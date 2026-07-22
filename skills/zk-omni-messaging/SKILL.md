---
name: zk-omni-messaging
description: Zero-knowledge omnichain messaging between Robinhood Chain and Solana using CheshireZkOmniMessenger (msgType 4) with nullifier anti-replay and the zk-omni-relayer service.
---

# ZK Omnichain Messaging (Robinhood ↔ Solana)

Use this skill when the user wants to send, plan, relay, or inspect **nullifier-bound** cross-chain messages between **Robinhood Chain (EID 30416)** and **Solana (EID 30168)**.

## Protocol

| Field | Value |
|-------|--------|
| Message type | `4` (`MSG_ZK_OMNI`) |
| Anti-replay | Domain-separated **nullifier** (consumed on source + destination) |
| Transport | LayerZero Endpoint V2 (authenticated peer) |
| Contract | `contracts/zk-omni/CheshireZkOmniMessenger.sol` |
| Codec / relayer | `src/zkOmni/` |

Payload (abi.encode):

```text
uint16 msgType, bytes32 agentId, bytes32 controller, bytes32 nullifier,
bytes32 payloadCommitment, bytes32 modelHash, uint64 expiresAt,
string action, string memo
```

## One-shot CLI

```bash
# Plan only (no state)
npx robinhood-agents zk-omni-plan --action attest --memo "demo"

# Derive nullifier
npx robinhood-agents zk-omni-nullifier --context "zk-omni:attest:v1"

# Local relayer oneshot (journal + simulated deliver)
npx robinhood-agents zk-omni-oneshot --action publish_attestation --memo "one-shot"

# Relayer service
npm run zk-omni:relayer -- --port 8787
curl -s localhost:8787/health
```

## Relayer lifecycle

`observed → verified → queued → relayed → delivered | failed`

Nullifier replay is rejected at observe time.

## Product hosts

- FunPump: `https://funpump.ai`
- Cheshire: `https://cheshireterminal.ai`

## Related

- Contract-focused skill: `cheshire-zk-omni`
- Existing authenticated-intent OApp (msgType 3): `my-lz-oapp/contracts/CheshireOmnichainOApp.sol`
- ZK Shark agent TUI: `packages/clawd-agent-tui`
- LayerZero notes: `packages/layerzero-omnichain/README.md`
