# Musebook ZK Omnichain Messaging

Nullifier-bound messaging between **Robinhood Chain** and **Solana** for agent intents, attestations, and encrypted-state commitments — with a deployable relayer, Solana receiver, Zero Clawd CLI, and agent TUI.

## Why this exists

The existing LayerZero OApp (`my-lz-oapp`, msgType **3**) authenticates agent intents with per-scope nonces.  
**msgType 4 (ZkOmni)** adds a **zero-knowledge proof of knowledge** (Ed25519 PoK of secret) and a **nullifier** bound to the proof public key so the same proof-backed action cannot be double-published across unordered delivery — without putting the secret on-chain.

| | Authenticated Intent (3) | ZkOmni (4) |
|--|--------------------------|------------|
| Anti-replay | `(srcEid, agentId, nonce)` | `nullifier` (ZK-bound) |
| Binding | parametersHash | payloadCommitment + modelHash + proofPubkey |
| Proof | none | Ed25519 signature over public inputs (64 bytes) |
| Contract (RH) | CheshireOmnichainOApp | CheshireZkOmniMessenger |
| Program (Solana) | musebook_oapp | `programs/zk_omni` (`receive_zk_omni`) |
| Best for | ordered agent commands | one-shot attest / claim / commit |

### ZK construction

```text
seed      = SHA-256("clawd-zk-omni-ed25519:v1" || 0x00 || secret)
(pk, sk)  = Ed25519 keypair from seed
binding   = SHA-256(agentId || payloadCommitment || modelHash)
nullifier = SHA-256("clawd-zk-omni-nullifier:v1" || 0x00 || pk || 0x00 || binding)
proof     = Ed25519.Sign(sk, publicInputsHash)
```

Relayer **always** verifies the proof before delivery. RH contract + Solana program enforce the nullifier↔pk binding on-chain. Solana also requires a prior **Ed25519Program** instruction matching pk / publicInputsHash / signature.

## Architecture

```text
┌────────────────────┐     LayerZero V2      ┌──────────────────────────┐
│ Robinhood (30416)  │ ───────────────────► │ Solana (30168)           │
│ ZkOmniMessenger    │                      │ programs/zk_omni         │
│ sendZkOmni         │ ◄─────────────────── │ receive_zk_omni + NF PDA │
└─────────┬──────────┘                      └────────────┬─────────────┘
          │                                              │
          └────────── zk-omni-relayer ───────────────────┘
               observe → verifyZkProof → deliver (viem / web3.js)

User-facing entry points:
  • npx robinhood-agents zk-omni-*
  • clawdbot zero zkomni / zero ask "zk-omni…"
  • packages/clawd-agent-tui (zk_omni_plan / zk_omni_oneshot)
```

## What was shipped (inventory)

| Component | Path / surface |
|-----------|----------------|
| RH messenger | `contracts/zk-omni/CheshireZkOmniMessenger.sol` |
| LZ endpoint interface + mock | `contracts/zk-omni/ILayerZeroEndpointV2.sol`, `MockLzEndpoint.sol` |
| Foundry tests | `deploy/test/CheshireZkOmniMessenger.t.sol` |
| Solana program | `programs/zk_omni/` (id `Hfbc3tAGYE5nBUa5UncjSV6hoWd3JoVKdA49jPcreXFJ`) |
| Account layout | Named `SZ_*` field sizes; `NullifierAccount::SIZE == 301` (compile-time assert) |
| IDL | `programs/zk_omni/idl.json` |
| Proof / codec | `src/zkOmni/proof.js`, `codec.js` |
| Solana client | `src/zkOmni/solana.js` (Ed25519 ix + receive ix) |
| Deliver | `src/zkOmni/deliver.js` (viem sendZkOmni / web3 receive) |
| Relayer | `src/zkOmni/relayer.js`, `scripts/zk-omni-relayer.mjs` |
| Package export | `musebook-agents-forge/zkOmni` |
| CLI | `zk-omni-plan`, `zk-omni-oneshot`, `zk-omni-nullifier`, `zk-omni-status` |
| Skill (npm pack) | `skills/zk-omni-messaging/SKILL.md` |
| Zero Clawd Go | `ClawdBrowser/go-bot/pkg/zkomni` |
| Zero CLI | `clawdbot zero zkomni plan\|oneshot`, `zero ask` → `IntentZkOmni` |
| Zero skill | go-bot `skills/musebook-zk-omni/SKILL.md` |
| Agent TUI | monorepo `packages/clawd-agent-tui` |

