#!/usr/bin/env bash
# Fail-closed registry deployment runner. It probes eth_chainId before Forge
# simulation/signing and blocks duplicate broadcasts when a canonical manifest
# for the selected chain ships with this repository.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

die() {
  echo "error: $*" >&2
  exit 1
}

MODE="dry-run"
if [[ ${1:-} == "--broadcast" ]]; then
  MODE="broadcast"
  shift
fi
[[ $# -eq 0 ]] || die "only the optional --broadcast flag is accepted"
export DEPLOYMENT_MODE="$MODE"

EXPECTED_CHAIN_ID="${EXPECTED_CHAIN_ID:-${CHAIN_ID:-}}"
[[ -n "$EXPECTED_CHAIN_ID" ]] || die "EXPECTED_CHAIN_ID must be explicitly set to 4663 or 46630"
case "$EXPECTED_CHAIN_ID" in
  4663|46630) ;;
  *) die "EXPECTED_CHAIN_ID must be 4663 or 46630" ;;
esac
export EXPECTED_CHAIN_ID

# This repository ships pins for the already-deployed canonical namespaces.
# Stop before reading a key or contacting an RPC if a broadcast would duplicate
# one. Forks can replace the manifest and policy when intentionally creating an
# independently named namespace.
if [[ "$MODE" == "broadcast" ]]; then
  node -e '
    const safety = require("./deploy/scripts/deployment-safety.cjs");
    safety.assertRegistryBroadcastAvailable(process.argv[1]);
  ' "$EXPECTED_CHAIN_ID"
fi

if [[ -z ${RH_RPC_URL:-} ]]; then
  if [[ -n ${ALCHEMY_API_KEY:-} ]]; then
    if [[ $ALCHEMY_API_KEY == https://* ]]; then
      RH_RPC_URL="$ALCHEMY_API_KEY"
    elif [[ "$EXPECTED_CHAIN_ID" == "4663" ]]; then
      RH_RPC_URL="https://robinhood-mainnet.g.alchemy.com/v2/${ALCHEMY_API_KEY}"
    else
      RH_RPC_URL="https://robinhood-testnet.g.alchemy.com/v2/${ALCHEMY_API_KEY}"
    fi
  elif [[ "$EXPECTED_CHAIN_ID" == "46630" ]]; then
    RH_RPC_URL="https://rpc.testnet.chain.robinhood.com"
  else
    die "Robinhood mainnet requires RH_RPC_URL or ALCHEMY_API_KEY; public RPC fallback is disabled"
  fi
fi
export RH_RPC_URL

[[ -n ${PRIVATE_KEY:-} ]] || die "PRIVATE_KEY is required (use a throwaway, gas-only deployer)"
[[ $PRIVATE_KEY =~ ^0x[0-9a-fA-F]{64}$ ]] || die "PRIVATE_KEY must be a 32-byte 0x-prefixed hex key"
[[ ! $PRIVATE_KEY =~ ^0x0{64}$ ]] || die "PRIVATE_KEY must not be the zero key"

command -v node >/dev/null 2>&1 || die "node is required for deployment preflight"
command -v forge >/dev/null 2>&1 || die "forge is required; install a pinned Foundry release"
[[ -f deploy/lib/forge-std/src/Script.sol ]] || die "forge-std is missing; run npm run setup:solidity"

# The bounded chain probe is the only pre-signing network operation. The script
# never prints the credential-bearing RPC URL.
node deploy/scripts/deployment-safety.cjs \
  --chain-id "$EXPECTED_CHAIN_ID" \
  --rpc-url "$RH_RPC_URL" \
  --mode "$MODE"

echo "Target: cheshire-agent-registries"
echo "Expected chain: $EXPECTED_CHAIN_ID"
echo "Mode: $MODE"
forge build

SCRIPT_TARGET="deploy/script/DeployCheshireAgentRegistries.s.sol:DeployCheshireAgentRegistries"
if [[ "$MODE" == "broadcast" ]]; then
  exec forge script "$SCRIPT_TARGET" --rpc-url "$RH_RPC_URL" --broadcast -vvvv
fi

echo "Simulation only. No transaction will be sent."
exec forge script "$SCRIPT_TARGET" --rpc-url "$RH_RPC_URL" -vvvv
