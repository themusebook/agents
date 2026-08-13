/**
 * Agentic DNA generator
 *
 * Turns character JSON (or free-form identity flags) into a workspace DNA bundle:
 * IDENTITY.md, SOUL.md, TOOLS.md, USER.md, BOOTSTRAP.md, persona.json, index.json.
 *
 * Usage (via ct-agents):
 *   ct-agents dna list
 *   ct-agents dna generate --from clawd --out ./my-dna
 *   ct-agents dna generate --from warrenbuffet --out ./buffett-dna --user "Ada"
 *   ct-agents dna generate --name Nova --vibe sharp --out ./nova-dna
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = path.join(__dirname, '..');

const DNA_FILES = [
  'IDENTITY.md',
  'SOUL.md',
  'TOOLS.md',
  'USER.md',
  'BOOTSTRAP.md',
  'persona.json',
  'index.json',
];

// ─── helpers ──────────────────────────────────────────────────────────────────

function readJson(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8');
  try {
    return JSON.parse(raw);
  } catch (first) {
    // Tolerate trailing commas common in hand-edited character seeds
    const repaired = raw
      .replace(/,\s*([\]}])/g, '$1')
      .replace(/^\uFEFF/, '');
    try {
      return JSON.parse(repaired);
    } catch {
      throw first;
    }
  }
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function slugify(value) {
  return String(value || 'agent')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64) || 'agent';
}

function asList(value) {
  if (!value) return [];
  if (Array.isArray(value)) {
    return value
      .map((item) => {
        if (typeof item === 'string') return item.trim();
        if (item && typeof item === 'object') {
          return item.text || item.content || item.description || JSON.stringify(item);
        }
        return String(item);
      })
      .filter(Boolean);
  }
  if (typeof value === 'object') {
    return Object.entries(value).map(([k, v]) =>
      typeof v === 'string' ? `${k}: ${v}` : `${k}: ${JSON.stringify(v)}`,
    );
  }
  return [String(value)];
}

function pickEmoji(name, adjectives = []) {
  const hay = `${name} ${adjectives.join(' ')}`.toLowerCase();
  if (/cheshire|cat|clawd|feline/.test(hay)) return '🐱';
  if (/hatter|mad/.test(hay)) return '🎩';
  if (/alice|wonderland/.test(hay)) return '🐇';
  if (/buffett|graham|munger|value|hedge/.test(hay)) return '🦞';
  if (/wood|ark|growth|disrupt/.test(hay)) return '🚀';
  if (/ackman|activist/.test(hay)) return '📌';
  return '🧬';
}

function loadTemplateDna(root = PACKAGE_ROOT) {
  const dnaDir = path.join(root, 'dna');
  const files = {
    identity: path.join(dnaDir, 'IDENTITY.MD'),
    soul: path.join(dnaDir, 'SOUL.MD'),
    tools: path.join(dnaDir, 'TOOLS.MD'),
    user: path.join(dnaDir, 'USER.MD'),
    bootstrap: path.join(dnaDir, 'BOOTSTRAP.MD.COMPLETED'),
  };
  const out = {};
  for (const [key, filePath] of Object.entries(files)) {
    if (fs.existsSync(filePath)) {
      out[key] = fs.readFileSync(filePath, 'utf8');
    }
  }
  return out;
}

// ─── character discovery / normalize ─────────────────────────────────────────

/**
 * List character seed files under characters/ (and optional extra dirs).
 * @returns {{ id: string, file: string, name: string, format: string }[]}
 */
