---
name: tigris-agent-storage
description: Tigris object storage for Clawd agents — self-provisioned buckets, scoped keys, and event-driven writer→watcher handoffs via object notifications (zero polling). Use when agents need durable artifacts, multi-agent coordination, or webhook-triggered handoffs on Tigris.
---

# Tigris agent storage

Clawd agents store artifacts on **Tigris** (`https://t3.storage.dev`) and coordinate through **object notifications**. Agent A writes. Tigris POSTs the webhook. Agent B reads. No polling, no extra queue.

Premiere writer: **eliZERO** (`elizero`). Default watcher sibling: HedgeDNA (`hedgedna`).

## Why this, not a queue

- The bucket is the coordination layer.
- Prefix-scoped triggers (`results/`, `handoffs/`).
- Loose coupling: the writer does not know the consumer.
- Delivery metadata: bucket, key, size, ETag. Sequence with object **Last-Modified**, not `eventTime`.
- At-least-once delivery — handlers must be idempotent (ETag).

## CLI (this package)

```bash
ct-agents storage status
ct-agents storage provision --agent elizero --url https://host/webhook --dry-run
ct-agents storage put --from elizero --file ./report.json
ct-agents storage handoff --from elizero --to hedgedna --file ./report.json
ct-agents storage webhook --port 8788
```

Env: `TIGRIS_STORAGE_BUCKET`, `TIGRIS_STORAGE_ACCESS_KEY_ID`, `TIGRIS_STORAGE_SECRET_ACCESS_KEY`, `TIGRIS_WEBHOOK_SECRET`, `TIGRIS_WEBHOOK_URL`, `TIGRIS_ADAPTER=memory|file|live`.

## Pattern: writer → watcher

```
eliZERO  --PutObject-->  coordination-bucket / agents/elizero/results/*
                              |
                     Tigris object notification
                              |
                              v
                     POST /webhook  (bearer token)
                              |
                              v
                     HedgeDNA GetObject + next step
```

### 1. Notification rule

```bash
tigris buckets set-notifications clawd-elizero-workspace \
  --url https://example.com/webhook \
  --filter 'WHERE `key` REGEXP "^agents/elizero/results/|^handoffs/"' \
  --token "$TIGRIS_WEBHOOK_SECRET"
```

Or: `ct-agents storage provision --agent elizero --url https://example.com/webhook`

### 2. Writer (no consumer awareness)

```js
import { put } from "@tigrisdata/storage";

await put("agents/elizero/results/report.json", report, {
  config: { bucket: "clawd-elizero-workspace" },
});
```

### 3. Webhook dispatches to watcher

Return **200** only after the event is durably handled. Non-200 → Tigris retries. Reject unsigned requests.

### 4. Watcher reads Last-Modified + ETag

```js
import { get, head } from "@tigrisdata/storage";

const meta = await head(key, { config: { bucket } });
const object = await get(key, "string", { config: { bucket } });
// Ignore notifications whose Last-Modified is older than the last processed version.
```

## Agent-managed storage

Agents provision their own workspace. Do not wait for a human to create the bucket.

```bash
AGENT_ID="elizero"
tigris mb "clawd-${AGENT_ID}-workspace"
tigris cp ./results.json "s3://clawd-${AGENT_ID}-workspace/agents/${AGENT_ID}/results/results.json"
```

Coordinator → workers: one bucket per worker, scoped access key, collect outputs, revoke the key.

```bash
tigris access-keys create \
  --name "pipeline-step-3" \
  --policy '{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Action":["s3:GetObject","s3:PutObject"],"Resource":"arn:aws:s3:::pipeline-step-3-data/*"}]}'
```

## Key layout

| Prefix | Role |
| --- | --- |
| `agents/{id}/results/` | Writer artifacts (notification trigger) |
| `agents/{id}/processed/` | Watcher outputs |
| `handoffs/{from}--{to}/` | Explicit envelopes |
| `scratch/` | Short-lived intermediates (lifecycle expire) |

## Guardrails

- Never put private keys, seeds, or JWTs in objects.
- Default trading artifacts stay paper/observe unless a live gate is armed.
- Idempotent handlers only. Sequence by Last-Modified.
- Bearer-token the webhook. Open endpoints are a footgun.

## Official Tigris skills (skills.sh)

This file is the **Clawd** playbook (prefixes, premiere writer, `ct-agents storage`). Official Tigris skills teach SDK/CLI patterns. Project names live in [`TIGRIS.md`](../../TIGRIS.md).

```bash
npx skills add tigrisdata/skills --skill '*' --agent cursor -y --copy
# or one skill:
npx skills add tigrisdata/skills --skill tigris-object-operations
```

Bodies land in `.agents/skills/` (gitignored). Restore from `skills-lock.json`. Browse: https://skills.sh/tigrisdata/skills

| When | Official skill |
| --- | --- |
| SDK vs AWS, CLI (`tigris` / `t3`), credentials | `tigris-sdk-guide` |
| put / get / delete / list / presigned URLs | `tigris-object-operations` |
| Create/list/remove buckets | `tigris-bucket-management` |
| Scoped keys and bucket policies | `tigris-security-access-control` |
| Forks, workspaces, checkpoints, `setupCoordination` | `tigris-agent-kit` |
| Lifecycle / expire scratch | `tigris-lifecycle-management` |

Prefer `@tigrisdata/storage` and the Tigris CLI. Do not invent a second coordination queue.

## Docs

- https://www.tigrisdata.com/docs/ai/agent-skills/
- https://www.tigrisdata.com/docs/use-cases/agent-coordination/
- https://www.tigrisdata.com/docs/use-cases/agent-managed-storage/
- https://www.tigrisdata.com/docs/buckets/object-notifications/
