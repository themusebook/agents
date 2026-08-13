#!/usr/bin/env node

import { createRequire } from 'module';
import { fileURLToPath, pathToFileURL } from 'url';
import path from 'path';
import http from 'http';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const require = createRequire(import.meta.url);
const pkg = require('../package.json');
const catalog = require('../agents-catalog.json');

/** Canonical product hubs from open-source-connection-map.json (agents + cli + eliza). */
function loadOssMap() {
  try {
    return require('../open-source-connection-map.json');
  } catch {
    return null;
  }
}

const BOLD = '\x1b[1m';
const CYAN = '\x1b[36m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const MAGENTA = '\x1b[35m';
const RED = '\x1b[31m';
const DIM = '\x1b[2m';
const RESET = '\x1b[0m';

function showBoot() {
  process.stdout.write(`
${CYAN}  ██████╗██╗  ██╗███████╗███████╗██╗  ██╗██╗██████╗ ███████╗${RESET}
${CYAN} ██╔════╝██║  ██║██╔════╝██╔════╝██║  ██║██║██╔══██╗██╔════╝${RESET}
${CYAN} ██║     ███████║█████╗  ███████╗███████║██║██████╔╝█████╗${RESET}
${CYAN} ██║     ██╔══██║██╔══╝  ╚════██║██╔══██║██║██╔══██╗██╔══╝${RESET}
${CYAN} ╚██████╗██║  ██║███████╗███████║██║  ██║██║██║  ██║███████╗${RESET}
${CYAN}  ╚═════╝╚═╝  ╚═╝╚══════╝╚══════╝╚═╝  ╚═╝╚═╝╚═╝  ╚═╝╚══════╝${RESET}
${CYAN}  ████████╗███████╗██████╗ ███╗   ███╗██╗███╗   ██╗ █████╗ ██╗${RESET}
${CYAN}  ╚══██╔══╝██╔════╝██╔══██╗████╗ ████║██║████╗  ██║██╔══██╗██║${RESET}
${CYAN}     ██║   █████╗  ██████╔╝██╔████╔██║██║██╔██╗ ██║███████║██║${RESET}
${CYAN}     ██║   ██╔══╝  ██╔══██╗██║╚██╔╝██║██║██║╚██╗██║██╔══██║██║${RESET}
${CYAN}     ██║   ███████╗██║  ██║██║ ╚═╝ ██║██║██║ ╚████║██║  ██║██║${RESET}
${CYAN}     ╚═╝   ╚══════╝╚═╝  ╚═╝╚═╝     ╚═╝╚═╝╚═╝  ╚═══╝╚═╝  ╚═╝╚═╝${RESET}
${CYAN}  █████╗  ██████╗ ███████╗███╗   ██╗████████╗███████╗${RESET}
${CYAN} ██╔══██╗██╔════╝ ██╔════╝████╗  ██║╚══██╔══╝██╔════╝${RESET}
${CYAN} █████████║  ███╗ █████╗  ██╔██╗ ██║   ██║   ███████╗${RESET}
${CYAN} ██╔══██║██║   ██║██╔══╝  ██║╚██╗██║   ██║   ╚════██║${RESET}
${CYAN} ██║  ██║╚██████╔╝███████╗██║ ╚████║   ██║   ███████║${RESET}
${CYAN} ╚═╝  ╚═╝ ╚═════╝ ╚══════╝╚═╝  ╚═══╝   ╚═╝   ╚══════╝${RESET}

${GREEN}✦ dual-chain agent forge ✦ ${RESET}
${YELLOW}${pkg.version}${RESET} · solana:mainnet · robinhood-chain:4663
${DIM}  design your own: ct-agents design · fork any catalog agent as a template${RESET}
`);
}

async function runDesign(argv) {
  const modPath = path.join(ROOT, 'robinhood-src', 'designTui.js');
  const { runDesignTui } = await import(pathToFileURL(modPath).href);
  const code = await runDesignTui(argv, ROOT);
  process.exit(code ?? 0);
}

async function runSkills(argv) {
  const modPath = path.join(ROOT, 'robinhood-src', 'skillHub.js');
  const { runSkillsCli } = await import(pathToFileURL(modPath).href);
  const code = await runSkillsCli(argv, ROOT);
  process.exit(code ?? 0);
}

async function runDna(argv) {
  const modPath = path.join(ROOT, 'robinhood-src', 'dnaGenerate.js');
  const { runDnaCli } = await import(pathToFileURL(modPath).href);
  const code = await runDnaCli(argv, ROOT);
  process.exit(code ?? 0);
}

async function runKnowledge(argv) {
  const modPath = path.join(ROOT, 'robinhood-src', 'knowledgeUpload.js');
  const { runKnowledgeCli } = await import(pathToFileURL(modPath).href);
  const code = await runKnowledgeCli(argv, ROOT);
  process.exit(code ?? 0);
}

async function runStorage(argv) {
  const modPath = path.join(ROOT, 'robinhood-src', 'tigrisStorage.js');
  const { runTigrisStorageCli } = await import(pathToFileURL(modPath).href);
  const code = await runTigrisStorageCli(argv, ROOT);
  process.exit(code ?? 0);
}

async function runMemory(argv) {
  const modPath = path.join(ROOT, 'robinhood-src', 'membrainMemory.js');
  const { runMembrainCli } = await import(pathToFileURL(modPath).href);
  const code = await runMembrainCli(argv, ROOT);
  process.exit(code ?? 0);
}

async function runAcp(argv) {
  const modPath = path.join(ROOT, 'robinhood-src', 'acp.js');
  const { runAcpCli } = await import(pathToFileURL(modPath).href);
  const code = await runAcpCli(argv, ROOT);
  process.exit(code ?? 0);
}

async function runA2a(argv) {
  const modPath = path.join(ROOT, 'robinhood-src', 'a2a.js');
  const { runA2aCli } = await import(pathToFileURL(modPath).href);
  const code = await runA2aCli(argv, ROOT);
  process.exit(code ?? 0);
}

const COMMANDS = {
  version: () => {
    showBoot();
    process.exit(0);
  },

  catalog: () => {
    const stats = catalog.stats || catalog;
    const oss = loadOssMap();
    const hub = {
      ...(catalog.hub || {}),
      agents: catalog.hub?.agents || catalog.hub?.gallery || 'https://cheshireterminal.ai/agents',
      cli: catalog.hub?.cli || oss?.productHubs?.cli || 'https://cheshireterminal.ai/cli',
      forge: catalog.hub?.forge || 'https://cheshireterminal.ai/agents/forge',
      elizaAgents: catalog.hub?.elizaAgents || oss?.productHubs?.elizaAgents || 'https://cheshireterminal.ai/eliza-agents',
      skills: catalog.hub?.skills || oss?.productHubs?.skills || 'https://cheshireterminal.ai/skills',
    };
    console.log(JSON.stringify({
      agents: stats.totalAgents,
      oneShots: stats.totalOneShots,
      featured: stats.totalFeatured,
      premiere: stats.premiereAgent || 'elizero',
      templates: stats.totalTemplates,
      categories: stats.byCategory ? Object.keys(stats.byCategory) : [],
      hub,
      productHubs: oss?.productHubs || {
        agents: hub.agents,
        elizaAgents: hub.elizaAgents,
        cli: hub.cli,
        skills: hub.skills,
      },
      design: 'ct-agents design',
      siteCli: 'npx cheshire-terminal-cli connect',
    }, null, 2));
  },

  /** Print product hubs + GitHub sources (wired to /agents, /skills, /cli). */
  connect: async () => {
    const { cheshireTerminalConnectInfo } = await import(
      pathToFileURL(path.join(ROOT, 'robinhood-src', 'cheshireTerminalRoot.js')).href
    );
    const ct = cheshireTerminalConnectInfo(ROOT);
    const oss = loadOssMap() || {
      productHubs: {
        agents: 'https://cheshireterminal.ai/agents',
        elizaAgents: 'https://cheshireterminal.ai/eliza-agents',
        cli: 'https://cheshireterminal.ai/cli',
        skills: 'https://cheshireterminal.ai/skills',
      },
      github: {
        agents: 'https://github.com/Solizardking/agents',
        cli: 'https://github.com/Solizardking/cli',
        eliza: 'https://github.com/Solizardking/eliza',
        cheshireTerminal: 'https://github.com/Solizardking/cheshire-terminal',
        skills: 'https://github.com/Solizardking/skills',
        skillhub: 'https://github.com/Solizardking/skillhub-main',
      },
      local: { skillhub: '../skillhub-main' },
    };
    const localCheckout = oss.local?.skillsDir || '../skillhub-main/skills';
    console.log(JSON.stringify({
      package: pkg.name,
      version: pkg.version,
      productHubs: { ...ct.productHubs, ...oss.productHubs },
      github: oss.github,
      skills: {
        product: oss.productHubs?.skills || 'https://cheshireterminal.ai/skills',
        github: oss.github?.skills || 'https://github.com/Solizardking/skills',
        skillhub: oss.github?.skillhub || 'https://github.com/Solizardking/skillhub-main',
        local: process.env.CLAWD_SKILLHUB_ROOT || localCheckout,
        install: 'npx --yes github:Solizardking/skills install',
        agentsProduct: oss.productHubs?.agents || 'https://cheshireterminal.ai/agents',
        agentsGithub: oss.github?.agents || 'https://github.com/Solizardking/agents',
      },
      thisPackage: {
        npm: 'cheshire-terminal-agents',
        siteHub: 'https://cheshireterminal.ai/agents',
        design: 'ct-agents design',
        catalog: 'ct-agents catalog',
        skillsCli: 'ct-agents skills',
      },
      siteCli: {
        npm: 'cheshire-terminal-cli',
        siteHub: 'https://cheshireterminal.ai/cli',
        connect: 'npx cheshire-terminal-cli connect',
        agentsList: 'npx cheshire-terminal-cli agents:list',
      },
      robinhood: {
        product: 'https://cheshireterminal.ai/agents',
        forge: 'https://cheshireterminal.ai/agents/forge',
        github: oss.github?.robinhoodAgents || 'https://github.com/Solizardking/robinhood-agents',
        local: process.env.CLAWD_ROBINHOOD_AGENTS_ROOT || oss.local?.robinhoodAgents || '../cheshire-terminal-main/robinhood-agents',
        skills: 'skills/',
        deployments: 'deployments/',
        contracts: 'contracts/',
        env: 'CLAWD_ROBINHOOD_AGENTS_ROOT',
      },
      cheshireTerminal: {
        product: ct.product,
        github: ct.github,
        local: ct.local,
        resolved: ct.resolved,
        env: ct.env,
        surfaces: ct.surfaces,
      },
      acp: oss.protocols?.acp || {
        wellKnown: 'https://cheshireterminal.ai/.well-known/acp.json',
        local: 'public/.well-known/acp.json',
        cli: 'ct-agents acp',
      },
      a2a: oss.protocols?.a2a || {
        elizero: 'https://cheshireterminal.ai/a2a/elizero',
        zkShark: 'https://cheshireterminal.ai/a2a/zk-shark',
        productCard: 'https://cheshireterminal.ai/.well-known/agent-card.json',
        cli: 'ct-agents a2a',
      },
      map: 'open-source-connection-map.json',
    }, null, 2));
  },

  registry: () => {
    const regPath = path.join(ROOT, 'public', 'api', 'agents', 'registry', 'index.json');
    if (!fs.existsSync(regPath)) {
      console.error('Registry index not found. Run build first: npm run build');
      process.exit(1);
    }
    const reg = JSON.parse(fs.readFileSync(regPath, 'utf8'));
    console.log(JSON.stringify(reg, null, 2));
  },

  // legacy local suite listing moved under: ct-agents skills packs
  // full Skill Hub: ct-agents skills list|search|install

  schema: () => {
    const schemaPath = path.join(ROOT, 'schema', 'clawdAgentSchema.v1.json');
    if (!fs.existsSync(schemaPath)) {
      console.error('Schema file not found.');
      process.exit(1);
    }
    const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
    console.log(`Schema: ${schema.$id || schema.title || 'clawdAgentSchema.v1'}`);
    console.log(`Required: ${(schema.required || []).join(', ')}`);
    console.log(`Properties: ${Object.keys(schema.properties || {}).join(', ')}`);
    console.log(`\n${DIM}Design against this schema:${RESET} ${CYAN}ct-agents design${RESET}`);
  },

  templates: () => {
    const templates = catalog.templates || [];
    console.log(JSON.stringify({
      count: templates.length,
      design: 'ct-agents design --list',
      templates: templates.map((t) => ({
        id: t.templateId,
        name: t.name,
        category: t.category,
        avatar: t.avatar,
        design: t.deploy?.design || `ct-agents design --from ${t.templateId}`,
      })),
    }, null, 2));
  },

  // design / forge — template-driven TUI
  design: (argv) => runDesign(argv),
  forge: (argv) => runDesign(argv),
  tui: (argv) => runDesign(argv),

  // skills — Skill Hub picker (remote catalog; no install bloat)
  skills: (argv) => runSkills(argv),

  // dna — generate agentic DNA bundles from character seeds or free-form identity
  dna: (argv) => runDna(argv),

  // knowledge — init/upload/inject personal knowledge/ folders (clawd-character.md shaped)
  knowledge: (argv) => runKnowledge(argv),

  // storage — Tigris object store + event-driven agent handoffs (no polling)
  storage: (argv) => runStorage(argv),
  tigris: (argv) => runStorage(argv),

  // memory — Membrain selective memory (default source for catalog agents)
  memory: (argv) => runMemory(argv),
  membrain: (argv) => runMemory(argv),

  // acp / a2a — Agent Commerce Protocol + Agent-to-Agent HTTP+JSON
  acp: (argv) => runAcp(argv),
  a2a: (argv) => runA2a(argv),

  serve: async () => {
    const port = parseInt(process.argv[3] || process.env.PORT || '3000', 10);
    const PUBLIC = path.join(ROOT, 'public');

    const MIME = {
      '.json': 'application/json',
      '.html': 'text/html',
      '.js': 'application/javascript',
      '.css': 'text/css',
      '.svg': 'image/svg+xml',
      '.txt': 'text/plain',
      '.png': 'image/png',
    };

    const { handleProtocolRequest } = await import(
      pathToFileURL(path.join(ROOT, 'robinhood-src', 'protocolHttp.js')).href
    );

    const server = http.createServer(async (req, res) => {
      try {
        const handled = await handleProtocolRequest(req, res, { root: ROOT });
        if (handled) return;
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }));
        return;
      }

      let url = req.url.split('?')[0];
      if (url === '/') url = '/api/agents/index.json';
      if (url === '/api/agents') url = '/api/agents/index.json';

      let filePath = path.join(PUBLIC, url);

      if (!fs.existsSync(filePath)) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'not found', path: url }));
        return;
      }

      // directory → index.json
      if (fs.statSync(filePath).isDirectory()) {
        const indexPath = path.join(filePath, 'index.json');
        if (fs.existsSync(indexPath)) filePath = indexPath;
      }

      const ext = path.extname(filePath);
      res.writeHead(200, {
        'Content-Type': MIME[ext] || 'application/octet-stream',
        'Access-Control-Allow-Origin': '*',
      });

      if (ext === '.json') {
        res.end(JSON.stringify(JSON.parse(fs.readFileSync(filePath, 'utf8')), null, 2));
      } else {
        res.end(fs.readFileSync(filePath));
      }
    });

    showBoot();
    console.log(`${GREEN}✦ Agent API server running ✦${RESET}`);
    console.log(`${CYAN}  http://localhost:${port}/api/agents/catalog${RESET}`);
    console.log(`${CYAN}  http://localhost:${port}/api/agents/registry${RESET}`);
    console.log(`${CYAN}  http://localhost:${port}/api/agents/templates${RESET}`);
    console.log(`${CYAN}  http://localhost:${port}/skills-picker.html${RESET}  ${DIM}# multi-select skills (no bloat)${RESET}`);
    console.log(`${CYAN}  http://localhost:${port}/.well-known/acp.json${RESET}`);
    console.log(`${CYAN}  http://localhost:${port}/.well-known/agent-card.json${RESET}  ${DIM}# A2A product card${RESET}`);
    console.log(`${CYAN}  http://localhost:${port}/a2a/elizero/.well-known/agent-card.json${RESET}`);
    console.log(`${CYAN}  http://localhost:${port}/api/agents/acp${RESET}  ${DIM}# ACP discovery${RESET}`);
    console.log(`${CYAN}  http://localhost:${port}/api/a2a/peers${RESET}`);
    console.log(`${DIM}  design locally: ct-agents design · skills TUI: ct-agents skills pick${RESET}\n`);

    server.listen(port, () => {
      console.log(`${GREEN}✓ Listening on port ${port}${RESET}`);
    });
  },

  help: () => {
    showBoot();
    console.log(`
${BOLD}Usage:${RESET}
  ${CYAN}npx cheshire-terminal-agents${RESET}              Open design TUI (default)
  ${CYAN}npx cheshire-terminal-agents design${RESET}       Template-driven agent forge TUI
  ${CYAN}npx cheshire-terminal-agents design --list${RESET} List forkable templates
  ${CYAN}npx cheshire-terminal-agents design --from <id> --id <new> --skills metaplex-agent --out ./agent.json${RESET}
  ${CYAN}npx cheshire-terminal-agents forge${RESET}        Alias for design (oneshot OK)
  ${CYAN}npx cheshire-terminal-agents skills${RESET}       Multi-select Skill Hub TUI (no bloat)
  ${CYAN}npx cheshire-terminal-agents skills pick${RESET}  Browse / toggle / sparse-install
  ${CYAN}npx cheshire-terminal-agents skills search vulcan${RESET}
  ${CYAN}npx cheshire-terminal-agents skills install metaplex-agent${RESET}
  ${CYAN}npx cheshire-terminal-agents serve${RESET}        Start the API server
  ${CYAN}npx cheshire-terminal-agents catalog${RESET}      Print agent catalog stats (+ /agents + /cli hubs)
  ${CYAN}npx cheshire-terminal-agents connect${RESET}      Product hubs + GitHub sources (agents ↔ cli)
  ${CYAN}npx cheshire-terminal-agents templates${RESET}    List scaffold templates
  ${CYAN}npx cheshire-terminal-agents dna list${RESET}       List character seeds for DNA generation
  ${CYAN}npx cheshire-terminal-agents dna generate --from clawd --out ./my-dna${RESET}
  ${CYAN}npx cheshire-terminal-agents knowledge list${RESET}  List package knowledge corpus
  ${CYAN}npx cheshire-terminal-agents knowledge init --from clawd --out ./my-knowledge${RESET}
  ${CYAN}npx cheshire-terminal-agents knowledge upload ./notes.md --out ./my-knowledge${RESET}
  ${CYAN}npx cheshire-terminal-agents storage status${RESET}    Tigris agent storage + handoff status
  ${CYAN}npx cheshire-terminal-agents storage handoff --from elizero --to hedgedna --file ./report.json${RESET}
  ${CYAN}npx cheshire-terminal-agents storage webhook --port 8788${RESET}
  ${CYAN}npx cheshire-terminal-agents memory status${RESET}     Membrain memory (default source)
  ${CYAN}npx cheshire-terminal-agents memory ingest --agent elizero --summary "…"${RESET}
  ${CYAN}npx cheshire-terminal-agents memory retrieve --agent elizero --query "SOL swap"${RESET}
  ${CYAN}npx cheshire-terminal-agents acp${RESET}           ACP discovery (well-known + catalog)
  ${CYAN}npx cheshire-terminal-agents a2a${RESET}           A2A card + peers (eliZERO premiere)
  ${CYAN}npx cheshire-terminal-agents a2a send --text "who are you"${RESET}
  ${CYAN}npx cheshire-terminal-agents registry${RESET}     Print registry index
  ${CYAN}npx cheshire-terminal-agents schema${RESET}       Show agent schema info
  ${CYAN}npx cheshire-terminal-agents --help${RESET}       Show this help

${BOLD}Install globally:${RESET}
  ${YELLOW}npm i -g cheshire-terminal-agents${RESET}
  ${YELLOW}ct-agents design${RESET}          ${DIM}# interactive template forge${RESET}
  ${YELLOW}ct-agents design --from defi-yield-farmer --id my-yield --skills cheshire-core --out ./my-yield.json${RESET}
  ${YELLOW}ct-agents skills${RESET}                         ${DIM}# multi-select TUI — pick what you need${RESET}
  ${YELLOW}ct-agents skills install metaplex-agent${RESET}  ${DIM}# download only that skill${RESET}
  ${YELLOW}ct-agents dna generate --from warrenbuffet --out ./buffett-dna${RESET}  ${DIM}# agentic DNA bundle${RESET}

${BOLD}Design flow:${RESET}
  1. Pick a catalog agent, character, or blank scaffold as a template
  2. Customize identifier / title / systemRole / tags
  3. Optionally open the Skill Hub multi-select picker (refs only — 595 stay remote)
  4. Validate against ${MAGENTA}clawdAgentSchema.v1${RESET}
  5. Write a local agent JSON you own
  6. Optional: sparse-install selected skills into ./.agents/skills (never the full hub)

${BOLD}Skill picker (avoid bloat):${RESET}
  ${CYAN}ct-agents skills${RESET}          interactive TUI — list, search, multi-select, install only picks
  ${CYAN}ct-agents skills packs${RESET}    curated packs (cheshire-core, trading, imperial, …)
  ${CYAN}ct-agents serve${RESET} then open ${MAGENTA}/skills-picker.html${RESET} for a browser multi-select UI

${BOLD}Agentic DNA:${RESET}
  1. ${CYAN}ct-agents dna list${RESET} — browse ${MAGENTA}characters/*.json${RESET} seeds
  2. ${CYAN}ct-agents dna generate --from <id> --out ./my-dna${RESET} — write IDENTITY/SOUL/USER/TOOLS
  3. Or free-form: ${CYAN}ct-agents dna generate --name Nova --vibe "sharp" --out ./nova-dna${RESET}
  4. Point your agent workspace at the output directory for session continuity

${BOLD}Knowledge folder (upload your own):${RESET}
  1. ${CYAN}ct-agents knowledge init --from clawd --out ./my-knowledge${RESET} — scaffold from ${MAGENTA}clawd-character.md${RESET}
  2. ${CYAN}ct-agents knowledge upload ./notes.md ./dumps/ --out ./my-knowledge${RESET} — drop your files
  3. ${CYAN}ct-agents knowledge inject ./my-knowledge${RESET} — write ${MAGENTA}.grok/rules/knowledge-inject.md${RESET}
  4. Package corpus lives in ${MAGENTA}knowledge/${RESET} (JSONL + character markdown)

${BOLD}Tigris storage (event-driven handoffs, no polling):${RESET}
  1. ${CYAN}ct-agents storage provision --agent elizero --url https://host/webhook${RESET} — bucket + notification rule
  2. ${CYAN}ct-agents storage put --from elizero --file ./report.json${RESET} — writer PutObject
  3. ${CYAN}ct-agents storage webhook --port 8788${RESET} — Tigris POSTs here; watcher GetObject
  4. ${CYAN}ct-agents storage handoff --from elizero --to hedgedna --file ./report.json${RESET} — envelope under ${MAGENTA}handoffs/${RESET}

${BOLD}Membrain memory (default source for catalog agents):${RESET}
  1. ${CYAN}ct-agents memory status${RESET} — adapter + daemon + record counts
  2. ${CYAN}ct-agents memory ingest --agent elizero --summary "swap filled"${RESET} — episodic event
  3. ${CYAN}ct-agents memory retrieve --agent elizero --query "evaluate SOL swap"${RESET}
  4. ${CYAN}ct-agents memory start${RESET} — run ${MAGENTA}packages/membrain${RESET} daemon (gRPC :9090, JSON HTTP :9091)

${BOLD}ACP + A2A:${RESET}
  ${CYAN}ct-agents acp${RESET} / ${CYAN}acp discover${RESET} / ${CYAN}acp list${RESET} / ${CYAN}acp show elizero${RESET}
  ${CYAN}ct-agents a2a${RESET} / ${CYAN}a2a peers${RESET} / ${CYAN}a2a send --text "who are you"${RESET}
  Local HTTP: ${CYAN}ct-agents serve${RESET} then ${MAGENTA}/.well-known/acp.json${RESET} · ${MAGENTA}/a2a/elizero${RESET}

  ${MAGENTA}https://cheshireterminal.ai/agents${RESET}              Agent hub (this npm package)
  ${MAGENTA}https://cheshireterminal.ai/cli${RESET}                 Site CLI hub (cheshire-terminal-cli)
  ${MAGENTA}https://cheshireterminal.ai/eliza-agents${RESET}        Eliza studio
  ${MAGENTA}https://cheshireterminal.ai/agents/forge${RESET}        Dual-chain forge
  ${MAGENTA}https://cheshireterminal.ai/api/agents/catalog${RESET}  Catalog API
  ${MAGENTA}https://cheshireterminal.ai/api/agents/registry${RESET} On-chain registry
  ${MAGENTA}https://cheshireterminal.ai/api/agents/templates${RESET} Scaffolds

${BOLD}Connect map:${RESET}
  ${CYAN}ct-agents connect${RESET}                 Print product hubs + GitHub sources (JSON)
  ${CYAN}npx cheshire-terminal-cli connect${RESET} Site CLI companion (status / agents / skills)
`);
  },
};

