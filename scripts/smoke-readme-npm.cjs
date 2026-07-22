#!/usr/bin/env node
/**
 * Smoke: README branding + package.json + real CLI entry agree.
 * Drives bin/ct-agents.js (shipped entry) — not a reimplementation.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const SCRATCH = process.env.SMOKE_SCRATCH || '';
const failures = [];

function fail(msg) {
  failures.push(msg);
  console.error('FAIL:', msg);
}

function ok(msg) {
  console.log('OK:', msg);
}

function writeScratch(name, body) {
  if (!SCRATCH) return;
  try {
    fs.mkdirSync(SCRATCH, { recursive: true });
    fs.writeFileSync(path.join(SCRATCH, name), body, 'utf8');
  } catch (e) {
    console.warn('scratch write skipped:', e.message);
  }
}

const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const readme = fs.readFileSync(path.join(ROOT, 'README.md'), 'utf8');
const catalog = JSON.parse(fs.readFileSync(path.join(ROOT, 'agents-catalog.json'), 'utf8'));
const stats = catalog.stats || {};

// --- README structure / branding ---
if (!/^# Clawd Agents/m.test(readme)) {
  fail('README must have H1 "Clawd Agents"');
} else {
  ok('README brands Clawd Agents');
}

if (!readme.includes('public/assets/cheshire-terminal-agents.svg')) {
  fail('README must link hero SVG under public/assets/');
} else {
  ok('README hero SVG present');
}

if (!/ONE-SHOT INSTALL|one-shot install|npx cheshire-terminal-agents/i.test(readme)) {
  fail('README must front one-shot install with npx cheshire-terminal-agents');
} else {
  ok('README one-shot install present');
}

const version = pkg.version;
if (!readme.includes(version)) {
  fail(`README must mention package version ${version}`);
} else {
  ok(`README version matches package.json (${version})`);
}

if (!readme.includes(pkg.name)) {
  fail(`README must mention npm name ${pkg.name}`);
} else {
  ok(`README npm name matches (${pkg.name})`);
}

for (const bin of Object.keys(pkg.bin || {})) {
  if (!readme.includes(bin)) {
    fail(`README must document bin "${bin}"`);
  } else {
    ok(`README documents bin ${bin}`);
  }
}

// Nested packages must not be claimed as published on npm
const privateClaims = [
  /npm i(?:nstall)?\s+@cheshire\/clawd-agent-tui/i,
  /npm i(?:nstall)?\s+@cheshire\/headless-agent/i,
  /www\.npmjs\.com\/package\/@cheshire%2fclawd-agent-tui/i,
  /www\.npmjs\.com\/package\/@cheshire\/clawd-agent-tui/i,
];
for (const re of privateClaims) {
  if (re.test(readme)) {
    fail(`README falsely suggests private package install: ${re}`);
  }
}
if (/Private.*unpublished|source only|not on npm/i.test(readme)) {
  ok('README documents nested packages as private/unpublished');
} else {
  fail('README should state nested @cheshire/* packages are private/unpublished');
}

// Catalog count consistency
const totalAgents = stats.totalAgents;
if (totalAgents == null) {
  fail('agents-catalog.json missing stats.totalAgents');
} else if (!readme.includes(String(totalAgents))) {
  fail(`README must mention catalog agent count ${totalAgents}`);
} else {
  ok(`README agent count matches catalog (${totalAgents})`);
}

// Description brands Clawd
if (!/Clawd Agents/i.test(pkg.description || '')) {
  fail('package.json description must brand Clawd Agents');
} else {
  ok('package.json description brands Clawd Agents');
}

// --- Real CLI entry (twice) ---
const binPath = path.join(ROOT, 'bin', 'ct-agents.js');
if (!fs.existsSync(binPath)) {
  fail('missing bin/ct-agents.js');
}

function runCli(args) {
  return spawnSync(process.execPath, [binPath, ...args], {
    cwd: ROOT,
    encoding: 'utf8',
    env: { ...process.env, NO_COLOR: '1', FORCE_COLOR: '0' },
  });
}

function stripAnsi(s) {
  return String(s || '').replace(/\x1b\[[0-9;]*m/g, '');
}

const helpRuns = [];
for (let i = 0; i < 2; i++) {
  const r = runCli(['--help']);
  if (r.status !== 0) {
    fail(`ct-agents --help run ${i + 1} exited ${r.status}: ${r.stderr}`);
  }
  helpRuns.push(stripAnsi(r.stdout + r.stderr));
}
writeScratch('cli-help.log', helpRuns.join('\n--- run 2 ---\n'));

const helpText = helpRuns[0];
if (!/catalog/i.test(helpText) || !/cheshire-terminal-agents|ct-agents/i.test(helpText)) {
  fail('help output missing catalog / package usage');
} else {
  ok('CLI --help shows forge usage (run ×2)');
}
if (helpRuns[0].includes('catalog') !== helpRuns[1].includes('catalog')) {
  fail('help runs inconsistent on primary keyword catalog');
}

const catalogRuns = [];
for (let i = 0; i < 2; i++) {
  const r = runCli(['catalog']);
  if (r.status !== 0) {
    fail(`ct-agents catalog run ${i + 1} exited ${r.status}: ${r.stderr}`);
  }
  catalogRuns.push(stripAnsi(r.stdout));
}
writeScratch('cli-catalog.log', catalogRuns.join('\n--- run 2 ---\n'));

let parsed;
try {
  parsed = JSON.parse(catalogRuns[0].trim());
} catch (e) {
  fail(`catalog output is not JSON: ${e.message}\n${catalogRuns[0].slice(0, 200)}`);
}

if (parsed) {
  if (!(parsed.agents > 0)) {
    fail(`catalog agents must be > 0, got ${parsed.agents}`);
  } else {
    ok(`CLI catalog returns agents=${parsed.agents}`);
  }
  if (!Array.isArray(parsed.categories) || parsed.categories.length === 0) {
    fail('catalog categories must be non-empty array');
  } else {
    ok(`CLI catalog categories=${parsed.categories.length}`);
  }
  if (parsed.agents !== totalAgents) {
    fail(`CLI catalog agents ${parsed.agents} !== catalog stats ${totalAgents}`);
  } else {
    ok('CLI catalog agents matches agents-catalog.json stats');
  }
  try {
    const p2 = JSON.parse(catalogRuns[1].trim());
    if (p2.agents !== parsed.agents) {
      fail(`catalog run2 agents ${p2.agents} !== run1 ${parsed.agents}`);
    } else {
      ok('CLI catalog consistent across two runs');
    }
  } catch (e) {
    fail(`catalog run2 not JSON: ${e.message}`);
  }
}

// README excerpt for evidence
const excerpt = readme.split('\n').slice(0, 80).join('\n');
writeScratch('readme-smoke.txt', excerpt);

// Pack dry-check: files list includes README + bin + catalog
const files = pkg.files || [];
for (const must of ['README.md', 'bin/', 'agents-catalog.json']) {
  if (!files.some((f) => f === must || f.startsWith(must.replace(/\/$/, '')))) {
    // bin/ is listed as "bin/" in files
    if (!files.includes(must)) {
      fail(`package.json files[] must include ${must}`);
    } else {
      ok(`files[] includes ${must}`);
    }
  } else {
    ok(`files[] includes ${must}`);
  }
}

if (failures.length) {
  console.error(`\n${failures.length} smoke failure(s)`);
  process.exit(1);
}
console.log('\nsmoke-readme-npm: all checks passed');
process.exit(0);
