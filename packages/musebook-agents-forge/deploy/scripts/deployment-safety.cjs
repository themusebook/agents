"use strict";

const fs = require("node:fs");
const path = require("node:path");

const PACKAGE_ROOT = path.resolve(__dirname, "../..");
const ROBINHOOD_MAINNET_CHAIN_ID = 4663;
const ROBINHOOD_TESTNET_CHAIN_ID = 46630;
const DEPLOYMENT_TARGET = "cheshire-agent-registries";

const NETWORKS = Object.freeze({
  [ROBINHOOD_MAINNET_CHAIN_ID]: Object.freeze({
    name: "Robinhood Chain mainnet",
    confirmation: "DEPLOY ROBINHOOD MAINNET 4663",
    publicRpc: "https://rpc.mainnet.chain.robinhood.com",
    manifest: "agent-registries-mainnet-4663.json",
  }),
  [ROBINHOOD_TESTNET_CHAIN_ID]: Object.freeze({
    name: "Robinhood Chain testnet",
    confirmation: "DEPLOY ROBINHOOD TESTNET 46630",
    publicRpc: "https://rpc.testnet.chain.robinhood.com",
    manifest: "agent-registries-testnet-46630.json",
  }),
});

function parseChainId(value) {
  const text = String(value ?? "").trim();
  if (!/^[0-9]+$/.test(text)) {
    throw new Error("EXPECTED_CHAIN_ID must be the explicit decimal value 4663 or 46630");
  }
  const chainId = Number(text);
  if (!Number.isSafeInteger(chainId) || !NETWORKS[chainId]) {
    throw new Error(`Unsupported chain ID ${text}; expected 4663 or 46630`);
  }
  return chainId;
}

function parseRpcUrl(value, { allowLocalDryRun = false } = {}) {
  const raw = String(value ?? "").trim();
  if (!raw) throw new Error("A Robinhood RPC URL is required");
  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error("Robinhood RPC URL must be an absolute HTTPS URL");
  }
  if (parsed.username || parsed.password) {
    throw new Error("Robinhood RPC URL must not contain URL user-info credentials");
  }
  if (parsed.hash) throw new Error("Robinhood RPC URL must not contain a URL fragment");
  const local = parsed.hostname === "127.0.0.1" || parsed.hostname === "localhost" || parsed.hostname === "::1";
  if (parsed.protocol !== "https:" && !(allowLocalDryRun && local && parsed.protocol === "http:")) {
    throw new Error("Robinhood RPC URL must use HTTPS (HTTP is allowed only for an explicit local dry-run)");
  }
  return parsed;
}

function isOfficialPublicRpc(value) {
  const candidate = parseRpcUrl(value, { allowLocalDryRun: true }).hostname.toLowerCase();
  return Object.values(NETWORKS).some(
    (network) => parseRpcUrl(network.publicRpc).hostname.toLowerCase() === candidate,
  );
}

function assertAuditDigest(value) {
  const digest = String(value ?? "").trim();
  if (!/^0x[0-9a-fA-F]{64}$/.test(digest) || /^0x0{64}$/.test(digest)) {
    throw new Error(
      "DEPLOYMENT_AUDIT_SHA256 must be a nonzero 0x-prefixed 32-byte SHA-256 digest of the approved audit artifact",
    );
  }
}

function validateDeploymentIntent({
  expectedChainId,
  rpcUrl,
  mode = "dry-run",
  quotaBacked = false,
  confirmation = "",
  auditSha256 = "",
}) {
  const chainId = parseChainId(expectedChainId);
  const normalizedMode = String(mode).trim().toLowerCase();
  if (normalizedMode !== "dry-run" && normalizedMode !== "broadcast") {
    throw new Error("DEPLOYMENT_MODE must be dry-run or broadcast");
  }
  parseRpcUrl(rpcUrl, { allowLocalDryRun: normalizedMode === "dry-run" });

  if (normalizedMode === "broadcast") {
    if (confirmation !== NETWORKS[chainId].confirmation) {
      throw new Error(`DEPLOYMENT_CONFIRMATION must exactly equal: ${NETWORKS[chainId].confirmation}`);
    }
    if (chainId === ROBINHOOD_MAINNET_CHAIN_ID) {
      if (isOfficialPublicRpc(rpcUrl)) {
        throw new Error("Robinhood mainnet broadcast cannot use the rate-limited public RPC");
      }
      if (quotaBacked !== true) {
        throw new Error("RH_RPC_IS_QUOTA_BACKED=1 is required for a Robinhood mainnet broadcast");
      }
      assertAuditDigest(auditSha256);
    }
  }

  return Object.freeze({
    target: DEPLOYMENT_TARGET,
    chainId,
    network: NETWORKS[chainId].name,
    mode: normalizedMode,
  });
}

function canonicalManifestPath(chainIdValue, packageRoot = PACKAGE_ROOT) {
  const chainId = parseChainId(chainIdValue);
  return path.join(packageRoot, "deployments", NETWORKS[chainId].manifest);
}