## Contracts & programs

- EVM: `contracts/zk-omni/CheshireZkOmniMessenger.sol`
- EVM mock: `contracts/zk-omni/MockLzEndpoint.sol`
- Solana: `programs/zk_omni/` (`Hfbc3tAGYE5nBUa5UncjSV6hoWd3JoVKdA49jPcreXFJ`, + `idl.json`)
  - `receive_zk_omni` **requires** a prior `Ed25519Program` ix that verifies `proof` over `publicInputsHash`
  - Client: `src/zkOmni/solana.js` builds both ixs; `deliver.js` submits them in one tx
- Foundry: `forge test --match-contract CheshireZkOmniMessengerTest`
- Solana compile: `cd programs/zk_omni && cargo check && cargo test`

### Payload (abi.encode)

```text
uint16  msgType            // = 4
bytes32 agentId
bytes32 controller
bytes32 nullifier
bytes32 payloadCommitment
bytes32 modelHash
bytes32 proofPubkey        // Ed25519 public key
uint64  expiresAt
string  action             // ≤64 UTF-8 bytes
string  memo               // ≤200 UTF-8 bytes
bytes   proof              // 64-byte Ed25519 signature
```

### Deploy sketch (Robinhood)

```bash
# After forge build, deploy with your RH RPC + endpoint
# Endpoint mainnet: 0x6f475642a6e85809b1c36fa62763669b1b48dd5b
# Then: setPeer(30168, bytes32(solanaStore))
```

Env (see `.env.example`):

```bash
ZK_OMNI_MESSENGER_ROBINHOOD=0x…
ZK_OMNI_PEER_SOLANA=0x…   # left-padded store pubkey
ZK_OMNI_MESSENGER_ROBINHOOD_BYTES32=0x…  # for Solana peer checks
LAYERZERO_ENDPOINT_ROBINHOOD=0x6f475642a6e85809b1c36fa62763669b1b48dd5b
ZK_OMNI_SIMULATE=1        # explicit simulate (still builds real call plans)
ZK_OMNI_JOURNAL=.zk-omni-relayer/journal.jsonl
```

## SDK + one-shot

```js
import {
  planZkOmniMessage,
  createRelayer,
  verifyZkProof,
  planSolanaReceive,
  buildRobinhoodSendCall,
} from "musebook-agents-forge/zkOmni";

const plan = planZkOmniMessage({
  direction: "robinhood-to-solana",
  action: "publish_attestation",
  memo: "one-shot",
});

const relayer = createRelayer({ allowSimulateFallback: true });
await relayer.init();
const job = await relayer.oneshot(plan);
```

### CLI (this package)

```bash
npx robinhood-agents zk-omni-plan --action attest --memo demo
npx robinhood-agents zk-omni-oneshot --action publish_attestation
npx robinhood-agents zk-omni-nullifier --context "zk-omni:attest:v1"
npx robinhood-agents zk-omni-status
npx zk-omni-relayer serve --port 8787
```

npm scripts: `zk-omni:plan`, `zk-omni:oneshot`, `zk-omni:relayer`, `zk-omni:status`, `test:zk-omni`.

## Zero Clawd (user-friendly agent path)