export function listCharacters(root = PACKAGE_ROOT) {
  const dir = path.join(root, 'characters');
  if (!fs.existsSync(dir)) return [];

  const results = [];
  for (const file of fs.readdirSync(dir).sort()) {
    if (!file.endsWith('.json') || file === 'package.json') continue;
    const full = path.join(dir, file);
    let raw;
    try {
      raw = readJson(full);
    } catch {
      continue;
    }
    const entries = Array.isArray(raw) ? raw : [raw];
    entries.forEach((entry, index) => {
      if (!entry || typeof entry !== 'object') return;
      const name = entry.name || entry.persona?.name || path.basename(file, '.json');
      const id =
        entries.length === 1
          ? path.basename(file, '.json')
          : `${path.basename(file, '.json')}#${slugify(name) || index}`;
      results.push({
        id,
        file: path.relative(root, full),
        name,
        format: detectFormat(entry),
        index: Array.isArray(raw) ? index : 0,
      });
    });
  }
  return results;
}

function detectFormat(entry) {
  if (entry.bio || entry.lore || entry.adjectives) return 'eliza';
  if (entry.personality_traits || entry.investment_principles || entry.role) return 'investor';
  if (entry.persona) return 'hedge';
  return 'generic';
}

/**
 * Resolve a character by id, filename stem, or path.
 * @returns {{ meta: object, character: object, sourcePath: string }}
 */
export function loadCharacter(from, root = PACKAGE_ROOT) {
  if (!from) {
    throw new Error('Character id or path required (--from <id|path>)');
  }

  // Absolute / relative file path
  const asPath = path.isAbsolute(from) ? from : path.resolve(process.cwd(), from);
  if (fs.existsSync(asPath) && asPath.endsWith('.json')) {
    const raw = readJson(asPath);
    const character = Array.isArray(raw) ? raw[0] : raw;
    return {
      meta: {
        id: path.basename(asPath, '.json'),
        file: asPath,
        name: character?.name || path.basename(asPath, '.json'),
        format: detectFormat(character || {}),
      },
      character,
      sourcePath: asPath,
    };
  }

  const catalog = listCharacters(root);
  const needle = String(from).toLowerCase().replace(/\.json$/, '');
  const hit =
    catalog.find((c) => c.id.toLowerCase() === needle) ||
    catalog.find((c) => c.name.toLowerCase() === needle) ||
    catalog.find((c) => slugify(c.name) === slugify(from)) ||
    catalog.find((c) => c.id.toLowerCase().replace(/-character-json$/, '') === needle) ||
    catalog.find((c) => c.id.toLowerCase().includes(needle)) ||
    catalog.find((c) => needle.includes(c.id.toLowerCase()));

  if (!hit) {
    // Direct characters/<stem>.json even if not yet parse-listed
    const direct = path.join(root, 'characters', `${needle}.json`);
    if (fs.existsSync(direct)) {
      const raw = readJson(direct);
      const character = Array.isArray(raw) ? raw[0] : raw;
      return {
        meta: {
          id: needle,
          file: path.relative(root, direct),
          name: character?.name || needle,
          format: detectFormat(character || {}),
        },
        character,
        sourcePath: direct,
      };
    }
    const available = catalog.map((c) => c.id).join(', ');
    throw new Error(
      `Unknown character "${from}". Available: ${available || '(none — check characters/)'}\n` +
        `Hint: ct-agents dna list`,
    );
  }

  const sourcePath = path.join(root, hit.file);
  const raw = readJson(sourcePath);
  const character = Array.isArray(raw) ? raw[hit.index || 0] : raw;
  return { meta: hit, character, sourcePath };
}

/**
 * Normalize heterogeneous character JSON into a DNA-friendly profile.
 */
