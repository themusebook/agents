/**
 * Agent Commerce Protocol (ACP) client + server.
 *
 * Discovery matches public/.well-known/acp.json
 * (schemaVersion: openclawd.acp.registry.v1).
 *
 * Server: local catalog + well-known document.
 * Client: fetch remote well-known, list/resolve agents, fall back local.
 */
import { createRequire } from 'node:module';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  CLAWD_MINT,
  PRODUCT_ORIGIN,
  PRODUCT_SURFACES,
  cheshireTerminalConnectInfo,
} from './cheshireTerminalRoot.js';

const PACKAGE_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);

export const ACP_SCHEMA_VERSION = 'openclawd.acp.registry.v1';
export const PREMIERE_AGENT_ID = 'elizero';

function publicOrigin(origin) {
  return String(origin || process.env.CHESHIRE_SITE_URL || PRODUCT_ORIGIN).replace(/\/$/, '');
}

export function acpWellKnownPath(root = PACKAGE_ROOT) {
  return join(root, 'public', '.well-known', 'acp.json');
}

export function loadLocalAcpRegistry(root = PACKAGE_ROOT) {
  const p = acpWellKnownPath(root);
  if (!existsSync(p)) return null;
  return JSON.parse(readFileSync(p, 'utf8'));
}

function loadCatalog(root = PACKAGE_ROOT) {
  return require(join(root, 'agents-catalog.json'));
}

export function summarizeAcpAgent(agent, origin) {
  const base = publicOrigin(origin);
  const id = agent.identifier || agent.id;
  const meta = agent.meta || {};
  const caps = agent.solana?.capabilities || agent.capabilities || [];
  return {
    id,
    name: meta.title || agent.name || id,
    category: meta.category || agent.category || null,
    featured: Boolean(agent.featured),
    oneShot: Boolean(agent.oneShot),
    premiere: id === PREMIERE_AGENT_ID,
    capabilities: caps,
    a2a: `${base}/a2a/${encodeURIComponent(id)}`,
    catalog: `${base}/api/agents/catalog/${encodeURIComponent(id)}`,
    registry: `${base}/api/agents/registry/${encodeURIComponent(id)}`,
  };
}

export function listAcpAgents({ root = PACKAGE_ROOT, origin } = {}) {
  const catalog = loadCatalog(root);
  const agents = Array.isArray(catalog.agents) ? catalog.agents : [];
  return agents.map((a) => summarizeAcpAgent(a, origin));
}

export function getAcpAgent(id, { root = PACKAGE_ROOT, origin } = {}) {
  const wanted = String(id || '').trim();
  if (!wanted) return null;
  return listAcpAgents({ root, origin }).find((a) => a.id === wanted) || null;
}

export function buildAcpDiscovery({ root = PACKAGE_ROOT, origin } = {}) {
  const base = publicOrigin(origin);
  const local = loadLocalAcpRegistry(root);
  const catalog = loadCatalog(root);
  const stats = catalog.stats || {};
  const premiere = getAcpAgent(PREMIERE_AGENT_ID, { root, origin });
  return {
    schemaVersion: ACP_SCHEMA_VERSION,
    protocol: 'Agent Commerce Protocol',
    generatedAt: new Date().toISOString(),
    host: base,
    role: 'server',
    premiereAgent: PREMIERE_AGENT_ID,
    discover: {
      catalog: `${base}/api/agents/catalog`,
      registry: `${base}/api/agents/registry`,
      templates: `${base}/api/agents/templates`,
      wellKnown: `${base}/.well-known/acp.json`,
      acp: `${base}/api/agents/acp`,
      a2a: `${base}/a2a/${PREMIERE_AGENT_ID}`,
    },
    chain: local?.chain || {
      namespace: 'solana',
      cluster: 'mainnet-beta',
      token: { symbol: 'CLAWD', mint: CLAWD_MINT },
      registry: 'metaplex-agent-registry',
    },
    stats: {
      agents: stats.totalAgents ?? (catalog.agents || []).length,
      featured: stats.totalFeatured ?? null,
      oneShots: stats.totalOneShots ?? null,
      premiere: stats.premiereAgent || PREMIERE_AGENT_ID,
    },
    premiere,
    cheshireTerminal: cheshireTerminalConnectInfo(root),
  };
}

