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

const COMMANDS = {
  version: () => {
    showBoot();
    process.exit(0);
  },

  catalog: () => {
    const stats = catalog.stats || catalog;
    console.log(JSON.stringify({
      agents: stats.totalAgents,
      oneShots: stats.totalOneShots,
      featured: stats.totalFeatured,
      templates: stats.totalTemplates,
      categories: stats.byCategory ? Object.keys(stats.byCategory) : [],
      hub: catalog.hub || null,
      design: 'ct-agents design',
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

  serve: () => {
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

    const server = http.createServer((req, res) => {
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
    console.log(`${CYAN}  http://localhost:${port}/.well-known/acp.json${RESET}`);
    console.log(`${DIM}  design locally: ct-agents design${RESET}\n`);

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
  ${CYAN}npx cheshire-terminal-agents skills${RESET}       Skill Hub picker (remote, no bloat)
  ${CYAN}npx cheshire-terminal-agents skills search vulcan${RESET}
  ${CYAN}npx cheshire-terminal-agents skills install metaplex-agent${RESET}
  ${CYAN}npx cheshire-terminal-agents serve${RESET}        Start the API server
  ${CYAN}npx cheshire-terminal-agents catalog${RESET}      Print agent catalog stats
  ${CYAN}npx cheshire-terminal-agents templates${RESET}    List scaffold templates
  ${CYAN}npx cheshire-terminal-agents registry${RESET}     Print registry index
  ${CYAN}npx cheshire-terminal-agents schema${RESET}       Show agent schema info
  ${CYAN}npx cheshire-terminal-agents --help${RESET}       Show this help

${BOLD}Install globally:${RESET}
  ${YELLOW}npm i -g cheshire-terminal-agents${RESET}
  ${YELLOW}ct-agents design${RESET}          ${DIM}# interactive template forge${RESET}
  ${YELLOW}ct-agents design --from defi-yield-farmer --id my-yield --skills cheshire-core --out ./my-yield.json${RESET}
  ${YELLOW}ct-agents skills install metaplex-agent${RESET}  ${DIM}# download only that skill${RESET}

${BOLD}Design flow:${RESET}
  1. Pick a catalog agent, character, or blank scaffold as a template
  2. Customize identifier / title / systemRole / tags
  3. Optionally attach Skill Hub skills (refs only — 595 skills stay remote)
  4. Validate against ${MAGENTA}clawdAgentSchema.v1${RESET}
  5. Write a local agent JSON you own
  6. Optional: ${CYAN}--install-skills${RESET} pulls only selected skills into ./.agents/skills

${BOLD}Endpoints:${RESET}
  ${MAGENTA}https://cheshireterminal.ai/agents${RESET}          Agent hub
  ${MAGENTA}https://cheshireterminal.ai/api/agents/catalog${RESET}   catalog
  ${MAGENTA}https://cheshireterminal.ai/api/agents/registry${RESET}  On-chain registry
  ${MAGENTA}https://cheshireterminal.ai/api/agents/templates${RESET} Scaffolds
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
