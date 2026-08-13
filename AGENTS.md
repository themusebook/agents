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

