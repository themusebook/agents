# solana-clawd agents

> DeFi agent definitions JSON API + MCP. See root [AGENTS.md](../../AGENTS.md) for full development guidelines, terminal management, and contributing instructions.

This sub-package provides production-ready AI agent definitions in universal JSON format for Web3, crypto trading, portfolio management, and blockchain automation.

## Skill Hub (agents have access)

Do not vendor skill bodies. Resolve skills in this order:

1. Local checkout: `../skillhub-main/skills` (override with `CLAWD_SKILLHUB_ROOT`)
2. Product hub: https://cheshireterminal.ai/skills (`GET /api/skills`)
3. Installer: https://github.com/Solizardking/skills — `npx --yes github:Solizardking/skills install <slug>`
4. Catalog bodies: https://github.com/Solizardking/skillhub-main

Wired to the agent catalog:

- https://cheshireterminal.ai/agents
- https://github.com/Solizardking/agents

CLI: `ct-agents skills` · `ct-agents connect` · `ct-agents skills attach <agent.json> <slug>`

## eliZERO (premiere)

DNA lives in `agents/elizero/` (character, clawd-power, IDENTITY/SOUL/USER/TOOLS).  
Hub entry: `agents/elizero.json`. Validate: `node agents/elizero/validate.mjs`.  
Mint: `8cHzQHUS2s2h8TzCmfqPKYiM4dSt4roa3n7MyRLApump`. Do not invent decimals.

## Membrain (default agent memory)

Selective memory for catalog agents lives in `packages/membrain` (Go daemon + TS/Python/OpenClawd clients).  
Node host: `robinhood-src/membrainMemory.js`. CLI: `ct-agents memory`.  
Runtime default: every agent uses Membrain unless `config.memory.source` is `"none"`.  
JSON HTTP `:9091` for JS agents; gRPC `:9090` for native clients. File adapter: `.membrain-agent-store/`.

Validate daemon: `make -C packages/membrain test`. Host tests: `npm run test:membrain`.

## Cheshire Terminal (local product checkout)

Resolve the sibling app when present — do not vendor it:

`../cheshire-terminal-main` (override with `CLAWD_CHESHIRE_TERMINAL_ROOT`)

Surfaces this package talks to:

- `skills/` · `skills-store/`
- `agents/` · `client/`
- `mcp-server/` · `registry/`
- `robinhood-agents/`
- `agent-arena/` · `agent-arena-skill/`
- `cli/`

CLI: `ct-agents connect` · `ct-agents acp` · `ct-agents a2a`

ACP well-known: `public/.well-known/acp.json`  
A2A premiere server: eliZERO at `/a2a/elizero` (HTTP+JSON). Client peers: eliZERO, ZK Shark, Cheshire Terminal.

## Robinhood agents (local forge checkout)

Use the full dual-rail forge tree when present — do not copy it into this package:

`../cheshire-terminal-main/robinhood-agents` (override with `CLAWD_ROBINHOOD_AGENTS_ROOT`)

That checkout is the source for:

- `skills/` — registry, forge, omni-mint, rh-crypto-agent pack
- `packages/` — clawd-agent-tui, headless-agent, layerzero-omnichain, solana-agent-trust
- `deployments/` — ERC-8004 manifests `4663` / `46630`
- `contracts/` · `src/` · `schema/` · `docs/`

GitHub: https://github.com/Solizardking/robinhood-agents  
Product: https://cheshireterminal.ai/agents · https://cheshireterminal.ai/agents/forge

