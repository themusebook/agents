<p align="center">
  <a href="public/assets/cheshire-terminal-agents.svg">
    <img src="public/assets/cheshire-terminal-agents.svg" alt="Animated Clawd Agents banner — dual-chain identity forge and production agent catalog" width="100%" />
  </a>
</p>

# Clawd Agents

**Catalog + forge. One package for agent prompts and on-chain identity.**  
Ship Clawd / Cheshire-schema agents, then register them on **Robinhood Chain** (EVM / ERC-8004), **Solana** (SVM / Metaplex Core), or *both rails* with optional LayerZero zk-omni through the Cheshire Terminal hub.

<p align="center">
  <a href="https://cheshireterminal.ai/agents"><img alt="Open Agent Hub" src="https://img.shields.io/badge/OPEN_AGENT_HUB-75f58b?style=for-the-badge&labelColor=07140d" /></a>
  <a href="https://cheshireterminal.ai/agents/forge"><img alt="Open Agent Forge" src="https://img.shields.io/badge/OPEN_AGENT_FORGE-c084fc?style=for-the-badge&labelColor=12081f" /></a>
  <a href="https://www.npmjs.com/package/cheshire-terminal-agents"><img alt="npm cheshire-terminal-agents" src="https://img.shields.io/badge/npm-cheshire--terminal--agents-ff8ad8?style=for-the-badge&labelColor=1b0b18" /></a>
  <a href="LICENSE"><img alt="MIT license" src="https://img.shields.io/badge/LICENSE-MIT-9f8cff?style=for-the-badge&labelColor=100b1d" /></a>
</p>

<p align="center">
  <img alt="Node.js 18.18+" src="https://img.shields.io/badge/Node-%3E%3D18.18-5fa04e?style=flat-square&logo=nodedotjs&logoColor=white" />
  <img alt="138 catalog agents" src="https://img.shields.io/badge/catalog-138_agents-75f58b?style=flat-square" />
  <img alt="31 skills" src="https://img.shields.io/badge/skills-31-c084fc?style=flat-square" />
  <img alt="Solana mainnet-beta" src="https://img.shields.io/badge/Solana-mainnet--beta-9f8cff?style=flat-square&logo=solana&logoColor=white" />
  <img alt="Robinhood Chain 4663" src="https://img.shields.io/badge/Robinhood_Chain-4663-75f58b?style=flat-square" />
  <img alt="npm v1.48.3" src="https://img.shields.io/badge/npm-v1.48.3-cb3837?style=flat-square&logo=npm&logoColor=white" />
</p>

```
  ██████╗██╗      █████╗ ██╗    ██╗██████╗      █████╗  ██████╗ ███████╗███╗   ██╗████████╗███████╗
 ██╔════╝██║     ██╔══██╗██║    ██║██╔══██╗    ██╔══██╗██╔════╝ ██╔════╝████╗  ██║╚══██╔══╝██╔════╝
 ██║     ██║     ███████║██║ █╗ ██║██║  ██║    ███████║██║  ███╗█████╗  ██╔██╗ ██║   ██║   ███████╗
 ██║     ██║     ██╔══██║██║███╗██║██║  ██║    ██╔══██║██║   ██║██╔══╝  ██║╚██╗██║   ██║   ╚════██║
 ╚██████╗███████╗██║  ██║╚███╔███╔╝██████╔╝    ██║  ██║╚██████╔╝███████╗██║ ╚████║   ██║   ███████║
  ╚═════╝╚══════╝╚═╝  ╚═╝ ╚══╝╚══╝ ╚═════╝     ╚═╝  ╚═╝ ╚═════╝ ╚══════╝╚═╝  ╚═══╝   ╚═╝   ╚══════╝
                         ✦ dual-chain agent forge · cheshire-terminal-agents@1.48.3 ✦
```