export async function fetchAcpWellKnown(origin, { fetchImpl = fetch } = {}) {
  const url = `${publicOrigin(origin)}/.well-known/acp.json`;
  const res = await fetchImpl(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`ACP well-known HTTP ${res.status}`);
  return res.json();
}

export async function discoverAcp({
  origin,
  root = PACKAGE_ROOT,
  fetchImpl,
} = {}) {
  const base = publicOrigin(origin);
  const local = buildAcpDiscovery({ root, origin: base });
  if (!fetchImpl && base.includes('localhost')) {
    return { ok: true, source: 'local', discovery: local };
  }
  try {
    const remote = await fetchAcpWellKnown(base, { fetchImpl: fetchImpl || fetch });
    return {
      ok: true,
      source: 'remote',
      origin: base,
      discovery: {
        schemaVersion: remote.schemaVersion || ACP_SCHEMA_VERSION,
        protocol: remote.protocol || 'Agent Commerce Protocol',
        host: remote.host || base,
        discover: remote.discover || local.discover,
        chain: remote.chain || local.chain,
        agentCount: Array.isArray(remote.agents) ? remote.agents.length : local.stats.agents,
      },
      local,
    };
  } catch (err) {
    return {
      ok: true,
      source: 'local-fallback',
      origin: base,
      error: err instanceof Error ? err.message : String(err),
      discovery: local,
    };
  }
}

export async function resolveAcpAgent(id, {
  origin,
  root = PACKAGE_ROOT,
  fetchImpl,
} = {}) {
  const local = getAcpAgent(id, { root, origin });
  if (!fetchImpl) return local;
  const base = publicOrigin(origin);
  const url = `${base}/api/agents/catalog/${encodeURIComponent(id)}`;
  const res = await fetchImpl(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) return local;
  const body = await res.json();
  return summarizeAcpAgent(body.agent || body, origin);
}

function parseFlags(argv) {
  const flags = { _: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === '--help' || token === '-h') flags.help = true;
    else if (token.startsWith('--')) {
      const name = token.slice(2);
      const next = argv[i + 1];
      if (next && !next.startsWith('--')) {
        flags[name] = next;
        i += 1;
      } else flags[name] = true;
    } else flags._.push(token);
  }
  return flags;
}

function printHelp() {
  console.log(`ct-agents acp — Agent Commerce Protocol client + server

  ct-agents acp                    Discovery (local catalog + well-known)
  ct-agents acp discover [--site]  Probe remote /.well-known/acp.json
  ct-agents acp list               List catalog agents as ACP records
  ct-agents acp show <id>          Resolve one agent (premiere: elizero)

Local server routes (via ct-agents serve):
  GET  /.well-known/acp.json
  GET  /api/agents/acp
  GET  /api/agents/acp/agents
  GET  /api/agents/acp/agents/:id
`);
}

export async function runAcpCli(argv = [], root = PACKAGE_ROOT) {
  const args = [...argv];
  const sub = args[0] && !args[0].startsWith('-') ? args.shift() : 'status';
  const flags = parseFlags(args);
  if (sub === 'help' || flags.help) {
    printHelp();
    return 0;
  }
  const origin = flags.site || flags.origin || process.env.CHESHIRE_SITE_URL || PRODUCT_ORIGIN;

  if (sub === 'status' || sub === 'discovery') {
    console.log(JSON.stringify(buildAcpDiscovery({ root, origin }), null, 2));
    return 0;
  }
  if (sub === 'discover') {
    const report = await discoverAcp({ origin, root });
    console.log(JSON.stringify(report, null, 2));
    return 0;
  }
  if (sub === 'list') {
    const agents = listAcpAgents({ root, origin });
    console.log(JSON.stringify({
      protocol: 'ACP',
      count: agents.length,
      premiere: PREMIERE_AGENT_ID,
      agents,
    }, null, 2));
    return 0;
  }
  if (sub === 'show') {
    const id = flags.id || flags._[0] || PREMIERE_AGENT_ID;
    const agent = getAcpAgent(id, { root, origin });
    if (!agent) {
      console.error(`ACP agent not found: ${id}`);
      return 1;
    }
    console.log(JSON.stringify(agent, null, 2));
    return 0;
  }
  printHelp();
  return 1;
}

export { PRODUCT_SURFACES };
