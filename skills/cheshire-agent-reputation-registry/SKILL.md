---
name: cheshire-agent-reputation-registry
description: >
  Post and query ERC-8004 reputation feedback for Cheshire agents on Robinhood
  Chain via CheshireAgentReputationRegistry. Use for giveFeedback, revokeFeedback,
  appendResponse, getSummary, and client lists. Requires identity registry
  0x7036…c950. Source: CheshireAgentReputationRegistry.sol.
---

# CheshireAgentReputationRegistry

On-chain **feedback signals** for agents registered in `CheshireAgentIdentityRegistry`.  
Clients (non-operators) leave scored feedback; agents/operators cannot self-review.

## Mainnet (4663)

| | |
|--|--|
| **Address** | `0x8a4154a6c1ee44b4b790948f9613e3fb934628ff` |
| **Identity dependency** | `0x70361a37951d66f8c44cfb45873df2ba8b9fc950` |
| **Explorer** | https://robinhoodchain.blockscout.com/address/0x8a4154a6c1ee44b4b790948f9613e3fb934628ff |
| **Source** | `cheshire-terminal/robinhood-agents/contracts/CheshireAgentReputationRegistry.sol` |

Testnet 46630: `0x2137528bf45480693fd22704a978f564a3bb1570` (identity `0xf1a30080…fdb3`)

## Feedback model

```solidity
struct Feedback {
  int128 value;
  uint8 valueDecimals; // 0–18
  string tag1;
  string tag2;
  bool isRevoked;
}
```

Indexed per `(agentId → clientAddress → feedbackIndex)`.

## API

| Function | Caller | Notes |
|----------|--------|--------|
| `giveFeedback(agentId, value, valueDecimals, tag1, tag2, endpoint, feedbackURI, feedbackHash)` | any **not** `isAuthorized` for agent | reverts `SelfFeedback` if operator; `ownerOf` must exist |
| `revokeFeedback(agentId, feedbackIndex)` | original client | soft-revoke |
| `appendResponse(agentId, clientAddress, feedbackIndex, responseURI, responseHash)` | anyone | threaded response |
| `getSummary(agentId, clientAddresses, tag1, tag2)` | view | aggregate scores |
| `readFeedback` / client lists | view | |

Events: `NewFeedback`, `FeedbackRevoked`, `ResponseAppended`.

## Agent rules

1. Confirm agent exists on identity (`ownerOf`) before prompting feedback.
2. **Never** submit feedback from the agent owner/operator wallet — use a client wallet.
3. `valueDecimals > 18` reverts.
4. Prefer durable `feedbackURI` (ipfs://) for production reviews.
5. Product UX / forge: `https://cheshireterminal.ai/agents/forge` · FunPump: `https://funpump.ai`

## Related

- Identity: `cheshire-agent-identity-registry`
- Validation: `cheshire-agent-validation-registry`
- Suite: `cheshire-agent-registries`
