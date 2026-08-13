#!/usr/bin/env node
/**
 * One-shot knowledge inject → harness system instructions.
 *
 * Reads knowledge files (.md, .txt, .json, .jsonl, optional .pdf/images),
 * normalizes facts, and writes:
 *   .grok/rules/knowledge-inject.md
 *   .grok/knowledge-inject.manifest.json
 *
 * Safety: refuses to overwrite inject targets when zero files extract successfully.
 *
 * Usage:
 *   node scripts/knowledge-inject.mjs
 *   node scripts/knowledge-inject.mjs knowledge/ path/to/upload.pdf
 *   node scripts/knowledge-inject.mjs --dry-run
 *   node scripts/knowledge-inject.mjs --out /path/to/rules.md knowledge/
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = path.resolve(__dirname, '..');
const CWD = process.cwd();

const TEXT_EXTS = new Set(['.md', '.txt', '.json', '.jsonl', '.svg']);
const IMAGE_EXTS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif']);
const MAX_EXCERPT = 4000;
const MAX_FACTS_IN_RULES = 200;

function parseArgs(argv) {
  const flags = { paths: [], dryRun: false, out: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--dry-run') flags.dryRun = true;
    else if (a === '--out' && argv[i + 1]) {
      flags.out = path.resolve(argv[++i]);
    } else if (a === '--help' || a === '-h') flags.help = true;
    else if (!a.startsWith('-')) flags.paths.push(path.resolve(a));
  }
  if (!flags.paths.length) {
    const pkgKnowledge = path.join(PACKAGE_ROOT, 'knowledge');
    const cwdKnowledge = path.join(CWD, 'knowledge');
    if (fs.existsSync(cwdKnowledge)) flags.paths.push(cwdKnowledge);
    else if (fs.existsSync(pkgKnowledge)) flags.paths.push(pkgKnowledge);
    else flags.paths.push(pkgKnowledge);
  }
  return flags;
}

function walkFiles(input, acc = []) {
  if (!fs.existsSync(input)) return acc;
  const st = fs.statSync(input);
  if (st.isFile()) {
    acc.push(input);
    return acc;
  }
  if (st.isDirectory()) {
    for (const name of fs.readdirSync(input).sort()) {
      if (name.startsWith('.')) continue;
      walkFiles(path.join(input, name), acc);
    }
  }
  return acc;
}

function extractText(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const base = path.basename(filePath);

  if (ext === '.pdf') {
    const r = spawnSync('pdftotext', ['-layout', filePath, '-'], { encoding: 'utf8' });
    if (r.status !== 0) {
      return { ok: false, reason: 'pdftotext unavailable or failed', facts: [], text: '' };
    }
    return { ok: true, reason: 'pdf', facts: [], text: r.stdout || '' };
  }

  if (IMAGE_EXTS.has(ext)) {
    const r = spawnSync('tesseract', [filePath, 'stdout'], { encoding: 'utf8' });
    if (r.status !== 0) {
      return { ok: false, reason: 'tesseract unavailable or failed', facts: [], text: '' };
    }
    return { ok: true, reason: 'ocr', facts: [], text: r.stdout || '' };
  }

  if (!TEXT_EXTS.has(ext) && ext !== '') {
    // allow extensionless text-ish small files
    try {
      const buf = fs.readFileSync(filePath);
      if (buf.includes(0)) {
        return { ok: false, reason: `unsupported binary ${ext || base}`, facts: [], text: '' };
      }
    } catch {
      return { ok: false, reason: 'unreadable', facts: [], text: '' };
    }
  }

  let raw;
  try {
    raw = fs.readFileSync(filePath, 'utf8');
  } catch (err) {
    return { ok: false, reason: err.message, facts: [], text: '' };
  }

  if (ext === '.jsonl') {
    const facts = [];
    const lines = raw.split(/\r?\n/).filter((l) => l.trim());
    for (const line of lines) {
      try {
        const obj = JSON.parse(line);
        if (obj && (obj.fact || obj.recommendation)) facts.push(obj);
      } catch {
        // skip bad line
      }
    }
    if (!facts.length) {
      return { ok: false, reason: 'jsonl had no parseable facts', facts: [], text: '' };
    }
    return { ok: true, reason: 'jsonl', facts, text: '' };
  }

  if (ext === '.json') {
    try {
      const obj = JSON.parse(raw);
      if (Array.isArray(obj)) {
        const facts = obj.filter((x) => x && (x.fact || x.recommendation));
        if (facts.length) return { ok: true, reason: 'json-array', facts, text: '' };
      }
      if (obj && obj.fact) return { ok: true, reason: 'json-fact', facts: [obj], text: '' };
      return {
        ok: true,
        reason: 'json',
        facts: [],
        text: JSON.stringify(obj, null, 2).slice(0, MAX_EXCERPT),
      };
    } catch {
      return { ok: false, reason: 'invalid json', facts: [], text: '' };
    }
  }

  // markdown / txt / svg title-ish
  const text = raw.length > MAX_EXCERPT * 2 ? `${raw.slice(0, MAX_EXCERPT)}\n\n…[truncated]…\n` : raw;
  return { ok: true, reason: ext || 'text', facts: [], text };
}

function renderRules({ sources, facts, excerpts }) {
  const lines = [];
  lines.push('# Knowledge inject (auto-generated)');
  lines.push('');
  lines.push('> Generated by `scripts/knowledge-inject.mjs` / `ct-agents knowledge inject`.');
  lines.push('> Do not hand-edit — re-run inject to refresh. Safe re-runs only overwrite this file + manifest.');
  lines.push('');
  lines.push(`- Generated at: ${new Date().toISOString()}`);
  lines.push(`- Sources: ${sources.length}`);
  lines.push(`- Structured facts: ${facts.length}`);
  lines.push(`- Narrative excerpts: ${excerpts.length}`);
  lines.push('');
  lines.push('## How to use');
  lines.push('');
  lines.push('Treat the following as project memory. Prefer these facts over improvisation.');
  lines.push('Never invent balances, signatures, or secrets. Knowledge must not contain private keys.');
  lines.push('');

  if (facts.length) {
    lines.push('## Structured facts');
    lines.push('');
    const slice = facts.slice(0, MAX_FACTS_IN_RULES);
    for (const f of slice) {
      const id = f.id || 'fact';
      const type = f.type || 'fact';
      const conf = f.confidence || 'n/a';
      lines.push(`### ${id} · ${type} · ${conf}`);
      lines.push('');
      lines.push(`- **Fact:** ${f.fact || ''}`);
      if (f.recommendation) lines.push(`- **Do:** ${f.recommendation}`);
      if (Array.isArray(f.tags) && f.tags.length) {
        lines.push(`- **Tags:** ${f.tags.join(', ')}`);
      }
      lines.push('');
    }
    if (facts.length > MAX_FACTS_IN_RULES) {
      lines.push(`_…${facts.length - MAX_FACTS_IN_RULES} more facts omitted; query knowledge/*.jsonl directly._`);
      lines.push('');
    }
  }

  if (excerpts.length) {
    lines.push('## Narrative / document excerpts');
    lines.push('');
    for (const ex of excerpts) {
      lines.push(`### ${ex.name}`);
      lines.push('');
      lines.push('```');
      lines.push(ex.text.trim().slice(0, MAX_EXCERPT));
      lines.push('```');
      lines.push('');
    }
  }

  // Prefer character summary sections when present
  const character = excerpts.find((e) => /-character\.md$/i.test(e.name) || e.name === 'clawd-character.md');
  if (character) {
    lines.push('## Character knowledge priority');
    lines.push('');
    lines.push(`Primary character narrative: \`${character.name}\` (clawd-character.md shape: Lore · Voice · Style · Summary).`);
    lines.push('');
  }

  return `${lines.join('\n')}\n`;
}

async function main() {
  const flags = parseArgs(process.argv.slice(2));
  if (flags.help) {
    console.log(`Usage: node scripts/knowledge-inject.mjs [paths...] [--dry-run] [--out rules.md]`);
    process.exit(0);
  }

  const files = [];
  for (const p of flags.paths) walkFiles(p, files);
  const unique = [...new Set(files)].sort();

  const sources = [];
  const facts = [];
  const excerpts = [];
  let okCount = 0;

  for (const filePath of unique) {
    const result = extractText(filePath);
    const rel = path.relative(CWD, filePath);
    const entry = {
      path: filePath,
      relative: rel,
      ok: result.ok,
      reason: result.reason,
      factCount: result.facts.length,
      textBytes: result.text ? result.text.length : 0,
    };
    sources.push(entry);
    if (!result.ok) continue;
    okCount++;
    for (const f of result.facts) facts.push(f);
    if (result.text && result.text.trim()) {
      // Prioritize character md and README
      const name = path.basename(filePath);
      if (
        name.endsWith('.md') ||
        name.endsWith('.txt') ||
        name === 'README.md'
      ) {
        excerpts.push({ name, path: rel, text: result.text });
      }
    }
  }

  // Prefer character docs first in excerpts
  excerpts.sort((a, b) => {
    const score = (n) =>
      (/-character\.md$/i.test(n) || n === 'clawd-character.md' ? 0 : 10) +
      (n === 'README.md' ? 1 : 5);
    return score(a.name) - score(b.name);
  });

  const rulesBody = renderRules({ sources: sources.filter((s) => s.ok), facts, excerpts: excerpts.slice(0, 12) });
  const rulesPath =
    flags.out ||
    path.join(CWD, '.grok', 'rules', 'knowledge-inject.md');
  const manifestPath = path.join(CWD, '.grok', 'knowledge-inject.manifest.json');

  const manifest = {
    generatedAt: new Date().toISOString(),
    packageRoot: PACKAGE_ROOT,
    cwd: CWD,
    inputPaths: flags.paths,
    sourceCount: sources.length,
    okCount,
    factCount: facts.length,
    excerptCount: excerpts.length,
    rulesPath,
    dryRun: flags.dryRun,
    sources,
    factIds: facts.map((f) => f.id).filter(Boolean).slice(0, 500),
    hash: createHash('sha256').update(rulesBody).digest('hex'),
  };

  if (okCount === 0) {
    console.error(
      'knowledge-inject: no extractable knowledge (okCount=0). Refusing to overwrite inject targets.',
    );
    console.error(`Tried ${sources.length} file(s) under: ${flags.paths.join(', ')}`);
    process.exit(1);
  }

  if (flags.dryRun) {
    console.log(JSON.stringify({ dryRun: true, ...manifest, rulesPreviewBytes: rulesBody.length }, null, 2));
    console.log(`\n[dry-run] would write ${rulesPath} (${rulesBody.length} bytes)`);
    process.exit(0);
  }

  fs.mkdirSync(path.dirname(rulesPath), { recursive: true });
  fs.mkdirSync(path.dirname(manifestPath), { recursive: true });
  fs.writeFileSync(rulesPath, rulesBody, 'utf8');
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');

  let membrain = null;
  if (process.env.MEMBRAIN_SKIP_KNOWLEDGE_INGEST !== '1') {
    try {
      const { ingestKnowledgeFacts } = await import(
        pathToFileURL(path.join(PACKAGE_ROOT, 'robinhood-src', 'membrainMemory.js')).href
      );
      membrain = await ingestKnowledgeFacts(facts, {
        adapter: process.env.MEMBRAIN_ADAPTER || 'file',
        agentId: process.env.CLAWD_PREMIERE_AGENT || 'elizero',
        source: 'knowledge-inject',
      });
    } catch (err) {
      membrain = { skipped: true, error: err.message };
    }
  }

  console.log(`✓ knowledge inject`);
  console.log(`  rules: ${rulesPath}`);
  console.log(`  manifest: ${manifestPath}`);
  console.log(`  ok files: ${okCount}/${sources.length}`);
  console.log(`  facts: ${facts.length}`);
  console.log(`  excerpts: ${excerpts.length}`);
  if (membrain?.ingested) {
    console.log(`  membrain: ${membrain.ingested} facts → ${membrain.adapter} (${membrain.agentId})`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
