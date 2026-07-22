---
name: cheshire-agent-identity-registry
description: >
  Register and operate Cheshire Robinhood agent identities (ERC-721 RHAGENT) via
  CheshireAgentIdentityRegistry on Robinhood Chain. Use for register(agentURI),
  agentWallet EIP-712/1271 proofs, metadata, isAuthorized, and ownerOf reads.
  Source: robinhood-agents/contracts/CheshireAgentIdentityRegistry.sol.
---

# CheshireAgentIdentityRegistry

ERC-8004-compatible **identity singleton** for Robinhood Chain. Dependency-free ERC-721 + URI + arbitrary metadata + reserved `agentWallet` with EIP-712 / ERC-1271 proof.

## Mainnet (4663)

| | |
|--|--|
| **Address** | `0x70361a37951d66f8c44cfb45873df2ba8b9fc950` |
| **Name / symbol** | `Cheshire Robinhood Agents` / `RHAGENT` |
| **Version** | `1` (EIP-712 domain) |
| **Explorer** | https://robinhoodchain.blockscout.com/address/0x70361a37951d66f8c44cfb45873df2ba8b9fc950 |
| **RPC** | `https://rpc.mainnet.chain.robinhood.com` |
| **Source** | `cheshire-terminal/robinhood-agents/contracts/CheshireAgentIdentityRegistry.sol` |
| **Deploy JSON** | `deployments/agent-registries-mainnet-4663.json` |

Testnet 46630: `0xf1a30080f5da64ab0456f3adc06dfd8fc9d2fdb3`  
Product UX: `https://cheshireterminal.ai/agents/forge` · FunPump site: `https://funpump.ai`

## Core API

| Function | Who | Notes |
|----------|-----|--------|
| `register()` | anyone | mints to `msg.sender`, empty URI |
| `register(string uri)` | anyone | sets agentURI |
| `register(string uri, MetadataEntry[] metadata)` | anyone | batch metadata; cannot set reserved keys via metadata except agentWallet init path |
| `setAgentURI(agentId, newURI)` | owner/operator | |
| `setMetadata(agentId, key, value)` | owner/operator | **not** for reserved `agentWallet` key |
| `setAgentWallet(agentId, newWallet, deadline, signature)` | anyone w/ valid proof | EIP-712 / ERC-1271 from **newWallet** |
| `unsetAgentWallet(agentId)` | owner/operator | |
| `getAgentWallet(agentId)` | view | |
| `isAuthorized(operator, agentId)` | view | owner, approved, or operator |
| `ownerOf` / `tokenURI` / `agentURI` | view | |
| `totalSupply()` | view | `_nextAgentId - 1` |

`MetadataEntry { string metadataKey; bytes metadataValue }`

## Semantics agents must respect

1. **`register` mints the ERC-721 to `msg.sender`** and initializes `agentWallet` to that address.
2. **ERC-721 transfer clears a nonzero `agentWallet`** — transferring the NFT revokes the bound wallet.
3. Approvals are **consequential authority** (can transfer + update metadata).
4. **`agentWallet` is reserved** — only via `setAgentWallet` with a proof from the new wallet (EOA `ecrecover` or ERC-1271).
5. EIP-712 typehash: `SetAgentWallet(uint256 agentId,address newWallet,uint256 deadline)` under domain `(name, version, chainId, verifyingContract)`.

## Minimal viem flow

```ts
import { createWalletClient, createPublicClient, http, defineChain } from "viem";
import { privateKeyToAccount } from "viem/accounts"; // only if user authorized agent key

const RH = defineChain({
  id: 4663,
  name: "Robinhood Chain",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: ["https://rpc.mainnet.chain.robinhood.com"] } },
});

const IDENTITY = "0x70361a37951d66f8c44cfb45873df2ba8b9fc950" as const;

// Prefer unsigned intent → user wallet broadcast (forge APIs).
// After receipt: read ownerOf(agentId), agentURI, getAgentWallet — never claim success on hash alone.
```

## Safety

- Prefer **user-signed** registration; never handle raw private keys in chat.
- Confirm **chainId 4663** (or 46630 testnet) before broadcast.
- Do not redeploy a second identity namespace.
- Identity NFT ≠ FunPump bonding-curve token (`rh-launchpad-v3` / `rh-bonded-launch`).

## Related

- Reputation: `cheshire-agent-reputation-registry`
- Validation: `cheshire-agent-validation-registry`
- Suite overview: `cheshire-agent-registries`
- Forge lifecycle: `robinhood-agent-forge`
