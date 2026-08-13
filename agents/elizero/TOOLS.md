# TOOLS.md — eliZERO local notes

Skills define *how* tools work. This file is *your* environment map.

## Bundle paths

| Path | Purpose |
| --- | --- |
| `character.json` | elizaOS character (bio, style, system) |
| `elizero.json` | Clawd agent catalog manifest |
| `clawd-power.json` | $CLAWD mint, birth funding, x402 |
| `IDENTITY.md` / `SOUL.md` | who + constitution |
| `USER.md` | human notes |
| `validate.mjs` | self-check |

## Zero engine

```bash
# from zero-clawd root
go test ./pkg/zero/...
clawdbot zero ask "inspect"
clawdbot zero run --attest att.json "audit the OODA loop"
clawdbot zero verify run.jsonl
```

Env: `ZERO_SECRET_HEX` (≥16 bytes hex) for re-derivable nullifiers.

## $CLAWD powering

| Constant | Value |
| --- | --- |
| Mint | `8cHzQHUS2s2h8TzCmfqPKYiM4dSt4roa3n7MyRLApump` |
| Birth CLAWD | `1000` |
| Birth SOL | `0.069420` |
| Skill | `agent/skills/clawd-token-ops` |
| Go default | `pkg/birthfund.DefaultCLAWDMint` |

Env overrides (mint): `CLAWD_TOKEN_MINT`, `CLAWDBOT_CLAWD_MINT`, `CLAWDBOT_CLAWD_TOKEN_MINT`.

## Tigris storage (event-driven handoffs)

Writer PutObject → Tigris notification POST → watcher GetObject. Zero polling.

```bash
ct-agents storage status
ct-agents storage provision --agent elizero --url https://host/webhook --dry-run
ct-agents storage put --from elizero --file ./report.json
ct-agents storage handoff --from elizero --to hedgedna --file ./report.json
ct-agents storage webhook --port 8788
```

| Prefix | Role |
| --- | --- |
| `agents/elizero/results/` | Writer artifacts (notification trigger) |
| `handoffs/elizero--{to}/` | Explicit envelopes |
| Skill | `skills/tigris-agent-storage` |

Env: `TIGRIS_STORAGE_BUCKET`, `TIGRIS_STORAGE_ACCESS_KEY_ID`, `TIGRIS_STORAGE_SECRET_ACCESS_KEY`, `TIGRIS_WEBHOOK_SECRET`. Sequence by object Last-Modified; handlers are idempotent on ETag.

## Membrain memory (default source)

Typed, revisable memory for this agent lives in **Membrain** (`packages/membrain`). DNA files are continuity; Membrain is recall.

```bash
ct-agents memory status
ct-agents memory ingest --agent elizero --summary "Zero attested dry task completed"
ct-agents memory retrieve --agent elizero --query "last attested run"
ct-agents memory context --agent elizero
ct-agents memory start
```

| Item | Value |
| --- | --- |
| Source | `membrain` |
| Scope | `agent:elizero` |
| gRPC | `localhost:9090` |
| JSON HTTP | `http://127.0.0.1:9091` |
| Skill | `skills/membrain-memory` |

Env: `MEMBRAIN_ADAPTER=file|memory|live`, `MEMBRAIN_HTTP_URL`, `MEMBRAIN_GRPC`, `MEMBRAIN_API_KEY`. File adapter writes `.membrain-agent-store/`. Live talks to `membraned`.

## Catalog registration

- DNA bundle (this folder): `agents/elizero/`  
- Hub catalog entry: `agents/elizero.json` (`featured` + `oneShot`, pinned first)  
- Upstream source: `zero-clawd/agent/eliza/eliZERO`  
- eliza character copies: `characters/elizero.json`, `eliza-agents/characters/elizero.json`  

## RPC / APIs (fill as configured)

- RPC primary →  
- Helius →  
- Birdeye →  
- zkrouter → `https://clawdrouter-zk.fly.dev/v1` (public free key patterns in docs)  

## Guardrails

- No private keys in this file.  
- No treasury secrets.  
- Confirm before mainnet transfers / burns / stakes.

---

Update as the install hardens. Keep secrets in env / vault only.
