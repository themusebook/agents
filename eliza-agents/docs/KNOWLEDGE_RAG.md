# elizaOS Knowledge & RAG for eliza-agents

This surface wires **Cheshire / Clawd agents** to the official elizaOS Knowledge plugin
([@elizaos/plugin-knowledge](https://docs.elizaos.ai/plugin-registry/knowledge)).

Upstream docs index: https://docs.elizaos.ai/llms.txt  
Quick start: https://docs.elizaos.ai/plugin-registry/knowledge/quick-start  
Complete reference: https://docs.elizaos.ai/plugin-registry/knowledge/complete-documentation

## What you get

| Capability | How |
| --- | --- |
| Document store + semantic search | `@elizaos/plugin-knowledge` |
| Auto RAG in chat | Knowledge provider injects top fragments |
| Upload UI | Agent Knowledge tab at `http://localhost:3000` |
| Package corpus | Repo `knowledge/` (JSONL + `clawd-character.md` shape) |
| User packs | `ct-agents knowledge init|upload` |
| eliza `docs/` folder | `ct-agents knowledge eliza-docs` |

## Install

```bash
# in an elizaOS project
elizaos plugins add @elizaos/plugin-knowledge
# or
bun add @elizaos/plugin-knowledge
```

Requires an embedding provider, typically:

```env
OPENAI_API_KEY=...
# or OpenRouter:
# OPENROUTER_API_KEY=...
# OPENROUTER_EMBEDDING_MODEL=openai/text-embedding-3-large
```

## Character plugins

Add the plugin next to SQL/bootstrap (and your Cheshire plugins):

```json
{
  "plugins": [
    "@elizaos/plugin-sql",
    "@elizaos/plugin-bootstrap",
    "@elizaos/plugin-openai",
    "@elizaos/plugin-knowledge",
    "@elizaos/plugin-robinhood",
    "@elizaos/plugin-solana-forging",
    "@elizaos/plugin-e2b-computer",
    "@elizaos/plugin-cheshire-memory"
  ]
}
```

See [characters/solizard-eliza.json](../characters/solizard-eliza.json) and
[characters/clawd.json](../characters/clawd.json) for catalog seeds.

## Load package / user knowledge on startup

```bash
# From cheshire-terminal-agents package root (or any knowledge pack):
npx cheshire-terminal-agents knowledge eliza-docs \
  --from knowledge \
  --out ./docs \
  --force

# Env (merge into project .env)
LOAD_DOCS_ON_STARTUP=true
KNOWLEDGE_PATH=./docs
# Optional quality:
CTX_KNOWLEDGE_ENABLED=true
```

`eliza-docs` organizes:

```text
docs/
  characters/*-character.md   # clawd-character.md shaped narrative
  facts/*.jsonl               # machine facts
  *.md                        # architecture / product notes
  .env.knowledge.example
  eliza-knowledge.manifest.json
```

## Actions (chat)

Once the plugin is loaded:

- **PROCESS_KNOWLEDGE** — “Remember this document: …”
- **SEARCH_KNOWLEDGE** — “Search your knowledge for …”

Web UI: start the agent, open Knowledge tab, drag-and-drop uploads.

## Bridge from ct-agents knowledge packs

```bash
# 1) Personal pack (clawd-character.md template)
npx cheshire-terminal-agents knowledge init --from clawd --out ./my-knowledge

# 2) Upload operator files
npx cheshire-terminal-agents knowledge upload ./notes.md --out ./my-knowledge

# 3) Optional: harness inject (Grok rules)
npx cheshire-terminal-agents knowledge inject ./my-knowledge

# 4) elizaOS RAG docs folder
npx cheshire-terminal-agents knowledge eliza-docs --from ./my-knowledge --out ./docs --force
```

## zk-primitives knowledge

ZK Shark / nullifier docs under [`../../zk-primitives`](../../zk-primitives) can be
uploaded the same way:

```bash
npx cheshire-terminal-agents knowledge upload \
  ../../zk-primitives/docs \
  ../../zk-primitives/zk.md \
  --out ./my-knowledge
npx cheshire-terminal-agents knowledge eliza-docs --from ./my-knowledge --out ./docs --force
```

## Related paths in this repo

| Path | Role |
| --- | --- |
| `eliza-agents/` | Catalog + characters + this doc |
| `knowledge/` | Shared JSONL + character corpus |
| `zk-primitives/` | ZK agent/client/program package |
| `robinhood-src/knowledgeUpload.js` | CLI implementation |
| `scripts/knowledge-inject.mjs` | Harness inject (non-eliza) |
