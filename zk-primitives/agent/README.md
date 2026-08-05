# ZK Shark - Shark of All Streets Agent

> ZK Shark is the Shark of All Streets agent, named in honor of zk Shark,
> the legend of ordinals. It wraps [`@clawd/zk-client`](../client/) so
> nullifiers, Groth16 proofs, Light Protocol compressed state, and
> attestation flows can be driven through a typed API, CLI, or deterministic
> natural-language intent router.

The lower-level ZK primitive SDK is useful but repetitive: every caller has
to derive nullifiers, pack public inputs, assemble proofs, and build the
same Solana instructions. `@clawd/zk-shark-agent` keeps that wiring in one
place so an agent can operate across the ZK stack with a small surface:

```ts
import { ZkSharkAgent } from "@clawd/zk-shark-agent";

const agent = await ZkSharkAgent.fromEnv();
const { nullifierHex, signature } = await agent.attestModel({
  modelHash,
  payloadCommitment,
  proof,
  context: "model-attest:v1:my-model",
});
```

`ClawdZkAgent` and `clawd-zk-agent` remain compatibility aliases for older
callers.

## Repo Layout

```text
agent/
├── package.json
├── tsconfig.json
├── README.md
├── SKILL.md
├── src/
│   ├── index.ts
│   ├── agent.ts
│   ├── config.ts
│   ├── intents.ts
│   └── cli.ts
└── tests/
    └── agent.test.ts
```

## CLI

```bash
zk-shark-agent inspect
zk-shark-agent attest <modelHash> <payloadCommitment> <proof.json> \
  [--context "model-attest:v1:my-model"]
zk-shark-agent commit <ciphertextCommitment> <stateVersion> <proof.json> \
  [--model <modelHash>]
zk-shark-agent verify <proof.json>
zk-shark-agent nullifier "model-attest:v1:my-model"
zk-shark-agent ask "attest this model 0xab12... with my proof"
```

The package also exposes `shark-of-all-streets` as a command alias.

The proof JSON shape is:

```json
{
  "a": "0x0102...",
  "b": "0x0102...",
  "c": "0x0102...",
  "verifyingKey": "0x0102..."
}
```

## Programmatic API

```ts
import { ZkSharkAgent } from "@clawd/zk-shark-agent";

const agent = await ZkSharkAgent.fromEnv();

const result = await agent.attestModel({
  modelHash: new Uint8Array(32),
  payloadCommitment: new Uint8Array(32),
  proof: { a, b, c, verifyingKey },
  context: "model-attest:v1:my-model",
});

console.log(result.nullifierHex);
```

The four core operations are:

| Method | Purpose |
|---|---|
| `agent.attestModel({ modelHash, payloadCommitment, proof, context })` | Build a `publish_attestation` instruction with a nullifier. |
| `agent.commitEncryptedState({ modelHash, ciphertextCommitment, stateVersion, proof })` | Build a `commit_encrypted_state` instruction. |
| `agent.verifyProof({ proof, publicInputs?, ... })` | Run the off-chain proof and input-shape sanity check. |
| `agent.computeNullifierFor(secret, context)` | Derive a deterministic 32-byte nullifier. |

## Configuration

Preferred environment variables:

| Var | Default | Notes |
|---|---|---|
| `ZK_SHARK_RPC_URL` | required | Solana RPC endpoint. |
| `ZK_SHARK_PROGRAM_ID` | generated program identity | Base58 pubkey, or `ZK_SHARK_MAINNET`, `ZK_SHARK_DEVNET`, `ZK_SHARK_LOCALNET`. |
| `ZK_SHARK_PHOTON_URL` | `ZK_SHARK_RPC_URL` | Photon indexer URL. |
| `ZK_SHARK_API_KEY` | none | Separate RPC API key when needed. |
| `ZK_SHARK_COMMITMENT` | `confirmed` | `processed`, `confirmed`, or `finalized`. |
| `ZK_SHARK_KEYPAIR` | none | Path to a Solana CLI keypair JSON. |
| `ZK_SHARK_NETWORK` | `mainnet` | `mainnet`, `devnet`, or `localnet`. |

Legacy `CLAWD_ZK_*` variables and `CLAWDZK_*` program aliases are still
accepted as fallbacks.

## Intent Router

The router is deterministic and rule-based, with no model calls. It maps
natural language to executable routes:

| Verb pattern | Routed action |
|---|---|
| `attest`, `attestation`, `publish`, `publish_attestation` | `attestModel` |
| `commit`, `commit_state`, `encrypted state`, `ciphertext` | `commitEncryptedState` |
| `verify`, `check`, `validate` | `verifyProof` |
| `nullifier`, `derive`, `compute_nullifier` | `computeNullifier` |
| `inspect`, `config`, `status`, `show` | `describe` |
| `help`, `usage`, `how`, `what` | `help` |

## Status

This package is an off-chain agent surface. It builds instructions and
performs deterministic preparation. Production transaction submission still
needs the `trySend` hook in [src/agent.ts](src/agent.ts) wired to the chosen
`@solana/kit` send-and-confirm pipeline.

## See Also

- [`../client/`](../client/) - lower-level SDK (`@clawd/zk-client`)
- [`../programs/clawd-zk/`](../programs/clawd-zk/) - Anchor program
- [`../docs/ARCHITECTURE.md`](../docs/ARCHITECTURE.md) - architecture notes
- [`../../AGENTS.md`](../../AGENTS.md) - agent catalog

## License

Apache-2.0.
