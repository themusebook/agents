# eliza-agents

Surface for **[cheshireterminal.ai/eliza-agents](https://cheshireterminal.ai/eliza-agents)** and the Solizardking elizaOS fork.

## Links

| Surface | Location |
| --- | --- |
| Eliza fork | https://github.com/Solizardking/eliza |
| Agents catalog repo | https://github.com/Solizardking/agents |
| Plugins + character source | `agents/eliza/plugins/*`, `agents/eliza/packages/cheshire-eliza` |
| Catalog manifest | [catalog.json](./catalog.json) |
| Solizard character JSON | [characters/solizard-eliza.json](./characters/solizard-eliza.json) |

## Required secrets (memory + computer)

```bash
HERMES_API_KEY=   # durable trade/chat vault memory
HONCHO_API_KEY=   # peer dialectic memory
E2B_API_KEY=      # live sandbox computer (optional dry-run without)
```

## PR map

1. **Solizardking/eliza** — plugin + character package PR (`feat/cheshire-eliza-plugins`)
2. **Solizardking/agents** — this `eliza-agents/` folder + catalog JSON
3. **cheshire-terminal** — SPA route `/eliza-agents` serving or linking this catalog (follow-up)

See `eliza/packages/cheshire-eliza/docs/PR_PATH.md` for full git commands.
