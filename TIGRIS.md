# Tigris context (this project)

Project-specific Tigris setup for Clawd agents. **Skills** teach how to use Tigris; **this file** tells agents our bucket names, prefixes, and env.

Install official playbooks (once per clone):

```bash
npx skills add tigrisdata/skills --skill '*' --agent cursor -y --copy
```

Browse: https://skills.sh/tigrisdata/skills · lockfile: `skills-lock.json`.

## Clawd layout

| Item | Value |
| --- | --- |
| Endpoint | `https://t3.storage.dev` |
| Shared coordination bucket | `clawd-agent-coordination` (`TIGRIS_STORAGE_BUCKET`) |
| Per-agent workspace | `clawd-{agentId}-workspace` |
| Premiere writer | `elizero` (`CLAWD_PREMIERE_AGENT`) |
| Default watcher sibling | `hedgedna` |
| Adapter | `live` when access key + secret are set; else `file` (`.tigris-agent-store/`) or `memory` |

### Key prefixes

| Prefix | Role |
| --- | --- |
| `agents/{id}/results/` | Writer artifacts — notification trigger |
| `agents/{id}/processed/` | Watcher outputs |
| `handoffs/{from}--{to}/` | Explicit envelopes |
| `scratch/` | Short-lived intermediates |

Sequence by object **Last-Modified**, not `eventTime`. Idempotent on **ETag**. Webhook bearer: `TIGRIS_WEBHOOK_SECRET`. Non-200 → Tigris retries.

### Env

```bash
TIGRIS_STORAGE_BUCKET=clawd-agent-coordination
TIGRIS_STORAGE_ACCESS_KEY_ID=tid_...
TIGRIS_STORAGE_SECRET_ACCESS_KEY=tsec_...
TIGRIS_STORAGE_ENDPOINT=https://t3.storage.dev
TIGRIS_WEBHOOK_SECRET=...
TIGRIS_WEBHOOK_URL=https://host/webhook
TIGRIS_ADAPTER=memory|file|live
CLAWD_PREMIERE_AGENT=elizero
```

Never commit credentials. `@tigrisdata/storage` is optional — `ct-agents storage` falls back to the file adapter.

### CLI

```bash
ct-agents storage status
ct-agents storage provision --agent elizero --url https://host/webhook --dry-run
ct-agents storage put --from elizero --file ./report.json
ct-agents storage handoff --from elizero --to hedgedna --file ./report.json
ct-agents storage webhook --port 8788
```

## Skills vs this file

| | Skills | This file |
| --- | --- | --- |
| Scope | Procedural (SDK, buckets, objects, agent-kit) | This repo’s names and env |
| Official | `npx skills add tigrisdata/skills` → `.agents/skills/` | `TIGRIS.md` |
| Clawd-specific | `skills/tigris-agent-storage/SKILL.md` | — |

Use both: official skills for Tigris APIs; Clawd skill + this file for writer→watcher handoffs.

## Official skills installed here

Storage: `tigris-sdk-guide`, `tigris-object-operations`, `file-storage`, `tigris-image-optimization`, `tigris-static-assets`

Buckets: `tigris-bucket-management`, `tigris-lifecycle-management`, `tigris-security-access-control`

Snapshots / migration: `tigris-snapshots-forking`, `tigris-snapshots-recovery`, `tigris-s3-migration`, `tigris-backup-export`

Agent kit: `tigris-agent-kit` (forks, workspaces, checkpoints, `setupCoordination` webhooks)

Other: `tigris-egress-optimizer`, `tigris-python-sdk`, `openclaw-backup`, `conventional-commits`, `go-table-driven-tests`

Docs list `installing-tigris-storage`; it is not in the `tigrisdata/skills` git snapshot this lockfile pins. Use `tigris-sdk-guide` for SDK/endpoint/credentials.

Prefer `@tigrisdata/storage` and the Tigris CLI (`tigris` / `t3`) over raw AWS S3 SDKs.
