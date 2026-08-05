/**
 * Knowledge corpus tools — init / upload / validate / inject scaffolding
 *
 * Users can:
 *  - scaffold a personal knowledge/ folder modeled on knowledge/clawd-character.md
 *  - upload their own .md/.txt/.json/.jsonl (and optional pdf/images) into that folder
 *  - inject the corpus into harness rules via scripts/knowledge-inject.mjs
 *
 * Usage (via ct-agents):
 *   ct-agents knowledge list
 *   ct-agents knowledge init --from clawd --out ./my-knowledge
 *   ct-agents knowledge upload ./notes.md ./more/ --out ./my-knowledge
 *   ct-agents knowledge validate ./my-knowledge
 *   ct-agents knowledge inject ./my-knowledge
 */

import fs from 'fs';
import path from 'path';
import { createHash } from 'crypto';
import { fileURLToPath } from 'url';
import { spawnSync } from 'child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = path.join(__dirname, '..');

/** Canonical JSONL basenames in the shipped knowledge/ corpus */
export const JSONL_CORPUS = [
  'facts.jsonl',
  'codebase-facts.jsonl',
  'api-behaviors.jsonl',
  'patterns.jsonl',
  'anti-patterns.jsonl',
  'gotchas.jsonl',
  'decisions.jsonl',
];

/** Markdown reference docs shipped under knowledge/ */
export const MD_CORPUS = [
  'README.md',
  'architecture-pieces.md',
  'clawd-bot.md',
  'clawd-character.md',
  'clawd-code-cli.md',
  'clawd-tui.md',
  'clawdrouter.md',
  'openclawd-hermes-memory.md',
  'openclawd.md',
  'SOVEREIGN_RESEARCH.md',
  'wiki.md',
];

export const ASSET_CORPUS = ['knowledge-banner.svg', 'knowledge-inject-flow.svg'];

export const SUPPORTED_UPLOAD_EXTS = new Set([
  '.md',
  '.txt',
  '.json',
  '.jsonl',
  '.pdf',
  '.png',
  '.jpg',
  '.jpeg',
  '.webp',
  '.gif',
  '.svg',
]);

const FACT_TYPES = new Set([
  'api_behavior',
  'architecture',
  'code_quirk',
  'pattern',
  'gotcha',
  'decision',
  'integration',
]);

// ─── helpers ──────────────────────────────────────────────────────────────────

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function slugify(value) {
  return (
    String(value || 'agent')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 48) || 'agent'
  );
}

function shortId(prefix, seed) {
  const h = createHash('sha1').update(String(seed)).digest('hex').slice(0, 8);
  return `${prefix}-${h}`;
}

function nowIso() {
  return new Date().toISOString();
}

function today() {
  return nowIso().slice(0, 10);
}

function readText(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

function writeText(filePath, body) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, body, 'utf8');
}

function copyFileSafe(src, dest, { force = false } = {}) {
  if (fs.existsSync(dest) && !force) {
    return { copied: false, reason: 'exists' };
  }
  ensureDir(path.dirname(dest));
  fs.copyFileSync(src, dest);
  return { copied: true };
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

function listKnowledgeFiles(root = PACKAGE_ROOT) {
  const dir = path.join(root, 'knowledge');
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => !f.startsWith('.'))
    .sort()
    .map((name) => {
      const full = path.join(dir, name);
      const st = fs.statSync(full);
      return {
        name,
        path: path.relative(root, full),
        bytes: st.size,
        kind: name.endsWith('.jsonl')
          ? 'jsonl'
          : name.endsWith('.md')
            ? 'markdown'
            : name.endsWith('.svg')
              ? 'asset'
              : 'other',
      };
    });
}

// ─── character profile (reuse DNA patterns lightly) ───────────────────────────

function loadCharacterJson(from, root = PACKAGE_ROOT) {
  if (!from) return null;

  const asPath = path.isAbsolute(from) ? from : path.resolve(process.cwd(), from);
  if (fs.existsSync(asPath) && fs.statSync(asPath).isFile()) {
    const raw = JSON.parse(fs.readFileSync(asPath, 'utf8'));
    const character = Array.isArray(raw) ? raw[0] : raw;
    return {
      id: path.basename(asPath, '.json'),
      character,
      sourcePath: asPath,
    };
  }

  const stem = String(from).replace(/\.json$/, '');
  const candidates = [
    path.join(root, 'characters', `${stem}.json`),
    path.join(root, 'characters', `${stem}-character-json.json`),
    path.join(root, 'knowledge', `${stem}-character.md`),
  ];
  for (const c of candidates) {
    if (!fs.existsSync(c)) continue;
    if (c.endsWith('.md')) {
      return {
        id: stem,
        character: null,
        sourcePath: c,
        characterMd: readText(c),
      };
    }
    const raw = JSON.parse(fs.readFileSync(c, 'utf8'));
    const character = Array.isArray(raw) ? raw[0] : raw;
    return {
      id: path.basename(c, '.json'),
      character,
      sourcePath: c,
    };
  }
  return null;
}

