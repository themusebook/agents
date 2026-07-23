#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const EXPECTED_TOTAL = 137;
const EXPECTED_ONE_SHOTS = ['solana-pumpfun-bot'];
const EXPECTED_FEATURED = ['clawd-agents-perps-runtime', 'clawd-livekit-voice', 'mechaplex-mech-builder', 'solana-pumpfun-bot', 'solana-vulcan-clawd-autonomous-perps'];
const CANONICAL_API = 'https://cheshireterminal.ai/api/agents';
const FORBIDDEN_PATTERNS = [/www\.x402\.wtf/, /clawd\.click/];

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, relativePath), 'utf8'));
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function walkFiles(dir, files = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkFiles(fullPath, files);
    } else {
      files.push(fullPath);
    }
  }
  return files;
}

const catalog = readJson('agents-catalog.json');
const apiIndex = readJson('public/api/agents/index.json');
const catalogIndex = readJson('public/api/agents/catalog/index.json');
const registryIndex = readJson('public/api/agents/registry/index.json');

assert(catalog.hub.api === CANONICAL_API, `bad agents API: ${catalog.hub.api}`);
assert(catalogIndex.hub.api === CANONICAL_API, `bad catalog API: ${catalogIndex.hub.api}`);
assert(apiIndex.endpoints.catalog === '/api/agents/catalog', 'missing catalog endpoint');
assert(apiIndex.endpoints.registry === '/api/agents/registry', 'missing registry endpoint');

assert(
  catalog.stats.totalAgents === EXPECTED_TOTAL,
  `bad totalAgents: ${catalog.stats.totalAgents}`
);
assert(catalog.agents.length === EXPECTED_TOTAL, `agent array mismatch: ${catalog.agents.length}`);
assert(
  catalogIndex.stats.totalAgents === EXPECTED_TOTAL,
  `catalog index mismatch: ${catalogIndex.stats.totalAgents}`
);
assert(registryIndex.count === EXPECTED_TOTAL, `registry count mismatch: ${registryIndex.count}`);
assert(
  catalog.stats.totalTemplates >= 1,
  `expected scaffold templates >= 1, got ${catalog.stats.totalTemplates}`
);
assert(
  Array.isArray(catalog.templates) && catalog.templates.length === catalog.stats.totalTemplates,
  `templates array length mismatch: ${catalog.templates?.length} vs stats ${catalog.stats.totalTemplates}`
);
for (const template of catalog.templates) {
  assert(template.templateId, 'template missing templateId');
  assert(template.name, `${template.templateId} missing name`);
  assert(
    fs.existsSync(path.join(ROOT, 'public/api/agents/templates', `${template.templateId}.json`)),
    `${template.templateId} missing public template file`
  );
}
assert(
  fs.existsSync(path.join(ROOT, 'public/api/agents/templates', 'index.json')),
  'missing templates index.json'
);

const oneShots = catalog.oneShots.map((agent) => agent.identifier).sort();
const featured = catalog.featured.map((agent) => agent.identifier).sort();
assert(
  JSON.stringify(oneShots) === JSON.stringify(EXPECTED_ONE_SHOTS),
  `bad one-shots: ${oneShots.join(',')}`
);
assert(
  JSON.stringify(featured) === JSON.stringify([...EXPECTED_FEATURED].sort()),
  `bad featured: ${featured.join(',')}`
);

const categoryIds = new Set(catalog.categories.map((category) => category.id));
for (const category of Object.keys(catalog.stats.byCategory)) {
  assert(categoryIds.has(category), `missing category map entry: ${category}`);
}

for (const agent of catalog.agents) {
  assert(agent.identifier, 'agent missing identifier');
  assert(agent.title, `${agent.identifier} missing title`);
  assert(agent.category, `${agent.identifier} missing category`);
  assert(
    agent.deploy?.json === `/api/agents/catalog/${encodeURIComponent(agent.identifier)}.json`,
    `${agent.identifier} bad catalog deploy route`
  );
  assert(
    agent.deploy?.registration ===
      `/api/agents/registry/${encodeURIComponent(agent.identifier)}.json`,
    `${agent.identifier} bad registry deploy route`
  );
  assert(
    fs.existsSync(path.join(ROOT, 'public/api/agents/catalog', `${agent.identifier}.json`)),
    `${agent.identifier} missing catalog file`
  );
  assert(
    fs.existsSync(path.join(ROOT, 'public/api/agents/registry', `${agent.identifier}.json`)),
    `${agent.identifier} missing registry file`
  );
}

for (const file of walkFiles(path.join(ROOT, 'public/api/agents'))) {
  if (!file.endsWith('.json')) continue;
  const content = fs.readFileSync(file, 'utf8');
  for (const pattern of FORBIDDEN_PATTERNS) {
    assert(
      !pattern.test(content),
      `${path.relative(ROOT, file)} contains forbidden host ${pattern}`
    );
  }
}

console.log(`${EXPECTED_TOTAL} schema validations pass`);