/** Fail closed when the repository already pins a canonical registry suite. */
function assertRegistryBroadcastAvailable(chainIdValue, packageRoot = PACKAGE_ROOT) {
  const chainId = parseChainId(chainIdValue);
  const manifestPath = canonicalManifestPath(chainId, packageRoot);
  if (!fs.existsSync(manifestPath)) return Object.freeze({ chainId, available: true });

  let manifest;
  try {
    manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  } catch (error) {
    throw new Error(`Canonical deployment manifest cannot be trusted: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (manifest?.chainId !== chainId) {
    throw new Error(`Canonical deployment manifest chainId mismatch for ${chainId}`);
  }
  if (!Array.isArray(manifest.broadcastBlockedTargets)
    || !manifest.broadcastBlockedTargets.includes(DEPLOYMENT_TARGET)) {
    throw new Error(`Canonical deployment manifest does not contain the required ${DEPLOYMENT_TARGET} broadcast guard`);
  }
  const addresses = ["identity", "reputation", "validation"].map(
    (kind) => manifest?.contracts?.[kind]?.address,
  );
  if (!addresses.every((address) => /^0x[0-9a-fA-F]{40}$/.test(address ?? ""))) {
    throw new Error("Canonical deployment manifest is missing a registry address");
  }
  throw new Error(
    `Canonical ERC-8004 registries are already deployed on chain ${chainId}; refusing to create a competing namespace`,
  );
}

function resolveRpcUrl(chainIdValue, env = process.env) {
  const chainId = parseChainId(chainIdValue);
  const direct = env.RH_RPC_URL?.trim();
  if (direct) return direct;
  const key = env.ALCHEMY_API_KEY?.trim();
  if (key) {
    if (/^https:\/\//i.test(key)) return key;
    const network = chainId === ROBINHOOD_MAINNET_CHAIN_ID ? "mainnet" : "testnet";
    return `https://robinhood-${network}.g.alchemy.com/v2/${key}`;
  }
  if (chainId === ROBINHOOD_TESTNET_CHAIN_ID) return NETWORKS[chainId].publicRpc;
  throw new Error("Robinhood mainnet requires RH_RPC_URL or ALCHEMY_API_KEY; the public RPC is never a deploy fallback");
}

async function probeRpcChainId(rpcUrl, fetchImpl = globalThis.fetch) {
  if (typeof fetchImpl !== "function") throw new Error("No fetch implementation is available for the RPC chain probe");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  let response;
  let payload;
  try {
    response = await fetchImpl(rpcUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_chainId", params: [] }),
      signal: controller.signal,
    });
    if (!response?.ok) throw new Error(`Robinhood RPC chain probe returned HTTP ${response?.status ?? "error"}`);
    payload = await response.json();
  } catch (error) {
    if (error?.name === "AbortError") throw new Error("Robinhood RPC chain probe timed out");
    if (error instanceof Error && error.message.startsWith("Robinhood RPC chain probe returned HTTP")) throw error;
    throw new Error("Robinhood RPC chain probe failed");
  } finally {
    clearTimeout(timeout);
  }
  if (payload?.error || !/^0x[0-9a-fA-F]+$/.test(payload?.result ?? "")) {
    throw new Error("Robinhood RPC returned an invalid eth_chainId response");
  }
  const chainId = Number(BigInt(payload.result));
  if (!Number.isSafeInteger(chainId)) throw new Error("Robinhood RPC returned an unsafe eth_chainId");
  return chainId;
}

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    if (!key.startsWith("--")) throw new Error(`Unexpected argument ${key}`);
    const value = argv[index + 1];
    if (value === undefined || value.startsWith("--")) throw new Error(`Missing value for ${key}`);
    args[key.slice(2)] = value;
    index += 1;
  }
  return args;
}

async function runCli(argv = process.argv.slice(2), env = process.env) {
  const args = parseArgs(argv);
  const result = validateDeploymentIntent({
    expectedChainId: args["chain-id"],
    rpcUrl: args["rpc-url"],
    mode: args.mode,
    quotaBacked: env.RH_RPC_IS_QUOTA_BACKED === "1",
    confirmation: env.DEPLOYMENT_CONFIRMATION,
    auditSha256: env.DEPLOYMENT_AUDIT_SHA256,
  });
  const rpcChainId = await probeRpcChainId(args["rpc-url"]);
  if (rpcChainId !== result.chainId) {
    throw new Error(`RPC chain ID ${rpcChainId} does not match EXPECTED_CHAIN_ID ${result.chainId}`);
  }
  process.stdout.write(`Deployment safety preflight passed: ${result.target}, chain ${result.chainId}, ${result.mode}\n`);
}

if (require.main === module) {
  runCli().catch((error) => {
    process.stderr.write(`error: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}

module.exports = {
  DEPLOYMENT_TARGET,
  NETWORKS,
  PACKAGE_ROOT,
  ROBINHOOD_MAINNET_CHAIN_ID,
  ROBINHOOD_TESTNET_CHAIN_ID,
  assertRegistryBroadcastAvailable,
  canonicalManifestPath,
  isOfficialPublicRpc,
  parseChainId,
  parseRpcUrl,
  probeRpcChainId,
  resolveRpcUrl,
  runCli,
  validateDeploymentIntent,
};
