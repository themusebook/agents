/**
 * Clawd Agent Design TUI
 *
 * Interactive terminal forge: browse catalog agents / characters / scaffolds
 * as templates, customize fields against clawdAgentSchema.v1, validate, and
 * write a local agent definition JSON.
 *
 * Usage (via ct-agents):
 *   ct-agents design
 *   ct-agents design --from defi-yield-farmer --id my-yield-bot --out ./my-yield-bot.json
 *   ct-agents design --list
 *   ct-agents design --validate ./path/to/agent.json
 */

import fs from 'fs';
import path from 'path';
import readline from 'readline';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const require = createRequire(import.meta.url);

const BOLD = '\x1b[1m';
const DIM = '\x1b[2m';
const CYAN = '\x1b[36m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const MAGENTA = '\x1b[35m';
const RED = '\x1b[31m';
const RESET = '\x1b[0m';
const CLEAR_LINE = '\x1b[2K';

const CATEGORIES = [
  'defi',
  'trading',
  'nft',
  'analytics',
  'security',
  'dev-tools',
  'education',
  'governance',
];

const AVATAR_PRESETS = ['🤖', '🐱', '♟️', '🚀', '🛡️', '📈', '💰', '🎨', '🗳️', '🛠️', '📚', '⚡'];

// ─── filesystem helpers ───────────────────────────────────────────────────────

function readJsonSafe(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

function listJsonFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.json') && f !== 'package.json')
    .sort();
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

// ─── template catalog ─────────────────────────────────────────────────────────

/**
 * Load every forkable template source shipped in the package:
 *  - agents/*.json        → production catalog agents (primary templates)
 *  - characters/*.json    → persona/character seeds
 *  - templates/*.template.json → blank scaffolds
 *  - minted/*.json        → on-chain mint metadata examples
 */
export function loadTemplateCatalog(root = ROOT) {
  const items = [];

  // 1. Scaffold templates
  const templatesDir = path.join(root, 'templates');
  for (const file of listJsonFiles(templatesDir).filter((f) => f.endsWith('.template.json'))) {
    const raw = readJsonSafe(path.join(templatesDir, file));
    if (!raw) continue;
    items.push({
      kind: 'scaffold',
      id: raw.templateId || path.basename(file, '.template.json'),
      title: raw.templateName || raw.meta?.title || path.basename(file, '.template.json'),
      description: raw.templateDescription || raw.meta?.description || 'Blank scaffold',
      avatar: raw.templateAvatar || raw.meta?.avatar || '🧩',
      category: raw.templateCategory || raw.meta?.category || 'dev-tools',
      tags: raw.meta?.tags || raw.variables?.map((v) => v.name) || ['scaffold'],
      sourcePath: path.join(templatesDir, file),
      agent: materializeScaffold(raw),
    });
  }

  // 2. Catalog agents — primary "use as template" source
  const agentsDir = path.join(root, 'agents');
  for (const file of listJsonFiles(agentsDir)) {
    const raw = readJsonSafe(path.join(agentsDir, file));
    if (!raw || !raw.identifier) continue;
    items.push({
      kind: 'agent',
      id: raw.identifier,
      title: raw.meta?.title || raw.identifier,
      description: raw.meta?.description || raw.summary || '',
      avatar: raw.meta?.avatar || '🤖',
      category: raw.meta?.category || 'defi',
      tags: raw.meta?.tags || [],
      sourcePath: path.join(agentsDir, file),
      agent: raw,
    });
  }

  // 3. Characters → soft-converted into clawd agent shells
  const charactersDir = path.join(root, 'characters');
  for (const file of listJsonFiles(charactersDir)) {
    const raw = readJsonSafe(path.join(charactersDir, file));
    if (!raw) continue;
    const id = slugify(raw.name || path.basename(file, '.json'));
    items.push({
      kind: 'character',
      id: `character-${id}`,
      title: raw.name || id,
      description: Array.isArray(raw.bio) ? raw.bio[0] : raw.description || 'Character persona',
      avatar: raw.avatar || raw.persona?.avatar || '🎭',
      category: 'education',
      tags: ['character', ...(raw.adjectives || []).slice(0, 4)],
      sourcePath: path.join(charactersDir, file),
      agent: characterToAgent(raw, id),
    });
  }

  // 4. Minted examples (metadata only — converted to light agent shells)
  const mintedDir = path.join(root, 'minted');
  for (const file of listJsonFiles(mintedDir)) {
    const raw = readJsonSafe(path.join(mintedDir, file));
    if (!raw) continue;
    const id = slugify(raw.symbol || raw.name || path.basename(file, '.json'));
    items.push({
      kind: 'minted',
      id: `minted-${id}`,
      title: raw.name || id,
      description: raw.description || 'Minted agent metadata',
      avatar: '🪙',
      category: 'nft',
      tags: ['minted', 'on-chain'],
      sourcePath: path.join(mintedDir, file),
      agent: mintedToAgent(raw, id),
    });
  }

  return items;
}

function materializeScaffold(raw) {
  if (raw.identifier && raw.config && raw.meta) {
    // Already a clawd-shaped agent embedded in the template file
    return {
      author: raw.author || 'your-name',
      identifier: raw.identifier,
      schemaVersion: 1,
      homepage: raw.homepage || 'https://cheshireterminal.ai/agents',
      createdAt: new Date().toISOString().slice(0, 10),
      summary: raw.summary || raw.meta?.description || '',
      knowledgeCount: 0,
      pluginCount: 0,
      tokenUsage: raw.tokenUsage || 0,
      meta: { ...raw.meta },
      config: { ...raw.config },
      examples: raw.examples || [],
    };
  }

  // Variable-driven scaffold
  const vars = Object.fromEntries((raw.variables || []).map((v) => [v.name, v.default ?? '']));
  return blankAgent({
    identifier: vars.identifier || raw.templateId || 'my-agent',
    title: vars.title || raw.templateName || 'My Agent',
    description: vars.description || raw.templateDescription || 'Custom agent',
    avatar: vars.avatar || raw.templateAvatar || '🤖',
    category: vars.category || raw.templateCategory || 'defi',
    systemRole: vars.systemRole || 'You are a helpful Cheshire Terminal agent.',
    author: vars.author || 'your-name',
  });
}

function characterToAgent(character, id) {
  const bio = Array.isArray(character.bio) ? character.bio.join('\n') : character.bio || '';
  const lore = Array.isArray(character.lore) ? character.lore.join('\n') : '';
  const traits = (character.adjectives || character.persona?.traits || []).join(', ');
  const systemRole = [
    `You are ${character.name || id}, a Cheshire Terminal character agent.`,
    traits ? `Personality traits: ${traits}.` : '',
    bio ? `\nBIO:\n${bio}` : '',
    lore ? `\nLORE:\n${lore}` : '',
    '\nNever request seed phrases or private keys.',
    'Prefer Solana-first guidance when chain is unspecified.',
  ]
    .filter(Boolean)
    .join('\n');

  return blankAgent({
    identifier: slugify(character.name || id),
    title: character.name || id,
    description: Array.isArray(character.bio) ? character.bio[0] : bio.slice(0, 200),
    avatar: character.avatar || character.persona?.avatar || '🎭',
    category: 'education',
    systemRole,
    author: 'cheshire-terminal',
    tags: ['character', ...(character.adjectives || []).slice(0, 5)],
    openingMessage: character.persona?.greeting || `Hello — I'm ${character.name || id}.`,
  });
}

function mintedToAgent(minted, id) {
  const role =
    minted.attributes?.find((a) => a.trait_type === 'Role')?.value ||
    minted.openclawd?.role ||
    'Agent';
  const systemRole = [
    `You are ${minted.name || id} (${minted.symbol || 'AGENT'}), a minted on-chain agent.`,
    `Role: ${role}.`,
    minted.description || '',
    'Operate with safety-first execution. Never request seed phrases or private keys.',
  ]
    .filter(Boolean)
    .join('\n');

  return blankAgent({
    identifier: slugify(minted.symbol || id).toLowerCase(),
    title: minted.name || id,
    description: (minted.description || role).slice(0, 300),
    avatar: '🪙',
    category: 'nft',
    systemRole,
    author: 'cheshire-terminal',
    tags: ['minted', 'on-chain', role.toLowerCase().replace(/\s+/g, '-')],
  });
}

export function blankAgent(opts = {}) {
  const identifier = slugify(opts.identifier || 'my-agent');
  const title = opts.title || 'My Agent';
  const description = opts.description || 'Custom Cheshire Terminal agent';
  return {
    author: opts.author || 'your-name',
    identifier,
    schemaVersion: 1,
    homepage: opts.homepage || 'https://cheshireterminal.ai/agents',
    createdAt: new Date().toISOString().slice(0, 10),
    summary: opts.summary || description,
    knowledgeCount: 0,
    pluginCount: 0,
    tokenUsage: opts.tokenUsage || 0,
    meta: {
      title,
      description: description.slice(0, 300),
      avatar: opts.avatar || '🤖',
      tags: opts.tags || ['custom', 'cheshire-terminal'],
      category: opts.category || 'defi',
    },
    config: {
      systemRole:
        opts.systemRole ||
        'You are a helpful Cheshire Terminal agent. Prefer Solana-first guidance when chain is unspecified. Never request seed phrases or private keys.',
      openingMessage:
        opts.openingMessage ||
        `Hello! I'm ${title}. How can I help you today?`,
      openingQuestions: opts.openingQuestions || [
        'What would you like help with?',
        'Should we start with a high-level overview?',
      ],
      displayMode: opts.displayMode || 'chat',
    },
    examples: opts.examples || [
      {
        role: 'user',
        content: `Can you help me with ${title.toLowerCase()}?`,
      },
      {
        role: 'assistant',
        content: `Absolutely — that's what I'm built for. Tell me your goal and constraints.`,
      },
    ],
  };
}

export function slugify(value) {
  return String(value || 'agent')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-')
    .slice(0, 64) || 'agent';
}

export function forkAgent(source, overrides = {}) {
  const base = JSON.parse(JSON.stringify(source));
  const nextId = slugify(overrides.identifier || `${base.identifier || 'agent'}-fork`);

  base.identifier = nextId;
  base.author = overrides.author || base.author || 'your-name';
  base.schemaVersion = 1;
  base.createdAt = new Date().toISOString().slice(0, 10);
  base.homepage = overrides.homepage || base.homepage || 'https://cheshireterminal.ai/agents';

  base.meta = base.meta || {};
  if (overrides.title) base.meta.title = overrides.title;
  if (overrides.description) base.meta.description = String(overrides.description).slice(0, 300);
  if (overrides.avatar) base.meta.avatar = overrides.avatar;
  if (overrides.category) base.meta.category = overrides.category;
  if (overrides.tags) base.meta.tags = overrides.tags;
  if (!base.meta.tags) base.meta.tags = ['custom'];
  if (!base.meta.avatar) base.meta.avatar = '🤖';
  if (!base.meta.category) base.meta.category = 'defi';
  if (!base.meta.title) base.meta.title = nextId;
  if (!base.meta.description) base.meta.description = base.summary || 'Custom agent';

  base.config = base.config || {};
  if (overrides.systemRole) base.config.systemRole = overrides.systemRole;
  if (overrides.openingMessage) base.config.openingMessage = overrides.openingMessage;
  if (overrides.openingQuestions) base.config.openingQuestions = overrides.openingQuestions;
  if (!base.config.systemRole) {
    base.config.systemRole =
      'You are a helpful Cheshire Terminal agent. Never request seed phrases or private keys.';
  }

  base.summary = overrides.summary || base.summary || base.meta.description;
  base.knowledgeCount = base.knowledgeCount ?? 0;
  base.pluginCount = base.pluginCount ?? 0;
  base.tokenUsage = base.tokenUsage ?? 0;

  // Forks should not inherit one-shot/featured flags from hub agents
  delete base.oneShot;
  delete base.featured;

  return base;
}

// ─── lightweight schema validation ────────────────────────────────────────────

export function validateAgent(agent, schemaPath = path.join(ROOT, 'schema', 'clawdAgentSchema.v1.json')) {
  const errors = [];
  const schema = readJsonSafe(schemaPath);

  if (!agent || typeof agent !== 'object') {
    return { ok: false, errors: ['Agent must be a JSON object'] };
  }

  for (const key of ['author', 'config', 'identifier', 'meta', 'schemaVersion']) {
    if (agent[key] === undefined || agent[key] === null || agent[key] === '') {
      errors.push(`Missing required field: ${key}`);
    }
  }

  if (agent.schemaVersion !== 1) {
    errors.push('schemaVersion must be 1');
  }

  if (agent.identifier !== undefined) {
    if (typeof agent.identifier !== 'string' || !/^[a-z0-9][a-z0-9-]{0,63}$/.test(agent.identifier)) {
      errors.push(
        'identifier must match ^[a-z0-9][a-z0-9-]{0,63}$ (lowercase, digits, hyphens)'
      );
    }
  }

  if (agent.meta) {
    for (const key of ['title', 'description', 'avatar', 'tags']) {
      if (agent.meta[key] === undefined || agent.meta[key] === null || agent.meta[key] === '') {
        errors.push(`meta.${key} is required`);
      }
    }
    if (agent.meta.description && String(agent.meta.description).length > 300) {
      errors.push('meta.description must be ≤ 300 characters');
    }
    if (agent.meta.tags && (!Array.isArray(agent.meta.tags) || agent.meta.tags.length < 1)) {
      errors.push('meta.tags must be a non-empty array');
    }
    if (agent.meta.tags && agent.meta.tags.length > 12) {
      errors.push('meta.tags max 12 items');
    }
    if (agent.meta.category && !CATEGORIES.includes(agent.meta.category)) {
      // allow extended categories from catalog (warn-level → soft error note)
      const known = new Set([
        ...CATEGORIES,
        'payments',
        'research',
        'infrastructure',
        'crypto',
        'platform',
        'programming',
        'tools',
        'voice-council',
        'community',
      ]);
      if (!known.has(agent.meta.category)) {
        errors.push(`meta.category "${agent.meta.category}" is not a known category`);
      }
    }
  } else {
    errors.push('meta object is required');
  }

  if (agent.config) {
    if (!agent.config.systemRole || typeof agent.config.systemRole !== 'string') {
      errors.push('config.systemRole is required');
    }
    if (
      agent.config.openingQuestions &&
      (!Array.isArray(agent.config.openingQuestions) || agent.config.openingQuestions.length > 8)
    ) {
      errors.push('config.openingQuestions must be an array of ≤ 8 strings');
    }
  } else {
    errors.push('config object is required');
  }

  // Surface schema $id for UX
  return {
    ok: errors.length === 0,
    errors,
    schemaId: schema?.$id || 'clawdAgentSchema.v1',
  };
}

// ─── non-interactive CLI paths ────────────────────────────────────────────────

function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--from' || a === '-f') args.from = argv[++i];
    else if (a === '--id') args.id = argv[++i];
    else if (a === '--out' || a === '-o') args.out = argv[++i];
    else if (a === '--author') args.author = argv[++i];
    else if (a === '--title') args.title = argv[++i];
    else if (a === '--category') args.category = argv[++i];
    else if (a === '--skills' || a === '-s') args.skills = argv[++i];
    else if (a === '--install-skills') args.installSkills = true;
    else if (a === '--via-skillhub-cli') args.viaSkillhubCli = true;
    else if (a === '--skills-target') args.skillsTarget = argv[++i];
    else if (a === '--list' || a === '-l') args.list = true;
    else if (a === '--validate' || a === '-V') args.validate = argv[++i];
    else if (a === '--blank') args.blank = true;
    else if (a === '--json') args.json = true;
    else if (a === '--help' || a === '-h') args.help = true;
    else if (!a.startsWith('-')) args._.push(a);
  }
  return args;
}

