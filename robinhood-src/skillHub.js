/**
 * Skill Hub client — on-demand skill selection without bloating the npm install.
 *
 * Full catalog (~595 skills) lives at github.com/Solizardking/skillhub-main.
 * This package only ships skills/skillhub-index.json (tiny pointer + packs).
 *
 * Modes:
 *  - list / search: fetch remote catalog (cached under os.tmpdir)
 *  - attach: write skill *references* onto an agent JSON (default, zero download)
 *  - install: fetch only selected skill SKILL.md files into a local target dir
 *             OR shell out to: npx github:Solizardking/skills install <slugs>
 */

import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');

const DEFAULT_INDEX_PATH = path.join(ROOT, 'skills', 'skillhub-index.json');
const DEFAULT_CACHE_DIR = path.join(os.tmpdir(), 'cheshire-terminal-agents-skillhub');
const DEFAULT_INSTALL_DIR = path.join(process.cwd(), '.agents', 'skills');

const BOLD = '\x1b[1m';
const DIM = '\x1b[2m';
const CYAN = '\x1b[36m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const RED = '\x1b[31m';
const RESET = '\x1b[0m';

// ─── index / cache ────────────────────────────────────────────────────────────

export function loadSkillHubIndex(root = ROOT) {
  const p = path.join(root, 'skills', 'skillhub-index.json');
  if (!fs.existsSync(p)) {
    return {
      hub: { github: 'https://github.com/Solizardking/skillhub-main' },
      remote: {
        catalogUrl:
          'https://raw.githubusercontent.com/Solizardking/skillhub-main/main/catalog.json',
        rawSkillBase:
          'https://raw.githubusercontent.com/Solizardking/skillhub-main/main/skills',
        installCommand: 'npx --yes github:Solizardking/skills install',
        cacheTtlMs: 86_400_000,
      },
      featured: [],
      packs: {},
    };
  }
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

function cachePaths(index) {
  const dir = process.env.CLAWD_SKILLHUB_CACHE || DEFAULT_CACHE_DIR;
  return {
    dir,
    catalog: path.join(dir, 'catalog.json'),
    meta: path.join(dir, 'cache-meta.json'),
    ttl: Number(index?.remote?.cacheTtlMs || 86_400_000),
  };
}

function readJsonSafe(p) {
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch {
    return null;
  }
}

async function fetchText(url, { timeoutMs = 20_000 } = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: { accept: 'application/json,text/plain,*/*' },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
    return await res.text();
  } finally {
    clearTimeout(t);
  }
}

/**
 * Load full Skill Hub catalog (595 entries). Cached on disk.
 * Falls back to featured+packs offline index when network fails.
 */
export async function loadSkillCatalog({ root = ROOT, forceRefresh = false } = {}) {
  const index = loadSkillHubIndex(root);
  const { dir, catalog: catalogPath, meta: metaPath, ttl } = cachePaths(index);

  if (!forceRefresh && fs.existsSync(catalogPath) && fs.existsSync(metaPath)) {
    const meta = readJsonSafe(metaPath);
    if (meta?.fetchedAt && Date.now() - meta.fetchedAt < ttl) {
      const cached = readJsonSafe(catalogPath);
      if (Array.isArray(cached) && cached.length) {
        return { skills: cached, source: 'cache', index, fetchedAt: meta.fetchedAt };
      }
    }
  }

  const url = index.remote?.catalogUrl;
  try {
    if (!url) throw new Error('no catalogUrl in skillhub-index');
    const text = await fetchText(url);
    const skills = JSON.parse(text);
    if (!Array.isArray(skills)) throw new Error('catalog is not an array');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(catalogPath, JSON.stringify(skills));
    const fetchedAt = Date.now();
    fs.writeFileSync(metaPath, JSON.stringify({ fetchedAt, url, count: skills.length }));
    return { skills, source: 'remote', index, fetchedAt };
  } catch (err) {
    // Offline fallback: featured + packs only
    const offline = buildOfflineCatalog(index);
    if (offline.length) {
      return {
        skills: offline,
        source: 'offline-index',
        index,
        warning: `remote catalog unavailable (${err.message}); using local packs/featured only`,
      };
    }
    throw err;
  }
}

function buildOfflineCatalog(index) {
  const seen = new Set();
  const out = [];
  const push = (slug, extra = {}) => {
    if (!slug || seen.has(slug)) return;
    seen.add(slug);
    out.push({
      slug,
      name: path.basename(slug),
      description: extra.description || `Skill Hub skill: ${slug}`,
      category: extra.category || 'Utilities',
      offline: true,
    });
  };
  for (const slug of index.featured || []) push(slug, { category: 'Featured' });
  for (const [packId, pack] of Object.entries(index.packs || {})) {
    for (const slug of pack.skills || []) {
      push(slug, { category: pack.label || packId, description: pack.description });
    }
  }
  // local suite skills shipped with this package (tiny)
  const suitePath = path.join(ROOT, 'skills', 'suite-index.json');
  const suite = readJsonSafe(suitePath);
  if (suite?.skills) {
    for (const slug of suite.skills) {
      push(slug, { category: 'Local suite', description: suite.description });
    }
  }
  return out;
}

export function searchSkills(skills, query, { limit = 40 } = {}) {
  const q = String(query || '')
    .trim()
    .toLowerCase();
  if (!q) return skills.slice(0, limit);
  const terms = q.split(/\s+/).filter(Boolean);
  const scored = [];
  for (const s of skills) {
    const hay = `${s.slug} ${s.name || ''} ${s.category || ''} ${s.description || ''}`.toLowerCase();
    let score = 0;
    for (const t of terms) {
      if (s.slug?.toLowerCase() === t) score += 100;
      else if (s.slug?.toLowerCase().includes(t)) score += 40;
      else if (s.name?.toLowerCase() === t) score += 30;
      else if (hay.includes(t)) score += 10;
      else {
        score = -1;
        break;
      }
    }
    if (score >= 0) scored.push({ score, s });
  }
  scored.sort((a, b) => b.score - a.score || a.s.slug.localeCompare(b.s.slug));
  return scored.slice(0, limit).map((x) => x.s);
}

export function resolveSkillRefs(requested, skills, index) {
  const bySlug = new Map(skills.map((s) => [s.slug, s]));
  const packs = index.packs || {};
  const resolved = [];
  const expansions = [];
  const missing = [];

  for (const raw of requested) {
    const key = String(raw || '').trim();
    if (!key) continue;

    // pack id
    if (packs[key]) {
      expansions.push(`pack ${key} → ${(packs[key].skills || []).join(', ')}`);
      for (const slug of packs[key].skills || []) {
        resolved.push(bySlug.get(slug) || { slug, name: path.basename(slug), description: '', category: packs[key].label || key });
      }
      continue;
    }

    // exact slug
    if (bySlug.has(key)) {
      resolved.push(bySlug.get(key));
      continue;
    }

    // fuzzy unique match
    const hits = searchSkills(skills, key, { limit: 5 });
    if (hits.length === 1) {
      resolved.push(hits[0]);
      continue;
    }
    if (hits.length > 1 && hits[0].slug.endsWith(key)) {
      resolved.push(hits[0]);
      continue;
    }
    // still allow attaching unknown skillhub slug (lazy)
    if (/^[a-z0-9][a-z0-9_./-]*$/i.test(key)) {
      resolved.push({ slug: key, name: path.basename(key), description: '', category: 'Custom', unresolved: true });
    } else {
      missing.push(key);
    }
  }

  // dedupe by slug
  const seen = new Set();
  const unique = [];
  for (const s of resolved) {
    if (seen.has(s.slug)) continue;
    seen.add(s.slug);
    unique.push(s);
  }
  return { skills: unique, expansions, missing };
}

/** Build agent.skills reference entries (no file bodies). */
export function skillRefsForAgent(skillList, index) {
  const installBase = index.remote?.installCommand || 'npx --yes github:Solizardking/skills install';
  const hub = index.hub?.github || 'https://github.com/Solizardking/skillhub-main';
  return skillList.map((s) => ({
    name: s.name || path.basename(s.slug),
    slug: s.slug,
    enabled: true,
    source: 'skillhub',
    hub,
    category: s.category || undefined,
    description: s.description ? String(s.description).slice(0, 240) : undefined,
    install: `${installBase} ${s.slug}`,
    path: `skills/${s.slug}`,
  }));
}

export function attachSkillsToAgent(agent, skillList, index) {
  const next = { ...agent };
  const refs = skillRefsForAgent(skillList, index);
  const existing = Array.isArray(next.skills) ? next.skills : [];
  const bySlug = new Map();
  for (const r of existing) {
    const key = r.slug || r.name || r.path;
    if (key) bySlug.set(key, r);
  }
  for (const r of refs) bySlug.set(r.slug, r);
  next.skills = Array.from(bySlug.values());
  next.pluginCount = next.skills.length;
  // light tag hint
  if (next.meta && Array.isArray(next.meta.tags)) {
    const tags = new Set(next.meta.tags);
    tags.add('skillhub');
    next.meta.tags = Array.from(tags).slice(0, 12);
  }
  return next;
}

// ─── selective install (only chosen skills) ───────────────────────────────────

function rawSkillUrl(index, slug, file = 'SKILL.md') {
  const base = (index.remote?.rawSkillBase || '').replace(/\/$/, '');
  return `${base}/${slug}/${file}`;
}

/**
 * Download only selected skills into targetDir/<slug>/SKILL.md
 * Does NOT pull the rest of Skill Hub.
 */
export async function installSkillsSparse(skillList, {
  root = ROOT,
  targetDir = DEFAULT_INSTALL_DIR,
  force = false,
} = {}) {
  const index = loadSkillHubIndex(root);
  fs.mkdirSync(targetDir, { recursive: true });
  const results = [];

  for (const s of skillList) {
    const slug = s.slug;
    // local suite already in package — symlink/copy reference path note
    const localSuite = path.join(root, 'skills', slug, 'SKILL.md');
    const destDir = path.join(targetDir, slug.replace(/\//g, path.sep));
    const destFile = path.join(destDir, 'SKILL.md');

    if (fs.existsSync(destFile) && !force) {
      results.push({ slug, status: 'skipped', path: destFile });
      continue;
    }

    try {
      fs.mkdirSync(destDir, { recursive: true });
      if (fs.existsSync(localSuite)) {
        fs.copyFileSync(localSuite, destFile);
        results.push({ slug, status: 'copied-local', path: destFile });
        continue;
      }
      const url = rawSkillUrl(index, slug, 'SKILL.md');
      const body = await fetchText(url);
      if (!body || body.length < 20) throw new Error('empty SKILL.md');
      fs.writeFileSync(destFile, body, 'utf8');
      results.push({ slug, status: 'fetched', path: destFile, bytes: body.length });
    } catch (err) {
      results.push({ slug, status: 'error', error: err.message });
    }
  }
  return { targetDir, results };
}

/**
 * Optional: use Skill Hub one-shot installer for packs / full skill trees.
 * Heavier than sparse fetch — only when user opts in with --via-skillhub-cli.
 */
export function installSkillsViaCli(slugs, {
  targetDir = DEFAULT_INSTALL_DIR,
  force = true,
} = {}) {
  return new Promise((resolve, reject) => {
    const args = [
      '--yes',
      'github:Solizardking/skills',
      'install',
      ...slugs,
      '--target',
      targetDir,
    ];
    if (force) args.push('--force');
    const child = spawn('npx', args, { stdio: 'inherit', shell: process.platform === 'win32' });
    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) resolve({ code, targetDir, slugs });
      else reject(new Error(`skillhub install exited ${code}`));
    });
  });
}

