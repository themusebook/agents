# ZK Programs

On-chain programs for the Clawd ZK primitive layer.

## `clawd-zk`

Path: `programs/clawd-zk`

Instruction handlers:

| Instruction | Purpose |
|---|---|
| `publish_attestation` | Verify a Groth16 proof, create nullifiers, and write an attestation record |
| `consume_attestation` | Verify consume authority and mark an attestation as consumed |
| `commit_encrypted_state` | Verify state authority and write encrypted-state commitment metadata |

## Build And Test

```bash
cd programs/clawd-zk
cargo build-sbf
cargo test-sbf
```

On-chain tests require a Light-compatible validator and the expected tree
accounts. The TypeScript package tests cover off-chain packing and routing.

## Production Circuit Gates

- Pin verifying keys per circuit.
- Validate compute-unit budgets on devnet before mainnet deployment.
