# Dual-rail omni agent mint (Solana + Robinhood)

Mint one logical agent as **two chain-scoped identities**, then optionally bind them with **LayerZero zk-omni (msgType 4)**.

| Rail | Identity | Path |
|------|----------|------|
| **Solana** | Metaplex Core asset + Agent Identity PDA | Metaplex API `mint-prepare` → wallet sign → `mint-confirm` (preferred) |
| **Robinhood Chain** | ERC-721 ERC-8004 registry record | Local unsigned `register(agentURI)` calldata |
| **Link** | Nullifier-bound dual_identity_link | `CheshireZkOmniMessenger` / `programs/zk_omni` |

Hosted surfaces: [forge](https://musebook.trade/agents/forge) · [hub](https://musebook.trade/agents) · [live](https://musebook.trade/agents/live)

> Identity ≠ fungible token. This flow does **not** launch a bonding-curve coin on either chain.

## Why two rails + zk-omni

- **Solana** is the Metaplex-native agent identity (Core + registry API metadata, services, trust).
- **Robinhood** is the ERC-8004 identity / reputation / validation suite (4663 / 46630).
- **zk-omni** proves a one-shot link without replaying the same binding (nullifier anti-replay). LayerZero EIDs: Solana `30168`, Robinhood `30416`.

```text
┌─────────────────────┐     planOmniAgentMint      ┌──────────────────────┐
│ Solana Metaplex     │◄──────────────────────────►│ Robinhood ERC-8004   │
│ Core + Agent ID PDA │                            │ register(agentURI)   │
└──────────┬──────────┘                            └──────────┬───────────┘
           │              planOmniIdentityLink                 │
           └───────────► zk-omni dual_identity_link ◄──────────┘
                         (msgType 4 + nullifier)
```

## SDK

```js
import {
  planOmniAgentMint,
  planOmniIdentityLink,
  createAgentForge,
} from "musebook-agents-forge";

// 1) Local dual-rail plan (no keys, no network)
const plan = planOmniAgentMint({
  name: "Omni Scout",
  description: "Dual-rail Musebook agent",
  image: "ipfs://bafy…",
  services: [{ name: "MCP", endpoint: "https://agent.example/mcp" }],
  ownerPubkey: "<solana-base58>",
  chainId: 46630,                 // prefer testnet
  solanaNetwork: "solana-devnet", // or solana-mainnet
  linkOmni: true,
});

// Solana: plan.solana.metaplexMintInput  → mintSolanaPrepare / mintAndSubmitAgent
// RH:     plan.robinhood.{ to, data, value } → wallet eth_sendTransaction

// 2) After both confirms
const link = planOmniIdentityLink({
  solanaAsset: "<core-asset-address>",
  rhAgentId: 42,
  chainId: 46630,
  controllerAddress: "0x…",
});
// → zk-omni-relayer oneshot / buildRobinhoodSendCall
```

Forge helper:

```js
const forge = createAgentForge();
const plan = await forge.prepare({ platform: "omni", ...fields });
// or forge.planOmniMint(fields)
```

## CLI

```bash
# Dual-rail plan (JSON in, JSON out)
npx musebook-agents-forge omni-mint-plan --file agent.json --chain 46630 \
  --solana-network solana-devnet

# Mainnet RH requires explicit flag
npx musebook-agents-forge omni-mint-plan --file agent.json --chain 4663 --confirm-mainnet

# After both identities exist
npx musebook-agents-forge omni-link-plan \
  --solana-asset <base58> --rh-agent-id 42 --chain 46630 --controller 0x…
```

`agent.json` minimum:

```json
{
  "name": "Omni Scout",
  "description": "Dual-rail agent",
  "image": "ipfs://bafy…",
  "ownerPubkey": "So1…",
  "services": [{ "name": "MCP", "endpoint": "https://example.com/mcp" }]
}
```

## Execution order

1. **Review** `planOmniAgentMint` output — destination registry, Metaplex network, no private keys in the plan.
2. **Solana** — `mintSolanaPrepare` (or local `@metaplex-foundation/mpl-agent-registry` `mintAndSubmitAgent`) → owner signs → confirm; keep `assetAddress`.
3. **Robinhood** — broadcast `plan.robinhood` calldata; keep `agentId` from `Registered`.
4. **Link** — `planOmniIdentityLink` → deliver via `zk-omni-relayer` / `sendZkOmni`.
5. **Live feed** — `reportLive` on both rails with `metadata.omniPair`.

## Metaplex API notes (Solana rail)

Aligned with Metaplex **Mint an Agent** (mpl-agent-registry ≥ 0.2.0):

- `uri` → on-chain Core asset NFT metadata
- `agentMetadata` → off-chain API storage (type, name, description, services, registrations, supportedTrust)
- Single atomic tx: Core mint + Agent Identity PDA
- Networks: `solana-mainnet`, `solana-devnet` (also Eclipse/Sonic/Fogo in Metaplex API; Musebook omni defaults to Solana + RH)

## Safety

- Never request private keys. Wallet signs each rail separately.
- Prefer RH **46630** and Solana **devnet** for experiments; mainnet needs explicit confirmation.
- Identity registration does not launch a fungible agent token.
- Provisional omni plan uses a derived agentId; replace with the real RH token id via `planOmniIdentityLink`.
- Nullifiers are single-use — never reuse a secret/nullifier pair.

## Related

- [ZK_OMNI.md](./ZK_OMNI.md) — codec, relayer, contracts
- Skills: `musebook-omni-mint`, `musebook-zk-omni`, `robinhood-agent-forge`, `musebook-agent-registries`
- Contracts: `contracts/zk-omni/CheshireZkOmniMessenger.sol`, identity suite under `contracts/`