// ─── CLI surface ──────────────────────────────────────────────────────────────

function parseSkillsArgs(argv) {
  const args = { _: [], flags: {} };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--json') args.flags.json = true;
    else if (a === '--refresh') args.flags.refresh = true;
    else if (a === '--force') args.flags.force = true;
    else if (a === '--target') args.flags.target = argv[++i];
    else if (a === '--via-skillhub-cli') args.flags.viaCli = true;
    else if (a === '--help' || a === '-h') args.flags.help = true;
    else if (!a.startsWith('-')) args._.push(a);
  }
  return args;
}

export function printSkillsHelp() {
  console.log(`
${BOLD}${CYAN}ct-agents skills${RESET} — Skill Hub picker (no install bloat)

Skills are NOT bundled (595 live on Skill Hub). This CLI fetches the catalog
on demand and installs only what you select.

${BOLD}Commands:${RESET}
  ${CYAN}ct-agents skills list${RESET} [--json] [--refresh]
  ${CYAN}ct-agents skills search <query>${RESET} [--json]
  ${CYAN}ct-agents skills packs${RESET} [--json]
  ${CYAN}ct-agents skills install <slug|pack> [...]${RESET} [--target DIR] [--force] [--via-skillhub-cli]
  ${CYAN}ct-agents skills attach <agent.json> <slug|pack> [...]${RESET} [--install]

${BOLD}With design / oneshot forge:${RESET}
  ${CYAN}ct-agents design --from blank --id my-bot --skills metaplex-agent,trading --out ./my-bot.json${RESET}
  ${CYAN}ct-agents design --from defi-yield-farmer --id yield --skills cheshire-core --install-skills${RESET}

${BOLD}Install targets:${RESET}
  default sparse target:  ${DIM}./.agents/skills${RESET}
  Skill Hub CLI:          ${DIM}npx github:Solizardking/skills install <slugs>${RESET}

${BOLD}Hub:${RESET} https://github.com/Solizardking/skillhub-main
`);
}

