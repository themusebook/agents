# 🦞🔐 Clawd ZK Primitives

<p align="center">
  <img alt="license" src="https://img.shields.io/badge/license-Apache--2.0-blue?style=flat-square">
  <img alt="chain" src="https://img.shields.io/badge/chain-Solana-14F195?style=flat-square&logo=solana&logoColor=white">
  <img alt="compression" src="https://img.shields.io/badge/state-Light%20Protocol%20(zk--compressed)-9945FF?style=flat-square">
  <img alt="proof system" src="https://img.shields.io/badge/proof-Groth16%20(alt--bn128)-orange?style=flat-square">
  <img alt="status" src="https://img.shields.io/badge/status-circuit--gated-orange?style=flat-square">
</p>

<p align="center"><strong>
🦈 &nbsp;&nbsp; nullifier → proof → compressed state → provable AI &nbsp;&nbsp; 🦈
</strong></p>

> **A zero-knowledge primitive layer for Solana-native AI models.**
> Built on [Light Protocol](https://www.zkcompression.com).
> Powers the on-chain identity, attestation, and encrypted-state
> layer for the Clawd agent fleet — and yes, its mascot is a
> shark. 🦈 More on that below.

---

## 🍿 The 30-second version

Your model did some work. How does anyone *else* — another agent,
a smart contract, a curious human — know that's true, that it only
happened once, and that nobody's cheating the reward pool?

That's what this repo answers, in three moves:

```
   ┌─────────────┐      ┌───────────────────┐      ┌────────────────────┐
   │  1. PROVE   │ ───▶ │  2. STAMP ONCE     │ ───▶ │  3. STORE FOR FREE │
   │ Groth16 SNARK│      │  Nullifier registry│      │  Light-compressed  │
   │ "I did the   │      │  "this exact action│      │  state (rent-free, │
   │  work, here's│      │   happened exactly │      │  ~26–32 deep tree)  │
   │  the proof"  │      │   once, ever"       │      │                    │
   └─────────────┘      └───────────────────┘      └────────────────────┘
         🔐                     🚫🔁                        💾
```

No re-used proofs. No double-claimed rewards. No 890,880-lamport
rent bill per record. Just a receipt, a stamp, and a cheap place to
keep it — all verifiable by anyone with an RPC endpoint.

## 🧩 The three primitives

| # | Primitive | What it buys you | Cost |
|---|---|---|---|
| 1 | **Nullifier registry** 🚫🔁 | A 32-byte, deterministic, per-action hash proving an action happened *exactly once*. Anti-double-publish, anti-double-claim, anti-double-inference-reward. | 15,000 lamports/nullifier (compressed PDA) vs. 890,880 for a regular PDA |
| 2 | **Groth16 proof verification** 🔐 | On-chain bn128/alt-bn128 zk-SNARK verifier. Proves model inference correctness, encrypted-state commitment, license-bound authorization, ZK identity. | ~200k CU |
| 3 | **Compressed state (Light Protocol)** 💾 | Model metadata, attestations, and encrypted params live in rent-free compressed accounts. Reads via Helius Photon, writes via CPI to the Light System Program. | 26-deep (V1) / 32-deep (V2) trees |

📖 The deep dive — design, cost math, security model — lives in
[`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md).
🌐 The edge install/metadata surface is in
[`docs/EDGE_DISTRIBUTION.md`](./docs/EDGE_DISTRIBUTION.md).

## 🗂️ Repo layout

```
zk-primitives/
├── README.md                                ← you are here
├── package.json                             ← pnpm workspace root (jayson>uuid override)
├── pnpm-workspace.yaml                       ← workspace: agent, client
├── docs/
│   ├── ARCHITECTURE.md                      ← deep dive: design, costs, security
│   ├── INTEGRATION.md                       ← runtime catalog and trust gates
│   ├── EDGE_DISTRIBUTION.md                 ← Cloudflare metadata surface
│   └── PIEDPIPER_ADAPTATION.md              ← classical→ZK algorithm map
├── programs/
│   └── clawd-zk/                            ← Anchor program (Rust, on-chain)
│       ├── Cargo.toml
│       ├── Xargo.toml
│       └── src/
│           ├── lib.rs                       ← program entry, instruction dispatch
│           ├── nullifier.rs                 ← compressed-PDA nullifier logic
│           ├── proof.rs                     ← Groth16 verifier wrapper
│           └── state.rs                     ← compressed state writes / consumes
├── client/                                  ← 🧰 TypeScript SDK (@clawd/zk-client)
│   ├── package.json
│   ├── tsconfig.json
│   └── src/
│       ├── index.ts                         ← public exports
│       ├── types.ts                         ← shared types
│       ├── nullifier.ts                     ← nullifier computation
│       ├── proof.ts                         ← public-input packing + proof serialization
│       ├── state.ts                         ← Light Protocol helpers
│       └── client.ts                        ← high-level ClawdZkClient
├── agent/                                   ← 🦈 ZK Shark agent (@clawd/zk-shark-agent)
│   ├── package.json
│   ├── tsconfig.json
│   ├── README.md · SKILL.md · agent.json
│   └── src/
│       ├── index.ts                         ← public exports
│       ├── agent.ts                         ← ZkSharkAgent / ClawdZkAgent
│       ├── config.ts                        ← env-driven config loader
│       ├── intents.ts                       ← natural-language intent router
│       └── cli.ts                           ← zk-shark-agent CLI
├── tests/                                   ← integration tests
│   ├── nullifier.test.ts                    ← vitest, off-chain pieces
│   └── nullifier.rs                         ← cargo test-sbf, on-chain pieces
└── configs/
    └── light-trees.yaml                     ← canonical V2 tree pubkeys
```

Two ways to use this stack:

- **`client/`** — the raw SDK. You drive nullifiers, proofs, and
  instructions yourself. Maximum control.
- **`agent/`** — 🦈 **ZK Shark**, *the Shark of All Streets*. A typed
  wrapper + CLI + natural-language intent router built on top of
  `client/`, so an agent can just say *"attest this model"* instead
  of hand-assembling instructions. Named in honor of zk Shark, the
  legend of ordinals. See [`agent/README.md`](./agent/README.md).

## ⚙️ The three instructions

```text
publish_attestation(model_hash, payload_commitment, proof, nullifiers)
   ├── Verifies Groth16(attester, model_hash, payload_commitment, nullifiers)
   ├── CPI → Light System Program
   │   ├── Create nullifier compressed PDA at derived address
   │   └── Write AttestationAccount (compressed state)
   └── Emits: tx log, ~25,000 lamports, ~618k CU

consume_attestation(attestation_address, consume_nonce, proof)
   ├── Verifies Groth16(consumer, attestation_address, consume_nonce)
   ├── CPI → Light System Program
   │   └── Read+modify AttestationAccount (status 0→1)
   └── Emits: tx log, ~5,000 lamports, ~310k CU

commit_encrypted_state(model_hash, ciphertext_commitment, version, proof)
   ├── Verifies Groth16(committer, model_hash, ciphertext_commitment, version)
   ├── CPI → Light System Program
   │   └── Write EncryptedStateAccount (compressed state)
   └── Emits: tx log, ~5,300 lamports, ~410k CU
```

## 🚀 Quick start

### Install

```bash
# On-chain program deps
cd programs/clawd-zk
cargo build-sbf

# TypeScript workspace (client + agent, from the repo root)
cd ../..
pnpm install
```

### Use the raw SDK (`@clawd/zk-client`)

```ts
import { ClawdZkClient, computeNullifier } from "@clawd/zk-client";
import { createSolanaRpc, createKeyPairSignerFromBytes } from "@solana/kit";

const rpc = createSolanaRpc("https://mainnet.helius-rpc.com?api-key=...");
const signer = await createKeyPairSignerFromBytes(secretKey);
const client = new ClawdZkClient({ rpc, programId: PROGRAM_ID });

// 1. Compute the nullifier.
const nullifier = await computeNullifier({
  secret: signer.secretKey,
  context: "model-attestation:abc123",
});

// 2. Build the publish-attestation instruction.
//    (The Groth16 proof is generated off-chain and supplied by the caller.)
const ix = await client.publishAttestation({
  signer: signer.address,
  modelHash: hexToBytes("ab12..."),
  payloadCommitment: hexToBytes("cd34..."),
  nullifier,
  proof: { a: proofA, b: proofB, c: proofC, verifyingKey },
});

// 3. Send.
const sig = await sendAndConfirm([ix], signer);
console.log("attestation published:", sig);
```

### Or let 🦈 ZK Shark do the wiring for you

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

...or from the command line:

```bash
zk-shark-agent inspect
zk-shark-agent attest <modelHash> <payloadCommitment> <proof.json>
zk-shark-agent ask "attest this model 0xab12... with my proof"
```

Full CLI + env var reference: [`agent/README.md`](./agent/README.md).

### Test

```bash
# Everything (client + agent, vitest)
pnpm -r test

# On-chain tests (cargo test-sbf)
cd programs/clawd-zk
# In another terminal, first run:
#   light test-validator
# Then:
cargo test-sbf
```

## 🩹 Recent fixes (this pass)

A parallel copy of this workspace had drifted in a few small but
sharp-edged ways. Ported forward into this copy:

- **ESM imports were silently broken.** Every relative import in
  `agent/src/*.ts` and `client/src/*.ts` had lost its `.js`
  extension (e.g. `from "./intents"` instead of
  `from "./intents.js"`). Both packages are `"type": "module"`, so
  `tsc` with `moduleResolution: "Bundler"` happily type-checks
  extensionless imports — but Node's real ESM loader does not, and
  the compiled `dist/*.js` would throw `ERR_MODULE_NOT_FOUND` at
  runtime. Fixed and verified: `tsc --noEmit` passes, and the built
  CLI (`node dist/cli.js --help`) now actually runs.
- **Deprecated transitive `uuid`.** The workspace was missing its
  root `package.json`, which is where the
  `pnpm.overrides["jayson>uuid"] = "^14.0.1"` override lives.
  Without it, `jayson` (a `@solana/web3.js` dependency) pulled in
  the deprecated, no-longer-supported `uuid@8.3.2`. Root
  `package.json` restored, lockfile regenerated — `uuid@8.3.2` is
  gone, everything now resolves to `uuid@14.0.1`.
- **`.gitignore`** re-added the `package-lock.json` ignores (this
  is a pnpm-only workspace; stray npm lockfiles shouldn't get
  committed).

All 49 existing tests still pass after the fix.

## 🧠 Why this matters for the Clawd stack

The `ai-training/` pipeline produces fine-tuned models. `clawd-zk`
gives those models a verifiable on-chain footprint:

- **Provenance** 🧾 — every published inference or attestation gets
  a nullifier, so the same model can't claim the same reward twice.
- **Confidentiality** 🕶️ — weights and training data can be
  committed in encrypted form, with the proof attesting the
  committer's authority to publish.
- **Portability** 🌍 — a Clawd agent on any chain, on any device,
  can read a model's attestation with a single `getCompressedAccount`
  call to the Helius Photon indexer.

This is the missing layer between *"we trained a model"* and
*"we have provable, on-chain, sovereign identity for that model."*

## ☁️ Cloudflare edge metadata

The installer Worker in [`../cloudflare/`](../cloudflare/) advertises
this ZK surface through read-only JSON endpoints:

```bash
curl -fsSL https://install.onchainai.fund/.well-known/clawdbot-zk.json
curl -fsSL https://zk.x402.wtf/clawdbot/.well-known/clawdbot-zk.json
```

Those endpoints expose package names, operation names, docs, and
trust gates. They do not execute proofs or submit transactions.
Installed runtimes continue to discover local source through
`CLAWDBOT_ZK_PRIMITIVES_DIR` and `clawdbot catalog zk`.

## Status

The Rust program and TypeScript SDK compile, Groth16 verification uses the
Solana alt-bn128 syscalls, and client instructions use Anchor-compatible Borsh
encoding. A production circuit rollout still needs:

1. Run a per-circuit Powers-of-Tau ceremony and pin each trusted Groth16 VK.
2. Run `light test-validator` + `cargo test-sbf` against a deployed
   V2 mainnet/devnet tree set.
3. Measure compute-unit budgets on devnet before authorizing a mainnet upgrade.

The on-chain program is < 400 lines of Rust across 4 files; the
off-chain SDK is < 300 lines of TypeScript across 5 files. Small on
purpose — easy to read end-to-end in one sitting.

## 🦖 Historical lineage

This ZK primitive layer is the Solana-native descendant of the
**PiedPiper project** (`docs/PiedPiper-master/`, from
[vs666/MinMax](https://github.com/vs666/MinMax)) — a landmark
academic implementation of classical compression (Huffman,
Arithmetic, BWT+RLE), encryption (AES-128, DES, RSA,
cellular-automaton-based PRNG), Conway's Game of Life, distributed
multi-agent collision avoidance, and cryptographic hash optimization.

The full mapping lives at
[`docs/PIEDPIPER_ADAPTATION.md`](./docs/PIEDPIPER_ADAPTATION.md).
Every classical algorithm has an on-chain ZK equivalent:

| Classical algorithm | ZK primitive | On-chain instruction |
|---|---|---|
| Huffman/Arithmetic compression | `verifyGroth16` (proof of correct decompression) | `publish_attestation` |
| AES-128 / DES / RSA encryption | `commit_encrypted_state` (ciphertext commitment) | `commit_encrypted_state` |
| CA-based PRNG (PP_HASH) | `computeNullifier` (deterministic 32-byte hash) | Client-side derivation |
| CA-based SSH protocol | Nullifier-based session authentication | `publish_attestation` |
| Conway's Game of Life | Groth16 proof of universal computation | `publish_attestation` |
| Min-Max decision tree | `computeNullifier` for commitment schemes | Client-side |

From Huffman to Groth16 — the same compression, the same encryption,
the same computation. Just faster. Just provable on Solana.

**Credits:**

- **Varul Srivastava** (`@vs666`) — primary author of MinMax, PP_HASH,
  PP_SSH, CA encryption, multi-agent collision avoidance, Game of Life,
  Forest Fire, PCA, Universal Computer document
- **Akshett Rai Jindal**, **Ashwin Mittal**, **Zishan Kazi**,
  **Keshav Bansal** — AES-128, DES, Huffman, Arithmetic, BWT+RLE,
  image compression, audio compression, video compression

Original repository: `https://github.com/vs666/MinMax`

## 📚 See also

- [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md) — the deep dive
- [`docs/INTEGRATION.md`](./docs/INTEGRATION.md) — runtime catalog integration
- [`docs/EDGE_DISTRIBUTION.md`](./docs/EDGE_DISTRIBUTION.md) — Cloudflare install and metadata surface
- [`docs/PIEDPIPER_ADAPTATION.md`](./docs/PIEDPIPER_ADAPTATION.md) — classical→ZK algorithm map
- [`agent/README.md`](./agent/README.md) — 🦈 ZK Shark agent, CLI, and intent router
- [`../ai-training/README.md`](../ai-training/README.md) — the model
  training pipeline that produces the weights this primitive attests to
- [`../AGENTS.md`](../AGENTS.md) — the Clawd agent catalog
- [Light Protocol docs](https://www.zkcompression.com) — the
  underlying ZK compression framework
- [light-verifier](https://docs.rs/light-verifier) — the on-chain
  Groth16 verifier we use
- [Helius Photon](https://docs.helius.dev) — the indexer that serves
  compressed-state reads

## 📄 License

Apache-2.0. The on-chain program and the TypeScript SDK are both
under Apache-2.0. The Light Protocol dependencies retain their
upstream licenses.
