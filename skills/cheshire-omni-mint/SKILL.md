---
name: cheshire-omni-mint
description: >
  Dual-rail omni agent mint: Solana Metaplex Core + Agent Identity and Robinhood
  Chain ERC-8004 identity in one plan, optionally bound with LayerZero zk-omni
  (msgType 4 dual_identity_link). Use when the user wants omnichain identity,
  Solana and Robinhood together, Metaplex mintAgent + RH register, or Cheshire
  Terminal dual-rail forge. Product: cheshireterminal.ai/agents/forge · funpump.ai.
---

# Cheshire Omni Mint (Solana + Robinhood)

Become **both** rails in one logical agent identity:

| Rail | Standard | Package path |
|------|----------|--------------|
| Solana | Metaplex Core + Agent Identity PDA | `planOmniAgentMint` → `mintSolanaPrepare` / `mintAndSubmitAgent` |
| Robinhood | ERC-8004 `register(agentURI)` | `plan.robinhood.{to,data,value}` |
| Link | zk-omni msgType **4** | `planOmniIdentityLink` → relayer / `sendZkOmni` |

Package: `cheshire-terminal-agents` (`robinhood-agents` workspace).

## When to use

- User says “omni”, “dual-rail”, “Solana and Robinhood”, “LayerZero agent”, or pastes Metaplex Mint Agent docs and wants RH too.
- Do **not** use for single-chain only (use `robinhood-agent-forge` or Solana mint alone).
- Do **not** use for bonding-curve token launches (`rh-bonded-launch` / `rh-launchpad-v3`).

## Plan (local, unsigned)

```bash
npx cheshire-terminal-agents omni-mint-plan --file agent.json --chain 46630 \
  --solana-network solana-devnet
```

```js
import { planOmniAgentMint, planOmniIdentityLink, createAgentForge } from "cheshire-terminal-agents";

const plan = planOmniAgentMint({
  name: "Omni Scout",
  description: "Dual-rail Cheshire agent",
  image: "ipfs://bafy…",
  ownerPubkey: "<solana>",
  chainId: 46630,
  solanaNetwork: "solana-devnet",
  services: [{ name: "MCP", endpoint: "https://…" }],
});

// After both txs confirm:
const link = planOmniIdentityLink({
  solanaAsset: planResult.assetAddress,
  rhAgentId: registeredId,
  chainId: 46630,
  controllerAddress: "0x…",
});
```

Forge: `createAgentForge().prepare({ platform: "omni", ... })` or `.planOmniMint(...)`.

## Execution order (operator)

1. Show the user **both** destinations (Metaplex network + RH registry address). Require confirmation.
2. Prefer RH **46630** / Solana **devnet**. Mainnet `4663` requires `confirmMainnet: true` / `--confirm-mainnet`.
3. **Solana first or RH first** is fine; keep both ids before linking.
4. Solana preferred path: Metaplex API mint-prepare → **owner wallet signs** → mint-confirm (live feed).
5. RH: wallet broadcasts unsigned `register` calldata; verify `Registered` + `ownerOf`.
6. Link: `omni-link-plan` / `planOmniIdentityLink` then zk-omni deliver (never reuse nullifier).
7. `reportLive` with `metadata.omniPair = { solanaAsset, rhAgentId, nullifier }`.

## Metaplex fields (Solana)

Per Metaplex Mint Agent guide (`mpl-agent-registry` ≥ 0.2.0):

- `uri` — on-chain Core NFT metadata JSON
- `agentMetadata` — off-chain API (type=`agent`, name, description, services, registrations, supportedTrust)
- Atomic Core + Agent Identity; verify `agentIdentities[0].lifecycleChecks`

Plan embeds cross-registry registrations (`cheshire-omni`, `robinhood-erc8004`, `metaplex-agent-identity`).

## Safety

1. **Never** request private keys or seed phrases.
2. Identity is **not** a fungible token launch.
3. Two wallets may be needed (Solana + EVM); do not conflate them.
4. Provisional omni plan agentId is derived; replace after RH mint via `planOmniIdentityLink`.
5. Re-read registry pins from `deployments/agent-registries-*.json` — do not invent addresses.

## Related skills

- `robinhood-agent-forge` — single-rail forge UX
- `cheshire-agent-registries` / `cheshire-agent-identity-registry` — RH suite
- `cheshire-zk-omni` / `zk-omni-messaging` — messenger + relayer
- Docs: `docs/OMNI_MINT.md`, `docs/ZK_OMNI.md`
