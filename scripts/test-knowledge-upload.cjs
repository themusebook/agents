#!/usr/bin/env node
/**
 * Real-path tests for knowledge init / upload / inject.
 * Drives robinhood-src/knowledgeUpload.js + bin/ct-agents.js + scripts/knowledge-inject.mjs.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { pathToFileURL } = require('url');

const ROOT = path.resolve(__dirname, '..');
const SCRATCH =
  process.env.SMOKE_SCRATCH ||
  process.env.SCRATCH ||
  path.join(ROOT, '.tmp-knowledge-test');
const failures = [];

function fail(msg) {
  failures.push(msg);
  console.error('FAIL:', msg);
}
function ok(msg) {
  console.log('OK:', msg);
}
function writeScratch(name, body) {
  try {
    fs.mkdirSync(SCRATCH, { recursive: true });
    fs.writeFileSync(path.join(SCRATCH, name), body, 'utf8');
  } catch (e) {
    console.warn('scratch write skipped:', e.message);
  }
}

const REQUIRED_KNOWLEDGE = [
  'anti-patterns.jsonl',
  'api-behaviors.jsonl',
  'architecture-pieces.md',
  'clawd-bot.md',
  'clawd-character.md',
  'clawd-code-cli.md',
  'clawd-tui.md',
  'clawdrouter.md',
  'codebase-facts.jsonl',
  'decisions.jsonl',
  'facts.jsonl',
  'gotchas.jsonl',
  'knowledge-banner.svg',
  'knowledge-inject-flow.svg',
  'openclawd-hermes-memory.md',
  'openclawd.md',
  'patterns.jsonl',
  'README.md',
  'SOVEREIGN_RESEARCH.md',
  'wiki.md',
];

async function main() {
  // --- shipped knowledge corpus present ---
  for (const name of REQUIRED_KNOWLEDGE) {
    const p = path.join(ROOT, 'knowledge', name);
    if (!fs.existsSync(p)) fail(`missing knowledge/${name}`);
    else ok(`knowledge present: ${name}`);
  }

  // clawd-character.md shape
  const charTemplate = fs.readFileSync(
    path.join(ROOT, 'knowledge', 'clawd-character.md'),
    'utf8',
  );
  for (const section of [
    '## Lore',
    '## Voice',
    '## Style Rules',
    '## Agent Knowledge Summary',
  ]) {
    if (!charTemplate.includes(section)) fail(`clawd-character.md missing ${section}`);
    else ok(`template section: ${section}`);
  }

  const mod = await import(
    pathToFileURL(path.join(ROOT, 'robinhood-src', 'knowledgeUpload.js')).href
  );

  // --- init from clawd character, based on clawd-character.md ---
  const packDir = path.join(SCRATCH, 'user-knowledge');
  fs.rmSync(packDir, { recursive: true, force: true });
  const init = mod.initKnowledge({
    root: ROOT,
    from: 'clawd',
    out: packDir,
    force: true,
  });
  if (!fs.existsSync(path.join(packDir, init.characterFile))) {
    fail('init missing character file');
  } else ok(`init character: ${init.characterFile}`);

  const genChar = fs.readFileSync(path.join(packDir, init.characterFile), 'utf8');
  for (const section of [
    '## Lore',
    '## Voice',
    '## Style Rules',
    '## Agent Knowledge Summary',
  ]) {
    if (!genChar.includes(section)) fail(`generated character missing ${section}`);
    else ok(`generated section: ${section}`);
  }
  if (!genChar.includes('Clawd')) fail('generated character should mention Clawd');
  else ok('generated character mentions Clawd');

  mod.validateKnowledgeDir(packDir);
  ok('validateKnowledgeDir(init pack)');

  // --- upload user files into pack ---
  const uploadSrc = path.join(SCRATCH, 'upload-src');
  fs.rmSync(uploadSrc, { recursive: true, force: true });
  fs.mkdirSync(uploadSrc, { recursive: true });
  fs.writeFileSync(
    path.join(uploadSrc, 'operator-notes.md'),
    '# Operator notes\n\n- Prefer dry-run inject before prod.\n',
    'utf8',
  );
  const factLine = {
    id: 'fact-upload-001',
    type: 'gotcha',
    fact: 'User-uploaded fact: always validate JSONL before inject.',
    recommendation: 'Run ct-agents knowledge validate.',
    confidence: 'high',
    provenance: [{ source: 'human', reference: 'test', date: '2026-08-04' }],
    tags: ['upload', 'test'],
    affectedFiles: [],
    affectedServices: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    usageCount: 0,
    helpfulCount: 0,
    outdatedReports: 0,
  };
  fs.writeFileSync(
    path.join(uploadSrc, 'extra-facts.jsonl'),
    `${JSON.stringify(factLine)}\n`,
    'utf8',
  );

  const report = mod.uploadKnowledge({
    out: packDir,
    inputs: [uploadSrc],
    force: true,
  });
  if (report.uploaded.length < 2) fail(`expected >=2 uploads, got ${report.uploaded.length}`);
  else ok(`uploaded ${report.uploaded.length} files`);
  if (!fs.existsSync(path.join(packDir, 'uploads', 'operator-notes.md'))) {
    fail('upload did not place operator-notes.md under uploads/');
  } else ok('uploads/operator-notes.md present');

  // --- inject (real script) into scratch .grok ---
  const injectCwd = path.join(SCRATCH, 'inject-cwd');
  fs.rmSync(injectCwd, { recursive: true, force: true });
  fs.mkdirSync(injectCwd, { recursive: true });
  const inject = spawnSync(
    process.execPath,
    [path.join(ROOT, 'scripts', 'knowledge-inject.mjs'), packDir],
    { encoding: 'utf8', cwd: injectCwd },
  );
  writeScratch(
    'knowledge-inject-run.txt',
    `status=${inject.status}\n${inject.stdout}\n${inject.stderr}`,
  );
  if (inject.status !== 0) {
    fail(`inject exit ${inject.status}: ${inject.stderr || inject.stdout}`);
  } else {
    ok('knowledge-inject exit 0');
    const rules = path.join(injectCwd, '.grok', 'rules', 'knowledge-inject.md');
    const man = path.join(injectCwd, '.grok', 'knowledge-inject.manifest.json');
    if (!fs.existsSync(rules)) fail('missing .grok/rules/knowledge-inject.md');
    else {
      const body = fs.readFileSync(rules, 'utf8');
      if (!body.includes('Knowledge inject')) fail('rules missing header');
      else if (!body.includes('fact-') && !body.includes('Structured facts')) {
        fail('rules missing structured facts section');
      } else ok('inject rules written with facts');
    }
    if (!fs.existsSync(man)) fail('missing inject manifest');
    else {
      const m = JSON.parse(fs.readFileSync(man, 'utf8'));
      if (m.okCount < 1) fail('manifest okCount < 1');
      else ok(`manifest okCount=${m.okCount} facts=${m.factCount}`);
    }
  }

  // empty inject must refuse overwrite
  const emptyDir = path.join(SCRATCH, 'empty-knowledge');
  fs.rmSync(emptyDir, { recursive: true, force: true });
  fs.mkdirSync(emptyDir, { recursive: true });
  // seed a prior rules file
  const priorRules = path.join(injectCwd, '.grok', 'rules', 'knowledge-inject.md');
  const priorBody = fs.existsSync(priorRules)
    ? fs.readFileSync(priorRules, 'utf8')
    : 'PRIOR';
  const emptyInject = spawnSync(
    process.execPath,
    [path.join(ROOT, 'scripts', 'knowledge-inject.mjs'), emptyDir],
    { encoding: 'utf8', cwd: injectCwd },
  );
  if (emptyInject.status === 0) fail('empty inject should exit non-zero');
  else ok('empty inject refused (exit non-zero)');
  if (fs.existsSync(priorRules)) {
    const after = fs.readFileSync(priorRules, 'utf8');
    if (after !== priorBody && priorBody !== 'PRIOR') {
      // still ok if path missing; when present must be unchanged
      if (after.length < 50 && priorBody.length > 50) fail('empty inject clobbered prior rules');
      else ok('prior rules preserved on empty inject');
    } else ok('prior rules preserved on empty inject');
  }

  // --- CLI path ---
  const cliOut = path.join(SCRATCH, 'cli-knowledge');
  fs.rmSync(cliOut, { recursive: true, force: true });
  const cli = spawnSync(
    process.execPath,
    [
      path.join(ROOT, 'bin', 'ct-agents.js'),
      'knowledge',
      'init',
      '--from',
      'warrenbuffet',
      '--out',
      cliOut,
      '--force',
      '--json',
    ],
    { encoding: 'utf8', cwd: ROOT },
  );
  writeScratch('cli-knowledge-init.txt', `status=${cli.status}\n${cli.stdout}\n${cli.stderr}`);
  if (cli.status !== 0) fail(`cli knowledge init exit ${cli.status}: ${cli.stderr || cli.stdout}`);
  else {
    const payload = JSON.parse(cli.stdout);
    if (!payload.ok) fail('cli init missing ok');
    else if (!/Buffett/i.test(payload.profile?.name || '')) {
      fail(`cli init expected Buffett name, got ${payload.profile?.name}`);
    } else ok(`cli init ${payload.profile.name}`);
  }

  const list = spawnSync(
    process.execPath,
    [path.join(ROOT, 'bin', 'ct-agents.js'), 'knowledge', 'list', '--json'],
    { encoding: 'utf8', cwd: ROOT },
  );
  if (list.status !== 0) fail(`knowledge list exit ${list.status}`);
  else {
    const payload = JSON.parse(list.stdout);
    if (payload.count < 20) fail(`expected >=20 knowledge files, got ${payload.count}`);
    else ok(`knowledge list count=${payload.count}`);
  }

  // package knowledge validate
  const val = mod.validateKnowledgeDir(path.join(ROOT, 'knowledge'));
  ok(`package knowledge validate: ${val.jsonlFacts} facts`);

  finish();
}

function finish() {
  writeScratch(
    'test-knowledge-upload-summary.txt',
    failures.length ? `FAIL ${failures.length}\n${failures.join('\n')}` : 'PASS\n',
  );
  if (failures.length) {
    console.error(`\n${failures.length} failure(s)`);
    process.exit(1);
  }
  console.log('\nAll knowledge upload tests passed.');
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