From [ClawdBrowser/go-bot](https://github.com) (Zero Clawd runtime):

```bash
# Native Go plan (no Node required) — pkg/zkomni matches proof.js crypto
clawdbot zero zkomni plan --action attest --memo demo
clawdbot zero zkomni oneshot --action publish_attestation

# Natural language (deterministic router, no model call for routing)
clawdbot zero ask "zk-omni message attest demo"
clawdbot zero ask "send cross-chain message robinhood to solana"
```

| Piece | Location |
|-------|----------|
| Go package | `go-bot/pkg/zkomni` |
| CLI | `go-bot/cmd/clawdbot/zero.go` (`zkomni` subcommand) |
| Intent | `IntentZkOmni` in `pkg/zero/intents.go` |
| Skill | `go-bot/skills/musebook-zk-omni/SKILL.md` |

`oneshot` tries `node …/robinhood-agents/src/cli.js`, then `robinhood-agents` / `npx`, and falls back to plan-only if Node is unavailable.

## Relayer service

| Endpoint | Purpose |
|----------|---------|
| `GET /health` | liveness + job stats |
| `GET /jobs` | list journal |
| `POST /oneshot` | plan+deliver body |

Journal: `ZK_OMNI_JOURNAL` or `.zk-omni-relayer/journal.jsonl`

Lifecycle: `observed → verified → queued → relayed → delivered | failed`

### Delivery paths (`src/zkOmni/deliver.js`)

| Direction | Live path | Required env |
|-----------|-----------|--------------|
| `robinhood-to-solana` | `CheshireZkOmniMessenger.sendZkOmni` via **viem** | `RH_RPC_URL`, `ZK_OMNI_MESSENGER_ROBINHOOD`, `PRIVATE_KEY` |
| Solana receive | Ed25519 precompile **+** `receive_zk_omni` via **@solana/web3.js** | `SOLANA_RPC_URL`, `ZK_OMNI_SOLANA_KEYPAIR`, `ZK_OMNI_MESSENGER_ROBINHOOD_BYTES32` |

- Live mode **fails closed** if RPC/keys are missing (no silent success).
- `ZK_OMNI_SIMULATE=1` or CLI oneshot without keys uses explicit simulation that still builds the real call/ix plan.
- Every path runs `verifyZkProof` first.

## Agent TUI

`packages/clawd-agent-tui` (OpenRouter harness):

| Tool / command | Purpose |
|----------------|---------|
| `zk_omni_plan` | Plan RH↔Solana msgType-4 + nullifier |
| `zk_omni_oneshot` | Plan + local relayer oneshot |
| `/omni` | Messenger constants in REPL |

```bash
cd packages/clawd-agent-tui
npm start -- --oneshot "help"
# interactive: ask the agent to plan a RH→Solana zk omni message
```

## Tests

```bash
# Node (codec, proof, Solana ix, relayer, fail-closed deliver)
npm run test:zk-omni

# Foundry (messenger + nullifier relation + proof length)
forge test --match-contract CheshireZkOmniMessengerTest

# Solana program (program id, public hash, account SIZE layout)
cd programs/zk_omni && cargo test

# Zero Clawd
cd ClawdBrowser/go-bot && go test ./pkg/zkomni ./pkg/zero
```

## Constants

| Name | Value |
|------|--------|
| `MSG_ZK_OMNI` | `4` |
| Robinhood EID | `30416` (chain 4663) |
| Solana EID | `30168` |
| Solana program | `Hfbc3tAGYE5nBUa5UncjSV6hoWd3JoVKdA49jPcreXFJ` |
| `NullifierAccount::SIZE` | `301` (9×32 + 4 + 8 + 1) |
| RH LZ Endpoint V2 | `0x6f475642a6e85809b1c36fa62763669b1b48dd5b` |

## Related

- Dual-rail identity: [docs/OMNI_MINT.md](./OMNI_MINT.md)
- LayerZero notes: monorepo `packages/layerzero-omnichain`, `my-lz-oapp/`
- ZK Shark / clawd-zk: go-bot `zk-primitives/`
