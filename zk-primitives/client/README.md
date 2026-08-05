# @clawd/zk-client

Low-level TypeScript SDK for the `clawd-zk` Solana program.

## Responsibilities

- Derive deterministic nullifiers from `(secret, context)`.
- Pack Groth16 proof bytes and public inputs.
- Build `publish_attestation`, `consume_attestation`, and
  `commit_encrypted_state` instructions.
- Hold Light Protocol tree/address helper logic close to the client boundary.

The client does not decide whether an operation is safe to submit. It builds
typed artifacts for a caller that already passed its trust gate.

## Common Commands

```bash
npm install
npm test
npm run build
```

## Public API

```ts
import {
  ClawdZkClient,
  computeNullifier,
  buildPublishPublicInputs,
  verifyGroth16Offchain,
} from "@clawd/zk-client";
```

Use `@clawd/zk-agent` when you want natural-language routing or CLI commands.
Use this package directly when another runtime already knows which instruction
it wants to build.

## Safety Notes

- `verifyGroth16Offchain` is a structural check only.
- Real proof soundness is enforced by the on-chain verifier.
- Production releases should pin verifying keys to trusted setup artifacts.
- Secret keys should stay in caller-owned signer infrastructure, not this SDK.
