# PiedPiper → ZK Adaptation Guide

> **Full mapping of classical algorithms from the PiedPiper project
> (vs666/MinMax) into Solana-native ZK primitives.**
>
> Source: `docs/PiedPiper-master/` from
> [https://github.com/vs666/MinMax](https://github.com/vs666/MinMax)
> Adapted for: `zk-primitives/` — the Clawd ZK program, client SDK,
> and agent runtime on Solana.

---

## Table of Contents

1. [Why Adapt Classical Algorithms to ZK?](#why-adapt-classical-algorithms-to-zk)
2. [Quick Reference Table](#quick-reference-table)
3. [Compression → ZK](#compression--zk)
   - Huffman Static → Groth16
   - Adaptive Huffman → Groth16
   - Arithmetic Coding → Groth16
   - BWT + RLE → Groth16
4. [Encryption → ZK](#encryption--zk)
   - AES-128 → commit_encrypted_state
   - DES → commit_encrypted_state
   - RSA → commit_encrypted_state
   - CA-based PRNG → Nullifier Derivation
   - CA-based SSH → Nullifier Session Auth
5. [Cellular Automata → ZK](#cellular-automata--zk)
   - Conway's Game of Life → Groth16 Universal Computation
   - Forest Fire Simulation → Groth16
6. [Decision Theory → ZK](#decision-theory--zk)
   - Min-Max Algorithm → Nullifier Commitment
7. [Go Runtime Integration](#go-runtime-integration)
8. [On-Chain Integration Patterns](#on-chain-integration-patterns)

---

## Why Adapt Classical Algorithms to ZK?

Every classical algorithm implemented by the PiedPiper team — Huffman
compression, AES-128 encryption, SHA-512 via cellular automaton —
proves a property about data:

- **Compression** proves that data can be represented in fewer bits
- **Encryption** proves that data can be hidden behind a key
- **Cellular automata** prove that complex behavior emerges from
  simple rules — and that computation is universal

ZK-SNARKs (specifically Groth16) let us prove these same properties
_off-chain_ and verify them _on-chain_ without revealing the data:

- **Groth16 proof of correct decompression** = "I ran Huffman/Airthmetic
  on this ciphertext and got this plaintext" — verified on Solana for
  ~200k CU
- **Encrypted state commitment** = "I encrypted this plaintext with
  this key and got this ciphertext hash" — stored as a compressed
  account for ~5,300 lamports
- **Nullifier** = "I ran the cellular automaton PRNG on this input
  and got this deterministic output" — proven by address-tree existence

The same mathematics. The same algorithms. Just provable on Solana.

---

## Quick Reference Table

| PiedPiper Module | Classical Algorithm | ZK Primitive | On-Chain Equivalent | Cost |
|---|---|---|---|---|
| `Compression/Huffman/Static/` | Huffman coding | `verifyGroth16` | `publish_attestation` | ~618k CU |
| `Compression/Huffman/Adaptive/` | Adaptive Huffman | `verifyGroth16` | `publish_attestation` | ~618k CU |
| `Compression/Arithmetic/` | Arithmetic coding | `verifyGroth16` | `publish_attestation` | ~618k CU |
| `Compression/Add-ons/bwt.c` | Burrows-Wheeler Transform | `verifyGroth16` | `publish_attestation` | ~618k CU |
| `Compression/Add-ons/rle.c` | Run-Length Encoding | `verifyGroth16` | `publish_attestation` | ~618k CU |
| `Encryption/AES-128/` | AES-128 | `commit_encrypted_state` | `commit_encrypted_state` | ~410k CU |
| `Encryption/DES\ Encryption/` | DES | `commit_encrypted_state` | `commit_encrypted_state` | ~410k CU |
| `Encryption/RSA\ Encryption/` | RSA | `commit_encrypted_state` | `commit_encrypted_state` | ~410k CU |
| `Encryption/CA_Password_Protect/` | CA-based PRNG | `computeNullifier` | Client-side | 0 (off-chain) |
| `PP_SSH/` | CA-based SSH | `computeNullifier` | `publish_attestation` | ~618k CU |
| `PP_HASH/sha512-cellularAutomaton_paper.pdf` | SHA-512 via CA | `computeNullifier` | Client-side | 0 (off-chain) |
| `GameOfLife/` | Conway's Game of Life | `verifyGroth16` | `publish_attestation` | ~618k CU |
| `ForestFire_Simulation/` | Forest fire CA | `verifyGroth16` | `publish_attestation` | ~618k CU |
| `mmc/maincode.cpp` | Min-Max decision tree | `computeNullifier` | Client-side | 0 (off-chain) |
| `tic-tac-toe/min-max-tree.cpp` | Tic-Tac-Toe solver | `computeNullifier` | Client-side | 0 (off-chain) |
| `MultiAgent_CollisionAvoidance/` | Distributed agent routing | `computeNullifier` | `publish_attestation` | ~618k CU |

---

## Compression → ZK

### Huffman Static (MinMax `Compression/Huffman/Static/`)

Classical algorithm builds a prefix-code tree from symbol frequencies.
ZK equivalent: a Groth16 proof that attests "given ciphertext C and
canonical Huffman tree H, the decompressed output is O."

**PiedPiper source files:**
- `huffman.c` — tree construction, encoding, decoding
- `compress.c` — file-level compression wrapper
- `decompress.c` — file-level decompression wrapper
- `codeSearchTree.c` — canonical code tree search

**Clawd ZK integration:**
```typescript
// The prover (off-chain) runs the Huffman decoder and produces
// a Groth16 proof that the output is correct given the input.
const proof = await generateHuffmanDecompressionProof(
  ciphertext, tree, plaintext
);

// The verifier (on-chain) checks the proof.
const ix = await client.publishAttestation({
  signer,
  modelHash: hash(tree),
  payloadCommitment: hash(plaintext),
  nullifier: await computeNullifier({ secret, context: "huffman:v1" }),
  proof,
});
```

### Adaptive Huffman (MinMax `Compression/Huffman/Adaptive/`)

Same principle as static Huffman, but the tree adapts as symbols
are processed. The Groth16 circuit verifies the adaptive decoder
step by step.

### Arithmetic Coding (MinMax `Compression/Arithmetic/`)

Interval-based entropy coding. ZK equivalent: a Groth16 proof that
the decompressed interval [low, high) decodes to the correct symbols.

### BWT + RLE (MinMax `Compression/Add-ons/bwt.c`, `rle.c`)

Burrows-Wheeler Transform + Run-Length Encoding. The Groth16 proof
covers the full pipeline: BWT → MTF → RLE → output.

---

## Encryption → ZK

### AES-128 (MinMax `Encryption/AES-128/`)

Classical AES-128 encrypts a plaintext with a 128-bit key. ZK
equivalent: the ciphertext is committed on-chain via
`commit_encrypted_state`, and a Groth16 proof attests that the
committer knows the key and the plaintext.

**PiedPiper source files:**
- `encrypt.c` — AES-128 encryption round functions
- `decrypt.c` — AES-128 decryption round functions
- `expandKeys.c` — key schedule expansion
- `standardDefinitions.c` — S-box, constants

**Clawd ZK integration:**
```typescript
// The prover encrypts off-chain and commits the ciphertext hash.
const ciphertextCommitment = poseidonHash(ciphertext);
const proof = await generateAESProof(key, plaintext, ciphertext);

const ix = await client.commitEncryptedState({
  signer,
  modelHash: hash("aes-128:v1"),
  ciphertextCommitment,
  stateVersion: 1n,
  proof,
});
```

### DES (MinMax `Encryption/DES Encryption/`)

Same pattern as AES-128: the ciphertext commitment + Groth16 proof
attests to correct encryption. The circuit encodes the DES Feistel
network (16 rounds, S-box substitution, permutation).

### RSA (MinMax `Encryption/RSA Encryption/`)

RSA encryption/decryption as a Groth16 circuit over the alt-bn128
field. The proof attests that the exponentation `c = m^e mod n` was
computed correctly without revealing the private key `d`.

### CA-based PRNG (MinMax `Encryption/CA_Password_Protect/`)

The PiedPiper team designed a pseudorandom number generator using
elementary cellular automaton rules (Rule 30, Rule 110, etc.). The
PRNG is the core of their custom encryption engine.

**ZK equivalent:** The `computeNullifier` function is the direct
analogue. A nullifier is a deterministic 32-byte hash derived from
a (secret, context) pair — just as the CA-based PRNG produces
deterministic output from a seed and a rule.

```typescript
// The CA-based PRNG computes: output = CA(seed, rule, rounds)
// The nullifier computes:   nullifier = SHA-256(secret, context)
const nullifier = await computeNullifier({
  secret: seed,      // the CA seed
  context: "piedpiper-ca-prng:v1:" + rule,
});
```

### CA-based SSH (MinMax `PP_SSH/`)

The PiedPiper team designed an SSH-like protocol using their
CA-based encryption. ZK equivalent: nullifier-based session
authentication. The client proves they derived the correct
session key from their long-term secret without revealing it.

```typescript
// Session nullifier = deterministic proof of key possession
const sessionNullifier = await computeNullifier({
  secret: longTermSecret,
  context: "piedpiper-ca-ssh:session:nonce_" + sessionNonce,
});

// On-chain: publish_attestation proves the session was established
const ix = await client.publishAttestation({
  signer,
  modelHash: hash("pp-ssh:v1"),
  payloadCommitment: hash(sessionNullifier),
  nullifier: sessionNullifier,
  proof: groth16Proof,
});
```

---

## Cellular Automata → ZK

### Conway's Game of Life (MinMax `GameOfLife/`)

Conway's Game of Life is a universal computer — it can simulate any
Turing machine. A Groth16 proof can attest that a given initial
configuration evolves to a given final configuration after N
generations without revealing the intermediate states.

**PiedPiper source files:**
- `game_of_life.js` — JavaScript implementation with B3/S23 rule
- `index.html` — browser-based visualization

**Clawd ZK integration (via `pkg/gameoflife/`):**
```typescript
// Prove that glider starts at (0,1) and reaches (n,n) after 3n steps
const initialBoard = seedGlider(0, 1);
const finalBoard = step(initialBoard, 3 * n);
const circuit = new LifeCircuit(initialBoard, finalBoard, 3 * n);

const proof = await circuit.prove();
const ix = await client.publishAttestation({
  signer,
  modelHash: hash(initialBoard),
  payloadCommitment: hash(finalBoard),
  nullifier: await computeNullifier({ secret, context: "life:glider" }),
  proof,
});
```

This is the direct ZK analogue of Conway's universal computer proof:
the computation is private (you don't reveal intermediate frames),
but the final state is verifiable on-chain.

### Forest Fire Simulation (MinMax `ForestFire_Simulation/`)

A cellular automaton that simulates wildfire spread. Same Groth16
pattern: prove that the simulation ran correctly without revealing
the full state trajectory.

---

## Decision Theory → ZK

### Min-Max Algorithm (MinMax `mmc/maincode.cpp`, `tic-tac-toe/min-max-tree.cpp`)

The Min-Max solver computes the optimal move in a zero-sum game by
recursively evaluating the game tree. ZK equivalent: the solver
produces a commitment to the best action, and a nullifier proves
that the solver was consulted for that state without revealing the
full decision tree.

```typescript
// The solver computes the best action.
const bestAction = minMaxSolver(state, depth);

// The nullifier proves the solver was consulted.
const nullifier = await computeNullifier({
  secret: solverSecret,
  context: `minmax:${hash(state)}:${depth}`,
});

// On-chain: the nullifier is the proof of consultation.
// The action itself is revealed, but the decision tree is private.
```

The PiedPiper Min-Max solver computes:
```
utility(d) = weight[d] * utility[state] + Σ utility(child)
```

The ZK nullifier computes:
```
nullifier = SHA-256(secret || context || nonce)
```

Both are deterministic functions of their inputs. Both prove that
computation happened without revealing all intermediate steps.

---

## Go Runtime Integration

The Clawd Go packages that directly inherit PiedPiper algorithms:

| PiedPiper Source | Go Package | File | Integration |
|---|---|---|---|
| `GameOfLife/` | `pkg/gameoflife/` | `life.go` | Toroidal Life engine — `Grid.Step()`, `SeedGlider()`, `SeedGosperGun()` |
| `GameOfLife/` | `pkg/gameoflife/` | `life_test.go` | 6 test functions |
| `Compression/` (middle-out) | `pkg/middleout/` | `loop.go`, `cache.go` | Ralph loop, content caching, content router |
| `Compression/` (Weissman) | `pkg/weissman/` | `weissman.go` | Compression ratio scores |
| `PP_HASH/` (Zero) | `pkg/zero/` | `zero.go` | Zero-dependency startup benchmark |
| `MultiAgent_CollisionAvoidance/` | `pkg/routing/` | `routing.go` | Decentralized agent routing |

---

## On-Chain Integration Patterns

### Pattern 1: Proof of Correct Decompression

```
Client (off-chain)                          Solana (on-chain)
  │                                              │
  ├─ Run Huffman/Arithmetic/BWT decoder          │
  ├─ Generate Groth16 proof                      │
  ├─ Build publish_attestation instruction ─────→│
  │                                              ├─ Verify Groth16 proof
  │                                              ├─ Create nullifier (anti-double-claim)
  │                                              ├─ Write AttestationAccount
  │                                              └─ Emit event
  │                                              │
  └──────────────────────────────────────────────┘
```

### Pattern 2: Proof of Correct Encryption

```
Client (off-chain)                          Solana (on-chain)
  │                                              │
  ├─ Encrypt plaintext with key                  │
  ├─ Hash ciphertext to commitment               │
  ├─ Generate Groth16 proof                      │
  ├─ Build commit_encrypted_state instruction ──→│
  │                                              ├─ Verify Groth16 proof
  │                                              ├─ Write EncryptedStateAccount
  │                                              └─ Emit event
  │                                              │
  └──────────────────────────────────────────────┘
```

### Pattern 3: Nullifier as PRNG Output

```
Client (off-chain)                          Solana (on-chain)
  │                                              │
  ├─ Compute nullifier = SHA-256(secret, ctx)    │
  ├─ (deterministic, same as CA-based PRNG)      │
  ├─ Build publish_attestation instruction ─────→│
  │                                              ├─ Derive address from nullifier
  │                                              ├─ CPI: create compressed PDA
  │                                              └─ Address tree rejects duplicates
  │                                              │
  └──────────────────────────────────────────────┘
```

---

## Credits

**PiedPiper at IIIT Hyderabad:**
- **Varul Srivastava** (`@vs666`) — primary author of MinMax, PP_HASH,
  PP_SSH, CA encryption, multi-agent collision avoidance, Game of Life,
  Forest Fire simulation, PCA analysis, Universal Computer document
- **Akshett Rai Jindal** (`@akshettrj-iiith`) — AES-128, Huffman static
- **Ashwin Mittal** (`@ashwin-mittal`) — BWT+RLE, Huffman, image compression
- **Zishan Kazi** (`@pixel-z`) — DES, audio compression, arithmetic coding
- **Keshav Bansal** (`@keshavbnsl102`) — DES, audio compression, arithmetic coding

Original repository: `https://github.com/vs666/MinMax`
License: MIT — `docs/PiedPiper-master/LICENSE`

---

<div align="center">

**PiedPiper → ZK Adaptation** · Every classical algorithm, provable on Solana.

🦞 *The shell molts. The algorithms do not.*
*From Huffman to Groth16 — the same compression, the same encryption,
the same computation. Just faster. Just verifiable.*

</div>