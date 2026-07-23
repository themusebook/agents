# Handoff: integrate Design TUI + template forge into cheshireterminal.ai/agents

**Date:** 2026-07-23  
**From package:** `/Users/8bit/agents/agents` (`cheshire-terminal-agents` npm / GitHub `Solizardking/agents`)  
**Into monorepo:** `/Users/8bit/cheshire-terminal` (live hub at https://cheshireterminal.ai/agents)

This document is the integration brief for the next agent/session. Goal: users can **use catalog agents as templates** and **design their own** in a TUI-like flow — both in CLI (`ct-agents design`) and on the web hub (`/agents`, `/agents/builder`, templates).

---

## 1. What shipped in the package (source of truth for this handoff)

### 1.1 Privacy: `src/` is offline public GitHub

| Item | Status |
|------|--------|
| Path | `/Users/8bit/agents/agents/src` (local frontend app) |
| `.gitignore` | `src/` |
| Tracked files | **0** |
| History | Rewritten with `git filter-repo --path src --invert-paths` |
| Remote | Force-pushed; `src` 404s on GitHub |
| Local disk | Still present for private app work |

**Do not re-add `src/` to the public npm `files[]` or GitHub tree.**  
Catalog build prefers local `src/` when present (full hub JSON defs), else falls back to published `agents/`.

### 1.2 Design TUI (new install experience)

| Piece | Path |
|-------|------|
| CLI entry | `bin/ct-agents.js` |
| Design module | `robinhood-src/designTui.js` |
| Default command (TTY) | `npx cheshire-terminal-agents` → **design TUI** |
| Aliases | `design`, `forge`, `tui` |
| Schema | `schema/clawdAgentSchema.v1.json` |
| Scaffolds | `templates/*.template.json` (4): blank, defi-strategist, security-auditor, trading-analyst |

**Commands operators already have:**

```bash
npx cheshire-terminal-agents                  # interactive design TUI
ct-agents design --list                       # 70 forkable templates
ct-agents design --from defi-yield-farmer --id my-yield --out ./agents/my-yield.json
ct-agents design --blank --id research-bot --out ./research-bot.json
ct-agents design --validate ./agents/my-yield.json
ct-agents templates
ct-agents catalog
ct-agents serve
```

**Template sources loaded by the TUI:**

| Kind | Source | Count (local package) |
|------|--------|----------------------:|
| scaffold | `templates/*.template.json` | 4 |
| agent | `agents/*.json` | 53 |
| character | `characters/*.json` | 9 |
| minted | `minted/*.json` | 4 |
| **total forkable** | | **~70** |

Built catalog remains **137 agents**, **4 scaffold templates** (`npm test` green).

### 1.3 Catalog / API artifacts to sync

After `node build-catalog.cjs`:

- `agents-catalog.json`
- `public/api/agents/catalog/*` (+ `index.json`)
- `public/api/agents/registry/*`
- `public/api/agents/templates/*` ← **new index + scaffold bodies**
- `public/api/agents/acp-registry.json`, `public/.well-known/acp.json`

Each catalog agent now has:

```json
"deploy": {
  "json": "/api/agents/catalog/<id>.json",
  "chat": "/agents/chat?agent=<id>",
  "mint": "/agents/mint?template=<id>",
  "mcp": "/api/agents/catalog/<id>.json",
  "registration": "/api/agents/registry/<id>.json",
  "fork": "ct-agents design --from <id>"
}
```

Scaffold templates expose:

```json
"deploy": {
  "template": "/api/agents/templates/<id>.json",
  "create": "/agents/mint?fromTemplate=<id>",
  "design": "ct-agents design --from <id>"
}
```

---

## 2. Target monorepo map (cheshire-terminal)

### 2.1 High-level product surfaces

| URL / route | Client page | Role |
|-------------|-------------|------|
| `/agents` | `client/src/pages/AgentsHubPage.tsx` | Public agent hub gallery |
| `/agents/:id` | `AgentDetailPage.tsx` | Catalog agent detail |
| `/agents/builder` | `AgentBuilderPage.tsx` | **Web design surface** (starters / characters / templates → deploy) |
| `/agents/forge` | `AgentForgePage.tsx` | Robinhood Chain ERC-8004 identity forge |
| `/agents/mint` | `MetaplexAgentPage.tsx` | Solana Metaplex Core mint |
| `/agents/chat` | `AgentChatPage.tsx` | Instant chat with catalog agent |
| `/agents/live` | `LiveAgentsPage.tsx` | Deploy feed |
| `/agents/runtime` | `AgentRuntimeMatrixPage.tsx` | Runtime matrix |
| `/agent-templates`, `/templates` | `AgentTemplatesPage.tsx` | Variable-driven template wizard |
| `/agent-registry` | `AgentRegistryPage.tsx` | Holder-gated registry SPA |
| Routes constants | `client/src/lib/agentRoutes.ts` | `AGENT_ROUTES.*` |
| Hub helpers | `client/src/lib/agentsHub.ts` | Filters, character merge, defi pack |
| Deploy template resolve | `client/src/lib/agentDeployTemplate.ts` | Resolves `?template=` for mint/forge |

Routing registration: `client/src/App.tsx` (static `/agents/*` routes **before** `/agents/:id`).

### 2.2 Server / API surfaces that feed the hub

| Endpoint | Implementation | Notes |
|----------|----------------|-------|
| `GET /api/clawd/browser-agents` | `server/lib/clawd/browserAgents.ts` + generated JSON | **Primary hub catalog** for SPA |
| `GET /api/clawd/browser-agents/:id` | same | Detail / chat / adapter |
| `GET /api/clawd/browser-agent-templates` | clawd arena routes | Scaffold JSON list |
| `GET /api/clawd/templates` | `server/lib/clawd/templates.ts` | Unified deployable templates |
| `GET /api/agents/catalog` (static) | often served from `agents/public/api/agents/*` or CDN | Package-shaped catalog |
| `POST /api/agents/create` | `server/routes/agents.ts` | Create user agent |
| Deployed agents | clawd user-agent bridge | Holder deploy path from builder |

Generated snapshots (rebuild when agents tree changes):

- `server/lib/clawd/browser-agents.generated.json`
- `server/lib/clawd/starter-agents.generated.json`

### 2.3 Nested agents tree inside monorepo

```
/Users/8bit/cheshire-terminal/agents/     ← monorepo copy / submodule-style tree
  agents-catalog.json
  build-catalog.cjs
  src/*.json                              ← still present here (full defs)
  templates/*.template.json               ← monorepo has DIFFERENT scaffolds (5)
  characters/, locales/, minted/, public/api/agents/
  defi-agents/, plugin.delivery/, skills/, …
```

Package (this repo) vs monorepo differences today:

| | Package `/Users/8bit/agents/agents` | Monorepo `cheshire-terminal/agents` |
|--|-------------------------------------|--------------------------------------|
| npm name | `cheshire-terminal-agents` (public) | `cheshire-terminal-solana-agents` (private) |
| Design TUI | **yes** (`robinhood-src/designTui.js`, `bin/ct-agents.js`) | **no** |
| Scaffold templates | blank, defi-strategist, security-auditor, trading-analyst | defi-analyst, firecrawl-researcher, screener, solana-attestation-agent, trading-agent |
| Catalog templates count | 4 | (rebuild needed after merge) |
| `src/` on public GitHub | removed / ignored | still local under monorepo (private app may also live under `client/src`) |

**Important:** Live SPA frontend app code is under:

```
/Users/8bit/cheshire-terminal/client/src/
  App.tsx, main.tsx, index.css
  pages/   components/   hooks/   lib/   contexts/   gacha/   styles/   types/   assets/
```

Do **not** confuse monorepo `client/src` (Vite React app) with package `src` (was unpublished private frontend copy). Hub integration work is almost entirely in **`client/src/pages/*` + `server/lib/clawd/*` + `agents/`**.

### 2.4 Related monorepo dirs (context only)

| Path | Relevance |
|------|-----------|
| `client/` | SPA that hosts `/agents` |
| `server/` | Express API, clawd catalog host |
| `agents/` | Agent JSON catalog, templates, registry static API |
| `api/` | Edge/aux API package |
| `apps/` | Nested apps |
| `arena/` / `agent-arena/` | Arena product (adjacent) |
| `airship/` | Airship product (adjacent) |
| `apigee/` | API gateway configs |
| `box/` | Box product |
| `bundled-skills/` | Skill packs |
| `clawd-agent-product/`, `clawd-code/` | Product slices |
| `cli/`, `client/` | CLI + web |
| `assets/` | Static assets |

---

## 3. Integration goals (product)

1. **Every catalog agent is a template**  
   Hub cards and detail pages should expose **Fork / Design** → prefills builder or opens CLI recipe.

2. **One design mental model**  
   CLI TUI and web builder share the same schema (`clawdAgentSchema.v1`) and the same scaffold IDs where possible.

3. **Install path**  
   `npx cheshire-terminal-agents` teaches design; hub CTAs deep-link to the same flow.

4. **No leakage of private frontend**  
   Package `src/` stays gitignored; monorepo continues to own `client/src`.

---

## 4. Recommended integration plan (ordered)

### Phase A — Sync catalog + templates (low risk)

1. **Merge scaffolds** into monorepo `agents/templates/`:
   - Keep monorepo’s existing 5 if still used by `/api/clawd/templates`.
   - Add package’s 4 (`blank`, `defi-strategist`, `security-auditor`, `trading-analyst`) **or** rename for uniqueness.
   - Prefer single naming convention: `*.template.json` with `templateId`, `templateName`, `variables[]`, embedded clawd agent body.

2. **Port design module** into monorepo agents tree (if monorepo CLI is desired):
   ```
   agents/robinhood-src/designTui.js   # from package
   agents/bin/ct-agents.js             # wire design/forge default
   ```
   Or depend on published npm: `cheshire-terminal-agents` and shell out / document only.

3. **Rebuild monorepo catalog:**
   ```bash
   cd /Users/8bit/cheshire-terminal/agents
   # ensure build-catalog loads agents source + templates like package
   node build-catalog.cjs
   npm test   # or package validate scripts monorepo already runs
   ```

4. **Regenerate server snapshots** that power the SPA:
   - Whatever script produces `server/lib/clawd/browser-agents.generated.json`
   - Re-run monorepo tests: `browser-agents-catalog.test.ts`, `browserAgents.test.ts`

5. **Ensure static templates API** is reachable:
   - `agents/public/api/agents/templates/index.json`
   - Or proxy `GET /api/agents/templates` → same payload
   - Align `server/lib/clawd/templates.ts` `adaptBrowserTemplate` with package scaffold shape (already mostly compatible if `templateId` + `variables` + `agent.config.systemRole` exist)

### Phase B — Hub UX: “use as template” (medium)

**Files:**

- `client/src/pages/AgentsHubPage.tsx`
- `client/src/pages/AgentDetailPage.tsx`
- `client/src/lib/agentsHub.ts`
- `client/src/lib/agentRoutes.ts` (optional new route helper)

**Changes:**

1. On each hub card / detail, add CTA:
   - **Design in builder** → `/agents/builder?starter=<id>` (already partially exists)
   - **Fork template** → `/agents/builder?starter=<id>&mode=fork` or `/agent-templates?from=<id>`
   - Optional copy: CLI one-liner `ct-agents design --from <id>`

2. Surface scaffold rail from catalog templates:
   - Fetch `/api/clawd/templates` or `/api/agents/templates`
   - Show “Start from scaffold” chips (blank / defi / security / trading)

3. Keep dual-rail deploy intact:
   - Solana: `agentMintPath(id)` → `/agents/mint?template=`
   - Robinhood: `agentForgePath(id)` → `/agents/forge?template=`
   - Design is **pre-deploy authoring**, not a replacement for mint/forge.

### Phase C — Builder = web design TUI (high value)

**Primary file:** `client/src/pages/AgentBuilderPage.tsx`

Today it already has panes: starters | characters | personas | templates, and loads:

- `/api/clawd/browser-agents` (starters)
- `/api/clawd/browser-agent-templates`
- `/api/clawd/templates`

**Align with CLI design flow:**

| CLI step | Web builder equivalent |
|----------|------------------------|
| Pick template | Catalog panes (starters / templates / characters) |
| Edit identifier | slug field |
| Edit title / description / avatar / tags | form fields (ensure present) |
| Edit systemRole | persona / system prompt textarea |
| Validate clawdAgentSchema.v1 | client-side validate before deploy |
| Write JSON | `POST /api/agents/create` or deploy user-agent path |

**Implement:**

1. Shared validation helper (port rules from `designTui.js` `validateAgent()` into e.g. `client/src/lib/clawdAgentSchema.ts` or import schema JSON from `agents/schema/`).
2. “Export JSON” button → download clawd-shaped agent file (parity with CLI `--out`).
3. Prefill from query:
   - `?starter=` (exists)
   - `?fromTemplate=` / `?template=` (align with forge/mint query parsing in `agentDeployTemplate.ts`)
4. After save, deep-link to mint/forge with the new id.

### Phase D — AgentTemplatesPage parity

**File:** `client/src/pages/AgentTemplatesPage.tsx`

- Already uses `/api/clawd/templates` + variable render + deploy.
- Ensure new scaffolds appear in that list.
- Add “Open in builder” and “Validate schema” actions.
- Map `deployable` output into full clawdAgentSchema.v1 document (today it may be a thinner deploy shape).

### Phase E — Docs / CLI page / install messaging

| Surface | Action |
|---------|--------|
| `client/src/pages/CliPage.tsx` | Document `ct-agents design` |
| Hub header CTAs | “Design your own” → builder + CLI snippet |
| README monorepo / agents SETUP | Point at package handoff + design commands |
| Optional | Embed design help in `/agents` empty states |

---

## 5. Data contracts (do not break)

### 5.1 clawd agent definition (hub JSON)

Required (schema v1):

```
author, identifier, schemaVersion: 1, meta{title,description,avatar,tags}, config{systemRole}
```

Optional but hub-useful:

```
meta.category, config.openingMessage, config.openingQuestions,
oneShot, featured, solana.capabilities, solana.metaplexSkills, examples, summary
```

### 5.2 Hub catalog row (SPA)

Shape consumed by `HubCatalogAgent` / `BrowserAgent`:

```
id, title, description, category, avatar, tags,
featured, oneShot, tokenUsage, capabilities, metaplexSkills,
source{homepage, author, createdAt, file, repoRoot, deploy?}
```

When regenerating `browser-agents.generated.json`, preserve:

- dual-rail `deployPaths` (`mint`, `forge`, `chat`, …)
- defi pack agents from `agents/defi-agents`
- character pack detection (`isCharacterPackAgent`)

### 5.3 Template scaffold

Minimum for `templates.ts` adapter:

```json
{
  "templateId": "blank",
  "templateName": "Blank Agent",
  "templateDescription": "...",
  "templateCategory": "dev-tools",
  "templateAvatar": "🧩",
  "variables": [{ "name": "identifier", "description": "...", "required": true }],
  "agent": {
    "config": { "systemRole": "...", "openingMessage": "...", "openingQuestions": [] },
    "meta": { "title": "...", "description": "...", "avatar": "🤖", "tags": [], "category": "defi" }
  }
}
```

Package scaffolds embed full clawd fields at top-level; adapter accepts either nested `agent` or top-level `config`/`meta` — **normalize on ingest** in monorepo if needed.

---

## 6. Concrete file checklist (copy / edit)

### From package → monorepo

| Copy from package | To monorepo | Notes |
|-------------------|-------------|-------|
| `robinhood-src/designTui.js` | `agents/robinhood-src/designTui.js` | Core design logic |
| `bin/ct-agents.js` | `agents/bin/ct-agents.js` or monorepo CLI | Wire design default |
| `templates/*.template.json` | `agents/templates/` | Merge, don’t blind overwrite |
| `schema/clawdAgentSchema.v1.json` | `agents/schema/` (if newer) | Keep single schema |
| `build-catalog.cjs` patches | monorepo `agents/build-catalog.cjs` | templates index + `deploy.fork` |
| `scripts/validate-catalog.cjs` | monorepo validate | allow `totalTemplates >= 1` |
| `public/api/agents/templates/*` | monorepo public API tree | After rebuild |

### Edit in monorepo (web)

| File | Why |
|------|-----|
| `client/src/pages/AgentsHubPage.tsx` | Fork / Design CTAs |
| `client/src/pages/AgentDetailPage.tsx` | Same + schema export |
| `client/src/pages/AgentBuilderPage.tsx` | Web design TUI parity + validation |
| `client/src/pages/AgentTemplatesPage.tsx` | New scaffolds + export JSON |
| `client/src/lib/agentDeployTemplate.ts` | Resolve design templates into mint/forge |
| `client/src/lib/agentRoutes.ts` | Optional `design` helper if new route |
| `client/src/App.tsx` | Only if new route path added |
| `server/lib/clawd/templates.ts` | Load merged scaffolds |
| `server/lib/clawd/browserAgents.ts` | Expose template fork metadata if needed |
| generated JSON under `server/lib/clawd/` | Rebuild after catalog sync |

### Do not touch / caution

| Path | Reason |
|------|--------|
| Package `src/` | Private; gitignored; not for hub |
| `client/node_modules` | Generated |
| Force-push monorepo history | Unrelated to package `src` purge |
| Live wallet / mint paths without review | Keep fail-closed signing |

---

## 7. Acceptance criteria

- [ ] Hub lists 137 (or current monorepo expected) agents without empty fallback.
- [ ] Scaffold templates ≥ package 4 **or** merged monorepo set visible at `/agent-templates` and `/api/clawd/templates`.
- [ ] From any catalog agent: **one click** lands in builder with fields prefilled.
- [ ] Builder can validate against clawdAgentSchema.v1 and refuse/warn on invalid slug / missing systemRole.
- [ ] Export produces JSON that `ct-agents design --validate` accepts.
- [ ] Mint/forge still work with `?template=<id>` for existing deploy paths.
- [ ] CLI: monorepo or npm package supports `design --list` / `--from` / `--validate`.
- [ ] Defi pack + character pack tests still pass.
- [ ] No private app tree from package `src/` published via npm or static hosting.

---

## 8. Suggested verification commands

```bash
# Package (source)
cd /Users/8bit/agents/agents
npm test
node bin/ct-agents.js design --list --json | head
node bin/ct-agents.js design --from defi-yield-farmer --id handoff-test --out /tmp/handoff-test.json
node bin/ct-agents.js design --validate /tmp/handoff-test.json

# Monorepo agents tree
cd /Users/8bit/cheshire-terminal/agents
npm test

# Monorepo SPA/API (adjust to repo scripts)
cd /Users/8bit/cheshire-terminal
# regenerate browser agents if script exists, then:
# pnpm test --filter … or node --test server/lib/clawd/browserAgents.test.ts
```

Manual UI:

1. Open https://cheshireterminal.ai/agents (or local dev).
2. Open an agent → Design / Fork → builder prefills.
3. `/agents/builder` → Templates pane shows new scaffolds.
4. `/agent-templates` → render variables → deploy or export JSON.
5. `/agents/forge?template=…` and `/agents/mint?template=…` still resolve.

---

## 9. Open decisions (resolve during integration)

1. **Single source of truth:** publish npm package and consume in monorepo, **or** continue vendoring `cheshire-terminal/agents` as the hub tree and cherry-pick design TUI?
2. **Scaffold set:** merge both template lists vs replace monorepo’s 5 with package’s 4?
3. **Web “TUI” fidelity:** enhance existing builder chrome vs add a dedicated `/agents/design` route that mirrors CLI steps more literally?
4. **Community agents:** should holder-created agents also appear as forkable templates for other users (privacy / ToS)?
5. **Version bump:** package is `1.48.3`; publish new version after design TUI lands for `npx` users.

---

## 10. Quick architecture diagram

```
┌──────────────────────────────────────────────────────────────────┐
│  cheshire-terminal (monorepo)                                    │
│                                                                  │
│  client/src/pages                                                │
│    AgentsHubPage ──► GET /api/clawd/browser-agents               │
│    AgentBuilderPage ─► templates + starters + POST create/deploy │
│    AgentTemplatesPage ─► /api/clawd/templates                    │
│    AgentForgePage / MetaplexAgentPage ─► on-chain identity       │
│                                                                  │
│  server/lib/clawd                                                │
│    browser-agents.generated.json ◄── agents/* catalog build      │
│    templates.ts ◄── agents/templates/*.template.json             │
│                                                                  │
│  agents/  (catalog tree; sync from package)                      │
└────────────────────────────▲─────────────────────────────────────┘
                             │ sync / npm
┌────────────────────────────┴─────────────────────────────────────┐
│  agents package (/Users/8bit/agents/agents)                      │
│    bin/ct-agents.js  → designTui.js  (CLI design TUI)            │
│    agents/*.json, characters/, minted/, templates/               │
│    schema/clawdAgentSchema.v1.json                               │
│    public/api/agents/{catalog,registry,templates}                │
│    src/  ← LOCAL ONLY, gitignored, not for hub                   │
└──────────────────────────────────────────────────────────────────┘
```

---

## 11. Skill selection without install bloat (2026-07-23)

**Problem:** Skill Hub has **595** skills ([skillhub-main](https://github.com/Solizardking/skillhub-main)). Vendoring them in `cheshire-terminal-agents` would explode the npm install.

**Solution shipped in the package:**

| Layer | What ships | Size intent |
|-------|------------|-------------|
| `skills/skillhub-index.json` | Hub URLs + curated packs + featured slugs | ~2KB |
| `robinhood-src/skillHub.js` | Remote catalog fetch + sparse install | code only |
| Agent `skills[]` field | **References** (slug, install cmd, hub) | bytes per skill |
| Optional `--install-skills` | Fetch **only** selected `SKILL.md` into `./.agents/skills` | user opt-in |

**CLI:**

```bash
ct-agents skills packs
ct-agents skills search vulcan
ct-agents skills install metaplex-agent          # sparse
ct-agents design --from blank --id bot --skills cheshire-core,metaplex-agent --out ./bot.json
ct-agents design --skills trading --install-skills --id bot --out ./bot.json
```

**Web integration (monorepo):**

1. Builder skill picker should call the same remote catalog URL (or proxy `GET /api/skills` from skillhub public API) — never bundle skill bodies in the SPA bundle.
2. On deploy, store `skills[]` refs on the user-agent record; install to runtime skill root only when the operator enables skills.
3. Prefer sparse raw GitHub fetch or `npx github:Solizardking/skills install <slugs>` over cloning the whole hub.

Schema: `clawdAgentSchema.v1` now allows optional `skills[]` objects (`name`, `slug`, `source`, `install`, `path`, …).

---

## 12. Contact / ownership hints

- **Hub SPA UX:** `client/src/pages/AgentsHubPage.tsx`, `AgentBuilderPage.tsx`
- **Catalog build:** `agents/build-catalog.cjs`, validate scripts
- **Runtime hosting:** `server/lib/clawd/browserAgents.ts`
- **Schema:** `agents/schema/clawdAgentSchema.v1.json`
- **CLI design:** package `robinhood-src/designTui.js`

When in doubt: preserve dual-rail deploy (Solana mint + Robinhood forge), keep schema validation fail-closed, and treat every catalog agent as a **forkable template** first — mint/forge second.

---

*End of handoff. Implementation should start at Phase A (template + catalog sync), then Phase C (builder validation parity) for the highest user-visible win on cheshireterminal.ai/agents.*
