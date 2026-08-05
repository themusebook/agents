# Agentic DNA templates

Blank continuity templates for Clawd / OpenClawd / Eliza-style agents.

**Product hubs:** [agents](https://cheshireterminal.ai/agents) · [cli](https://cheshireterminal.ai/cli) · [eliza-agents](https://cheshireterminal.ai/eliza-agents) · **Package:** [`cheshire-terminal-agents`](https://www.npmjs.com/package/cheshire-terminal-agents)

| File | Role |
| --- | --- |
| `IDENTITY.MD` | Who wakes up each session |
| `SOUL.MD` | Constitution: truths, boundaries, vibe |
| `USER.MD` | Human context (living notes) |
| `TOOLS.MD` | Environment-specific cheat sheet |
| `BOOTSTRAP.MD.COMPLETED` | First-run conversation (completed template) |

## Generate your own DNA

Use any seed under [`../characters/`](../characters/) (or free-form flags):

```bash
# list character seeds
npx cheshire-terminal-agents dna list

# generate a full DNA bundle from Clawd
npx cheshire-terminal-agents dna generate --from clawd --out ./my-clawd-dna

# investor persona
npx cheshire-terminal-agents dna generate --from warrenbuffet --out ./buffett-dna --user Ada

# custom identity (no character file)
npx cheshire-terminal-agents dna generate \
  --name Nova \
  --creature "Solana research familiar" \
  --vibe "warm, precise" \
  --emoji "✨" \
  --out ./nova-dna
```

Each generate writes `IDENTITY.md`, `SOUL.md`, `TOOLS.md`, `USER.md`, `BOOTSTRAP.md`,
`persona.json`, `index.json`, and a `character.seed.json` lineage copy when applicable.

Point your agent workspace at the output directory so DNA loads as session continuity.