export async function runSkillsCli(argv = [], root = ROOT) {
  const args = parseSkillsArgs(argv);
  if (args.flags.help || args._.length === 0) {
    printSkillsHelp();
    return 0;
  }

  const cmd = args._[0];
  const rest = args._.slice(1);

  if (cmd === 'packs') {
    const index = loadSkillHubIndex(root);
    if (args.flags.json) {
      console.log(JSON.stringify(index.packs || {}, null, 2));
    } else {
      console.log(`\n${BOLD}Curated packs${RESET} (local index — zero download)\n`);
      for (const [id, pack] of Object.entries(index.packs || {})) {
        console.log(`  ${GREEN}${id}${RESET}  ${pack.label || ''}`);
        console.log(`    ${DIM}${pack.description || ''}${RESET}`);
        console.log(`    skills: ${(pack.skills || []).join(', ')}`);
      }
      console.log(`\n${DIM}Featured:${RESET} ${(index.featured || []).join(', ')}\n`);
    }
    return 0;
  }

  if (cmd === 'list' || cmd === 'search') {
    const { skills, source, warning } = await loadSkillCatalog({
      root,
      forceRefresh: Boolean(args.flags.refresh),
    });
    if (warning) console.error(`${YELLOW}${warning}${RESET}`);
    const q = cmd === 'search' ? rest.join(' ') : '';
    const list = cmd === 'search' ? searchSkills(skills, q) : skills;
    if (args.flags.json) {
      console.log(JSON.stringify({ source, count: list.length, skills: list }, null, 2));
    } else {
      console.log(`\n${BOLD}Skill Hub${RESET} · ${list.length} shown · source=${source}\n`);
      for (const s of list.slice(0, 200)) {
        const d = String(s.description || '').replace(/\s+/g, ' ').slice(0, 70);
        console.log(`  ${GREEN}${s.slug}${RESET}  ${DIM}[${s.category || '?'}]${RESET}`);
        if (d) console.log(`    ${DIM}${d}${RESET}`);
      }
      if (list.length > 200) console.log(`\n  ${DIM}… ${list.length - 200} more — use search${RESET}`);
      console.log();
    }
    return 0;
  }

  if (cmd === 'install') {
    if (!rest.length) {
      console.error('Usage: ct-agents skills install <slug|pack> [...]');
      return 1;
    }
    const { skills: catalog, index, warning } = await loadSkillCatalog({ root });
    if (warning) console.error(`${YELLOW}${warning}${RESET}`);
    const { skills: picked, expansions, missing } = resolveSkillRefs(rest, catalog, index);
    for (const line of expansions) console.log(`${DIM}${line}${RESET}`);
    if (missing.length) {
      console.error(`${RED}Unknown: ${missing.join(', ')}${RESET}`);
      return 1;
    }
    const target = args.flags.target || DEFAULT_INSTALL_DIR;
    console.log(`${CYAN}Installing ${picked.length} skill(s) → ${target}${RESET}`);

    if (args.flags.viaCli) {
      await installSkillsViaCli(
        picked.map((s) => s.slug),
        { targetDir: target, force: Boolean(args.flags.force) }
      );
      return 0;
    }

    const { results } = await installSkillsSparse(picked, {
      root,
      targetDir: target,
      force: Boolean(args.flags.force),
    });
    for (const r of results) {
      if (r.status === 'error') console.log(`  ${RED}✗${RESET} ${r.slug}: ${r.error}`);
      else console.log(`  ${GREEN}✓${RESET} ${r.slug} (${r.status}) ${DIM}${r.path || ''}${RESET}`);
    }
    const failed = results.filter((r) => r.status === 'error').length;
    if (failed) {
      console.log(
        `${YELLOW}${failed} failed — try: ct-agents skills install ${rest.join(' ')} --via-skillhub-cli${RESET}`
      );
      return 1;
    }
    return 0;
  }

  if (cmd === 'attach') {
    const agentPath = rest[0];
    const skillArgs = rest.slice(1);
    if (!agentPath || !skillArgs.length) {
      console.error('Usage: ct-agents skills attach <agent.json> <slug|pack> [...] [--install]');
      return 1;
    }
    const installAlso = argv.includes('--install') || argv.includes('--install-skills');
    const agentFile = path.resolve(agentPath);
    const agent = readJsonSafe(agentFile);
    if (!agent) {
      console.error(`Cannot read agent: ${agentFile}`);
      return 1;
    }
    const { skills: catalog, index, warning } = await loadSkillCatalog({ root });
    if (warning) console.error(`${YELLOW}${warning}${RESET}`);
    const { skills: picked, missing } = resolveSkillRefs(skillArgs, catalog, index);
    if (missing.length) {
      console.error(`${RED}Unknown: ${missing.join(', ')}${RESET}`);
      return 1;
    }
    const next = attachSkillsToAgent(agent, picked, index);
    fs.writeFileSync(agentFile, JSON.stringify(next, null, 2) + '\n');
    console.log(`${GREEN}✓ attached ${picked.length} skill ref(s)${RESET} → ${agentFile}`);
    if (installAlso) {
      const { results } = await installSkillsSparse(picked, {
        root,
        targetDir: args.flags.target || DEFAULT_INSTALL_DIR,
        force: Boolean(args.flags.force),
      });
      for (const r of results) {
        console.log(
          r.status === 'error'
            ? `  ${RED}✗${RESET} ${r.slug}: ${r.error}`
            : `  ${GREEN}✓${RESET} ${r.slug} (${r.status})`
        );
      }
    } else {
      console.log(
        `${DIM}refs only (no download). Install later: ct-agents skills install ${picked.map((s) => s.slug).join(' ')}${RESET}`
      );
    }
    return 0;
  }

  console.error(`Unknown skills command: ${cmd}`);
  printSkillsHelp();
  return 1;
}

export { DEFAULT_INSTALL_DIR, DEFAULT_INDEX_PATH };