function parseSkillList(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  return String(raw)
    .split(/[,\s]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

async function applySkillsToAgent(agent, skillTokens, {
  root = ROOT,
  install = false,
  viaCli = false,
  targetDir,
} = {}) {
  if (!skillTokens.length) return { agent, installed: null };

  const {
    loadSkillCatalog,
    resolveSkillRefs,
    attachSkillsToAgent,
    installSkillsSparse,
    installSkillsViaCli,
    DEFAULT_INSTALL_DIR,
  } = await import('./skillHub.js');

  const { skills: catalog, index, warning } = await loadSkillCatalog({ root });
  if (warning) console.error(`${YELLOW}${warning}${RESET}`);
  const { skills: picked, expansions, missing } = resolveSkillRefs(skillTokens, catalog, index);
  for (const line of expansions) console.log(`${DIM}${line}${RESET}`);
  if (missing.length) {
    throw new Error(`Unknown skill(s): ${missing.join(', ')}. Run: ct-agents skills search <q>`);
  }
  let next = attachSkillsToAgent(agent, picked, index);
  let installed = null;
  if (install && picked.length) {
    const dest = targetDir || DEFAULT_INSTALL_DIR;
    if (viaCli) {
      installed = await installSkillsViaCli(
        picked.map((s) => s.slug),
        { targetDir: dest, force: true }
      );
    } else {
      installed = await installSkillsSparse(picked, { root, targetDir: dest, force: false });
    }
  }
  return { agent: next, installed, picked };
}

export function printDesignHelp() {
  console.log(`
${BOLD}${CYAN}ct-agents design${RESET} — template-driven agent forge (TUI)

${BOLD}Interactive:${RESET}
  ${CYAN}ct-agents design${RESET}
  ${CYAN}ct-agents forge${RESET}

${BOLD}Non-interactive / oneshot:${RESET}
  ${CYAN}ct-agents design --list${RESET}
  ${CYAN}ct-agents design --blank --id my-bot --out ./my-bot.json${RESET}
  ${CYAN}ct-agents design --from defi-yield-farmer --id my-yield --out ./agents/my-yield.json${RESET}
  ${CYAN}ct-agents design --from blank --id forge-bot --skills metaplex-agent,cheshire-core --out ./forge-bot.json${RESET}
  ${CYAN}ct-agents design --from blank --id forge-bot --skills trading --install-skills${RESET}
  ${CYAN}ct-agents design --validate ./agents/my-yield.json${RESET}

${BOLD}Flags:${RESET}
  --from, -f <id>     Fork a catalog agent / character / scaffold by id
  --blank             Start from the minimal blank scaffold
  --id <identifier>   Set agent identifier (slug)
  --title <title>     Display title
  --author <name>     Author field
  --category <cat>    One of: ${CATEGORIES.join(', ')}
  --skills, -s <list> Comma-separated Skill Hub slugs or packs (refs only by default)
  --install-skills    Also download ONLY selected skills into ./.agents/skills
  --via-skillhub-cli  Use npx github:Solizardking/skills for install (packs)
  --skills-target DIR Override install directory
  --out, -o <path>    Write JSON to path (default: ./agents/<id>.json)
  --list, -l          List all forkable templates
  --validate, -V      Validate an agent JSON file against clawdAgentSchema.v1
  --json              Machine-readable list/validate output

${BOLD}Skills:${RESET}
  Full Skill Hub (595) is ${DIM}not${RESET} bundled — see ${CYAN}ct-agents skills --help${RESET}
  Hub: https://github.com/Solizardking/skillhub-main
`);
}

function listTemplates(catalog, { json = false } = {}) {
  if (json) {
    console.log(
      JSON.stringify(
        catalog.map((t) => ({
          kind: t.kind,
          id: t.id,
          title: t.title,
          category: t.category,
          avatar: t.avatar,
          description: t.description,
        })),
        null,
        2
      )
    );
    return;
  }

  const byKind = groupBy(catalog, (t) => t.kind);
  console.log(`\n${BOLD}${CYAN}✦ Forkable templates${RESET} (${catalog.length})\n`);
  for (const kind of ['scaffold', 'agent', 'character', 'minted']) {
    const group = byKind[kind] || [];
    if (!group.length) continue;
    console.log(`${BOLD}${kind.toUpperCase()}${RESET} (${group.length})`);
    for (const t of group) {
      const cat = t.category ? `${DIM}[${t.category}]${RESET}` : '';
      console.log(
        `  ${t.avatar || '·'}  ${GREEN}${t.id}${RESET}  ${t.title}  ${cat}`
      );
      if (t.description) {
        const d = String(t.description).replace(/\s+/g, ' ').slice(0, 90);
        console.log(`      ${DIM}${d}${RESET}`);
      }
    }
    console.log();
  }
}

function groupBy(arr, keyFn) {
  const out = {};
  for (const item of arr) {
    const k = keyFn(item);
    (out[k] ||= []).push(item);
  }
  return out;
}

function resolveTemplate(catalog, fromId) {
  if (!fromId) return null;
  const needle = fromId.toLowerCase();
  return (
    catalog.find((t) => t.id.toLowerCase() === needle) ||
    catalog.find((t) => t.id.toLowerCase().includes(needle)) ||
    catalog.find((t) => t.title.toLowerCase().includes(needle))
  );
}

function defaultOutPath(identifier) {
  return path.join(process.cwd(), 'agents', `${identifier}.json`);
}

function writeAgentFile(agent, outPath) {
  ensureDir(path.dirname(outPath));
  fs.writeFileSync(outPath, JSON.stringify(agent, null, 2) + '\n', 'utf8');
  return outPath;
}

// ─── interactive TUI ──────────────────────────────────────────────────────────

function createRl() {
  return readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: true,
  });
}

