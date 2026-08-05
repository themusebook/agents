# Wiring eliza-agents into product

## cheshireterminal.ai/eliza-agents

Suggested SPA page:

- List `catalog.json` characters
- Show plugin badges (knowledge/RAG, robinhood, solana-forging, e2b, memory)
- Link install/docs to Solizardking/eliza plugins + [docs.elizaos.ai knowledge](https://docs.elizaos.ai/plugin-registry/knowledge)
- Env checklist: HERMES / HONCHO / E2B / OPENAI (embeddings)
- Knowledge pack actions: init / upload / eliza-docs (see [KNOWLEDGE_RAG.md](./KNOWLEDGE_RAG.md))

## Runtime start (local)

```bash
cd agents/eliza
# after bun install
export HERMES_API_KEY=...
export HONCHO_API_KEY=...
export E2B_API_KEY=...  # optional
export OPENAI_API_KEY=...  # required for @elizaos/plugin-knowledge embeddings

# Prepare docs/ from package knowledge corpus (optional but recommended)
npx cheshire-terminal-agents knowledge eliza-docs --from ../../knowledge --out ./docs --force
export LOAD_DOCS_ON_STARTUP=true
export KNOWLEDGE_PATH=./docs

# point character plugins at workspace packages
bun run start  # with character using CHESTER_PLUGIN_BUNDLE + plugin-knowledge
```

## Related monorepo packages

| Path | Include |
| --- | --- |
| `eliza-agents/` | this catalog |
| `knowledge/` | JSONL + character corpus |
| `zk-primitives/` | ZK agent/client/programs (upload docs into knowledge packs) |
