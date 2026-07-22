# @cheshire/headless-agent

Headless multi-chain agent harness for **Solana** + **Robinhood Chain (EVM 4663)**.

- CLI / automation entry (not a TUI)
- OpenRouter Chat Completions tool loop
- **Zero local retention** by default (no session files / chat DB)
- OpenRouter `provider.data_collection: "deny"` when zero-retention is on
- Logs: routing metadata only (no prompts, keys, full tool dumps)

## Quick start

```bash
export OPENROUTER_API_KEY=sk-or-...

# From monorepo root
pnpm agent:headless -- --prompt "Use multi_chain_capabilities then resolve SOL mint"

# NDJSON events
pnpm agent:headless -- --json --prompt "Resolve RH address 0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73"

# Quiet (exit code only)
pnpm agent:headless -- --quiet --prompt "What chains do you support?"
```

## Domain tools

| Tool | Chain | Mode |
|------|-------|------|
| `solana_resolve_address` | Solana | offline |
| `solana_get_balance` | Solana | RPC |
| `rh_resolve_address` | Robinhood 4663 | offline |
| `rh_get_balance` | Robinhood 4663 | RPC |
| `multi_chain_capabilities` | both | offline |

Optional OpenRouter server tools: `web_search`, `datetime`, `subagent` (cheap worker).

## Privacy

| Env | Default | Meaning |
|-----|---------|---------|
| `HEADLESS_ZERO_RETENTION` | `true` | Send `provider.data_collection=deny` |
| `HEADLESS_SESSION_PERSIST` | `false` | No durable session files |

## Tests

```bash
pnpm agent:headless:test
```