function question(rl, prompt, defaultValue = '') {
  const suffix = defaultValue !== '' && defaultValue !== undefined ? ` ${DIM}[${defaultValue}]${RESET}` : '';
  return new Promise((resolve) => {
    rl.question(`${prompt}${suffix}: `, (answer) => {
      const trimmed = answer.trim();
      resolve(trimmed === '' ? defaultValue : trimmed);
    });
  });
}

function printBanner() {
  process.stdout.write(`
${CYAN}  ╔══════════════════════════════════════════════════════════╗${RESET}
${CYAN}  ║${RESET}  ${BOLD}CLAWD AGENT DESIGN TUI${RESET}  ${DIM}· template → customize → ship${RESET}  ${CYAN}║${RESET}
${CYAN}  ╚══════════════════════════════════════════════════════════╝${RESET}
${DIM}  schema: clawdAgentSchema.v1 · package: cheshire-terminal-agents${RESET}
`);
}

function printAgentPreview(agent) {
  const skillNames = Array.isArray(agent.skills)
    ? agent.skills.map((s) => s.slug || s.name).filter(Boolean).join(', ')
    : '';
  console.log(`
${BOLD}── draft ──────────────────────────────────────────${RESET}
  ${CYAN}id${RESET}       ${agent.identifier}
  ${CYAN}title${RESET}    ${agent.meta?.avatar || ''} ${agent.meta?.title}
  ${CYAN}author${RESET}   ${agent.author}
  ${CYAN}category${RESET} ${agent.meta?.category}
  ${CYAN}tags${RESET}     ${(agent.meta?.tags || []).join(', ')}
  ${CYAN}skills${RESET}   ${skillNames || DIM + '(none — Skill Hub refs optional)' + RESET}
  ${CYAN}role${RESET}     ${String(agent.config?.systemRole || '').replace(/\s+/g, ' ').slice(0, 120)}…
${BOLD}───────────────────────────────────────────────────${RESET}
`);
}