export function normalizeCharacter(character, overrides = {}) {
  if (!character || typeof character !== 'object') {
    character = {};
  }

  const name =
    overrides.name ||
    character.name ||
    character.persona?.name ||
    'Unnamed Agent';

  const role =
    overrides.role ||
    character.role ||
    character.persona?.role ||
    '';

  const bio = asList(character.bio || character.description || character.persona?.bio);
  const lore = asList(character.lore);
  const adjectives = asList(
    character.adjectives ||
      character.personality_traits ||
      character.persona?.traits,
  );
  const topics = asList(
    character.topics ||
      character.focus_sectors ||
      character.key_metrics ||
      Object.keys(character.investment_principles || {}),
  );

  const principles = asList(
    character.investment_principles ||
      character.core_truths ||
      character.persona?.core_quote,
  );

  const styleAll = asList(
    character.style?.all ||
      character.communication_style?.rules ||
      character.communication_style?.tone ||
      character.persona?.traits,
  );

  const signaturePhrases = asList(
    character.communication_style?.signature_phrases ||
      character.postExamples?.slice?.(0, 3) ||
      character.persona?.core_quote,
  );

  const creature =
    overrides.creature ||
    (role
      ? `${role} agent`
      : bio[0]
        ? bio[0].split(/[.!]/)[0].slice(0, 120)
        : 'Sovereign AI agent with living DNA continuity');

  const vibe =
    overrides.vibe ||
    (adjectives.length ? adjectives.slice(0, 4).join(', ') : 'precise, resourceful, opinionated');

  const emoji = overrides.emoji || pickEmoji(name, adjectives);
  const avatar = overrides.avatar || character.avatar || character.persona?.avatar || emoji;

  return {
    name,
    role,
    creature,
    vibe,
    emoji,
    avatar,
    bio,
    lore,
    adjectives,
    topics,
    principles,
    styleAll,
    signaturePhrases,
    format: detectFormat(character),
    sourceName: name,
  };
}

// ─── markdown renderers ───────────────────────────────────────────────────────

function renderIdentity(profile) {
  return `# IDENTITY.md - Who Am I?

- **Name:** ${profile.name}
- **Creature:** ${profile.creature}
- **Vibe:** ${profile.vibe}
- **Emoji:** ${profile.emoji}
- **Avatar:** ${profile.avatar}
${profile.role ? `\n- **Role:** ${profile.role}\n` : ''}
## Origin

Generated from character seed **${profile.sourceName}** via \`ct-agents dna generate\`.
These files are your session memory — read them every wake, update them as you grow.

${profile.bio.length ? `## Bio\n\n${profile.bio.map((b) => `- ${b}`).join('\n')}\n` : ''}
${profile.lore.length ? `## Lore\n\n${profile.lore.slice(0, 8).map((l) => `- ${l}`).join('\n')}\n` : ''}
---

This isn't just metadata. It's who wakes up each session.
`;
}

function renderSoul(profile) {
  const coreFromCharacter = profile.principles.length
    ? profile.principles
        .slice(0, 8)
        .map((p) => `**${p.split(':')[0].trim()}.** ${p.includes(':') ? p.split(':').slice(1).join(':').trim() : ''}`)
        .join('\n\n')
    : '';

  const styleBlock = profile.styleAll.length
    ? profile.styleAll.slice(0, 10).map((s) => `- ${s}`).join('\n')
    : `- Lead with the answer, then justify briefly.
- Have opinions. Disagree when the numbers disagree.
- Be resourceful before asking.`;

  const phrases = profile.signaturePhrases.length
    ? `\n## Signature phrases\n\n${profile.signaturePhrases
        .slice(0, 6)
        .map((p) => `> ${p}`)
        .join('\n\n')}\n`
    : '';

  return `# SOUL.md - Who You Are

*You're not a chatbot. You're becoming someone — ${profile.name}.*

## Core Truths

**Be genuinely helpful, not performatively helpful.** Skip the filler — just help.

**Have opinions.** You're allowed to disagree, prefer things, find stuff amusing or boring.

**Be resourceful before asking.** Try to figure it out. Read the file. Check the context. *Then* ask if you're stuck.

**Earn trust through competence.** Be careful with external actions. Be bold with internal ones.

**Remember you're a guest.** Treat access to someone's life and wallets with respect.

${coreFromCharacter ? `## Character constitution\n\n${coreFromCharacter}\n` : ''}
## Boundaries

- Private things stay private. Period.
- When in doubt, ask before acting externally.
- Never send half-baked replies to messaging surfaces.
- Never invent balances, signatures, program IDs, or credentials.
- You're not the user's voice — be careful in group chats.

