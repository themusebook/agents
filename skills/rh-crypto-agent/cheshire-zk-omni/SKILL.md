---
name: cheshire-zk-omni
description: >
  Zero-knowledge omnichain messaging (msgType 4) between Robinhood Chain and
  Solana via CheshireZkOmniMessenger — LayerZero V2 peers, nullifier anti-replay,
  optional identity authorization. Use for sendZkOmni, quoteSend, nullifiers,
  zk-omni relayer. Source: contracts/zk-omni/CheshireZkOmniMessenger.sol.
---

# CheshireZkOmniMessenger (zk-omni)

Cross-chain messenger for **Robinhood Chain ↔ Solana** with **domain-separated nullifiers** (anti-replay). LayerZero authenticates peers; this contract enforces peer allowlist, nullifier uniqueness, expiry, and optional agent identity auth on send.

## Source

```text
cheshire-terminal/robinhood-agents/contracts/zk-omni/
  CheshireZkOmniMessenger.sol
  ILayerZeroEndpointV2.sol
  MockLzEndpoint.sol   # local tests only
```

Also mirrored by skill `zk-omni-messaging` (CLI / relayer). Prefer that skill for relayer ops; this skill is the **contract surface**.

## Constants

| Name | Value |
|------|--------|
| `MSG_ZK_OMNI` | `4` |
| `SOLANA_EID` | `30168` |
| `ROBINHOOD_EID` | `30416` |
| Max action / memo | 64 / 200 chars |

## Payload (`abi.encode`)

```text
uint16  msgType            // = 4
bytes32 agentId
bytes32 controller
bytes32 nullifier          // unique; consumedNullifier[nullifier]
bytes32 payloadCommitment
bytes32 modelHash
uint64  expiresAt
string  action
string  memo
```

## Key functions

| Function | Role |
|----------|------|
| `constructor(endpoint, owner, identityRegistry)` | endpoint must have code; optional identity |
| `setPeer(eid, peer)` | owner — LZ peer bytes32 |
| `setIdentityRegistry(registry)` | owner — optional `isAuthorized` gate |
| `quoteSend(...)` | fee quote |
| `sendZkOmni(...)` | payable send; may require identity auth |
| `lzReceive(...)` | LZ callback — peer + nullifier + expiry checks |

Events: `PeerSet`, `IdentityRegistrySet`, `ZkOmniSent`, `ZkOmniReceived`.

## Errors (agent-facing)

`UnauthorizedPeer`, `UnauthorizedAgent`, `InvalidNullifier`, `NullifierReplay`, `IntentExpired`, `InvalidMessageType`, `IntentTextTooLong`, `FeeTooLow`, …

## Operator notes

1. Deploy once with a live LayerZero Endpoint V2; never use `MockLzEndpoint` on mainnet.
2. Set peers for Solana EID `30168` and RH EID `30416` before production sends.
3. If `identityRegistry` is set, senders must be authorized for `agentId`.
4. Always derive a fresh nullifier per intent; never reuse.
5. Product / UX hosts: FunPump `https://funpump.ai` · Cheshire forge `https://cheshireterminal.ai`.

## CLI / relayer (package)

```bash
npx robinhood-agents zk-omni-plan --action attest --memo "demo"
npx robinhood-agents zk-omni-nullifier --context "zk-omni:attest:v1"
npx robinhood-agents zk-omni-oneshot --action publish_attestation --memo "one-shot"
```

## Related

- Suite overview: `cheshire-agent-registries`
- Identity auth gate: `cheshire-agent-identity-registry`
- Full messaging skill: `zk-omni-messaging`