/**
 * Interactive Skill Hub picker — attaches refs only unless user opts into install.
 * Does not vendor 595 skills; catalog is fetched on demand.
 */
async function pickSkillsInteractive(rl, agent) {
  const attach = (
    await question(
      rl,
      `${CYAN}attach Skill Hub skills?${RESET} ${DIM}(y/N — catalog fetched on demand, not bundled)${RESET}`,
      'n'
    )
  ).toLowerCase();
  if (attach !== 'y' && attach !== 'yes') return agent;

  try {
    const { loadSkillCatalog, loadSkillHubIndex, searchSkills, resolveSkillRefs, attachSkillsToAgent, installSkillsSparse, DEFAULT_INSTALL_DIR } =
      await import('./skillHub.js');
    const index = loadSkillHubIndex(ROOT);
    console.log(`\n${DIM}packs:${RESET} ${Object.keys(index.packs || {}).join(', ') || '(none)'}`);
    console.log(`${DIM}featured:${RESET} ${(index.featured || []).slice(0, 8).join(', ')}`);
    console.log(
      `${DIM}enter slugs/packs comma-separated, or /search term, or pack id (e.g. cheshire-core)${RESET}`
    );

    let tokens = [];
    while (true) {
      const ans = await question(rl, `${CYAN}skills${RESET}`, 'metaplex-agent');
      if (!ans) break;
      if (ans.startsWith('/')) {
        const { skills, warning } = await loadSkillCatalog({ root: ROOT });
        if (warning) console.log(`${YELLOW}${warning}${RESET}`);
        const hits = searchSkills(skills, ans.slice(1), { limit: 15 });
        if (!hits.length) {
          console.log(`${YELLOW}no matches${RESET}`);
          continue;
        }
        hits.forEach((s, i) => {
          console.log(
            `  ${YELLOW}${i + 1}${RESET}  ${GREEN}${s.slug}${RESET}  ${DIM}[${s.category}]${RESET}`
          );
        });
        const pick = await question(rl, `${CYAN}numbers or slugs${RESET}`, '1');
        const parts = pick.split(/[,\s]+/).filter(Boolean);
        for (const p of parts) {
          const n = parseInt(p, 10);
          if (!Number.isNaN(n) && hits[n - 1]) tokens.push(hits[n - 1].slug);
          else tokens.push(p);
        }
        break;
      }
      tokens = parseSkillList(ans);
      break;
    }

    if (!tokens.length) return agent;

    const { skills: catalog, warning } = await loadSkillCatalog({ root: ROOT });
    if (warning) console.log(`${YELLOW}${warning}${RESET}`);
    const { skills: picked, expansions, missing } = resolveSkillRefs(tokens, catalog, index);
    for (const line of expansions) console.log(`${DIM}${line}${RESET}`);
    if (missing.length) {
      console.log(`${RED}unknown: ${missing.join(', ')}${RESET}`);
      return agent;
    }
    console.log(
      `${GREEN}selected${RESET} ${picked.map((s) => s.slug).join(', ')} ${DIM}(refs only)${RESET}`
    );
    let next = attachSkillsToAgent(agent, picked, index);

    const doInstall = (
      await question(
        rl,
        `${CYAN}download only these skills now?${RESET} ${DIM}(y/N → ./.agents/skills)${RESET}`,
        'n'
      )
    ).toLowerCase();
    if (doInstall === 'y' || doInstall === 'yes') {
      const { results } = await installSkillsSparse(picked, {
        root: ROOT,
        targetDir: DEFAULT_INSTALL_DIR,
        force: false,
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
        `${DIM}later: ct-agents skills install ${picked.map((s) => s.slug).join(' ')}${RESET}`
      );
    }
    return next;
  } catch (err) {
    console.log(`${RED}skill picker failed: ${err.message}${RESET}`);
    return agent;
  }
}

async function pickFromList(rl, items, { pageSize = 12, label = 'template' } = {}) {
  if (!items.length) {
    console.log(`${RED}No ${label}s available.${RESET}`);
    return null;
  }

  let page = 0;
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));

  while (true) {
    const start = page * pageSize;
    const slice = items.slice(start, start + pageSize);
    console.log(
      `\n${BOLD}Choose a ${label}${RESET} ${DIM}(page ${page + 1}/${totalPages}, ${items.length} total)${RESET}\n`
    );
    slice.forEach((item, i) => {
      const n = start + i + 1;
      console.log(
        `  ${YELLOW}${String(n).padStart(3)}${RESET}  ${item.avatar || '·'}  ${GREEN}${item.id}${RESET}  ${item.title}  ${DIM}[${item.kind}/${item.category}]${RESET}`
      );
    });
    console.log(`
  ${DIM}n${RESET} next page · ${DIM}p${RESET} prev · ${DIM}q${RESET} cancel · ${DIM}/text${RESET} search · number to select`);

    const ans = (await question(rl, `${CYAN}>${RESET}`)).trim();
    if (!ans || ans === 'q') return null;
    if (ans === 'n') {
      page = Math.min(totalPages - 1, page + 1);
      continue;
    }
    if (ans === 'p') {
      page = Math.max(0, page - 1);
      continue;
    }
    if (ans.startsWith('/')) {
      const q = ans.slice(1).toLowerCase();
      const filtered = items.filter(
        (t) =>
          t.id.includes(q) ||
          t.title.toLowerCase().includes(q) ||
          t.category?.includes(q) ||
          (t.tags || []).some((tag) => tag.includes(q))
      );
      if (!filtered.length) {
        console.log(`${YELLOW}No matches for "${q}"${RESET}`);
        continue;
      }
      return pickFromList(rl, filtered, { pageSize, label });
    }
    const num = parseInt(ans, 10);
    if (!Number.isNaN(num) && num >= 1 && num <= items.length) {
      return items[num - 1];
    }
    console.log(`${RED}Invalid choice.${RESET}`);
  }
}