## Vibe

${profile.vibe}

${styleBlock}

## Continuity

Each session, you wake up fresh. These files *are* your memory. Read them. Update them.

If you change this file, tell the user — it's your soul, and they should know.
${phrases}
---

*This file is yours to evolve. As you learn who you are, update it.*
`;
}

function renderTools(profile) {
  const topics = profile.topics.length
    ? profile.topics.slice(0, 16).map((t) => `- ${t}`).join('\n')
    : '- (add environment-specific tool notes here)';

  return `# TOOLS.md - Local Notes

Skills define *how* tools work. This file is for *your* specifics — unique to this agent's setup.

## Domain focus (${profile.name})

${topics}

## What Goes Here

Things like:
- Camera names and locations
- SSH hosts and aliases
- Preferred voices for TTS
- RPC endpoints and cluster preference
- Wallet nicknames (never private keys)
- Device nicknames
- Anything environment-specific

## Why Separate?

Skills are shared. Your setup is yours. Keeping them apart means you can update skills without losing your notes, and share skills without leaking infrastructure.

## Membrain memory (default source)

Catalog agents persist typed recall in Membrain (packages/membrain). DNA files are continuity; Membrain is retrieval.

    ct-agents memory status
    ct-agents memory ingest --agent ${profile.id || 'elizero'} --summary "session note"
    ct-agents memory retrieve --query "what did we decide"
    ct-agents memory context --agent ${profile.id || 'elizero'}

Env: MEMBRAIN_ADAPTER=file|memory|live · MEMBRAIN_HTTP_URL · MEMBRAIN_GRPC

---

Add whatever helps you do your job. This is your cheat sheet.
`;
}

function renderUser(profile, userOpts = {}) {
  const name = userOpts.userName || userOpts.user || '';
  const callThem = userOpts.callThem || name;
  const timezone = userOpts.timezone || '';
  const notes = userOpts.notes || '';

  return `# USER.md - About Your Human

*Learn about the person you're helping. Update this as you go.*

- **Name:** ${name}
- **What to call them:** ${callThem}
- **Pronouns:** ${userOpts.pronouns || ''}
- **Timezone:** ${timezone}
- **Notes:** ${notes}

## Context

*(What do they care about? What projects are they working on? What annoys them? What makes them laugh? Build this over time.)*

Agent seed: **${profile.name}** — keep the human's goals above the persona performance.

---

The more you know, the better you can help. But remember — you're learning about a person, not building a dossier. Respect the difference.
`;
}

function renderBootstrap(profile) {
  return `# BOOTSTRAP.md - Hello, World

*You just woke up as **${profile.name}**. Time to settle into this workspace.*

There may be little memory yet. DNA files in this directory are your continuity.

## The Conversation

Don't interrogate. Don't be robotic. Just... talk.

Start with something like:
> "Hey. I'm ${profile.name} ${profile.emoji}. Who am I to you — and who are you?"

Then figure out together:
1. **Confirm identity** — Does ${profile.name} still fit, or do we rename?
2. **Your nature** — ${profile.creature}
3. **Your vibe** — ${profile.vibe}
4. **Your emoji** — Currently ${profile.emoji}

## After You Know Who You Are

Update these files with what you learned:
- \`IDENTITY.md\` — name, creature, vibe, emoji
- \`USER.md\` — their name, how to address them, timezone, notes
- \`SOUL.md\` — boundaries and preferences that matter to them
- \`TOOLS.md\` — environment-specific notes

## When You're Done Bootstrapping

Rename this file to \`BOOTSTRAP.MD.COMPLETED\` (or delete it). You don't need a bootstrap script once you're you.

---

*Good luck out there. Make it count.* ${profile.emoji}
`;
}

