# Wiring eliza-agents into product

## cheshireterminal.ai/eliza-agents

Suggested SPA page:

- List `catalog.json` characters
- Show plugin badges (robinhood, solana-forging, e2b, memory)
- Link install/docs to Solizardking/eliza plugins
- Env checklist: HERMES / HONCHO / E2B

## Runtime start (local)

```bash
cd agents/eliza
# after bun install
export HERMES_API_KEY=...
export HONCHO_API_KEY=...
export E2B_API_KEY=...  # optional
# point character plugins at workspace packages
bun run start  # with character using CHESTER_PLUGIN_BUNDLE
```