async function editAgentFields(rl, agent) {
  console.log(`\n${BOLD}Customize fields${RESET} ${DIM}(Enter keeps default)${RESET}\n`);

  agent.identifier = slugify(
    await question(rl, `${CYAN}identifier${RESET}`, agent.identifier)
  );
  agent.author = await question(rl, `${CYAN}author${RESET}`, agent.author);
  agent.meta.title = await question(rl, `${CYAN}title${RESET}`, agent.meta.title);
  agent.meta.description = (
    await question(rl, `${CYAN}description${RESET}`, agent.meta.description)
  ).slice(0, 300);

  console.log(`  ${DIM}categories: ${CATEGORIES.join(', ')}${RESET}`);
  const category = await question(rl, `${CYAN}category${RESET}`, agent.meta.category || 'defi');
  agent.meta.category = category;

  console.log(`  ${DIM}avatars: ${AVATAR_PRESETS.join(' ')}${RESET}`);
  agent.meta.avatar = await question(rl, `${CYAN}avatar${RESET}`, agent.meta.avatar || '🤖');

  const tagsRaw = await question(
    rl,
    `${CYAN}tags${RESET} ${DIM}(comma-separated)${RESET}`,
    (agent.meta.tags || []).join(', ')
  );
  agent.meta.tags = tagsRaw
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean)
    .slice(0, 12);
  if (!agent.meta.tags.length) agent.meta.tags = ['custom'];

  const editRole = (await question(rl, `${CYAN}edit systemRole?${RESET} (y/N)`, 'n')).toLowerCase();
  if (editRole === 'y' || editRole === 'yes') {
    console.log(
      `${DIM}Paste/type system prompt. End with a single line containing only ---${RESET}`
    );
    const lines = [];
    while (true) {
      const line = await question(rl, '');
      if (line === '---') break;
      lines.push(line);
    }
    if (lines.length) agent.config.systemRole = lines.join('\n');
  }

  agent.config.openingMessage = await question(
    rl,
    `${CYAN}openingMessage${RESET}`,
    agent.config.openingMessage || ''
  );

  agent.summary = agent.meta.description;
  agent.createdAt = new Date().toISOString().slice(0, 10);
  return agent;
}

