╔══════════════════════════════════════════════════════════════╗
║     ██████╗██╗  ██╗███████╗███████╗██╗  ██╗██╗██████╗ ██╗  ║
║    ██╔════╝██║  ██║██╔════╝██╔════╝██║  ██║██║██╔══██╗██║  ║
║    ██║     ███████║█████╗  ███████╗███████║██║██████╔╝██║  ║
║    ██║     ██╔══██║██╔══╝  ╚════██║██╔══██║██║██╔══██╗██║  ║
║    ╚██████╗██║  ██║███████╗███████║██║  ██║██║██║  ██║██║  ║
║     ╚═════╝╚═╝  ╚═╝╚══════╝╚══════╝╚═╝  ╚═╝╚═╝╚═╝  ╚═╝╚═╝  ║
║     ████████╗███████╗██████╗ ███╗   ███╗██╗███╗   ██╗ █████╗ ██╗        ██╗
║     ╚══██╔══╝██╔════╝██╔══██╗████╗ ████║██║████╗  ██║██╔══██╗██║        ██║
║        ██║   █████╗  ██████╔╝██╔████╔██║██║██╔██╗ ██║███████║██║        ██║
║        ██║   ██╔══╝  ██╔══██╗██║╚██╔╝██║██║██║╚██╗██║██╔══██║██║        ██║
║        ██║   ███████╗██║  ██║██║ ╚═╝ ██║██║██║ ╚████║██║  ██║███████╗██╗██║
║        ╚═╝   ╚══════╝╚═╝  ╚═╝╚═╝     ╚═╝╚═╝╚═╝  ╚═══╝╚═╝  ╚═╝╚══════╝╚═╝╚═╝
╚══════════════════════════════════════════════════════════════╝
```

<p align="center">
  <strong><code>✦ dual-chain agent forge · 137 agents · 53 characters · 31 skills ✦</code></strong><br>
  <em>solana:mainnet · robinhood-chain:4663 · layerzero zk-omni · erc-8004 · metaplex core</em>
</p>

---

## ⎧ ONE-SHOT INSTALL ⎫

```bash
# ── zero config, one command ──
npx cheshire-terminal-agents

# ── install globally ──
npm i -g cheshire-terminal-agents
ct-agents serve