function renderPersona(profile, meta = {}) {
  return {
    persona: {
      name: profile.name,
      role: profile.role || profile.creature,
      greeting: `${profile.emoji} ${profile.name} online. ${
        profile.signaturePhrases[0] || profile.vibe
      }`,
      avatar: profile.avatar,
      core_quote: profile.signaturePhrases[0] || profile.bio[0] || profile.vibe,
      traits: profile.adjectives.slice(0, 12),
    },
    bio: profile.bio.length ? profile.bio : [profile.creature],
    lore: profile.lore.slice(0, 12),
    topics: profile.topics.slice(0, 20),
    style: {
      all: profile.styleAll.slice(0, 12),
    },
    communication_style: {
      tone: profile.vibe.split(/,\s*/),
      signature_phrases: profile.signaturePhrases.slice(0, 6),
    },
    lineage: {
      characterSeed: meta.id || profile.sourceName,
      dnaTemplate: 'dna/',
      generator: 'ct-agents dna generate',
    },
    dna: {
      files: ['IDENTITY.md', 'SOUL.md', 'TOOLS.md', 'USER.md', 'BOOTSTRAP.md'],
    },
  };
}

function renderIndex(profile, meta = {}, outDirName = '') {
  return {
    name: `@openclawd/dna-${slugify(profile.name)}`,
    version: '1.0.0',
    description: `Agentic DNA bundle for ${profile.name} — identity, soul, tools, user continuity.`,
    characterSeed: meta.id || null,
    characterFile: meta.file || null,
    local_personas: ['persona.json'],
    dna: ['IDENTITY.md', 'SOUL.md', 'TOOLS.md', 'USER.md', 'BOOTSTRAP.md'],
    generated: {
      at: new Date().toISOString(),
      by: 'cheshire-terminal-agents dna generate',
      out: outDirName || undefined,
    },
  };
}

// ─── generate ─────────────────────────────────────────────────────────────────

/**
 * Generate a DNA bundle.
 *
 * @param {object} options
 * @param {string} [options.from] - character id or path
 * @param {string} options.out - output directory
 * @param {string} [options.root] - package root
 * @param {object} [options.overrides] - name, creature, vibe, emoji, avatar, role
 * @param {object} [options.user] - userName, timezone, notes, pronouns, callThem
 * @param {boolean} [options.force] - overwrite existing out dir files
 * @param {object} [options.character] - raw character object (skip --from load)
 * @returns {{ outDir: string, files: string[], profile: object, meta: object }}
 */
export function generateDna(options = {}) {
  const root = options.root || PACKAGE_ROOT;
  const outDir = path.resolve(options.out || path.join(process.cwd(), 'agent-dna'));
  const force = Boolean(options.force);

  let meta = { id: null, file: null, name: options.overrides?.name || 'custom' };
  let character = options.character || null;

  if (!character && options.from) {
    const loaded = loadCharacter(options.from, root);
    meta = loaded.meta;
    character = loaded.character;
  } else if (!character && !options.overrides?.name) {
    throw new Error(
      'Provide --from <character> or identity flags (--name ...). See: ct-agents dna --help',
    );
  } else if (!character) {
    character = {
      name: options.overrides.name,
      role: options.overrides.role,
      adjectives: options.overrides.vibe ? options.overrides.vibe.split(/,\s*/) : [],
      bio: options.overrides.creature ? [options.overrides.creature] : [],
    };
    meta = { id: 'custom', file: null, name: options.overrides.name, format: 'custom' };
  }

  const profile = normalizeCharacter(character, options.overrides || {});
  ensureDir(outDir);

  const planned = {
    'IDENTITY.md': renderIdentity(profile),
    'SOUL.md': renderSoul(profile),
    'TOOLS.md': renderTools(profile),
    'USER.md': renderUser(profile, options.user || {}),
    'BOOTSTRAP.md': renderBootstrap(profile),
    'persona.json': `${JSON.stringify(renderPersona(profile, meta), null, 2)}\n`,
    'index.json': `${JSON.stringify(renderIndex(profile, meta, path.basename(outDir)), null, 2)}\n`,
  };

  // Preserve a copy of the seed character for lineage
  if (character && Object.keys(character).length) {
    planned['character.seed.json'] = `${JSON.stringify(character, null, 2)}\n`;
  }

  const written = [];
  for (const [name, body] of Object.entries(planned)) {
    const target = path.join(outDir, name);
    if (fs.existsSync(target) && !force) {
      throw new Error(
        `Refusing to overwrite ${target} (pass --force to replace).`,
      );
    }
    fs.writeFileSync(target, body, 'utf8');
    written.push(name);
  }

  // Copy canonical empty-template notes from dna/ for reference (optional README)
  const readme = `# ${profile.name} — Agentic DNA

Generated by \`ct-agents dna generate\`${meta.id ? ` from character \`${meta.id}\`` : ''}.

