# Port of Solizardking/Cheshire-Terminal-Agents → musebook.trade

Ported from https://github.com/Solizardking/Cheshire-Terminal-Agents (main) and rebranded to musebook.trade.
npm name: `musebook-agents-forge` (was `cheshire-terminal-agents`). Env prefix `CHESHIRE_*` → `MUSEBOOK_*`.

## Security changes
- Removed the `postinstall` hook (it ran `npm install` in nested packages on every install). Run `npm run packages:install` explicitly.
- zk-omni delivery (`src/zkOmni/deliver.js`) now **simulates by default**. Live sends need `ZK_OMNI_LIVE=1` **and** a fee cap
  `ZK_OMNI_MAX_NATIVE_FEE_WEI`; sends above the cap are refused.
- `scripts/track-install.mjs` (install telemetry to x402.wtf) is not wired to any npm script; disable with `CLAWD_DISABLE_TRACKING=true`.
- Registry deployment stays dry-run unless `--broadcast` is passed (unchanged, fail-closed).

## Intentionally unchanged Cheshire identifiers
- Solidity contracts / deployed manifests (`contracts/`, `deploy/`, `deployments/`): `CheshireAgent*Registry`, `CheshireZkOmniMessenger`,
  ERC-721 name `Cheshire Robinhood Agents`, target `cheshire-agent-registries` — these match deployed bytecode on Robinhood Chain 4663/46630.
- Anchor program `cheshire_agent_trust` (program ID / IDL name).
- External endpoints with no musebook.trade equivalent: `install.cheshireterminal.ai`, `cheshireterminal.ai/api/*`,
  `cheshireterminal.ai/schemas/clawdAgentSchema.v1.json`.
