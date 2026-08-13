/**
 * Resolve the full robinhood-agents checkout (forge SDK, contracts, deployments, RH skills).
 *
 * Prefer a sibling cheshire-terminal-main checkout over vendoring that tree here.
 * Override with CLAWD_ROBINHOOD_AGENTS_ROOT.
 */
import { existsSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const PACKAGE_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

export const DEFAULT_ROBINHOOD_AGENTS_REL = '../cheshire-terminal-main/robinhood-agents';

function looksLikeRobinhoodAgents(abs) {
  if (!abs) return false;
  try {
    if (!existsSync(join(abs, 'package.json'))) return false;
    return (
      existsSync(join(abs, 'skills', 'suite-index.json')) ||
      existsSync(join(abs, 'deployments', 'agent-registries-mainnet-4663.json')) ||
      existsSync(join(abs, 'src', 'cli.js'))
    );
  } catch {
    return false;
  }
}

export function resolveRobinhoodAgentsRoot(root = PACKAGE_ROOT) {
  const candidates = [
    process.env.CLAWD_ROBINHOOD_AGENTS_ROOT,
    DEFAULT_ROBINHOOD_AGENTS_REL,
    join(root, DEFAULT_ROBINHOOD_AGENTS_REL),
  ].filter(Boolean);

  for (const raw of candidates) {
    const abs = isAbsolute(String(raw)) ? String(raw) : resolve(root, String(raw));
    if (!looksLikeRobinhoodAgents(abs)) continue;
    return {
      root: abs,
      skillsDir: join(abs, 'skills'),
      packagesDir: join(abs, 'packages'),
      deploymentsDir: join(abs, 'deployments'),
      contractsDir: join(abs, 'contracts'),
      srcDir: join(abs, 'src'),
      schemaDir: join(abs, 'schema'),
      docsDir: join(abs, 'docs'),
      env: 'CLAWD_ROBINHOOD_AGENTS_ROOT',
    };
  }
  return null;
}

export function robinhoodAgentsConnectInfo(root = PACKAGE_ROOT) {
  const local = resolveRobinhoodAgentsRoot(root);
  return {
    product: 'https://cheshireterminal.ai/agents',
    forge: 'https://cheshireterminal.ai/agents/forge',
    github: 'https://github.com/Solizardking/robinhood-agents',
    cheshireTerminal: 'https://github.com/Solizardking/cheshire-terminal',
    local: local?.root || DEFAULT_ROBINHOOD_AGENTS_REL,
    skills: local?.skillsDir || `${DEFAULT_ROBINHOOD_AGENTS_REL}/skills`,
    deployments: local?.deploymentsDir || `${DEFAULT_ROBINHOOD_AGENTS_REL}/deployments`,
    resolved: Boolean(local),
    env: 'CLAWD_ROBINHOOD_AGENTS_ROOT',
  };
}