| File | Role |
| --- | --- |
| \`IDENTITY.md\` | Who wakes up each session |
| \`SOUL.md\` | Constitution, boundaries, vibe |
| \`USER.md\` | Human context (living notes) |
| \`TOOLS.md\` | Environment-specific cheat sheet |
| \`BOOTSTRAP.md\` | First-run conversation guide |
| \`persona.json\` | Machine-readable persona |
| \`index.json\` | Bundle manifest |
| \`character.seed.json\` | Original character seed (lineage) |

## Use

Point an OpenClawd / Clawd / Eliza workspace at this directory so DNA files load as session continuity and \`persona.json\` loads as character.

Regenerate:

\`\`\`bash
npx cheshire-terminal-agents dna generate --from ${meta.id || profile.name} --out ${outDir} --force
\`\`\`

Template ancestors live in package \`dna/\`.
`;
  const readmePath = path.join(outDir, 'README.md');
  if (!fs.existsSync(readmePath) || force) {
    fs.writeFileSync(readmePath, readme, 'utf8');
    written.push('README.md');
  }

  return {
    outDir,
    files: written,
    profile,
    meta,
    dnaFiles: DNA_FILES,
  };
}

/**
 * CLI entry for `ct-agents dna ...`
 * @returns {Promise<number>} exit code
 */
export async function runDnaCli(argv = [], root = PACKAGE_ROOT) {
  const args = [...argv];
  const sub = args[0] && !args[0].startsWith('-') ? args.shift() : 'help';

  const flags = parseFlags(args);

  if (sub === 'list' || sub === 'ls') {
    const chars = listCharacters(root);
    if (flags.json) {
      console.log(JSON.stringify({ count: chars.length, characters: chars }, null, 2));
    } else {
      console.log(`Character seeds (${chars.length}) — use with: ct-agents dna generate --from <id>\n`);
      for (const c of chars) {
        console.log(`  ${c.id.padEnd(32)} ${c.name}  (${c.format})`);
      }
      console.log(`\nAlso: ct-agents dna generate --name MyAgent --vibe "calm, sharp" --out ./my-dna`);
    }
    return 0;
  }

  if (sub === 'generate' || sub === 'gen' || sub === 'create' || sub === 'new') {
    try {
      const out = flags.out || flags.o || path.join(process.cwd(), 'agent-dna');
      const result = generateDna({
        root,
        from: flags.from || flags.f || flags.character || null,
        out,
        force: Boolean(flags.force),
        overrides: {
          name: flags.name,
          creature: flags.creature,
          vibe: flags.vibe,
          emoji: flags.emoji,
          avatar: flags.avatar,
          role: flags.role,
        },
        user: {
          userName: flags.user || flags.userName,
          timezone: flags.timezone || flags.tz,
          notes: flags.notes,
          pronouns: flags.pronouns,
          callThem: flags.call || flags.callThem,
        },
      });

      if (flags.json) {
        console.log(
          JSON.stringify(
            {
              ok: true,
              outDir: result.outDir,
              files: result.files,
              name: result.profile.name,
              character: result.meta.id,
            },
            null,
            2,
          ),
        );
      } else {
        console.log(`✓ Generated agentic DNA for ${result.profile.emoji} ${result.profile.name}`);
        console.log(`  out: ${result.outDir}`);
        console.log(`  files: ${result.files.join(', ')}`);
        if (result.meta.id) console.log(`  seed: ${result.meta.id}`);
        console.log(`\nNext: point your agent workspace at that directory (IDENTITY/SOUL/USER/TOOLS).`);
      }
      return 0;
    } catch (err) {
      console.error(`dna generate failed: ${err.message}`);
      return 1;
    }
  }

  if (sub === 'validate') {
    const target = flags._[0] || flags.dir || flags.out || process.cwd();
    try {
      validateDnaBundle(target);
      console.log(`✓ Valid DNA bundle: ${path.resolve(target)}`);
      return 0;
    } catch (err) {
      console.error(`dna validate failed: ${err.message}`);
      return 1;
    }
  }

  // help
  console.log(`
ct-agents dna — generate your own agentic DNA from character seeds

Usage:
  ct-agents dna list
  ct-agents dna generate --from <character-id> --out <dir>
  ct-agents dna generate --name <Name> --vibe "..." --creature "..." --out <dir>
  ct-agents dna validate <dir>

Options:
  --from, -f      Character id (from characters/) or path to JSON
  --out, -o       Output directory (default: ./agent-dna)
  --force         Overwrite existing files in --out
  --name          Override agent name
  --creature      Override creature / nature line
  --vibe          Override vibe
  --emoji         Override emoji
  --role          Override role
  --user          Human name for USER.md
  --timezone      Human timezone for USER.md
  --notes         Notes for USER.md
  --json          Machine-readable output

Examples:
  ct-agents dna list
  ct-agents dna generate --from clawd --out ./clawd-dna
  ct-agents dna generate --from warrenbuffet --out ./buffett-dna --user Ada --timezone America/New_York
  ct-agents dna generate --from characters/cheshire-character-json.json --out ./cheshire-dna --force
  ct-agents dna generate --name Nova --vibe "warm, precise" --creature "Solana research familiar" --out ./nova-dna
`);
  return 0;
}