# ── add to any project ──
npm i cheshire-terminal-agents
```

---

## ⎧ LIVE ENDPOINTS ⎫

```
⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯
 AGENT HUB        https://cheshireterminal.ai/agents
 CATALOG API      GET /api/agents/catalog          ⟶  137 agents
 REGISTRY         GET /api/agents/registry          ⟶  on-chain docs
 TEMPLATES        GET /api/agents/templates          ⟶  5 scaffolds
 ACP DISCOVERY    GET /.well-known/acp.json         ⟶  protocol
 AI PLUGIN        GET /.well-known/ai-plugin.json   ⟶  chat-gpt
 ASSETS           /assets/*.svg                     ⟶  forge art
⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯
```

---

## ⎧ REPO TOPOLOGY ⎫

```
├── agents/          ⎯  53 agent definitions (Robinhood + Solana)
├── characters/      ⎯  11 character profiles (Cheshire, Clawd, etc.)
├── cli/             ⎯  CLI tools
├── docs/            ⎯  18 documentation files
├── examples/        ⎯  agent templates
├── gemini/          ⎯  Gemini AI gateway + MCP server
├── locales/         ⎯  757 files · 18 languages
├── minted/          ⎯  4 on-chain minted agents
├── packages/        ⎯  4 sub-packages (tui, headless, lz, trust)
├── public/
│   ├── .well-known/ ⎯  acp.json · ai-plugin.json
│   ├── api/agents/  ⎯  catalog(138) · registry(138) · templates(5)
│   └── assets/      ⎯  SVG branding
├── robinhood-schema/⎯  Cheshire agent schema
├── robinhood-src/   ⎯  JS source (catalog, bridge, deployments, zkOmni)
├── schema/          ⎯  clawdAgentSchema v1
├── scripts/         ⎯  build, validate, track
├── skills/          ⎯  31 deployable skills
├── solana-gpt-oracle/⎯  pumpfun oracle
└── src/             ⎯  React app · 121 pages · 135 components · 25 hooks
```

---

## ⎧ STATS ⎫

```
┌─────────────────────────────────────────────────────────────────┐
│  agents          ██████████████████████████████████████████  137 │
│  characters      ████████████                                  11 │
│  skills          █████████████████████████████████              31 │
│  locales         ██████████████████████████████████████████  757 │
│  one-shots       ██                                              1 │
│  featured        ███████                                         5 │
│  templates       ██████                                          5 │
│  pages           █████████████████████████████████████████   121 │
│  components      ██████████████████████████████████████████  135 │
│  hooks           ██████████████████                             25 │
│  catalog files   █████████████████████████████████████████████ 138 │
│  registry docs   █████████████████████████████████████████████ 138 │
└─────────────────────────────────────────────────────────────────┘
```

---

## ⎧ FEATURED AGENTS ⎫

| agent | category | type |
|-------|----------|------|
| **Solana Pump.fun Bot** | `trading` | one-shot ⭐ |
| **Solana Vulcan Clawd Autoperps** | `defi` | featured 🌟 |
| **Clawd Perps Runtime** | `trading` | featured 🌟 |
| **Clawd LiveKit Voice** | `platform` | featured 🌟 |
| **Mechaplex Mech Builder** | `platform` | featured 🌟 |

---

## ⎧ DEPLOY RUNS ⎫

| runtime | chain | protocol |
|---------|-------|----------|
| **Clawd Gateway Runtime** | `solana` | ACP · x402 |
| **Clawd Operator Runtime** | `solana` | agent orchestration |
| **Clawd Router Runtime** | `solana` | LLM routing · tier gate |
| **Clawd Grok Runtime** | `solana` | reasoning · perps |
| **Clawd Pump Runtime** | `solana` | memecoin trading |
| **Clawd Formal Verification** | `solana` | invariant checking |

---

## ⎧ CATEGORIES ⎫

```
defi          ████████████████████████████████████████████
payments      ████████████████████████████████████
trading       ██████████████████████████
security      ████████████████████████████
dev-tools     ██████████████████
education     ██████████
governance    ████████
nft           ████████████
research      ██████████
infrastructure████████
platform      ██████████
crypto        ██████████████████
programming   ████████████
tools         ████████████████
voice-council ████████
```

---

## ⎧ NPM PACKAGE ⎫

```bash
npx cheshire-terminal-agents

# ── or ──
npm i -g cheshire-terminal-agents
cheshire-terminal-agents --help

  Usage: ct-agents <command>

  Commands:
    serve       Start the agent API server
    catalog     Print the agent catalog
    registry    Print the on-chain registry
    skills      List deployable skills
    schema      Validate agent definitions
    version     Print version
```

**Published as** [`cheshire-terminal-agents`](https://www.npmjs.com/package/cheshire-terminal-agents) `v1.48.1`

977 files · 1.2 MB packed · 4.6 MB unpacked

---

## ⎧ QUICK START ⎫

```bash
# 1. Install
npm i -g cheshire-terminal-agents

# 2. Browse the catalog
ct-agents catalog

# 3. List skills
ct-agents skills

# 4. Validate everything
ct-agents schema

# 5. Serve the API
ct-agents serve --port 8080
```

From any project:

```js
import { loadCatalog } from 'cheshire-terminal-agents'

const catalog = loadCatalog()
console.log(`${catalog.length} agents ready`)
```

---

## ⎧ API REFERENCE ⎫

### Catalog

```bash
curl https://cheshireterminal.ai/api/agents/catalog | jq '.stats'
```

### Single Agent

```bash
curl https://cheshireterminal.ai/api/agents/catalog/solana-pumpfun-bot.json
```

### Registry

```bash
curl https://cheshireterminal.ai/api/agents/registry
```

### Templates

```bash
curl https://cheshireterminal.ai/api/agents/templates/trading-agent.json
```

---

## ⎧ DEPLOYMENT PATHS ⎫

```
┌─── PR into repo ──────────────────────────────────────────────┐
│  static agent prompt · auto-cdn · 18 locales                  │
└───────────────────────────────────────────────────────────────┘
┌─── Self-host + A2A ───────────────────────────────────────────┐
│  custom logic · streaming · discoverable via hub               │
└───────────────────────────────────────────────────────────────┘
┌─── Mint as MPL Core ──────────────────────────────────────────┐
│  on-chain identity · solana:mainnet · transferable ownership   │
└───────────────────────────────────────────────────────────────┘
┌─── MCP server only ───────────────────────────────────────────┐
│  tool provider · clawd desktop · cursor                        │
└───────────────────────────────────────────────────────────────┘
```

---

## ⎧ TECH STACK ⎫

```
🗄  Format       JSON · TypeScript · Rust · Solidity · Python
🌐  Chains       Solana (mainnet) · Robinhood Chain (4663)
📡  Protocols    ACP · A2A · MCP · x402 · LayerZero · ERC-8004
🛠  SDKs         Metaplex UMI · Anchor · viem · wagmi · Pump SDK
🎭  Frontend     React · Vite · Tailwind · shadcn/ui · wouter
🔬  Verification Groth16 · Ed25519 PoK · RedPill TEE
🎮  Skills       31 deployable skill modules
```

---

## ⎧ LOCALE MATRIX ⎫

```
en 🇺🇸  zh-CN 🇨🇳  zh-TW 🇹🇼  ja 🇯🇵  ko 🇰🇷  de 🇩🇪  fr 🇫🇷
es 🇪🇸  ru 🇷🇺  ar 🇸🇦  pt 🇵🇹  it 🇮🇹  nl 🇳🇱  pl 🇵🇱
vi 🇻🇳  tr 🇹🇷  sv 🇸🇪  id 🇮🇩

757 locale files · 18 languages
```

---

## ⎧ LICENSE ⎫

**MIT** — Open Source · Open Format · Open Future

```ascii
        ▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄
       ██                                          ██
       ██  cheshireterminal.ai/agents              ██
       ██  cheshireterminal-agents@1.48.1          ██
       ██  137 agents · 1 one-shot · 5 featured    ██
       ██  operators@cheshireterminal.ai            ██
       ██                                          ██
        ▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