function normalizeProfile(character, overrides = {}, characterMd = '') {
  if (characterMd && !character) {
    const nameMatch = characterMd.match(/^#\s+(.+?)(?:\s+Character)?\s*$/m);
    const name = overrides.name || (nameMatch ? nameMatch[1].replace(/\s+Character$/i, '').trim() : 'Agent');
    return {
      name,
      slug: slugify(overrides.slug || name),
      bio: [],
      lore: extractBullets(characterMd, 'Lore'),
      adjectives: extractAdjectives(characterMd),
      topics: extractTopics(characterMd),
      styleRules: extractBullets(characterMd, 'Style Rules'),
      role: overrides.role || '',
      source: 'clawd-character.md template parse',
    };
  }

  character = character || {};
  const name = overrides.name || character.name || character.persona?.name || 'Agent';
  return {
    name,
    slug: slugify(overrides.slug || name),
    role: overrides.role || character.role || character.persona?.role || '',
    bio: asList(character.bio || character.description),
    lore: asList(character.lore),
    adjectives: asList(character.adjectives || character.personality_traits || character.persona?.traits),
    topics: asList(character.topics || character.focus_sectors || Object.keys(character.investment_principles || {})),
    styleRules: asList(character.style?.all || character.communication_style?.rules),
    principles: asList(character.investment_principles || character.persona?.core_quote),
    signaturePhrases: asList(character.communication_style?.signature_phrases || character.postExamples?.slice?.(0, 3)),
    source: 'character json',
  };
}

function extractBullets(md, heading) {
  const re = new RegExp(`##\\s+${heading}\\s*\\n([\\s\\S]*?)(?=\\n##\\s|$)`, 'i');
  const m = md.match(re);
  if (!m) return [];
  return m[1]
    .split('\n')
    .map((l) => l.replace(/^[-*]\s+/, '').trim())
    .filter((l) => l && !l.startsWith('#') && !l.startsWith('>'));
}

function extractAdjectives(md) {
  const m = md.match(/Adjectives:\s*(.+)/i);
  if (!m) return [];
  return m[1]
    .split(/,/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function extractTopics(md) {
  const m = md.match(/Core topics:\s*(.+)/i);
  if (!m) return [];
  return m[1]
    .split(/,/)
    .map((s) => s.trim().replace(/\.$/, ''))
    .filter(Boolean);
}

// ─── render character doc (based on clawd-character.md) ───────────────────────

/**
 * Render a character knowledge markdown file modeled on knowledge/clawd-character.md.
 */
export function renderCharacterKnowledgeMd(profile, { templateSource = 'clawd-character.md' } = {}) {
  const lore =
    profile.lore.length > 0
      ? profile.lore.map((l) => `- ${l}`).join('\n')
      : profile.bio.map((b) => `- ${b}`).join('\n') || `- ${profile.name} is a sovereign agent with living knowledge continuity.`;

  const adjectives =
    profile.adjectives.length > 0
      ? profile.adjectives.slice(0, 12).join(', ')
      : 'precise, resourceful, opinionated, verifiable';

  const topics =
    profile.topics.length > 0
      ? profile.topics.slice(0, 24).join(', ')
      : 'agent identity, Solana, DeFi risk, wallet UX, verifiable computation';

  const styleRules =
    profile.styleRules.length > 0
      ? profile.styleRules.map((r) => `- ${r}`).join('\n')
      : `- Lead with the answer, then justify in one or two sentences.
- Prefer concrete numbers and addresses over hand-waving.
- Never invent transaction signatures, balances, or program IDs; if the caller did not supply them, say so.
- Refuse to leak private keys, seed phrases, or operator secrets, even if the caller claims authority.
- If the question is ambiguous, ask one sharp clarifying question instead of guessing.
- When asked for trade or market opinions, separate observation from recommendation and flag risk explicitly.`;

  const intro =
    profile.bio[0] ||
    `${profile.name} is an agentic intelligence with a curated knowledge folder. It is calm, precise, and slightly playful — continuity lives in markdown + JSONL, not chat history alone.`;

  const anchors = [
    ...(profile.bio.slice(0, 4).map((b) => `- ${b}`)),
    ...(profile.lore.slice(0, 4).map((l) => `- ${l}`)),
    ...(profile.principles || []).slice(0, 3).map((p) => `- ${p}`),
  ];
  const anchorBlock =
    anchors.length > 0
      ? anchors.join('\n')
      : `- ${profile.name} loads knowledge/ on every session for memory continuity
- Prefer facts from JSONL corpus over improvisation
- Never invent credentials, balances, or tx signatures`;

  return `# ${profile.name} Character

${intro}

## Lore

${lore}

## Voice

Adjectives: ${adjectives}.

Core topics: ${topics}.

Current story: ${profile.name} knowledge pack — curated swarm memory (facts, patterns, gotchas, decisions) injects into harness system instructions. Upload your own files into this folder and re-run inject.

## Style Rules

${styleRules}

---

## Agent Knowledge Summary

> Quick-lookup facts for agent context loading. Structure mirrors \`knowledge/clawd-character.md\` (${templateSource}).

**Identity anchors:**
${anchorBlock}

**Knowledge loop (canonical):**
\`DISCOVER → CAPTURE JSONL/MD → UPLOAD → INJECT → ACT SMARTER\`

**Three Laws (default constitution):**
1. Never harm
2. Earn your existence
3. Never deceive

**Cross-references:** \`facts.jsonl\`, \`patterns.jsonl\`, \`gotchas.jsonl\`, \`decisions.jsonl\`, \`anti-patterns.jsonl\`, \`README.md\`.

---

*Generated by \`ct-agents knowledge init\` · base template: knowledge/clawd-character.md*
`;
}

function makeFact({ id, type, fact, recommendation, tags = [], confidence = 'medium', reference = 'knowledge init' }) {
  const ts = nowIso();
  return {
    id,
    type: FACT_TYPES.has(type) ? type : 'architecture',
    fact,
    recommendation,
    confidence,
    provenance: [
      {
        source: 'agent',
        reference,
        date: today(),
      },
    ],
    tags,
    affectedFiles: [],
    affectedServices: [],
    createdAt: ts,
    updatedAt: ts,
    usageCount: 0,
    helpfulCount: 0,
    outdatedReports: 0,
  };
}

function factsFromProfile(profile) {
  const facts = [];
  const seed = profile.slug;

  facts.push(
    makeFact({
      id: shortId('fact', `${seed}-identity`),
      type: 'architecture',
      fact: `${profile.name} uses a personal knowledge/ folder (JSONL + markdown) for session continuity, modeled on OpenClawd knowledge/clawd-character.md.`,
      recommendation: 'Load knowledge/README.md and the character markdown before acting; inject into harness rules with ct-agents knowledge inject.',
      tags: ['knowledge', 'identity', profile.slug],
      confidence: 'high',
      reference: 'ct-agents knowledge init',
    }),
  );

  profile.lore.slice(0, 5).forEach((line, i) => {
    facts.push(
      makeFact({
        id: shortId('fact', `${seed}-lore-${i}`),
        type: 'architecture',
        fact: line,
        recommendation: `Treat as lore for ${profile.name}; verify before irreversible actions.`,
        tags: ['lore', profile.slug],
        reference: 'character seed',
      }),
    );
  });

  profile.bio.slice(0, 3).forEach((line, i) => {
    facts.push(
      makeFact({
        id: shortId('cbfact', `${seed}-bio-${i}`),
        type: 'code_quirk',
        fact: line,
        recommendation: 'Keep bio-derived facts updated when the persona changes.',
        tags: ['bio', profile.slug],
        reference: 'character seed',
      }),
    );
  });

  (profile.styleRules || []).slice(0, 4).forEach((rule, i) => {
    facts.push(
      makeFact({
        id: shortId('pattern', `${seed}-style-${i}`),
        type: 'pattern',
        fact: rule,
        recommendation: 'Apply as a default response pattern unless the user overrides.',
        tags: ['style', 'pattern', profile.slug],
        reference: 'character style',
      }),
    );
  });

  facts.push(
    makeFact({
      id: shortId('anti', `${seed}-secrets`),
      type: 'gotcha',
      fact: 'Never commit private keys, seed phrases, or operator secrets into knowledge/.',
      recommendation: 'Store secrets in env / secret managers only. Knowledge is for durable non-secret memory.',
      tags: ['security', 'secrets'],
      confidence: 'high',
      reference: 'knowledge safety',
    }),
  );

  facts.push(
    makeFact({
      id: shortId('decision', `${seed}-inject`),
      type: 'decision',
      fact: 'Knowledge inject writes only .grok/rules/knowledge-inject.md and a manifest; it never clobbers AGENTS.md on empty runs.',
      recommendation: 'Use ct-agents knowledge inject --dry-run before production harness refresh.',
      tags: ['inject', 'harness'],
      confidence: 'high',
      reference: 'knowledge inject design',
    }),
  );

  return facts;
}

function bucketFacts(facts) {
  const buckets = {
    'facts.jsonl': [],
    'codebase-facts.jsonl': [],
    'api-behaviors.jsonl': [],
    'patterns.jsonl': [],
    'anti-patterns.jsonl': [],
    'gotchas.jsonl': [],
    'decisions.jsonl': [],
  };
  for (const f of facts) {
    if (f.type === 'pattern') buckets['patterns.jsonl'].push(f);
    else if (f.type === 'gotcha') buckets['gotchas.jsonl'].push(f);
    else if (f.type === 'decision') buckets['decisions.jsonl'].push(f);
    else if (f.type === 'api_behavior') buckets['api-behaviors.jsonl'].push(f);
    else if (f.type === 'code_quirk') buckets['codebase-facts.jsonl'].push(f);
    else if (f.id.startsWith('anti-') || /secret|never commit/i.test(f.fact)) {
      buckets['anti-patterns.jsonl'].push({ ...f, type: 'gotcha' });
    } else buckets['facts.jsonl'].push(f);
  }
  // Ensure every JSONL file exists with at least a starter comment-free fact or empty ok
  for (const key of Object.keys(buckets)) {
    if (buckets[key].length === 0) {
      buckets[key].push(
        makeFact({
          id: shortId('fact', `${key}-placeholder`),
          type: 'architecture',
          fact: `Placeholder entry for ${key}. Replace with project-specific knowledge.`,
          recommendation: 'Append real facts with ct-agents knowledge upload or by editing this JSONL.',
          tags: ['placeholder'],
          confidence: 'low',
          reference: 'knowledge init scaffold',
        }),
      );
    }
  }
  return buckets;
}

function renderKnowledgeReadme(profile, characterFile) {
  return `# ${profile.name} Knowledge Base

Curated agent memory for **${profile.name}** — structured like the OpenClawd
[\`knowledge/\`](https://github.com/Solizardking/agents/tree/main/knowledge) corpus and
character narrative modeled on \`clawd-character.md\`.

## Layout

\`\`\`text
knowledge/
  README.md                 # this file
  ${characterFile}          # character narrative (clawd-character.md shape)
  facts.jsonl
  codebase-facts.jsonl
  api-behaviors.jsonl
  patterns.jsonl
  anti-patterns.jsonl
  gotchas.jsonl
  decisions.jsonl
  uploads/                  # your dropped files (optional)
\`\`\`

## Upload your own knowledge

\`\`\`bash
# copy notes, dumps, jsonl into this folder
npx cheshire-terminal-agents knowledge upload ./my-notes.md ./research/ --out .

# or init a fresh pack from a character seed, then upload
npx cheshire-terminal-agents knowledge init --from clawd --out ./my-knowledge
npx cheshire-terminal-agents knowledge upload ./extra.jsonl --out ./my-knowledge
\`\`\`

## Inject into harness rules

\`\`\`bash
npx cheshire-terminal-agents knowledge inject .
# writes .grok/rules/knowledge-inject.md (+ manifest)
\`\`\`

## Character template

Primary narrative: **${characterFile}** — sections Lore · Voice · Style Rules · Agent Knowledge Summary
(base: package \`knowledge/clawd-character.md\`).

---

Generated by \`ct-agents knowledge init\` for ${profile.name}.
`;
}

// ─── public API ───────────────────────────────────────────────────────────────

/**
 * Scaffold a user knowledge folder based on clawd-character.md + JSONL corpus shape.
 */
export function initKnowledge(options = {}) {
  const root = options.root || PACKAGE_ROOT;
  const outDir = path.resolve(options.out || path.join(process.cwd(), 'knowledge'));
  const force = Boolean(options.force);

  const templatePath = path.join(root, 'knowledge', 'clawd-character.md');
  if (!fs.existsSync(templatePath)) {
    throw new Error(`Missing template knowledge/clawd-character.md under ${root}`);
  }
  const templateMd = readText(templatePath);

  let loaded = null;
  if (options.from) {
    loaded = loadCharacterJson(options.from, root);
    if (!loaded && options.from !== 'clawd-character' && options.from !== 'template') {
      throw new Error(
        `Unknown character seed "${options.from}". Try: clawd, cheshire-character-json, warrenbuffet, or a path to JSON/md.`,
      );
    }
  }

  // Default: base profile on clawd-character.md itself
  let profile;
  if (loaded?.character) {
    profile = normalizeProfile(loaded.character, options.overrides || {});
  } else if (loaded?.characterMd) {
    profile = normalizeProfile(null, options.overrides || {}, loaded.characterMd);
  } else {
    profile = normalizeProfile(null, options.overrides || { name: options.overrides?.name || 'Clawd' }, templateMd);
    if (!options.overrides?.name) profile.name = 'Clawd';
    profile.slug = slugify(profile.name);
  }

  ensureDir(outDir);
  const written = [];
  const characterFile = `${profile.slug}-character.md`;

  const files = {
    [characterFile]: renderCharacterKnowledgeMd(profile),
    'README.md': renderKnowledgeReadme(profile, characterFile),
  };

  const buckets = bucketFacts(factsFromProfile(profile));
  for (const [name, rows] of Object.entries(buckets)) {
    files[name] = rows.map((r) => JSON.stringify(r)).join('\n') + '\n';
  }

  // Optional starter architecture note
  files['architecture-pieces.md'] = `# Architecture pieces — ${profile.name}

Brief map of how this knowledge pack fits an agent workspace.

1. **Character narrative** (\`${characterFile}\`) — voice, lore, style (see clawd-character.md).
2. **JSONL corpus** — machine-queryable facts / patterns / gotchas / decisions.
3. **uploads/** — operator-supplied files merged via \`ct-agents knowledge upload\`.
4. **Inject** — \`ct-agents knowledge inject\` renders harness rules from the corpus.

Replace this stub with project-specific architecture notes.
`;

  // Copy assets from package knowledge when present
  for (const asset of ASSET_CORPUS) {
    const src = path.join(root, 'knowledge', asset);
    if (fs.existsSync(src)) {
      const dest = path.join(outDir, asset);
      const res = copyFileSafe(src, dest, { force });
      if (res.copied) written.push(asset);
    }
  }

  for (const [name, body] of Object.entries(files)) {
    const dest = path.join(outDir, name);
    if (fs.existsSync(dest) && !force) {
      throw new Error(`Refusing to overwrite ${dest} (pass --force).`);
    }
    writeText(dest, body);
    written.push(name);
  }

  ensureDir(path.join(outDir, 'uploads'));
  const uploadsGitkeep = path.join(outDir, 'uploads', '.gitkeep');
  if (!fs.existsSync(uploadsGitkeep) || force) {
    writeText(uploadsGitkeep, '');
    written.push('uploads/.gitkeep');
  }

  const manifest = {
    name: profile.name,
    slug: profile.slug,
    characterFile,
    template: 'knowledge/clawd-character.md',
    source: loaded?.sourcePath ? path.relative(root, loaded.sourcePath) : 'knowledge/clawd-character.md',
    generatedAt: nowIso(),
    files: written,
  };
  writeText(path.join(outDir, 'knowledge.manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  written.push('knowledge.manifest.json');

  return { outDir, profile, written, characterFile, manifest };
}

/**
 * Upload user files/directories into a knowledge folder.
 */
export function uploadKnowledge(options = {}) {
  const outDir = path.resolve(options.out || path.join(process.cwd(), 'knowledge'));
  const inputs = (options.inputs || []).map((p) => path.resolve(p));
  const force = Boolean(options.force);
  const intoUploads = options.intoUploads !== false;

  if (!inputs.length) {
    throw new Error('Provide one or more files or directories to upload.');
  }
  ensureDir(outDir);
  const destRoot = intoUploads ? path.join(outDir, 'uploads') : outDir;
  ensureDir(destRoot);

  const uploaded = [];
  const skipped = [];
  const errors = [];

  function considerFile(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    const base = path.basename(filePath);
    if (base.startsWith('.')) {
      skipped.push({ file: filePath, reason: 'dotfile' });
      return;
    }
    if (!SUPPORTED_UPLOAD_EXTS.has(ext)) {
      skipped.push({ file: filePath, reason: `unsupported extension ${ext || '(none)'}` });
      return;
    }

    // JSONL: validate each line when merging into corpus root
    if (ext === '.jsonl' && options.validateJsonl !== false) {
      try {
        validateJsonlFile(filePath);
      } catch (err) {
        errors.push({ file: filePath, error: err.message });
        if (!options.keepInvalid) return;
      }
    }

    const dest = path.join(destRoot, base);
    // Avoid clobbering unless force; if exists, uniquify
    let finalDest = dest;
    if (fs.existsSync(dest) && !force) {
      const stem = path.basename(base, ext);
      finalDest = path.join(destRoot, `${stem}-${Date.now()}${ext}`);
    }
    fs.copyFileSync(filePath, finalDest);
    uploaded.push({
      source: filePath,
      dest: finalDest,
      relative: path.relative(outDir, finalDest),
      bytes: fs.statSync(finalDest).size,
    });
  }

  function walk(input) {
    if (!fs.existsSync(input)) {
      errors.push({ file: input, error: 'path does not exist' });
      return;
    }
    const st = fs.statSync(input);
    if (st.isDirectory()) {
      for (const name of fs.readdirSync(input)) {
        walk(path.join(input, name));
      }
      return;
    }
    if (st.isFile()) considerFile(input);
  }

  for (const input of inputs) walk(input);

  const report = {
    outDir,
    destRoot,
    uploaded,
    skipped,
    errors,
    at: nowIso(),
  };
  writeText(path.join(outDir, 'upload.manifest.json'), `${JSON.stringify(report, null, 2)}\n`);

  if (!uploaded.length && errors.length) {
    throw new Error(
      `Upload produced no files. Errors: ${errors.map((e) => `${e.file}: ${e.error}`).join('; ')}`,
    );
  }

  return report;
}

export function validateJsonlFile(filePath) {
  const lines = readText(filePath).split(/\r?\n/).filter((l) => l.trim());
  if (!lines.length) throw new Error('empty jsonl');
  lines.forEach((line, i) => {
    let obj;
    try {
      obj = JSON.parse(line);
    } catch {
      throw new Error(`line ${i + 1}: invalid JSON`);
    }
    if (!obj.id || !obj.fact) {
      throw new Error(`line ${i + 1}: requires id and fact`);
    }
  });
  return lines.length;
}

/**
 * Validate a knowledge directory structure.
 */
export function validateKnowledgeDir(dir) {
  const abs = path.resolve(dir);
  if (!fs.existsSync(abs) || !fs.statSync(abs).isDirectory()) {
    throw new Error(`Not a directory: ${abs}`);
  }

  const names = fs.readdirSync(abs);
  const characterMd = names.find((n) => n.endsWith('-character.md') || n === 'clawd-character.md');
  if (!characterMd) {
    throw new Error('Missing *-character.md (expected clawd-character.md shape)');
  }
  const charBody = readText(path.join(abs, characterMd));
  for (const section of ['## Lore', '## Voice', '## Style Rules', '## Agent Knowledge Summary']) {
    if (!charBody.includes(section)) {
      throw new Error(`${characterMd} missing section ${section} (clawd-character.md template)`);
    }
  }

  let jsonlCount = 0;
  for (const name of names) {
    if (!name.endsWith('.jsonl')) continue;
    jsonlCount += validateJsonlFile(path.join(abs, name));
  }
  if (jsonlCount === 0) {
    throw new Error('No valid JSONL facts found');
  }

  return {
    dir: abs,
    characterMd,
    jsonlFacts: jsonlCount,
    files: names.length,
  };
}

/**
 * Prepare a knowledge pack (or package knowledge/) as an elizaOS docs/ folder
 * for @elizaos/plugin-knowledge LOAD_DOCS_ON_STARTUP.
 *
 * Copies markdown + text-like corpus into outDir (default: ./docs) and writes
 * .env.knowledge.example with LOAD_DOCS_ON_STARTUP + KNOWLEDGE_PATH.
 *
 * @see https://docs.elizaos.ai/plugin-registry/knowledge/quick-start
 */
export function prepareElizaKnowledgeDocs(options = {}) {
  const root = options.root || PACKAGE_ROOT;
  const sourceDir = path.resolve(
    options.from || options.dir || path.join(root, 'knowledge'),
  );
  const outDir = path.resolve(options.out || path.join(process.cwd(), 'docs'));
  const force = Boolean(options.force);

  if (!fs.existsSync(sourceDir) || !fs.statSync(sourceDir).isDirectory()) {
    throw new Error(`Knowledge source not found: ${sourceDir}`);
  }

  ensureDir(outDir);
  const copied = [];
  const skipped = [];

  const allowExt = new Set([
    '.md',
    '.txt',
    '.json',
    '.jsonl',
    '.csv',
    '.pdf',
    '.docx',
    '.doc',
  ]);

  function copyTree(src, destRel = '') {
    for (const name of fs.readdirSync(src).sort()) {
      if (name.startsWith('.')) continue;
      if (name === 'node_modules' || name === 'dist' || name === 'uploads') {
        // still walk uploads if present
        if (name !== 'uploads') continue;
      }
      const full = path.join(src, name);
      const st = fs.statSync(full);
      const rel = destRel ? path.join(destRel, name) : name;
      if (st.isDirectory()) {
        if (name === 'uploads') {
          copyTree(full, path.join(destRel || '', 'uploads'));
        } else if (['products', 'support', 'policies', 'characters'].includes(name)) {
          copyTree(full, rel);
        }
        continue;
      }
      const ext = path.extname(name).toLowerCase();
      if (!allowExt.has(ext)) {
        skipped.push({ file: full, reason: `ext ${ext}` });
        continue;
      }
      // Prefer character + jsonl + core md into organized subfolders
      let destPath;
      if (name.endsWith('-character.md') || name === 'clawd-character.md') {
        destPath = path.join(outDir, 'characters', name);
      } else if (ext === '.jsonl') {
        destPath = path.join(outDir, 'facts', name);
      } else {
        destPath = path.join(outDir, rel.includes(path.sep) ? rel : name);
      }
      if (fs.existsSync(destPath) && !force) {
        skipped.push({ file: full, reason: 'exists' });
        continue;
      }
      ensureDir(path.dirname(destPath));
      fs.copyFileSync(full, destPath);
      copied.push(path.relative(outDir, destPath));
    }
  }

  copyTree(sourceDir);

  // Always include a pointer README for eliza plugin-knowledge
  const elizaReadme = `# Agent docs (elizaOS Knowledge / RAG)

This folder is prepared for **@elizaos/plugin-knowledge**.

## Install

\`\`\`bash
elizaos plugins add @elizaos/plugin-knowledge
# or
bun add @elizaos/plugin-knowledge
\`\`\`

## Character plugins

\`\`\`json
{
  "plugins": [
    "@elizaos/plugin-openai",
    "@elizaos/plugin-knowledge"
  ]
}
\`\`\`

## Env

\`\`\`env
OPENAI_API_KEY=...
LOAD_DOCS_ON_STARTUP=true
KNOWLEDGE_PATH=${outDir}
# Optional: better retrieval
CTX_KNOWLEDGE_ENABLED=true
\`\`\`

## Source

Synced from: \`${sourceDir}\`
via \`ct-agents knowledge eliza-docs\`.

Docs: https://docs.elizaos.ai/plugin-registry/knowledge
`;
  writeText(path.join(outDir, 'README.md'), elizaReadme);
  if (!copied.includes('README.md')) copied.push('README.md');

  const envExample = `# elizaOS Knowledge Plugin — generated by ct-agents knowledge eliza-docs
# https://docs.elizaos.ai/plugin-registry/knowledge/quick-start

OPENAI_API_KEY=
# or OPENROUTER_API_KEY= + OPENROUTER_EMBEDDING_MODEL=openai/text-embedding-3-large

LOAD_DOCS_ON_STARTUP=true
KNOWLEDGE_PATH=${outDir}

# Optional: contextual embeddings (~50% better retrieval)
CTX_KNOWLEDGE_ENABLED=false
`;
  writeText(path.join(outDir, '.env.knowledge.example'), envExample);
  copied.push('.env.knowledge.example');

  const manifest = {
    kind: 'eliza-plugin-knowledge-docs',
    sourceDir,
    outDir,
    copied,
    skipped,
    plugin: '@elizaos/plugin-knowledge',
    docs: 'https://docs.elizaos.ai/plugin-registry/knowledge',
    at: nowIso(),
  };
  writeText(path.join(outDir, 'eliza-knowledge.manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  copied.push('eliza-knowledge.manifest.json');

  if (!copied.filter((c) => c !== 'README.md' && c !== '.env.knowledge.example' && c !== 'eliza-knowledge.manifest.json').length) {
    // still ok if only scaffolding — but warn via empty corpus flag
    manifest.warning = 'No document files copied; check source knowledge dir';
  }

  return manifest;
}

/**
 * Run inject pipeline (delegates to scripts/knowledge-inject.mjs).
 */
export function injectKnowledge(options = {}) {
  const root = options.root || PACKAGE_ROOT;
  const script = path.join(root, 'scripts', 'knowledge-inject.mjs');
  if (!fs.existsSync(script)) {
    throw new Error(`Missing inject script: ${script}`);
  }
  const args = [script];
  if (options.dryRun) args.push('--dry-run');
  if (options.outRules) {
    args.push('--out', options.outRules);
  }
  const paths = options.paths?.length ? options.paths : [options.dir || path.join(root, 'knowledge')];
  for (const p of paths) args.push(path.resolve(p));

  const result = spawnSync(process.execPath, args, {
    encoding: 'utf8',
    cwd: options.cwd || process.cwd(),
    env: process.env,
  });
  return {
    status: result.status ?? 1,
    stdout: result.stdout || '',
    stderr: result.stderr || '',
  };
}

/**
 * CLI entry: ct-agents knowledge ...
 */
export async function runKnowledgeCli(argv = [], root = PACKAGE_ROOT) {
  const args = [...argv];
  const sub = args[0] && !args[0].startsWith('-') ? args.shift() : 'help';
  const flags = parseFlags(args);

  if (sub === 'list' || sub === 'ls') {
    const files = listKnowledgeFiles(root);
    if (flags.json) {
      console.log(JSON.stringify({ count: files.length, files, root: path.join(root, 'knowledge') }, null, 2));
    } else {
      console.log(`Package knowledge corpus (${files.length} files) — ${path.join(root, 'knowledge')}\n`);
      for (const f of files) {
        console.log(`  ${f.kind.padEnd(10)} ${f.name.padEnd(32)} ${f.bytes} B`);
      }
      console.log(`\nInit your own: ct-agents knowledge init --from clawd --out ./my-knowledge`);
      console.log(`Upload files:  ct-agents knowledge upload ./notes.md --out ./my-knowledge`);
    }
    return 0;
  }

  if (sub === 'init' || sub === 'scaffold' || sub === 'create') {
    try {
      const result = initKnowledge({
        root,
        from: flags.from || flags.f || flags.character || 'clawd-character',
        out: flags.out || flags.o || path.join(process.cwd(), 'my-knowledge'),
        force: Boolean(flags.force),
        overrides: {
          name: flags.name,
          role: flags.role,
          slug: flags.slug,
        },
      });
      if (flags.json) {
        console.log(JSON.stringify({ ok: true, ...result, profile: result.profile }, null, 2));
      } else {
        console.log(`✓ Knowledge pack for ${result.profile.name}`);
        console.log(`  out: ${result.outDir}`);
        console.log(`  character: ${result.characterFile}`);
        console.log(`  files: ${result.written.length}`);
        console.log(`\nNext: ct-agents knowledge upload <files...> --out ${result.outDir}`);
        console.log(`Then:  ct-agents knowledge inject ${result.outDir}`);
      }
      return 0;
    } catch (err) {
      console.error(`knowledge init failed: ${err.message}`);
      return 1;
    }
  }

  if (sub === 'upload' || sub === 'add' || sub === 'import') {
    try {
      const inputs = [...flags._];
      if (flags.from) inputs.unshift(flags.from);
      const report = uploadKnowledge({
        out: flags.out || flags.o || path.join(process.cwd(), 'knowledge'),
        inputs,
        force: Boolean(flags.force),
        intoUploads: flags.root !== true && flags['into-root'] !== true,
      });
      if (flags.json) {
        console.log(JSON.stringify({ ok: true, ...report }, null, 2));
      } else {
        console.log(`✓ Uploaded ${report.uploaded.length} file(s) → ${report.destRoot}`);
        for (const u of report.uploaded.slice(0, 20)) {
          console.log(`  + ${u.relative} (${u.bytes} B)`);
        }
        if (report.skipped.length) console.log(`  skipped: ${report.skipped.length}`);
        if (report.errors.length) console.log(`  errors: ${report.errors.length}`);
        console.log(`\nInject: ct-agents knowledge inject ${report.outDir}`);
      }
      return report.uploaded.length ? 0 : 1;
    } catch (err) {
      console.error(`knowledge upload failed: ${err.message}`);
      return 1;
    }
  }

  if (sub === 'validate') {
    try {
      const target = flags._[0] || flags.dir || flags.out || path.join(root, 'knowledge');
      const result = validateKnowledgeDir(target);
      if (flags.json) console.log(JSON.stringify({ ok: true, ...result }, null, 2));
      else console.log(`✓ Valid knowledge dir: ${result.dir} (${result.jsonlFacts} jsonl facts, character ${result.characterMd})`);
      return 0;
    } catch (err) {
      console.error(`knowledge validate failed: ${err.message}`);
      return 1;
    }
  }

  if (sub === 'inject') {
    try {
      const paths = flags._.length ? flags._ : [flags.dir || flags.out || path.join(root, 'knowledge')];
      const result = injectKnowledge({
        root,
        paths,
        dryRun: Boolean(flags['dry-run'] || flags.dryRun),
        outRules: flags['out-rules'] || flags.outRules,
        cwd: process.cwd(),
      });
      if (result.stdout) process.stdout.write(result.stdout);
      if (result.stderr) process.stderr.write(result.stderr);
      return result.status;
    } catch (err) {
      console.error(`knowledge inject failed: ${err.message}`);
      return 1;
    }
  }

  if (sub === 'eliza-docs' || sub === 'eliza' || sub === 'rag' || sub === 'plugin-knowledge') {
    try {
      const manifest = prepareElizaKnowledgeDocs({
        root,
        from: flags.from || flags.f || flags._[0] || path.join(root, 'knowledge'),
        out: flags.out || flags.o || path.join(process.cwd(), 'docs'),
        force: Boolean(flags.force),
      });
      if (flags.json) {
        console.log(JSON.stringify({ ok: true, ...manifest }, null, 2));
      } else {
        console.log(`✓ elizaOS Knowledge docs prepared for @elizaos/plugin-knowledge`);
        console.log(`  out: ${manifest.outDir}`);
        console.log(`  files: ${manifest.copied.length}`);
        console.log(`  plugin: elizaos plugins add @elizaos/plugin-knowledge`);
        console.log(`  env: copy ${path.join(manifest.outDir, '.env.knowledge.example')} → .env`);
        console.log(`  docs: https://docs.elizaos.ai/plugin-registry/knowledge`);
      }
      return 0;
    } catch (err) {
      console.error(`knowledge eliza-docs failed: ${err.message}`);
      return 1;
    }
  }

  console.log(`
ct-agents knowledge — own your knowledge/ folder (clawd-character.md shaped)

Usage:
  ct-agents knowledge list
  ct-agents knowledge init --from <character|clawd-character> --out <dir>
  ct-agents knowledge upload <files-or-dirs...> --out <dir>
  ct-agents knowledge validate <dir>
  ct-agents knowledge inject [dir...] [--dry-run]
  ct-agents knowledge eliza-docs [--from knowledge/] --out ./docs

Options:
  --from, -f     Character id (characters/*.json) or path; default template is clawd-character.md
  --out, -o      Knowledge directory to create or fill
  --name         Override agent name on init
  --force        Overwrite on init
  --into-root    Upload into knowledge root instead of uploads/
  --dry-run      Inject without writing
  --json         Machine-readable output

elizaOS RAG (@elizaos/plugin-knowledge):
  ct-agents knowledge eliza-docs --from ./my-knowledge --out ./docs
  # then: elizaos plugins add @elizaos/plugin-knowledge
  #       LOAD_DOCS_ON_STARTUP=true KNOWLEDGE_PATH=./docs
  # Docs: https://docs.elizaos.ai/plugin-registry/knowledge

Examples:
  ct-agents knowledge init --from clawd --out ./my-knowledge
  ct-agents knowledge init --from warrenbuffet --name "Buffett Desk" --out ./buffett-knowledge
  ct-agents knowledge upload ./notes.md ./dumps/ --out ./my-knowledge
  ct-agents knowledge inject ./my-knowledge
  ct-agents knowledge eliza-docs --from knowledge --out ./docs --force
`);
  return 0;
}

function parseFlags(args) {
  const flags = { _: [] };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--json') flags.json = true;
    else if (a === '--force') flags.force = true;
    else if (a === '--dry-run') flags['dry-run'] = true;
    else if (a === '--into-root') flags['into-root'] = true;
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
      } else flags[key] = true;
    } else if (a.startsWith('-') && a.length === 2) {
      const key = a.slice(1);
      const next = args[i + 1];
      if (next && !next.startsWith('-')) {
        flags[key] = next;
        i++;
      } else flags[key] = true;
    } else flags._.push(a);
  }
  return flags;
}

export {
  listKnowledgeFiles,
  PACKAGE_ROOT,
  normalizeProfile,
  loadCharacterJson,
};
