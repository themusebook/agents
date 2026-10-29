#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const HOST = 'https://x402.wtf';

function fullPath(relativePath) {
  return path.join(ROOT, relativePath);
}

function pathExists(relativePath) {
  try {
    fs.lstatSync(fullPath(relativePath));
    return true;
  } catch {
    return false;
  }
}

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(assertExists(relativePath), 'utf8'));
}

function readText(relativePath) {
  return fs.readFileSync(assertExists(relativePath), 'utf8');
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function assertExists(relativePath) {
  const target = fullPath(relativePath);
  assert(pathExists(relativePath), `missing ${relativePath}`);
  return target;
}

function assertNotExists(relativePath) {
  assert(!pathExists(relativePath), `stale build artifact present: ${relativePath}`);
}

function assertHostUrl(value, label, prefix = HOST) {
  assert(
    typeof value === 'string' && value.startsWith(prefix),
    `${label} must start with ${prefix}`
  );
}

function walkFiles(relativePath, files = []) {
  const root = fullPath(relativePath);
  if (!pathExists(relativePath)) return files;

  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const nextRelativePath = path.join(relativePath, entry.name);
    if (entry.isDirectory()) {
      walkFiles(nextRelativePath, files);
    } else {
      files.push(nextRelativePath);
    }
  }

  return files;
}

const cname = readText('CNAME').trim();
assert(cname === 'x402.wtf', `CNAME must be x402.wtf, got ${cname}`);

const requiredPaths = [
  'agent-minter',
  'Agent-Staking_Unstaking_solana_metaplex_core',
  'characters',
  'clawd-grok',
  'clawd-operator',
  'clawd-pump',
  'clawdrouter',
  'cli',
  'cloudflare-agent-api',
  'docs',
  'formal_verification',
  'gateway',
  'locales',
  'minted',
  'public',
  'scripts',
  'solana-gpt-oracle',
  'src',
  '.gitattributes',
  '.gitignore',
  'agent-template-attested.json',
  'agent-template-full.json',
  'agent-template.json',
  'agents-catalog.json',
  'agents-manifest.json',
  'AGENTS.md',
  'build-catalog.cjs',
  'bun.lock',
  'CHANGELOG.md',
  'CITATION.cff',
  'CNAME',
  'CODE_OF_CONDUCT.md',
  'CONTRIBUTING.md',
  'gateway.txt',
  'GEMINI.md',
  'humans.txt',
  'LICENSE',
  'meta.json',
  'nich.jpg',
  'package.json',
  'README.md',
  'SECURITY.md',
  'soltoshi.json',
  'public/.well-known/acp.json',
  'public/.well-known/ai-plugin.json',
  'public/api/agents/acp-registry.json',
  'public/api/agents/agents-catalog.json',
  'public/api/agents/catalog/index.json',
  'public/api/agents/index.json',
  'public/api/agents/registry/index.json',
];

for (const relativePath of requiredPaths) {
  assertExists(relativePath);
}

for (const relativePath of ['cli/dist', 'cloudflare-agent-api/.wrangler']) {
  assertNotExists(relativePath);
}

const finderMetadata = walkFiles('.').filter((file) => path.basename(file) === '.DS_Store');
assert(finderMetadata.length === 0, `stale Finder metadata present: ${finderMetadata.join(', ')}`);

const plugin = readJson('public/.well-known/ai-plugin.json');
assert(
  plugin.api?.url === `${HOST}/api/agents`,
  'ai-plugin api.url must use https://x402.wtf/api/agents'
);
assert(
  plugin.logo_url === `${HOST}/nich.jpg`,
  'ai-plugin logo_url must use https://x402.wtf/nich.jpg'
);
assert(plugin.agent_registry?.hub === `${HOST}/agents`, 'ai-plugin missing x402 agents hub');
assert(plugin.skill_registry?.hub === `${HOST}/skills`, 'ai-plugin missing x402 skills hub');
assert(plugin.gateway?.hub === `${HOST}/gateway`, 'ai-plugin missing x402 gateway hub');
assert(
  plugin.gateway?.telegram_webhook === `${HOST}/telegram/webhook`,
  'ai-plugin missing x402 Telegram webhook'
);
assert(plugin.staking?.hub === `${HOST}/staking`, 'ai-plugin missing x402 staking hub');
assert(
  plugin.staking?.portfolio === `${HOST}/api/staking/portfolio/{owner}`,
  'ai-plugin missing staking portfolio route'
);
assert(
  plugin.staking?.assets === `${HOST}/api/staking/assets/{owner}`,
  'ai-plugin missing staking assets route'
);
assert(
  plugin.staking?.asset === `${HOST}/api/staking/agent/{assetId}`,
  'ai-plugin missing staking asset route'
);
assert(
  Array.isArray(plugin.staking?.das_methods) &&
    plugin.staking.das_methods.includes('getAssetsByOwner'),
  'ai-plugin missing Helius DAS methods'
);

const catalog = readJson('agents-catalog.json');
const publicCatalog = readJson('public/api/agents/agents-catalog.json');
const catalogIndex = readJson('public/api/agents/catalog/index.json');
assert(catalog.hub?.gallery === `${HOST}/agents`, 'catalog hub.gallery must use x402.wtf/agents');
assert(
  catalog.hub?.mint === `${HOST}/agents/mint`,
  'catalog hub.mint must use x402.wtf/agents/mint'
);
assert(
  catalog.hub?.registry === `${HOST}/api/agents/registry`,
  'catalog hub.registry must use x402 API'
);
assert(catalog.hub?.api === `${HOST}/api/agents`, 'catalog hub.api must use x402 API');
assert(catalog.stats?.totalAgents > 0, 'catalog must include agents');
assert(
  publicCatalog.stats?.totalAgents === catalog.stats.totalAgents,
  'public API catalog copy is stale'
);
assert(
  catalogIndex.stats?.totalAgents === catalog.stats.totalAgents,
  'public catalog index is stale'
);

for (const agent of catalog.agents ?? []) {
  assert(agent.identifier, 'catalog agent missing identifier');
  assert(
    agent.deploy?.json === `/api/agents/catalog/${encodeURIComponent(agent.identifier)}.json`,
    `${agent.identifier} bad catalog route`
  );
  assert(
    agent.deploy?.registration ===
      `/api/agents/registry/${encodeURIComponent(agent.identifier)}.json`,
    `${agent.identifier} bad registry route`
  );
  assertExists(`public/api/agents/catalog/${agent.identifier}.json`);
  assertExists(`public/api/agents/registry/${agent.identifier}.json`);
}

const acp = readJson('public/api/agents/acp-registry.json');
const wellKnownAcp = readJson('public/.well-known/acp.json');
assert(acp.host === HOST, 'ACP registry host must be x402.wtf');
assert(
  acp.discover?.catalog === `${HOST}/api/agents/catalog`,
  'ACP catalog discovery must use x402'
);
assert(
  acp.discover?.wellKnown === `${HOST}/.well-known/acp.json`,
  'ACP well-known discovery must use x402'
);
assert(
  JSON.stringify(wellKnownAcp) === JSON.stringify(acp),
  'public .well-known ACP copy is stale'
);

console.log(`x402 setup OK: ${catalog.stats.totalAgents} agents`);
