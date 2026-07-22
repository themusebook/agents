---
name: cheshire-agent-validation-registry
description: >
  ERC-8004 validation request/response flow for Cheshire agents on Robinhood
  Chain via CheshireAgentValidationRegistry. Use for validationRequest,
  validationResponse, getValidationStatus, getSummary. Operators request;
  named validators respond (0–100 score). Source: CheshireAgentValidationRegistry.sol.
---

# CheshireAgentValidationRegistry

**Validation request/response** registry for Robinhood Chain agents.  
Agent operators open requests; the **named validator address alone** may respond.

## Mainnet (4663)

| | |
|--|--|
| **Address** | `0x020d053040da31195e5f9a992b8eda663dbb073b` |
| **Identity dependency** | `0x70361a37951d66f8c44cfb45873df2ba8b9fc950` |
| **Explorer** | https://robinhoodchain.blockscout.com/address/0x020d053040da31195e5f9a992b8eda663dbb073b |
| **Source** | `cheshire-terminal/robinhood-agents/contracts/CheshireAgentValidationRegistry.sol` |

Testnet 46630: `0x4126217abb0d12d8515698e819c543466f42eefd`

## Validation model

```solidity
struct Validation {
  address validatorAddress;
  uint256 agentId;
  uint8 response;       // 0–100 when responded
  bytes32 responseHash;
  string tag;
  uint256 lastUpdate;
  bool exists;
  bool responded;
}
```

Keyed by `requestHash` (bytes32, nonzero, unique).

## API

| Function | Caller | Notes |
|----------|--------|--------|
| `validationRequest(validator, agentId, requestURI, requestHash)` | agent **owner/operator** (`isAuthorized`) | reverts if hash exists or agent missing |
| `validationResponse(requestHash, response, responseURI, responseHash, tag)` | **validator only** | `response <= 100` |
| `getValidationStatus(requestHash)` | view | |
| `getSummary(agentId, validatorAddresses, tag)` | view | |
| `getAgentValidations(agentId)` | view | request hashes |
| `getValidatorRequests(validator)` | view | |

Events: `ValidationRequest`, `ValidationResponse`.

## Agent workflow

1. Ensure agent is registered on identity registry.
2. Choose a validator address and a unique `requestHash` (e.g. keccak of URI + salt).
3. Operator wallet calls `validationRequest` with durable `requestURI` (ipfs:// preferred).
4. Validator wallet calls `validationResponse` with score 0–100.
5. Verify with `getValidationStatus` / events on Blockscout.

## Safety

- Operators cannot respond as validators unless they are the named validator.
- Mainnet (4663) writes need explicit user confirmation.
- FunPump product host: `https://funpump.ai` · forge: `https://cheshireterminal.ai/agents/forge`

## Related

- Identity: `cheshire-agent-identity-registry`
- Reputation: `cheshire-agent-reputation-registry`
- Suite: `cheshire-agent-registries`