async function interactiveDesign(catalog) {
  printBanner();

  const rl = createRl();
  try {
    while (true) {
      console.log(`
${BOLD}Main menu${RESET}
  ${YELLOW}1${RESET}  Fork a catalog agent (recommended)
  ${YELLOW}2${RESET}  Start from blank scaffold
  ${YELLOW}3${RESET}  Fork a character persona
  ${YELLOW}4${RESET}  Browse all templates
  ${YELLOW}5${RESET}  Validate an existing agent JSON
  ${YELLOW}6${RESET}  List templates
  ${YELLOW}q${RESET}  Quit
`);
      const choice = (await question(rl, `${CYAN}select${RESET}`, '1')).toLowerCase();

      if (choice === 'q' || choice === 'quit' || choice === 'exit') {
        console.log(`${DIM}bye.${RESET}`);
        return 0;
      }

      if (choice === '5') {
        const file = await question(rl, `${CYAN}path to agent.json${RESET}`);
        if (!file) continue;
        const agent = readJsonSafe(path.resolve(file));
        if (!agent) {
          console.log(`${RED}Could not read JSON: ${file}${RESET}`);
          continue;
        }
        const result = validateAgent(agent);
        if (result.ok) {
          console.log(`${GREEN}✓ valid${RESET} against ${result.schemaId}`);
        } else {
          console.log(`${RED}✗ invalid${RESET}`);
          for (const e of result.errors) console.log(`  - ${e}`);
        }
        continue;
      }

      if (choice === '6') {
        listTemplates(catalog);
        continue;
      }

      let template = null;
      if (choice === '1') {
        template = await pickFromList(
          rl,
          catalog.filter((t) => t.kind === 'agent'),
          { label: 'agent template' }
        );
      } else if (choice === '2') {
        template =
          catalog.find((t) => t.kind === 'scaffold' && t.id === 'blank') ||
          catalog.find((t) => t.kind === 'scaffold') ||
          null;
        if (!template) {
          // synthesize blank on the fly
          template = {
            kind: 'scaffold',
            id: 'blank',
            title: 'Blank Agent',
            agent: blankAgent(),
          };
        }
      } else if (choice === '3') {
        template = await pickFromList(
          rl,
          catalog.filter((t) => t.kind === 'character'),
          { label: 'character' }
        );
      } else if (choice === '4') {
        template = await pickFromList(rl, catalog, { label: 'template' });
      } else {
        console.log(`${RED}Unknown option.${RESET}`);
        continue;
      }

      if (!template) continue;

      console.log(
        `\n${GREEN}Using template${RESET} ${template.avatar || ''} ${BOLD}${template.id}${RESET} — ${template.title}`
      );
      let agent = forkAgent(template.agent, {
        identifier: template.kind === 'scaffold' ? template.agent.identifier : `${template.id}-fork`,
      });

      agent = await editAgentFields(rl, agent);
      agent = await pickSkillsInteractive(rl, agent);
      printAgentPreview(agent);

      const result = validateAgent(agent);
      if (!result.ok) {
        console.log(`${RED}Validation failed:${RESET}`);
        for (const e of result.errors) console.log(`  - ${e}`);
        const again = (await question(rl, 'Edit again? (Y/n)', 'y')).toLowerCase();
        if (again !== 'n') {
          agent = await editAgentFields(rl, agent);
          printAgentPreview(agent);
        }
      } else {
        console.log(`${GREEN}✓ schema valid${RESET} (${result.schemaId})`);
      }

      const outDefault = defaultOutPath(agent.identifier);
      const out = path.resolve(
        await question(rl, `${CYAN}save path${RESET}`, outDefault)
      );

      const final = validateAgent(agent);
      if (!final.ok) {
        console.log(`${YELLOW}Saving with validation warnings:${RESET}`);
        for (const e of final.errors) console.log(`  - ${e}`);
      }

      writeAgentFile(agent, out);
      console.log(`\n${GREEN}✓ wrote${RESET} ${out}`);
      console.log(`${DIM}Next:${RESET}
  ct-agents design --validate ${out}
  # drop into your hub, MCP host, or open a PR under agents/
`);

      const more = (await question(rl, 'Design another? (y/N)', 'n')).toLowerCase();
      if (more !== 'y' && more !== 'yes') {
        console.log(`${DIM}done.${RESET}`);
        return 0;
      }
    }
  } finally {
    rl.close();
  }
}

