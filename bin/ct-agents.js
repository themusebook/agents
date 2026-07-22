#!/usr/bin/env node

import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import path from 'path';
import http from 'http';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const pkg = require('../package.json');
const catalog = require('../agents-catalog.json');

const BOLD = '\x1b[1m';
const CYAN = '\x1b[36m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const MAGENTA = '\x1b[35m';
const RED = '\x1b[31m';
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
`);
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
    }, null, 2));
  },

  registry: () => {
    const regPath = path.join(__dirname, '..', 'public', 'api', 'agents', 'registry', 'index.json');
    if (!fs.existsSync(regPath)) {
      console.error('Registry index not found. Run build first: npm run build');
      process.exit(1);
    }
    const reg = JSON.parse(fs.readFileSync(regPath, 'utf8'));
    console.log(JSON.stringify(reg, null, 2));
  },

  skills: () => {
    const skillsDir = path.join(__dirname, '..', 'skills');
    if (!fs.existsSync(skillsDir)) {
      console.log('No skills directory found.');
      return;
    }
    const dirs = fs.readdirSync(skillsDir).filter(d => fs.statSync(path.join(skillsDir, d)).isDirectory());
    console.log(JSON.stringify({ count: dirs.length, skills: dirs }, null, 2));
  },

  schema: () => {
    const schemaPath = path.join(__dirname, '..', 'schema', 'clawdAgentSchema.v1.json');
    if (!fs.existsSync(schemaPath)) {
      console.error('Schema file not found.');
      process.exit(1);
    }
    const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
    console.log(`Schema: ${schema.$id || schema.title || 'clawdAgentSchema.v1'}`);
    console.log(`Properties: ${Object.keys(schema.properties || {}).join(', ')}`);
  },

  serve: () => {
    const port = parseInt(process.argv[3] || process.env.PORT || '3000', 10);
    const PUBLIC = path.join(__dirname, '..', 'public');

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
    console.log(`${CYAN}  http://localhost:${port}/.well-known/acp.json${RESET}\n`);

    server.listen(port, () => {
      console.log(`${GREEN}✓ Listening on port ${port}${RESET}`);
    });
  },

  help: () => {
    showBoot();
    console.log(`
${BOLD}Usage:${RESET}
  ${CYAN}npx cheshire-terminal-agents${RESET}          Boot the agent forge (interactive)
  ${CYAN}npx cheshire-terminal-agents serve${RESET}    Start the API server
  ${CYAN}npx cheshire-terminal-agents catalog${RESET}   Print agent catalog stats
  ${CYAN}npx cheshire-terminal-agents registry${RESET}  Print registry index
  ${CYAN}npx cheshire-terminal-agents skills${RESET}    List deployable skills
  ${CYAN}npx cheshire-terminal-agents schema${RESET}    Show agent schema info
  ${CYAN}npx cheshire-terminal-agents --help${RESET}    Show this help

${BOLD}Install globally:${RESET}
  ${YELLOW}npm i -g cheshire-terminal-agents${RESET}
  ${YELLOW}ct-agents serve${RESET}

${BOLD}Endpoints:${RESET}
  ${MAGENTA}https://cheshireterminal.ai/agents${RESET}          Agent hub
  ${MAGENTA}https://cheshireterminal.ai/api/agents/catalog${RESET}   137 agents
  ${MAGENTA}https://cheshireterminal.ai/api/agents/registry${RESET}  On-chain registry
  ${MAGENTA}https://cheshireterminal.ai/api/agents/templates${RESET} 5 templates
`);
  },
};

const args = process.argv.slice(2);
const cmd = args[0] || 'help';

if (COMMANDS[cmd]) {
  COMMANDS[cmd]();
} else if (cmd === '--help' || cmd === '-h') {
  COMMANDS.help();
} else if (cmd === '--version' || cmd === '-v') {
  COMMANDS.version();
} else {
  showBoot();
  console.log(`${YELLOW}Unknown command: ${cmd}${RESET}`);
  console.log(`Run ${CYAN}npx cheshire-terminal-agents --help${RESET} for available commands.`);
  process.exit(1);
}