---
name: membrain-memory
description: Membrain selective memory for Clawd catalog agents — typed ingest, trust-gated retrieve, auto-context, decay, and revision. Default memory source unless config.memory.source is none.
---

# Membrain memory

Catalog agents persist recall in **Membrain** (`packages/membrain`). DNA files (`IDENTITY.md`, `SOUL.md`) are continuity. Knowledge inject is the curated corpus. Membrain is the runtime memory substrate: episodic trades, semantic facts, competence strategies, working state, plan graphs.

Premiere agent: **eliZERO** (`elizero`). Scope: `agent:{id}`.

## Why this, not a chat log

- Typed records (not a flat transcript).
- Revisable: supersede, fork, contest, retract.
- Decay: stale observations fade unless reinforced.
- Trust gating: sensitivity levels for multi-agent retrieval.
- JSON HTTP for JS agents (`:9091`) plus gRPC (`:9090`).

## CLI (this package)

```bash
ct-agents memory status
ct-agents memory ingest --agent elizero --summary "Jupiter swap filled"
ct-agents memory observe --agent elizero --subject $CLAWD --predicate liquidity --object "peaks 2-4pm UTC"
ct-agents memory retrieve --agent elizero --query "evaluate SOL swap"
ct-agents memory context --agent elizero
ct-agents memory start
```

Env: `MEMBRAIN_ADAPTER=file|memory|live`, `MEMBRAIN_HTTP_URL`, `MEMBRAIN_GRPC`, `MEMBRAIN_API_KEY`, `MEMBRAIN_STORE`.

Default adapter is `file` (`.membrain-agent-store/`). `live` talks to `membraned`.

## Agent JSON

Omitted `config.memory` still resolves to Membrain at runtime:

```json
{
  "memory": {
    "source": "membrain",
    "agentId": "elizero",
    "endpoint": "localhost:9090",
    "http": "http://127.0.0.1:9091",
    "autoContext": true
  }
}
```

Set `"source": "none"` to disable.

## Node host

```js
import { createStore, resolveAgentMemory } from 'cheshire-terminal-agents/memory';

const memory = resolveAgentMemory(agentJson);
const store = await createStore({ agentId: memory.agentId });
await store.ingestEvent({ summary: 'swap filled', eventKind: 'swap_executed' });
const hits = await store.retrieve('evaluate SOL swap');
const context = await store.contextForAgent('elizero');
```

## Daemon

```bash
make -C packages/membrain build
./packages/membrain/bin/membraned --db ./membrane.db
# gRPC :9090 · JSON HTTP :9091
```

Clients in-tree: `packages/membrain/clients/typescript`, `clients/python`, `clients/openclawd`.