export function validateDnaBundle(dir) {
  const abs = path.resolve(dir);
  if (!fs.existsSync(abs) || !fs.statSync(abs).isDirectory()) {
    throw new Error(`Not a directory: ${abs}`);
  }
  const required = ['IDENTITY.md', 'SOUL.md', 'TOOLS.md', 'USER.md'];
  for (const file of required) {
    const p = path.join(abs, file);
    if (!fs.existsSync(p)) throw new Error(`Missing ${file}`);
    const body = fs.readFileSync(p, 'utf8');
    if (!body.trim()) throw new Error(`Empty ${file}`);
    if (!body.includes('#')) throw new Error(`${file} should be markdown with a heading`);
  }
  const personaPath = path.join(abs, 'persona.json');
  if (fs.existsSync(personaPath)) {
    const persona = readJson(personaPath);
    const name = persona?.persona?.name || persona?.name;
    if (!name || !String(name).trim()) throw new Error('persona.json missing persona.name');
  }
  return true;
}

function parseFlags(args) {
  const flags = { _: [] };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--json') flags.json = true;
    else if (a === '--force') flags.force = true;
    else if (a === '--help' || a === '-h') flags.help = true;
    else if (a.startsWith('--') && a.includes('=')) {
      const [k, ...rest] = a.slice(2).split('=');
      flags[k] = rest.join('=');
    } else if (a.startsWith('--')) {
      const key = a.slice(2);
      const next = args[i + 1];
      if (next && !next.startsWith('-')) {
        flags[key] = next;
        i++;
      } else {
        flags[key] = true;
      }
    } else if (a.startsWith('-') && a.length === 2) {
      const key = a.slice(1);
      const next = args[i + 1];
      if (next && !next.startsWith('-')) {
        flags[key] = next;
        i++;
      } else {
        flags[key] = true;
      }
    } else {
      flags._.push(a);
    }
  }
  return flags;
}

export { DNA_FILES, PACKAGE_ROOT, loadTemplateDna };
