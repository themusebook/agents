#!/usr/bin/env node
/**
 * Membrain is the default memory source for catalog agents.
 * Uses the in-memory adapter — no membraned process required.
 */
'use strict';

const path = require('path');
const fs = require('fs');
const os = require('os');
const { pathToFileURL } = require('url');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const failures = [];

function fail(msg) {
  failures.push(msg);
  console.error('FAIL:', msg);
}
function ok(msg) {
  console.log('OK:', msg);
}

async function main() {
  const goMod = path.join(ROOT, 'packages', 'membrain', 'go.mod');
  if (!fs.existsSync(goMod)) fail('missing packages/membrain/go.mod');
  else ok('packages/membrain copied');

  const proto = path.join(ROOT, 'packages', 'membrain', 'api', 'proto', 'membrane', 'v1', 'membrane.proto');
  if (!fs.existsSync(proto)) fail('missing membrane.proto');
  else ok('membrane proto present');

  const httpApi = path.join(ROOT, 'packages', 'membrain', 'api', 'http', 'server.go');
  if (!fs.existsSync(httpApi)) fail('missing JSON HTTP API');
  else ok('JSON HTTP API present');

  const mod = await import(pathToFileURL(path.join(ROOT, 'robinhood-src/membrainMemory.js')).href);

  const def = mod.defaultAgentMemory('elizero');
  if (def.source !== 'membrain') fail(`default source=${def.source}`);
  else ok('default memory source=membrain');
  if (def.agentId !== 'elizero') fail(`default agentId=${def.agentId}`);
  else ok('premiere agentId=elizero');

  const resolved = mod.resolveAgentMemory({ identifier: 'solana-spot-trader' });
  if (resolved.source !== 'membrain' || resolved.agentId !== 'solana-spot-trader') {
    fail(`resolveAgentMemory drifted: ${JSON.stringify(resolved)}`);
  } else ok('omitted config.memory still resolves to membrain');

  const disabled = mod.resolveAgentMemory({ identifier: 'x', config: { memory: { source: 'none' } } });
  if (disabled.enabled !== false) fail('source=none should disable memory');
  else ok('source=none disables memory');

  const store = await mod.createStore({ adapter: 'memory', agentId: 'elizero' });
  const rec = await store.ingestEvent({
    summary: 'Swapped 2.3 SOL → USDC via Jupiter',
    eventKind: 'swap_executed',
    tags: ['jupiter', 'SOL'],
  });
  if (!rec?.id) fail('ingestEvent missing id');
  else ok('ingestEvent wrote episodic record');

  await store.ingestObservation({
    subject: '$CLAWD',
    predicate: 'liquidity_pattern',
    object: 'volume peaks 2-4pm UTC',
    tags: ['market-pattern'],
  });
  ok('ingestObservation wrote semantic record');

  const hits = await store.retrieve('Jupiter SOL swap', { minSalience: 0 });
  if (!hits.some((h) => String(mod.recordSummary(h)).includes('Jupiter'))) {
    fail(`retrieve missed swap: ${JSON.stringify(hits.map(mod.recordSummary))}`);
  } else ok('retrieve found swap memory');

  const ctx = await store.contextForAgent('elizero');
  if (!ctx || !ctx.includes('Membrain memory')) fail('contextForAgent missing header');
  else ok('contextForAgent injects Membrain block');

  const metrics = await store.getMetrics();
  if (metrics.total_records < 2) fail(`expected >=2 records, got ${metrics.total_records}`);
  else ok(`metrics total_records=${metrics.total_records}`);

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'membrain-file-'));
  const fileStore = await mod.createStore({ adapter: 'file', agentId: 'elizero', storeDir: tmp });
  await fileStore.ingestEvent({ summary: 'file-backed recall' });
  const disk = path.join(tmp, 'elizero.json');
  if (!fs.existsSync(disk)) fail('file adapter did not persist');
  else ok('file adapter persisted .membrain-agent-store shape');

  const facts = await mod.ingestKnowledgeFacts(
    [{ id: 'fact-001', type: 'gotcha', fact: 'Never invent CLAWD decimals', tags: ['clawd'] }],
    { adapter: 'memory', agentId: 'elizero' },
  );
  if (facts.ingested !== 1) fail(`knowledge ingest count=${facts.ingested}`);
  else ok('knowledge facts ingest into Membrain');

  const bin = path.join(ROOT, 'bin', 'ct-agents.js');
  const status = spawnSync(process.execPath, [bin, 'memory', 'status'], {
    cwd: ROOT,
    encoding: 'utf8',
    env: { ...process.env, MEMBRAIN_ADAPTER: 'memory' },
  });
  if (status.status !== 0) fail(`memory status exit ${status.status}: ${status.stderr || status.stdout}`);
  else {
    const payload = JSON.parse(status.stdout);
    if (payload.source !== 'membrain') fail(`CLI source=${payload.source}`);
    else ok('ct-agents memory status source=membrain');
  }

  const ingest = spawnSync(
    process.execPath,
    [bin, 'memory', 'ingest', '--agent', 'elizero', '--summary', 'CLI swap note', '--adapter', 'memory'],
    { cwd: ROOT, encoding: 'utf8', env: { ...process.env, MEMBRAIN_ADAPTER: 'memory' } },
  );
  if (ingest.status !== 0) fail(`memory ingest exit ${ingest.status}: ${ingest.stderr || ingest.stdout}`);
  else ok('ct-agents memory ingest');

  const elizero = JSON.parse(fs.readFileSync(path.join(ROOT, 'agents', 'elizero.json'), 'utf8'));
  if (elizero.config?.memory?.source !== 'membrain') fail('elizero hub memory.source must be membrain');
  else ok('elizero hub pins Membrain');

  finish();
}

function finish() {
  if (failures.length) {
    console.error(`\n${failures.length} failure(s)`);
    process.exit(1);
  }
  console.log('\nAll membrain memory tests passed.');
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