const args = process.argv.slice(2);
const cmd = args[0];

// Default: interactive design TUI when no command (or explicit design/forge/tui)
if (!cmd) {
  if (process.stdin.isTTY) {
    showBoot();
    await runDesign([]);
  } else {
    COMMANDS.help();
  }
} else if (cmd === 'design' || cmd === 'forge' || cmd === 'tui') {
  await runDesign(args.slice(1));
} else if (cmd === 'skills') {
  await runSkills(args.slice(1));
} else if (cmd === 'dna') {
  await runDna(args.slice(1));
} else if (cmd === 'knowledge') {
  await runKnowledge(args.slice(1));
} else if (cmd === 'storage' || cmd === 'tigris') {
  await runStorage(args.slice(1));
} else if (cmd === 'memory' || cmd === 'membrain') {
  await runMemory(args.slice(1));
} else if (cmd === 'acp') {
  await runAcp(args.slice(1));
} else if (cmd === 'a2a') {
  await runA2a(args.slice(1));
} else if (COMMANDS[cmd]) {
  const result = COMMANDS[cmd](args.slice(1));
  if (result && typeof result.then === 'function') await result;
} else if (cmd === '--help' || cmd === '-h') {
  COMMANDS.help();
} else if (cmd === '--version' || cmd === '-v') {
  COMMANDS.version();
} else {
  // Unknown command — if it looks like a design flag, forward to design
  if (cmd.startsWith('--')) {
    await runDesign(args);
  } else {
    showBoot();
    console.log(`${YELLOW}Unknown command: ${cmd}${RESET}`);
    console.log(`Run ${CYAN}npx cheshire-terminal-agents --help${RESET} for available commands.`);
    console.log(`Or open the design TUI: ${CYAN}npx cheshire-terminal-agents design${RESET}`);
    process.exit(1);
  }
}
