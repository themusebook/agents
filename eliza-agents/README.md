# eliza-agents

Surface for **[cheshireterminal.ai/eliza-agents](https://cheshireterminal.ai/eliza-agents)** and the Solizardking elizaOS fork.

## Links

| Surface | Location |
| --- | --- |
| Product hub (this surface) | https://cheshireterminal.ai/eliza-agents |
| Agent hub | https://cheshireterminal.ai/agents |
| Eliza fork | https://github.com/Solizardking/eliza |
| Agents catalog repo | https://github.com/Solizardking/agents |
| Site CLI repo | https://github.com/Solizardking/cli |
| Main product repo | https://github.com/Solizardking/cheshire-terminal |
| Plugins + character source | `agents/eliza/plugins/*`, `agents/eliza/packages/cheshire-eliza` |
| Catalog manifest | [catalog.json](./catalog.json) (includes full `openSource` map) |
| Package OSS map | [../open-source-connection-map.json](../open-source-connection-map.json) |
| Solizard character JSON | [characters/solizard-eliza.json](./characters/solizard-eliza.json) |
| Knowledge & RAG | [docs/KNOWLEDGE_RAG.md](./docs/KNOWLEDGE_RAG.md) |
| Package knowledge corpus | [`../knowledge`](../knowledge) |
| ZK primitives package | [`../zk-primitives`](../zk-primitives) |

## Knowledge & RAG (@elizaos/plugin-knowledge)

Official docs: https://docs.elizaos.ai/plugin-registry/knowledge

```bash
# Install into an elizaOS project
elizaos plugins add @elizaos/plugin-knowledge

# Prepare package knowledge/ as eliza docs/ for LOAD_DOCS_ON_STARTUP
npx cheshire-terminal-agents knowledge eliza-docs --from knowledge --out ./docs --force

# Env
OPENAI_API_KEY=...
LOAD_DOCS_ON_STARTUP=true
KNOWLEDGE_PATH=./docs
```

Characters in this catalog (e.g. **eliZERO** premiere, Solizard, Clawd) list `@elizaos/plugin-knowledge` so agents can store/retrieve PDFs, MD, JSONL, and answer with semantic search. Full guide: [docs/KNOWLEDGE_RAG.md](./docs/KNOWLEDGE_RAG.md).

## Required secrets (memory + computer + RAG)

```bash
MEMBRAIN_HTTP_URL=http://127.0.0.1:9091   # default catalog memory (packages/membrain)
MEMBRAIN_ADAPTER=file                     # file|memory|live — live talks to membraned
HERMES_API_KEY=   # optional durable trade/chat vault (legacy)
HONCHO_API_KEY=   # optional peer dialectic memory (legacy)
E2B_API_KEY=      # live sandbox computer (optional dry-run without)
OPENAI_API_KEY=   # embeddings for @elizaos/plugin-knowledge (or OpenRouter)
```

Catalog agents use **Membrain** as the memory source (`ct-agents memory`). Hermes/Honcho remain optional extras.

## Layout

```text
eliza-agents/
  catalog.json
  README.md
  characters/          # eliza character seeds (eliZERO premiere, clawd, solizard, …)
  docs/
    WIRING.md
    KNOWLEDGE_RAG.md
```

Sibling packages included in the agents monorepo:

- `knowledge/` — OpenClawd knowledge corpus + upload/inject CLI
- `zk-primitives/` — ZK Shark agent, client, programs, tests

## PR map

1. **Solizardking/eliza** — plugin + character package PR (`feat/cheshire-eliza-plugins`)
2. **Solizardking/agents** — this `eliza-agents/` folder + catalog JSON + knowledge RAG wiring
3. **cheshire-terminal** — SPA route `/eliza-agents` serving or linking this catalog (follow-up)

See `eliza/packages/cheshire-eliza/docs/PR_PATH.md` for full git commands.
