/**
 * Resolve the sibling cheshire-terminal-main checkout.
 *
 * Do not vendor that tree into this package. Override with
 * CLAWD_CHESHIRE_TERMINAL_ROOT.
 *
 * Surfaces (local folders when present):
 *   skills · skills-store · agents · client · mcp-server · registry
 *   robinhood-agents · agent-arena · agent-arena-skill · cli
 */
import { existsSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const PACKAGE_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

export const DEFAULT_CHESHIRE_TERMINAL_REL = '../cheshire-terminal-main';
export const CHESHIRE_TERMINAL_ENV = 'CLAWD_CHESHIRE_TERMINAL_ROOT';
export const PRODUCT_ORIGIN = 'https://cheshireterminal.ai';
export const CLAWD_MINT = '8cHzQHUS2s2h8TzCmfqPKYiM4dSt4roa3n7MyRLApump';

export const PRODUCT_SURFACES = {
  agents: `${PRODUCT_ORIGIN}/agents`,
  agentsForge: `${PRODUCT_ORIGIN}/agents/forge`,
  elizaAgents: `${PRODUCT_ORIGIN}/eliza-agents`,
  cli: `${PRODUCT_ORIGIN}/cli`,
  skills: `${PRODUCT_ORIGIN}/skills`,
  skillsStore: `${PRODUCT_ORIGIN}/skills-store`,
  arena: `${PRODUCT_ORIGIN}/arena`,
  registry: `${PRODUCT_ORIGIN}/registry`,
  agentRegistry: `${PRODUCT_ORIGIN}/agent-registry`,
  mcp: `${PRODUCT_ORIGIN}/mcp`,
  acp: `${PRODUCT_ORIGIN}/.well-known/acp.json`,
  a2a: `${PRODUCT_ORIGIN}/.well-known/agent-card.json`,
  zkSharkA2a: `${PRODUCT_ORIGIN}/a2a/zk-shark`,
  elizeroA2a: `${PRODUCT_ORIGIN}/a2a/elizero`,
};

const SURFACE_MARKERS = {
  skills: ['CANONICAL.md', 'HUB.md', 'README.md'],
  skillsStore: ['catalog.json'],
  agents: ['INTEGRATION_MANIFEST.json', 'AGENTS.md'],
  client: ['index.html'],
  mcpServer: ['package.json', 'src/index.ts'],
  registry: ['google/cheshire-agent-card.json'],
  robinhoodAgents: ['skills/suite-index.json', 'package.json'],
  agentArena: ['SKILL.md', '_meta.json'],
  agentArenaSkill: ['SKILL.md', 'examples/package.json'],
  cli: ['cheshire-cli.mjs', 'package.json'],
};

function looksLikeCheshireTerminal(abs) {
  if (!abs) return false;
  try {
    return (
      existsSync(join(abs, 'package.json')) &&
      (existsSync(join(abs, 'client', 'index.html')) ||
        existsSync(join(abs, 'mcp-server', 'package.json')) ||
        existsSync(join(abs, 'registry', 'google', 'cheshire-agent-card.json')))
    );
  } catch {
    return false;
  }
}

function surfaceExists(root, rel, markers) {
  const dir = join(root, rel);
  if (!existsSync(dir)) return false;
  return markers.some((m) => existsSync(join(dir, m)));
}

export function resolveCheshireTerminalRoot(root = PACKAGE_ROOT) {
  const candidates = [
    process.env[CHESHIRE_TERMINAL_ENV],
    DEFAULT_CHESHIRE_TERMINAL_REL,
    join(root, DEFAULT_CHESHIRE_TERMINAL_REL),
  ].filter(Boolean);

  for (const raw of candidates) {
    const abs = isAbsolute(String(raw)) ? String(raw) : resolve(root, String(raw));
    if (!looksLikeCheshireTerminal(abs)) continue;
    return {
      root: abs,
      skills: join(abs, 'skills'),
      skillsStore: join(abs, 'skills-store'),
      agents: join(abs, 'agents'),
      client: join(abs, 'client'),
      mcpServer: join(abs, 'mcp-server'),
      registry: join(abs, 'registry'),
      robinhoodAgents: join(abs, 'robinhood-agents'),
      agentArena: join(abs, 'agent-arena'),
      agentArenaSkill: join(abs, 'agent-arena-skill'),
      cli: join(abs, 'cli'),
      env: CHESHIRE_TERMINAL_ENV,
    };
  }
  return null;
}

export function inspectCheshireTerminalSurfaces(root = PACKAGE_ROOT) {
  const local = resolveCheshireTerminalRoot(root);
  const rel = DEFAULT_CHESHIRE_TERMINAL_REL;
  const dirs = {
    skills: { rel: 'skills', product: PRODUCT_SURFACES.skills },
    skillsStore: { rel: 'skills-store', product: PRODUCT_SURFACES.skillsStore },
    agents: { rel: 'agents', product: PRODUCT_SURFACES.agents },
    client: { rel: 'client', product: PRODUCT_ORIGIN },
    mcpServer: { rel: 'mcp-server', product: PRODUCT_SURFACES.mcp },
    registry: { rel: 'registry', product: PRODUCT_SURFACES.registry },
    robinhoodAgents: { rel: 'robinhood-agents', product: PRODUCT_SURFACES.agentsForge },
    agentArena: { rel: 'agent-arena', product: PRODUCT_SURFACES.arena },
    agentArenaSkill: { rel: 'agent-arena-skill', product: PRODUCT_SURFACES.arena },
    cli: { rel: 'cli', product: PRODUCT_SURFACES.cli },
  };

  const surfaces = {};
  for (const [id, meta] of Object.entries(dirs)) {
    const localPath = local ? local[id] : `${rel}/${meta.rel}`;
    const exists = local
      ? surfaceExists(local.root, meta.rel, SURFACE_MARKERS[id] || [])
      : false;
    surfaces[id] = {
      id,
      local: localPath,
      product: meta.product,
      exists,
    };
  }

  return {
    product: PRODUCT_ORIGIN,
    github: 'https://github.com/Solizardking/cheshire-terminal',
    local: local?.root || rel,
    resolved: Boolean(local),
    env: CHESHIRE_TERMINAL_ENV,
    surfaces,
  };
}

export function cheshireTerminalConnectInfo(root = PACKAGE_ROOT) {
  const inspected = inspectCheshireTerminalSurfaces(root);
  return {
    ...inspected,
    productHubs: {
      agents: PRODUCT_SURFACES.agents,
      elizaAgents: PRODUCT_SURFACES.elizaAgents,
      cli: PRODUCT_SURFACES.cli,
      skills: PRODUCT_SURFACES.skills,
      skillsStore: PRODUCT_SURFACES.skillsStore,
      arena: PRODUCT_SURFACES.arena,
      registry: PRODUCT_SURFACES.registry,
      mcp: PRODUCT_SURFACES.mcp,
      forge: PRODUCT_SURFACES.agentsForge,
    },
    protocols: {
      acp: PRODUCT_SURFACES.acp,
      a2a: PRODUCT_SURFACES.a2a,
      zkSharkA2a: PRODUCT_SURFACES.zkSharkA2a,
      elizeroA2a: PRODUCT_SURFACES.elizeroA2a,
    },
  };
}

/** Local SKILL.md candidates inside the cheshire-terminal checkout. */
export function findCheshireTerminalSkillMd(slug, root = PACKAGE_ROOT) {
  const ct = resolveCheshireTerminalRoot(root);
  if (!ct || !slug) return null;
  const safe = String(slug).replace(/\//g, '/');
  const candidates = [
    join(ct.skills, safe, 'SKILL.md'),
    join(ct.skillsStore, safe, 'SKILL.md'),
    safe === 'agent-arena' ? join(ct.agentArena, 'SKILL.md') : null,
    safe === 'agent-arena-skill' || safe === 'agent-registry'
      ? join(ct.agentArenaSkill, 'SKILL.md')
      : null,
  ].filter(Boolean);
  for (const file of candidates) {
    if (existsSync(file)) return file;
  }
  return null;
}