**Clawd Agents** ships as [`cheshire-terminal-agents`](https://www.npmjs.com/package/cheshire-terminal-agents) on npm — the open catalog + forge package for:

1. **Agent catalog** — 138 dual-chain agent definitions, character personas, locales, and schema validation  
2. **Identity forge** — dual-rail registration (Robinhood Chain EVM + Solana SVM) with fail-closed safety  

Hosted surfaces: [agent hub](https://cheshireterminal.ai/agents) · [agent forge](https://cheshireterminal.ai/agents/forge) · [catalog API](https://cheshireterminal.ai/api/agents/catalog)

---

## ⎧ ONE-SHOT INSTALL ⎫

```bash
# zero config — open the design TUI (fork templates → customize → save)
npx cheshire-terminal-agents

# or explicit
npx cheshire-terminal-agents design

# install globally (bins: cheshire-terminal-agents · ct-agents)
npm i -g cheshire-terminal-agents
ct-agents design
ct-agents catalog
ct-agents serve

# add to any project
npm i cheshire-terminal-agents
```

Requires **Node.js `>=18.18`** (ESM).

### Design your own agent (TUI)

Every catalog agent, character, minted example, and blank scaffold is a **forkable template**. The design TUI walks you through:

1. **Pick a template** — catalog agent / character / scaffold / minted  
2. **Customize** — identifier, title, author, category, tags, systemRole  
3. **Validate** — against `schema/clawdAgentSchema.v1.json`  
4. **Save** — local JSON you own (default `./agents/<id>.json`)

```bash
# interactive forge
ct-agents design
ct-agents forge          # alias

# list everything you can fork
ct-agents design --list

# non-interactive fork
ct-agents design --from defi-yield-farmer --id my-yield-bot --out ./agents/my-yield-bot.json

# blank scaffold
ct-agents design --blank --id research-bot --title "Research Bot" --out ./research-bot.json

# oneshot forge + choose Skill Hub skills (refs only — no bloat)
ct-agents design --from blank --id forge-bot \
  --skills metaplex-agent,cheshire-core \
  --out ./forge-bot.json

# same, and download ONLY those skills into ./.agents/skills
ct-agents design --from blank --id forge-bot \
  --skills metaplex-agent,trading \
  --install-skills \
  --out ./forge-bot.json

# Skill Hub browser (595 skills stay remote)
ct-agents skills packs
ct-agents skills search vulcan
ct-agents skills install metaplex-agent          # sparse fetch of one skill
ct-agents skills attach ./forge-bot.json trading # add refs to existing agent

# validate a definition
ct-agents design --validate ./agents/my-yield-bot.json
```

**Skills without install bloat:** the 595 Skill Hub playbooks live at
[Solizardking/skillhub-main](https://github.com/Solizardking/skillhub-main).
This package only ships a tiny `skills/skillhub-index.json` pointer + curated packs.
Full catalog is fetched on demand; installs pull **only** the slugs you select.

| Source | Path | Role |
|--------|------|------|
| Catalog agents | `agents/*.json` | Production prompts — fork & specialize |
| Scaffolds | `templates/*.template.json` | Blank / DeFi / security / trading starters |
| Characters | `characters/*.json` | Persona seeds converted to agent shells |
| Minted | `minted/*.json` | On-chain mint metadata → light agent shells |
| Schema | `schema/clawdAgentSchema.v1.json` | Validation contract |
| Locales | `locales/<id>/` | i18n packs for published agents |

### CLI

| Command | Effect |
|---------|--------|
| `ct-agents` / `ct-agents design` | **Design TUI** — fork templates, customize, validate, save |
| `ct-agents forge` | Alias for `design` |
| `ct-agents design --list` | List forkable templates (agents + scaffolds + characters) |
| `ct-agents design --from <id>` | Non-interactive fork |
| `ct-agents design --validate <file>` | Schema-check an agent JSON |
| `ct-agents catalog` | Print catalog stats (agents, categories, hub) |
| `ct-agents templates` | List scaffold templates from the catalog |
| `ct-agents skills` | List deployable skill directories |
| `ct-agents registry` | Print on-chain registry index |
| `ct-agents schema` | Show `clawdAgentSchema` info |
| `ct-agents serve [--port]` | Local static API from `public/` |
| `ct-agents --help` | Usage + live endpoint map |

```bash
npx cheshire-terminal-agents design --list
npx cheshire-terminal-agents catalog
npx cheshire-terminal-agents skills
npx cheshire-terminal-agents serve --port 8080
```

---

## ⎧ WHAT YOU GET ⎫

| Surface | Included | Boundary |
|---------|----------|----------|
| **Agent catalog** | 138 agents in `agents-catalog.json`, 53 JSON defs under `agents/`, 11 characters, locales, schema | Prompts + metadata — not a custody runtime |
| **CLI** | `cheshire-terminal-agents` · `ct-agents` → `bin/ct-agents.js` | No silent wallet broadcast |
| **Skills** | 31 deployable skill modules under `skills/` | Instruction content — pin like code |
| **REST / discovery** | `public/api/agents/*`, `.well-known/acp.json`, `ai-plugin.json` | Hosted hub is source of truth for live chain config |
| **Nested packages** | Source under `packages/*` (TUI, headless, LZ, trust) | **Private / unpublished** — not on npm |
| **Optional companion** | [`clawdbot-go`](https://www.npmjs.com/package/clawdbot-go) Zero Clawd runtime | Separate package — not a hard dependency |

```
catalog prompts ──► agents-catalog.json ──► hub / MCP / chat
metadata + image ──► choose rails
  ├─ Robinhood Chain (4663)  → ERC-8004 identity
  ├─ Solana mainnet          → Metaplex Core + Agent Identity
  └─ both + zk-omni          → dual_identity_link (LayerZero)
```

---

## ⎧ LIVE ENDPOINTS ⎫

```
 AGENT HUB        https://cheshireterminal.ai/agents
 CATALOG API      GET /api/agents/catalog          →  138 agents
 REGISTRY         GET /api/agents/registry          →  on-chain docs
 TEMPLATES        GET /api/agents/templates          →  scaffolds
 ACP DISCOVERY    GET /.well-known/acp.json         →  protocol
 AI PLUGIN        GET /.well-known/ai-plugin.json   →  chat-gpt
 ASSETS           /assets/*.svg                     →  forge art
```

```bash
curl -fsS https://cheshireterminal.ai/api/agents/catalog | jq '.stats'
```

---

## ⎧ CATALOG STATS ⎫

Facts from `agents-catalog.json` (rebuild with `npm run build`):

| Metric | Count |
|--------|------:|
| **Agents** | **138** |
| One-shots | 1 |
| Featured | 5 |
| Categories | 15 |
| Character profiles (`characters/`) | 11 |
| Agent JSON defs (`agents/`) | 53 |
| Deployable skills | 31 |
| Locale files | ~759 |

### Category breakdown

| Category | Agents |
|----------|-------:|
| defi | 64 |
| payments | 25 |
| trading | 13 |
| security | 6 |
| infrastructure | 5 |
| platform | 4 |
| tools | 4 |
| dev-tools | 3 |
| voice-council | 3 |
| crypto | 2 |
| governance | 2 |
| education | 2 |
| nft | 2 |
| programming | 1 |
| research | 1 |

### Featured agents

| Agent | Category | Type |
|-------|----------|------|
| **Clawd Perps Runtime** | `trading` | featured |
| **CLAWD LiveKit Voice** | `platform` | featured |
| **Mechaplex · Mech Builder** | `platform` | featured |
| **Solana PumpFun/PumpSwap Copy Trading Bot** | `trading` | one-shot · featured |
| **Vulcan CLAWD Autonomous Perps** | `trading` | featured |

---

## ⎧ NPM SURFACE ⎫

| Package | npm | Status |
|---------|-----|--------|
| **Clawd Agents / forge** | [`cheshire-terminal-agents@1.48.3`](https://www.npmjs.com/package/cheshire-terminal-agents) | **Published** · bins `cheshire-terminal-agents`, `ct-agents` |
| Zero Clawd runtime | [`clawdbot-go`](https://www.npmjs.com/package/clawdbot-go) | Optional companion |
| `@cheshire/clawd-agent-tui` | — | **Private** (source only in `packages/clawd-agent-tui`) |
| `@cheshire/headless-agent` | — | **Private** (source only in `packages/headless-agent`) |
| `@cheshire/layerzero-omnichain` | — | **Private** |
| `@cheshire/solana-agent-trust` | — | **Private** |

```bash
# published package only
npm view cheshire-terminal-agents name version bin
# name = cheshire-terminal-agents
# version = 1.48.3
# bin.cheshire-terminal-agents = bin/ct-agents.js
# bin.ct-agents = bin/ct-agents.js
```

---

## ⎧ REPO TOPOLOGY ⎫

```
clawd-agents / cheshire-terminal-agents
├── agents/              # 53 agent definition JSON files
├── characters/          # 11 character profiles
├── bin/ct-agents.js     # CLI entry (npm bins)
├── docs/                # documentation
├── examples/            # robinhood + solana templates
├── locales/             # i18n overlays (~759 files)
├── packages/            # private nested packages (not published)
│   ├── clawd-agent-tui/
│   ├── headless-agent/
│   ├── layerzero-omnichain/
│   └── solana-agent-trust/
├── public/
│   ├── .well-known/     # acp.json · ai-plugin.json
│   ├── api/agents/      # catalog · registry · templates
│   └── assets/          # animated SVG banners
├── robinhood-src/       # catalog loaders + bridge
├── schema/              # clawdAgentSchema
├── scripts/             # build + validate
├── skills/              # 31 deployable skills
├── agents-catalog.json  # built catalog (138 agents)
└── package.json         # name: cheshire-terminal-agents @ 1.48.3
```

---

## ⎧ QUICK START ⎫

```bash
# 1. Install
npm i -g cheshire-terminal-agents

# 2. Browse the catalog
ct-agents catalog

# 3. List skills
ct-agents skills

# 4. Schema info
ct-agents schema

# 5. Serve the local API
ct-agents serve --port 8080
```

From any project (after `npm i cheshire-terminal-agents`):

```js
import catalog from 'cheshire-terminal-agents/catalog'
// or load agents-catalog.json via package exports
console.log('Clawd Agents ready')
```

Root agent scaffolds: `agent-template.json` · `agent-template-full.json` · `agent-template-attested.json`.

---

## ⎧ DEPLOYMENT PATHS ⎫

```
┌─── PR into repo ──────────────────────────────────────────────┐
│  static agent prompt · auto-cdn · locales                     │
└───────────────────────────────────────────────────────────────┘
┌─── Self-host + A2A ───────────────────────────────────────────┐
│  custom logic · streaming · discoverable via hub              │
└───────────────────────────────────────────────────────────────┘
┌─── Mint as MPL Core ──────────────────────────────────────────┐
│  on-chain identity · solana:mainnet · transferable ownership  │
└───────────────────────────────────────────────────────────────┘
┌─── MCP server only ───────────────────────────────────────────┐
│  tool provider · clawd desktop · cursor                       │
└───────────────────────────────────────────────────────────────┘
```

---

## ⎧ SECURITY MODEL ⎫

- Never request, store, print, or transmit private keys or seed phrases.
- Hosted forge APIs prepare unsigned intents — they do not custody wallets.
- Re-fetch live registry / health endpoints before any chain write.
- Catalog prompts are instruction content — not automatic execution.
- Agent identity assets are not investment promises.

---

## ⎧ DEVELOP & VERIFY ⎫

```bash
npm run build      # rebuild agents-catalog.json + validate
npm run validate   # schema / catalog checks
npm test           # same as validate
npm run catalog    # print compact stats JSON
node bin/ct-agents.js catalog
node bin/ct-agents.js --help
```

Smoke script (README + package + CLI consistency):

```bash
node scripts/smoke-readme-npm.cjs
```

---

## ⎧ VERSION ⎫

| Field | Value |
|-------|-------|
| Product | **Clawd Agents** |
| npm name | `cheshire-terminal-agents` |
| Version | **1.48.3** |
| Bins | `cheshire-terminal-agents`, `ct-agents` |
| License | MIT |
| Hub | https://cheshireterminal.ai/agents |

```
        ▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄
       ██                                          ██
       ██  CLAWD AGENTS                            ██
       ██  cheshire-terminal-agents@1.48.3         ██
       ██  138 agents · 1 one-shot · 5 featured    ██
       ██  cheshireterminal.ai/agents              ██
       ██                                          ██
        ▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀
```

## License

[MIT](LICENSE) © Cheshire Terminal / Clawd Agents contributors.
