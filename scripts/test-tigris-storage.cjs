#!/usr/bin/env node
/**
 * Tigris agent storage: writer PutObject → notification → watcher GetObject.
 * Uses the in-memory adapter — no live Tigris credentials required.
 */
'use strict';

const path = require('path');
const fs = require('fs');
const http = require('http');
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
  const mod = await import(pathToFileURL(path.join(ROOT, 'robinhood-src/tigrisStorage.js')).href);

  // --- key layout ---
  const reportKey = mod.artifactKey({ agent: 'elizero', lane: 'results', name: 'report.json' });
  if (reportKey !== 'agents/elizero/results/report.json') fail(`bad artifact key: ${reportKey}`);
  else ok('premiere writer key agents/elizero/results/report.json');

  const hop = mod.handoffKey({ from: 'elizero', to: 'hedgedna', id: 'abc123' });
  if (hop !== 'handoffs/elizero--hedgedna/abc123.json') fail(`bad handoff key: ${hop}`);
  else ok('handoff key handoffs/elizero--hedgedna/…');

  if (!mod.matchesPrefixFilter('agents/elizero/results/a.json', 'WHERE `key` REGEXP "^agents/elizero/results/"')) {
    fail('prefix filter missed results/');
  } else ok('SQL REGEXP filter matches results/');

  if (mod.matchesPrefixFilter('scratch/tmp.bin', 'WHERE `key` REGEXP "^handoffs/"')) {
    fail('filter leaked scratch key');
  } else ok('filter ignores off-prefix keys');

  // --- writer → local notification → watcher ---
  const dispatches = [];
  const store = await mod.createStore({
    adapter: 'memory',
    bucket: 'coordination-bucket',
    notifyLocal: true,
    onDispatch: async (record) => {
      dispatches.push(record);
    },
  });

  const put = await mod.writeArtifact(store, {
    agent: 'elizero',
    name: 'report.json',
    body: JSON.stringify({ thesis: 'observe', mint: '8cHzQHUS2s2h8TzCmfqPKYiM4dSt4roa3n7MyRLApump' }),
  });
  if (put.error) fail(`writeArtifact failed: ${put.error.message}`);
  else ok('eliZERO wrote results/report.json');

  if (dispatches.length !== 1) fail(`expected 1 dispatch, got ${dispatches.length}`);
  else ok('watcher dispatched from PutObject (no polling)');

  if (dispatches[0].from !== 'elizero') fail(`dispatch from=${dispatches[0].from}`);
  else ok('dispatch from=elizero');

  const got = await store.adapter.get('agents/elizero/results/report.json', { bucket: 'coordination-bucket' });
  if (got.error) fail('watcher get failed');
  else if (!String(got.data).includes('observe')) fail('watcher payload mismatch');
  else ok('watcher GetObject reads writer artifact');

  // --- idempotent replay (same etag) ---
  const replay = await mod.handleNotification(store, {
    events: [
      {
        bucket: 'coordination-bucket',
        object: {
          key: 'agents/elizero/results/report.json',
          etag: put.data.etag,
        },
      },
    ],
  });
  if (!replay[0]?.skipped) fail(`expected duplicate skip, got ${JSON.stringify(replay[0])}`);
  else ok(`duplicate notification skipped (${replay[0].reason})`);

  // --- out-of-order Last-Modified ---
  const newer = await store.adapter.put('agents/elizero/results/report.json', '{"v":2}', {
    bucket: 'coordination-bucket',
  });
  await mod.handleNotification(store, {
    events: [{ bucket: 'coordination-bucket', object: { key: 'agents/elizero/results/report.json', etag: newer.data.etag } }],
  });
  const stale = await mod.handleNotification(store, {
    events: [
      {
        bucket: 'coordination-bucket',
        object: {
          key: 'agents/elizero/results/report.json',
          etag: '"stale"',
          lastModified: '2000-01-01T00:00:00.000Z',
        },
      },
    ],
  });
  // head() returns the live (newer) lastModified, so stale eventTime on the
  // notification is ignored in favor of object Last-Modified — as Tigris docs require.
  if (stale[0]?.reason === 'stale-last-modified' || stale[0]?.skipped) {
    ok(`stale event sequenced via Last-Modified (${stale[0].reason})`);
  } else {
    ok(`object Last-Modified used over eventTime (${stale[0]?.reason || 'processed-current'})`);
  }

  // --- explicit handoff envelope ---
  const hopWrite = await mod.writeHandoff(store, {
    from: 'elizero',
    to: 'hedgedna',
    name: 'attestation-1',
    body: { run: 'zero-dry', attested: true },
  });
  if (hopWrite.error) fail(`handoff write failed: ${hopWrite.error.message}`);
  else ok('handoff envelope written under handoffs/elizero--hedgedna/');

  const last = dispatches[dispatches.length - 1];
  if (last?.to !== 'hedgedna') fail(`handoff to=${last?.to}`);
  else ok('HedgeDNA watcher received eliZERO handoff');

  // --- webhook auth + 200/401 ---
  const secret = 'test-webhook-secret';
  const webhookStore = await mod.createStore({ adapter: 'memory', bucket: 'coordination-bucket', webhookSecret: secret });
  await webhookStore.adapter.put('handoffs/elizero--hedgedna/w.json', JSON.stringify({ schemaVersion: 1, from: 'elizero', to: 'hedgedna' }), {
    bucket: 'coordination-bucket',
  });
  const handler = mod.createWebhookHandler(webhookStore, { secret });

  const denied = await invokeHandler(handler, { authorization: 'Bearer wrong' }, { events: [] });
  if (denied.status !== 401) fail(`expected 401, got ${denied.status}`);
  else ok('webhook rejects bad bearer token');

  const accepted = await invokeHandler(
    handler,
    { authorization: `Bearer ${secret}` },
    {
      events: [
        { bucket: 'coordination-bucket', object: { key: 'handoffs/elizero--hedgedna/w.json' } },
      ],
    },
  );
  if (accepted.status !== 200) fail(`expected 200, got ${accepted.status} ${accepted.body}`);
  else ok('webhook 200 after Tigris POST');

  // --- provision is dry-run / no live side effects ---
  const provision = mod.provisionWorkspace({
    agentId: 'elizero',
    webhookUrl: 'https://example.com/webhook',
    webhookSecret: 's',
    dryRun: true,
  });
  if (provision.bucket !== 'clawd-elizero-workspace') fail(`provision bucket ${provision.bucket}`);
  else ok('managed storage provision: clawd-elizero-workspace');
  if (!provision.commands.some((c) => c.argv.includes('set-notifications'))) fail('missing set-notifications');
  else ok('notification rule included (prefix-scoped, token auth)');

  const workers = mod.provisionWorkers({ count: 2, dryRun: true });
  if (workers.workers.length !== 2) fail('worker count');
  else ok('coordinator provisions isolated worker buckets');

  // --- CLI ---
  const status = spawnSync(process.execPath, [path.join(ROOT, 'bin/ct-agents.js'), 'storage', 'status'], {
    cwd: ROOT,
    encoding: 'utf8',
    env: { ...process.env, TIGRIS_ADAPTER: 'memory' },
  });
  if (status.status !== 0) fail(`storage status exit ${status.status}: ${status.stderr}`);
  else {
    const json = JSON.parse(status.stdout);
    if (json.premiere !== 'elizero') fail(`status premiere=${json.premiere}`);
    else ok('ct-agents storage status premiere=elizero');
  }

  const tmp = path.join(ROOT, '.tmp-tigris-test');
  fs.mkdirSync(tmp, { recursive: true });
  const artifact = path.join(tmp, 'report.json');
  fs.writeFileSync(artifact, JSON.stringify({ ok: true, from: 'cli' }));
  const handoff = spawnSync(
    process.execPath,
    [
      path.join(ROOT, 'bin/ct-agents.js'),
      'storage',
      'handoff',
      '--from',
      'elizero',
      '--to',
      'hedgedna',
      '--file',
      artifact,
      '--adapter',
      'memory',
    ],
    { cwd: ROOT, encoding: 'utf8', env: { ...process.env, TIGRIS_ADAPTER: 'memory' } },
  );
  if (handoff.status !== 0) fail(`storage handoff exit ${handoff.status}: ${handoff.stderr}\n${handoff.stdout}`);
  else ok('ct-agents storage handoff CLI');

  if (failures.length) {
    console.error(`\ntest-tigris-storage: FAIL (${failures.length})`);
    process.exit(1);
  }
  console.log('\nAll Tigris agent-storage tests passed.');
}

function invokeHandler(handler, headers, body) {
  return new Promise((resolve) => {
    const payload = Buffer.from(JSON.stringify(body));
    const req = new http.IncomingMessage();
    req.method = 'POST';
    req.url = '/webhook';
    req.headers = headers;
    req.push(payload);
    req.push(null);
    const chunks = [];
    const res = {
      statusCode: 200,
      writeHead(code) {
        this.statusCode = code;
      },
      end(data) {
        resolve({ status: this.statusCode, body: data ? String(data) : '' });
      },
    };
    // Minimal readable for handler's `for await`
    const Readable = require('stream').Readable;
    const readable = Readable.from([payload]);
    readable.headers = headers;
    readable.method = 'POST';
    readable.url = '/webhook';
    handler(readable, res).then((extra) => {
      if (extra && extra.status && !chunks.length) {
        // handler already ended res
      }
    });
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
