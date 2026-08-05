/**
 * Smoke tests for skills multi-select TUI helpers + skills CLI surface.
 */
const assert = require('assert');
const path = require('path');
const { pathToFileURL } = require('url');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const BIN = path.join(ROOT, 'bin', 'ct-agents.js');

async function main() {
  const mod = await import(pathToFileURL(path.join(ROOT, 'robinhood-src', 'skillsTui.js')).href);
  assert.equal(typeof mod.runSkillsTui, 'function');
  assert.equal(typeof mod.pickSkillsForAgent, 'function');
  assert.equal(typeof mod.parseSelectionTokens, 'function');

  const r1 = mod.parseSelectionTokens('1,3,5', { total: 10 });
  assert.deepEqual(r1.absolute, [0, 2, 4]);

  const r2 = mod.parseSelectionTokens('2-4', { total: 10 });
  assert.deepEqual(r2.absolute, [1, 2, 3]);

  const r3 = mod.parseSelectionTokens('a', { total: 10 });
  assert.equal(r3.pageAll, true);

  const r4 = mod.parseSelectionTokens('u', { total: 10 });
  assert.equal(r4.pageNone, true);

  // CLI: help / packs still work non-interactively
  const packs = spawnSync(process.execPath, [BIN, 'skills', 'packs', '--json'], {
    cwd: ROOT,
    encoding: 'utf8',
  });
  assert.equal(packs.status, 0, packs.stderr || packs.stdout);
  const packJson = JSON.parse(packs.stdout);
  assert.ok(packJson['cheshire-core'] || packJson.trading, 'expected curated packs');

  const help = spawnSync(process.execPath, [BIN, 'skills', '--help'], {
    cwd: ROOT,
    encoding: 'utf8',
  });
  assert.equal(help.status, 0, help.stderr || help.stdout);
  assert.ok(/pick|multi-select|TUI/i.test(help.stdout), 'help should mention interactive picker');

  // skills-picker.html exists for serve
  const fs = require('fs');
  assert.ok(fs.existsSync(path.join(ROOT, 'public', 'skills-picker.html')));

  console.log('✓ skills TUI smoke ok');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
