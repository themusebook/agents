# ZK Edge Distribution

The Cloudflare Worker at `cloudflare/install-worker.js` is the public edge
surface for installing ClawdBot and discovering the bundled ZK primitive layer.
It serves shell installer wrappers and read-only JSON metadata; it does not
serve private proofs, sign transactions, or submit Solana instructions.

## Public Endpoints

| Endpoint | Purpose |
|---|---|
| `/.well-known/clawdbot-install.json` | Combined installer, repo, route, and ZK metadata |
| `/.well-known/clawdbot-zk.json` | ZK primitive metadata |
| `/.well-known/zk-primitives.json` | ZK metadata alias |
| `/zk` and `/zk.json` | ZK metadata aliases |
| `/metadata.json` and `/catalog` | Combined metadata aliases |
| `/routes` | Machine-readable route table |

The same routes work under the `/clawdbot` base path, for example
`https://zk.x402.wtf/clawdbot/.well-known/clawdbot-zk.json`.

## Metadata Contract

ZK metadata advertises:

- `root`: local runtime root (`zk-primitives`)
- `packages.agent`: `@clawd/zk-shark-agent`
- `packages.client`: `@clawd/zk-client`
- `packages.program`: `clawd-zk` program metadata
- `operations`: `publish_attestation`, `consume_attestation`,
  `commit_encrypted_state`, `verify_proof`, and `compute_nullifier`
- `environment`: accepted `ZK_SHARK_*`, `CLAWD_ZK_*`, and
  `CLAWDBOT_ZK_PRIMITIVES_DIR` variables
- `trustGate`: read/build/send boundaries for automation

This contract is intentionally descriptive. Live sends remain behind the
runtime trust gate and signer policy.

## Runtime Flow

```text
curl installer
  -> Cloudflare Worker wrapper
  -> install.sh
  -> writes CLAWDBOT_ZK_PRIMITIVES_DIR into ~/.clawdbot/.env
  -> clawdbot catalog zk reads zk-primitives/MANIFEST.json
  -> @clawd/zk-shark-agent builds dry-run instructions
  -> delegated signer policy submits only after operator approval
```

## Operator Verification

```bash
node --test cloudflare/install-worker.test.mjs
npx wrangler deploy --dry-run
curl -fsSL https://install.onchainai.fund/.well-known/clawdbot-zk.json
curl -fsSL https://zk.x402.wtf/clawdbot/.well-known/clawdbot-zk.json
clawdbot catalog zk
```

## Boundaries

- Worker vars are public configuration, not secrets.
- Cloudflare metadata is read-only and cacheable.
- Proof material stays off the Worker unless a future authenticated route is
  explicitly designed for it.
- `signAndSend` remains a delegated action. Catalog and metadata discovery
  should never silently move an agent from observer/dry-run into live execution.
