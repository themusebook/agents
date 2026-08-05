#!/usr/bin/env node
/**
 * Real-path tests for agentic DNA generation.
 * Drives robinhood-src/dnaGenerate.js + bin/ct-agents.js — not a reimplementation.
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
  path.join(ROOT, '.tmp-dna-test');
const OUT = path.join(SCRATCH, 'generated-dna');
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

async function main() {
  // --- characters dir must ship with listed seeds ---
  const requiredCharacters = [
    'alice-character-json.json',
    'bengraham.json',
    'billackman.json',
    'cathiewood.json',
    'charliemunger.json',
    'cheshire-character-json.json',
    'clawd.json',
    'hedgefund.json',
    'mad-hatter-character-json.json',
    'package.json',
    'warrenbuffet.json',
  ];
  for (const file of requiredCharacters) {
    const p = path.join(ROOT, 'characters', file);
    if (!fs.existsSync(p)) fail(`missing character file: characters/${file}`);
    else ok(`character present: ${file}`);
  }

  // --- dna templates present ---
  for (const file of [
    'IDENTITY.MD',
    'SOUL.MD',
    'TOOLS.MD',
    'USER.MD',
    'BOOTSTRAP.MD.COMPLETED',
  ]) {
    const p = path.join(ROOT, 'dna', file);
    if (!fs.existsSync(p)) fail(`missing dna template: dna/${file}`);
    else ok(`dna template: ${file}`);
  }

  // --- load shipped generator (real module) ---
  const modPath = path.join(ROOT, 'robinhood-src', 'dnaGenerate.js');
  if (!fs.existsSync(modPath)) {
    fail('missing robinhood-src/dnaGenerate.js');
    finish();
    return;
  }
  const dna = await import(pathToFileURL(modPath).href);

  const listed = dna.listCharacters(ROOT);
  if (!listed.length) fail('listCharacters returned empty');
  else ok(`listCharacters: ${listed.length} seeds`);

  const clawd = listed.find((c) => c.id === 'clawd' || c.name === 'Clawd');
  if (!clawd) fail('clawd character not listed');
  else ok(`found seed: ${clawd.id}`);

  // --- generate from clawd character into scratch ---
  fs.rmSync(OUT, { recursive: true, force: true });
  const result = dna.generateDna({
    root: ROOT,
    from: 'clawd',
    out: OUT,
    force: true,
    user: { userName: 'Test Human', timezone: 'UTC' },
  });

  const expectedFiles = [
    'IDENTITY.md',
    'SOUL.md',
    'TOOLS.md',
    'USER.md',
    'BOOTSTRAP.md',
    'persona.json',
    'index.json',
    'character.seed.json',
    'README.md',
  ];
  for (const f of expectedFiles) {
    const p = path.join(OUT, f);
    if (!fs.existsSync(p)) fail(`generated missing: ${f}`);
    else if (!fs.readFileSync(p, 'utf8').trim()) fail(`generated empty: ${f}`);
    else ok(`generated: ${f}`);
  }

  const identity = fs.readFileSync(path.join(OUT, 'IDENTITY.md'), 'utf8');
  if (!identity.includes('Clawd')) fail('IDENTITY.md must include character name Clawd');
  else ok('IDENTITY.md contains Clawd');

  const user = fs.readFileSync(path.join(OUT, 'USER.md'), 'utf8');
  if (!user.includes('Test Human')) fail('USER.md must include --user value');
  else ok('USER.md contains Test Human');

  const persona = JSON.parse(fs.readFileSync(path.join(OUT, 'persona.json'), 'utf8'));
  if (persona?.persona?.name !== 'Clawd') fail('persona.json name must be Clawd');
  else ok('persona.json name Clawd');

  dna.validateDnaBundle(OUT);
  ok('validateDnaBundle(clawd out)');

  // --- generate from investor-format character ---
  const buffettOut = path.join(SCRATCH, 'buffett-dna');
  fs.rmSync(buffettOut, { recursive: true, force: true });
  const buffett = dna.generateDna({
    root: ROOT,
    from: 'warrenbuffet',
    out: buffettOut,
    force: true,
  });
  const buffettId = fs.readFileSync(path.join(buffettOut, 'IDENTITY.md'), 'utf8');
  if (!/Warren Buffett/i.test(buffettId)) fail('warrenbuffet DNA must name Warren Buffett');
  else ok('warrenbuffet IDENTITY names Warren Buffett');
  if (!buffett.profile.principles.length && !buffett.profile.adjectives.length) {
    fail('warrenbuffet profile should extract principles or adjectives');
  } else ok('warrenbuffet profile normalized fields');

  // --- blank custom agent (no --from) ---
  const customOut = path.join(SCRATCH, 'custom-dna');
  fs.rmSync(customOut, { recursive: true, force: true });
  const custom = dna.generateDna({
    root: ROOT,
    out: customOut,
    force: true,
    overrides: {
      name: 'Nova',
      creature: 'Solana research familiar',
      vibe: 'warm, precise',
      emoji: '✨',
    },
  });
  if (custom.profile.name !== 'Nova') fail('custom name override failed');
  else ok('custom DNA name Nova');
  const novaId = fs.readFileSync(path.join(customOut, 'IDENTITY.md'), 'utf8');
  if (!novaId.includes('Nova') || !novaId.includes('✨')) fail('custom IDENTITY incomplete');
  else ok('custom IDENTITY has name+emoji');

  // --- drive shipped CLI entry ---
  const cliOut = path.join(SCRATCH, 'cli-dna');
  fs.rmSync(cliOut, { recursive: true, force: true });
  const cli = spawnSync(
    process.execPath,
    [
      path.join(ROOT, 'bin', 'ct-agents.js'),
      'dna',
      'generate',
      '--from',
      'cheshire-character-json',
      '--out',
      cliOut,
      '--force',
      '--json',
    ],
    { encoding: 'utf8', cwd: ROOT },
  );
  writeScratch('cli-dna-generate.txt', `status=${cli.status}\n${cli.stdout}\n${cli.stderr}`);
  if (cli.status !== 0) fail(`ct-agents dna generate exit ${cli.status}: ${cli.stderr || cli.stdout}`);
  else {
    ok('ct-agents dna generate exit 0');
    try {
      const payload = JSON.parse(cli.stdout);
      if (!payload.ok) fail('CLI json missing ok');
      else if (!fs.existsSync(path.join(cliOut, 'SOUL.md'))) fail('CLI did not write SOUL.md');
      else ok(`CLI wrote DNA for ${payload.name}`);
    } catch (e) {
      fail(`CLI json parse: ${e.message}`);
    }
  }

  const list = spawnSync(
    process.execPath,
    [path.join(ROOT, 'bin', 'ct-agents.js'), 'dna', 'list', '--json'],
    { encoding: 'utf8', cwd: ROOT },
  );
  writeScratch('cli-dna-list.txt', list.stdout || list.stderr || '');
  if (list.status !== 0) fail(`dna list exit ${list.status}`);
  else {
    const payload = JSON.parse(list.stdout);
    if (payload.count < 10) fail(`expected >=10 characters, got ${payload.count}`);
    else ok(`dna list count=${payload.count}`);
  }

  finish();
}

function finish() {
  writeScratch(
    'test-dna-generate-summary.txt',
    failures.length
      ? `FAIL ${failures.length}\n${failures.join('\n')}`
      : 'PASS\n',
  );
  if (failures.length) {
    console.error(`\n${failures.length} failure(s)`);
    process.exit(1);
  }
  console.log('\nAll dna generate tests passed.');
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