// ─── entry ────────────────────────────────────────────────────────────────────

export async function runDesignTui(argv = process.argv.slice(2), root = ROOT) {
  const args = parseArgs(argv);

  if (args.help) {
    printDesignHelp();
    return 0;
  }

  const catalog = loadTemplateCatalog(root);

  if (args.list) {
    listTemplates(catalog, { json: args.json });
    return 0;
  }

  if (args.validate) {
    const file = path.resolve(args.validate);
    const agent = readJsonSafe(file);
    if (!agent) {
      console.error(`${RED}Could not read ${file}${RESET}`);
      return 1;
    }
    const result = validateAgent(agent, path.join(root, 'schema', 'clawdAgentSchema.v1.json'));
    if (args.json) {
      console.log(JSON.stringify(result, null, 2));
    } else if (result.ok) {
      console.log(`${GREEN}✓ valid${RESET} ${file}`);
      console.log(`  schema: ${result.schemaId}`);
      console.log(`  id: ${agent.identifier} · ${agent.meta?.title || ''}`);
    } else {
      console.log(`${RED}✗ invalid${RESET} ${file}`);
      for (const e of result.errors) console.log(`  - ${e}`);
    }
    return result.ok ? 0 : 1;
  }

  // Non-interactive fork / blank
  if (args.blank || args.from || args.id || args.out) {
    let agent;
    if (args.blank || !args.from) {
      agent = blankAgent({
        identifier: args.id || 'my-agent',
        title: args.title,
        author: args.author,
        category: args.category,
      });
    } else {
      const template = resolveTemplate(catalog, args.from);
      if (!template) {
        console.error(`${RED}Template not found: ${args.from}${RESET}`);
        console.error(`${DIM}Run: ct-agents design --list${RESET}`);
        return 1;
      }
      agent = forkAgent(template.agent, {
        identifier: args.id || `${template.id}-fork`,
        title: args.title,
        author: args.author,
        category: args.category,
      });
    }

    if (args.id) agent.identifier = slugify(args.id);
    if (args.title) agent.meta.title = args.title;
    if (args.author) agent.author = args.author;
    if (args.category) agent.meta.category = args.category;

    const result = validateAgent(agent, path.join(root, 'schema', 'clawdAgentSchema.v1.json'));
    if (!result.ok) {
      console.error(`${RED}Generated agent failed validation:${RESET}`);
      for (const e of result.errors) console.error(`  - ${e}`);
      return 1;
    }

    const out = path.resolve(args.out || defaultOutPath(agent.identifier));
    writeAgentFile(agent, out);
    if (args.json) {
      console.log(JSON.stringify({ ok: true, path: out, agent }, null, 2));
    } else {
      console.log(`${GREEN}✓ wrote${RESET} ${out}`);
      console.log(`  template: ${args.from || 'blank'} → ${agent.identifier}`);
      console.log(`  validate: ct-agents design --validate ${out}`);
    }
    return 0;
  }

  // Fully interactive when stdin is a TTY; otherwise show help
  if (!process.stdin.isTTY) {
    printDesignHelp();
    console.log(`${YELLOW}stdin is not a TTY — use flags for non-interactive design.${RESET}`);
    return 0;
  }

  return interactiveDesign(catalog);
}

// Allow direct execution
const isMain =
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  runDesignTui(process.argv.slice(2)).then((code) => process.exit(code ?? 0));
}
