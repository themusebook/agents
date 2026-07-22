---
name: cheshire-agent-registries
description: >
  Overview of the ERC-8004 Cheshire agent registry suite on Robinhood Chain:
  identity (ERC-721 RHAGENT), reputation feedback, validation request/response,
  and optional zk-omni messenger. Use when registering agents, reading registry
  addresses, wiring forge/UI, or deploying operator tooling. Product host:
  funpump.ai · forge: cheshireterminal.ai/agents/forge.
---

# Cheshire Agent Registries (Robinhood Chain)

Open-source suite under `cheshire-terminal/robinhood-agents/contracts/`.  
**Do not redeploy** a competing identity namespace — use the canonical mainnet pins.

## Product surfaces

| Surface | URL |
|---------|-----|
| FunPump (launches + product) | `https://funpump.ai` |
| Agent forge (interactive) | `https://cheshireterminal.ai/agents/forge` |
| RH mainnet explorer | `https://robinhoodchain.blockscout.com` |
| Public RPC | `https://rpc.mainnet.chain.robinhood.com` |

## Mainnet 4663 pins

Source: `robinhood-agents/deployments/agent-registries-mainnet-4663.json`

| Contract | Address |
|----------|---------|
| **Identity** `CheshireAgentIdentityRegistry` | `0x70361a37951d66f8c44cfb45873df2ba8b9fc950` |
| **Reputation** `CheshireAgentReputationRegistry` | `0x8a4154a6c1ee44b4b790948f9613e3fb934628ff` |
| **Validation** `CheshireAgentValidationRegistry` | `0x020d053040da31195e5f9a992b8eda663dbb073b` |

All three share the same identity registry dependency (reputation + validation take it in the constructor).

Testnet **46630** pins: see `deployments/agent-registries-testnet-46630.json`. Prefer testnet for agent experiments; require explicit mainnet confirmation before writes on 4663.

## Suite relationship

```text
Identity (ERC-721 RHAGENT)
    ├── register / setAgentURI / setAgentWallet / isAuthorized
    ├── Reputation  → giveFeedback (non-operators only)
    └── Validation  → validationRequest (operators) / validationResponse (validators)

Optional: zk-omni/CheshireZkOmniMessenger (LayerZero msgType 4)
    └── may gate send on identityRegistry.isAuthorized
```

## Source paths

```text
cheshire-terminal/robinhood-agents/contracts/
  CheshireAgentIdentityRegistry.sol
  CheshireAgentReputationRegistry.sol
  CheshireAgentValidationRegistry.sol
  zk-omni/
    CheshireZkOmniMessenger.sol
    ILayerZeroEndpointV2.sol
    MockLzEndpoint.sol
```

## Focused skills

| Skill | When |
|-------|------|
| `cheshire-agent-identity-registry` | Mint/register agent NFT, agentWallet, metadata, isAuthorized |
| `cheshire-agent-reputation-registry` | Client feedback, revoke, summaries |
| `cheshire-agent-validation-registry` | Validation request/response lifecycle |
| `cheshire-zk-omni` / `zk-omni-messaging` | RH ↔ Solana nullifier messages |
| `robinhood-agent-forge` | End-to-end forge UX + API |
| `rh-launchpad-v3` / `rh-bonded-launch` | Token launches on FunPump (not identity) |

## Safety

1. Identity ≠ fungible agent token. Registration does not launch a bonding-curve coin.
2. Never invent registry addresses — re-read the deployment JSON or Blockscout code.
3. Never request private keys. Wallet signs `register` / metadata txs.
4. Reputation: agents cannot self-feedback (`isAuthorized` reverts `SelfFeedback`).
5. Mainnet writes require explicit user confirmation.

## Install

```bash
cp -R /Users/8bit/ClawdBrowser/go-bot/skills/cheshire-agent-registries \
  ~/.agents/skills/cheshire-agent-registries
```
