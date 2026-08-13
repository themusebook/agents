/**
 * Tigris agent storage — event-driven handoffs, no polling.
 *
 * Writer puts an artifact. Tigris object notifications POST the webhook.
 * Watcher reads the object (Last-Modified for order, ETag for idempotency).
 *
 * Adapters:
 *  - memory  tests / in-process
 *  - file    local dry-run under .tigris-agent-store/
 *  - live    @tigrisdata/storage when installed + credentials present
 *
 * Usage (via ct-agents):
 *   ct-agents storage status
 *   ct-agents storage put --from elizero --file ./report.json
 *   ct-agents storage handoff --from elizero --to hedgedna --file ./report.json
 *   ct-agents storage webhook --port 8788
 */

import fs from 'fs';
import http from 'http';
import path from 'path';
import crypto from 'crypto';
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const PACKAGE_ROOT = path.join(__dirname, '..');

function loadProjectEnv() {
  const seen = new Set();
  for (const file of [path.join(PACKAGE_ROOT, '.env'), path.join(process.cwd(), '.env')]) {
    const resolved = path.resolve(file);
    if (seen.has(resolved) || !fs.existsSync(resolved)) continue;
    seen.add(resolved);
    for (const raw of fs.readFileSync(resolved, 'utf8').split(/\r?\n/)) {
      const line = raw.trim();
      if (!line || line.startsWith('#')) continue;
      const eq = line.indexOf('=');
      if (eq < 1) continue;
      const key = line.slice(0, eq).trim();
      if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;
      if (process.env[key]) continue;
      let value = line.slice(eq + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      process.env[key] = value;
    }
  }
}

loadProjectEnv();

export const TIGRIS_ENDPOINT = 'https://t3.storage.dev';
export const PREMIERE_AGENT_ID = 'elizero';

export const LANES = {
  results: 'results',
  processed: 'processed',
  handoffs: 'handoffs',
  scratch: 'scratch',
};

const DEFAULT_BUCKET = 'clawd-agent-coordination';

// ─── config ──────────────────────────────────────────────────────────────────

export function loadStorageConfig(overrides = {}) {
  return {
    bucket: overrides.bucket || process.env.TIGRIS_STORAGE_BUCKET || DEFAULT_BUCKET,
    endpoint: overrides.endpoint || process.env.TIGRIS_STORAGE_ENDPOINT || TIGRIS_ENDPOINT,
    accessKeyId: overrides.accessKeyId || process.env.TIGRIS_STORAGE_ACCESS_KEY_ID || '',
    secretAccessKey: overrides.secretAccessKey || process.env.TIGRIS_STORAGE_SECRET_ACCESS_KEY || '',
    webhookSecret: overrides.webhookSecret || process.env.TIGRIS_WEBHOOK_SECRET || process.env.WEBHOOK_SECRET || '',
    webhookUrl: overrides.webhookUrl || process.env.TIGRIS_WEBHOOK_URL || '',
    storeDir: overrides.storeDir || process.env.TIGRIS_AGENT_STORE || path.join(process.cwd(), '.tigris-agent-store'),
    premiereAgent: overrides.premiereAgent || process.env.CLAWD_PREMIERE_AGENT || PREMIERE_AGENT_ID,
    adapter: overrides.adapter || process.env.TIGRIS_ADAPTER || inferAdapter(overrides),
  };
}

function inferAdapter(overrides = {}) {
  if (overrides.adapter) return overrides.adapter;
  if (process.env.TIGRIS_ADAPTER) return process.env.TIGRIS_ADAPTER;
  if (process.env.TIGRIS_STORAGE_ACCESS_KEY_ID && process.env.TIGRIS_STORAGE_SECRET_ACCESS_KEY) {
    return 'live';
  }
  return 'file';
}

export function hasLiveCredentials(config = loadStorageConfig()) {
  return Boolean(config.accessKeyId && config.secretAccessKey);
}

// ─── keys ────────────────────────────────────────────────────────────────────

export function slugifyAgent(id) {
  return (
    String(id || PREMIERE_AGENT_ID)
      .toLowerCase()
      .replace(/[^a-z0-9._-]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 48) || PREMIERE_AGENT_ID
  );
}

export function artifactKey({ agent = PREMIERE_AGENT_ID, lane = LANES.results, name = 'artifact.json' } = {}) {
  const cleanName = String(name).replace(/^\/+/, '');
  if (lane === LANES.handoffs) return `${LANES.handoffs}/${cleanName}`;
  return `agents/${slugifyAgent(agent)}/${lane}/${cleanName}`;
}

export function handoffKey({ from, to, id }) {
  const stamp = id || crypto.randomBytes(6).toString('hex');
  return artifactKey({
    lane: LANES.handoffs,
    name: `${slugifyAgent(from)}--${slugifyAgent(to)}/${stamp}.json`,
  });
}

export function parseAgentFromKey(key) {
  const agents = String(key || '').match(/^agents\/([^/]+)\//);
  if (agents) return agents[1];
  const handoff = String(key || '').match(/^handoffs\/([^/]+)--([^/]+)\//);
  if (handoff) return { from: handoff[1], to: handoff[2] };
  return null;
}

export function matchesPrefixFilter(key, filter) {
  if (!filter) return true;
  const text = String(filter);
  const regexpMatch = text.match(/REGEXP\s+["'`]([^"'`]+)["'`]/i);
  if (regexpMatch) {
    try {
      return new RegExp(regexpMatch[1]).test(key);
    } catch {
      return key.startsWith(regexpMatch[1].replace(/^\^/, '').replace(/\/$/, '') + '/');
    }
  }
  if (text.endsWith('/')) return key.startsWith(text);
  return key.includes(text);
}

// ─── adapters ────────────────────────────────────────────────────────────────

function etagFor(body) {
  return `"${crypto.createHash('sha256').update(body).digest('hex')}"`;
}

function asBuffer(body) {
  if (Buffer.isBuffer(body)) return body;
  if (typeof body === 'string') return Buffer.from(body);
  if (body instanceof Uint8Array) return Buffer.from(body);
  return Buffer.from(JSON.stringify(body));
}

export function createMemoryAdapter() {
  const objects = new Map();
  return {
    kind: 'memory',
    async put(key, body, { bucket, contentType } = {}) {
      const buf = asBuffer(body);
      const meta = {
        bucket,
        key,
        size: buf.length,
        etag: etagFor(buf),
        lastModified: new Date().toISOString(),
        contentType: contentType || 'application/octet-stream',
      };
      objects.set(`${bucket}:${key}`, { buf, meta });
      return { data: { ...meta, path: key } };
    },
    async get(key, { bucket } = {}) {
      const hit = objects.get(`${bucket}:${key}`);
      if (!hit) return { error: new Error(`not found: ${bucket}/${key}`) };
      return { data: hit.buf.toString('utf8'), meta: { ...hit.meta } };
    },
    async head(key, { bucket } = {}) {
      const hit = objects.get(`${bucket}:${key}`);
      if (!hit) return { error: new Error(`not found: ${bucket}/${key}`) };
      return { data: { ...hit.meta } };
    },
    async list({ bucket, prefix = '' } = {}) {
      const items = [];
      for (const [id, rec] of objects) {
        if (!id.startsWith(`${bucket}:`)) continue;
        const key = id.slice(bucket.length + 1);
        if (prefix && !key.startsWith(prefix)) continue;
        items.push({ ...rec.meta });
      }
      return { data: items.sort((a, b) => a.key.localeCompare(b.key)) };
    },
    async remove(key, { bucket } = {}) {
      objects.delete(`${bucket}:${key}`);
      return { data: undefined };
    },
  };
}

export function createFileAdapter(rootDir) {
  const root = rootDir || path.join(process.cwd(), '.tigris-agent-store');

  function objectPath(bucket, key) {
    return path.join(root, bucket, key);
  }
  function metaPath(bucket, key) {
    return `${objectPath(bucket, key)}.meta.json`;
  }

  return {
    kind: 'file',
    root,
    async put(key, body, { bucket, contentType } = {}) {
      const buf = asBuffer(body);
      const file = objectPath(bucket, key);
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, buf);
      const meta = {
        bucket,
        key,
        size: buf.length,
        etag: etagFor(buf),
        lastModified: new Date().toISOString(),
        contentType: contentType || 'application/octet-stream',
      };
      fs.writeFileSync(metaPath(bucket, key), JSON.stringify(meta, null, 2));
      return { data: { ...meta, path: key } };
    },
    async get(key, { bucket } = {}) {
      const file = objectPath(bucket, key);
      if (!fs.existsSync(file)) return { error: new Error(`not found: ${bucket}/${key}`) };
      const buf = fs.readFileSync(file);
      const meta = fs.existsSync(metaPath(bucket, key))
        ? JSON.parse(fs.readFileSync(metaPath(bucket, key), 'utf8'))
        : { bucket, key, size: buf.length, etag: etagFor(buf), lastModified: new Date().toISOString() };
      return { data: buf.toString('utf8'), meta };
    },
    async head(key, { bucket } = {}) {
      const got = await this.get(key, { bucket });
      if (got.error) return got;
      return { data: got.meta };
    },
    async list({ bucket, prefix = '' } = {}) {
      const dir = path.join(root, bucket);
      if (!fs.existsSync(dir)) return { data: [] };
      const items = [];
      function walk(current, rel) {
        for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
          if (entry.name.endsWith('.meta.json')) continue;
          const next = path.join(current, entry.name);
          const nextRel = rel ? `${rel}/${entry.name}` : entry.name;
          if (entry.isDirectory()) walk(next, nextRel);
          else if (!prefix || nextRel.startsWith(prefix)) {
            const metaFile = `${next}.meta.json`;
            if (fs.existsSync(metaFile)) items.push(JSON.parse(fs.readFileSync(metaFile, 'utf8')));
            else {
              const buf = fs.readFileSync(next);
              items.push({ bucket, key: nextRel, size: buf.length, etag: etagFor(buf) });
            }
          }
        }
      }
      walk(dir, '');
      return { data: items.sort((a, b) => a.key.localeCompare(b.key)) };
    },
    async remove(key, { bucket } = {}) {
      const file = objectPath(bucket, key);
      if (fs.existsSync(file)) fs.unlinkSync(file);
      if (fs.existsSync(metaPath(bucket, key))) fs.unlinkSync(metaPath(bucket, key));
      return { data: undefined };
    },
  };
}

export async function createLiveAdapter(config = loadStorageConfig()) {
  let sdk;
  try {
    sdk = await import('@tigrisdata/storage');
  } catch (err) {
    throw new Error(
      `live adapter requires @tigrisdata/storage (${err.message}). Install it or use --adapter file`
    );
  }
  const sdkConfig = {
    bucket: config.bucket,
    accessKeyId: config.accessKeyId,
    secretAccessKey: config.secretAccessKey,
    endpoint: config.endpoint,
  };
  return {
    kind: 'live',
    async put(key, body, { bucket, contentType } = {}) {
      return sdk.put(key, asBuffer(body), {
        contentType,
        config: { ...sdkConfig, bucket: bucket || sdkConfig.bucket },
      });
    },
    async get(key, { bucket } = {}) {
      const result = await sdk.get(key, 'string', {
        config: { ...sdkConfig, bucket: bucket || sdkConfig.bucket },
      });
      if (result.error) return result;
      const head = await sdk.head(key, { config: { ...sdkConfig, bucket: bucket || sdkConfig.bucket } });
      return { data: result.data, meta: head.data || { key, bucket } };
    },
    async head(key, { bucket } = {}) {
      return sdk.head(key, { config: { ...sdkConfig, bucket: bucket || sdkConfig.bucket } });
    },
    async list({ bucket, prefix = '' } = {}) {
      return sdk.list({
        prefix,
        config: { ...sdkConfig, bucket: bucket || sdkConfig.bucket },
      });
    },
    async remove(key, { bucket } = {}) {
      return sdk.remove(key, { config: { ...sdkConfig, bucket: bucket || sdkConfig.bucket } });
    },
    async setNotifications(bucket, notificationConfig) {
      if (typeof sdk.setBucketNotifications !== 'function') {
        return { error: new Error('setBucketNotifications not available in this SDK version') };
      }
      return sdk.setBucketNotifications(bucket, { notificationConfig, config: sdkConfig });
    },
  };
}

export async function createAdapter(config = loadStorageConfig()) {
  if (config.adapter === 'memory') return createMemoryAdapter();
  if (config.adapter === 'live') return createLiveAdapter(config);
  return createFileAdapter(config.storeDir);
}

// ─── processed / idempotency ─────────────────────────────────────────────────

export function processedId({ bucket, key, etag }) {
  return `${bucket}:${key}:${etag || ''}`;
}

export function createProcessedSet(filePath) {
  const seen = new Map();
  if (filePath && fs.existsSync(filePath)) {
    try {
      const raw = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      for (const [id, rec] of Object.entries(raw)) seen.set(id, rec);
    } catch {
      // start empty
    }
  }
  return {
    has(id) {
      return seen.has(id);
    },
    add(id, rec) {
      seen.set(id, rec);
      if (filePath) {
        fs.mkdirSync(path.dirname(filePath), { recursive: true });
        fs.writeFileSync(filePath, JSON.stringify(Object.fromEntries(seen), null, 2));
      }
    },
    get(id) {
      return seen.get(id);
    },
    get size() {
      return seen.size;
    },
  };
}

export function shouldProcessEvent(event, previous, { now = Date.now() } = {}) {
  if (!previous) return { process: true, reason: 'first-seen' };
  const prevTs = Date.parse(previous.lastModified || '') || 0;
  const nextTs = Date.parse(event.lastModified || event.eventTime || '') || now;
  if (nextTs < prevTs) return { process: false, reason: 'stale-last-modified' };
  if (event.etag && previous.etag && event.etag === previous.etag) {
    return { process: false, reason: 'duplicate-etag' };
  }
  return { process: true, reason: 'newer-version' };
}

// ─── notifications ───────────────────────────────────────────────────────────

export function normalizeNotificationEvents(body) {
  const raw = Array.isArray(body?.events)
    ? body.events
    : body?.event
      ? [body.event]
      : Array.isArray(body)
        ? body
        : [];
  return raw
    .map((event) => {
      const object = event.object || event.s3?.object || {};
      return {
        bucket: event.bucket || event.Bucket || event.s3?.bucket?.name,
        key: object.key || event.key || event.objectKey,
        size: object.size ?? event.size ?? null,
        etag: object.etag || object.eTag || object.ETag || event.etag || null,
        eventTime: event.eventTime || event.event_time || event.time || null,
        eventName: event.eventName || event.event || object.eventName || 'ObjectCreated',
        lastModified: object.lastModified || object.LastModified || event.lastModified || null,
      };
    })
    .filter((event) => event.bucket && event.key);
}

export function verifyWebhookAuth(headers = {}, secret = '') {
  if (!secret) return { ok: true, mode: 'open' };
  const auth = headers.authorization || headers.Authorization || '';
  const bearer = auth.match(/^Bearer\s+(.+)$/i);
  if (bearer && bearer[1] === secret) return { ok: true, mode: 'bearer' };
  const token = headers['x-webhook-token'] || headers['X-Webhook-Token'];
  if (token && token === secret) return { ok: true, mode: 'header' };
  return { ok: false, mode: 'denied' };
}

export async function handleNotification(store, body, options = {}) {
  const events = normalizeNotificationEvents(body);
  const results = [];
  for (const event of events) {
    if (options.filter && !matchesPrefixFilter(event.key, options.filter)) {
      results.push({ event, skipped: true, reason: 'filter' });
      continue;
    }
    const head = await store.adapter.head(event.key, { bucket: event.bucket });
    const lastModified = head.data?.lastModified || head.data?.modified || event.lastModified || event.eventTime;
    const etag = head.data?.etag || event.etag;
    const enriched = { ...event, lastModified, etag };
    const id = processedId(enriched);
    const previous = store.processed.get(id) || store.processed.get(`${event.bucket}:${event.key}:`);
    const decision = shouldProcessEvent(enriched, previous);
    if (!decision.process) {
      results.push({ event: enriched, skipped: true, reason: decision.reason });
      continue;
    }
    const got = await store.adapter.get(event.key, { bucket: event.bucket });
    if (got.error) {
      results.push({ event: enriched, error: got.error.message });
      continue;
    }
    const dispatch = await (options.dispatch || defaultDispatch)(store, enriched, got);
    const rec = { ...enriched, processedAt: new Date().toISOString() };
    store.processed.add(id, rec);
    store.processed.add(`${event.bucket}:${event.key}:`, rec);
    results.push({ event: enriched, dispatched: dispatch, reason: decision.reason });
  }
  return results;
}

export async function defaultDispatch(store, event, got) {
  const parsed = parseAgentFromKey(event.key);
  let envelope = null;
  if (typeof got.data === 'string' && got.data.trim().startsWith('{')) {
    try {
      envelope = JSON.parse(got.data);
    } catch {
      envelope = null;
    }
  }
  const to = envelope?.to || parsed?.to || store.config.premiereAgent;
  const from = envelope?.from || parsed?.from || parsed || 'unknown';
  const record = {
    kind: envelope?.schemaVersion ? 'handoff' : 'artifact',
    from,
    to,
    bucket: event.bucket,
    key: event.key,
    etag: event.etag,
    lastModified: event.lastModified,
    bytes: Buffer.byteLength(got.data || ''),
  };
  if (typeof store.onDispatch === 'function') {
    await store.onDispatch(record, { event, envelope, data: got.data });
  }
  return record;
}

// ─── writer / watcher ────────────────────────────────────────────────────────

export async function writeArtifact(store, { agent, name, body, lane = LANES.results, contentType } = {}) {
  const key = artifactKey({ agent, lane, name });
  const put = await store.adapter.put(key, body, {
    bucket: store.config.bucket,
    contentType: contentType || (typeof body === 'string' && body.trim().startsWith('{') ? 'application/json' : undefined),
  });
  if (put.error) return put;
  const event = {
    bucket: store.config.bucket,
    key,
    size: put.data?.size,
    etag: put.data?.etag,
    lastModified: put.data?.lastModified || put.data?.modified,
    eventName: 'ObjectCreated:Put',
  };
  let dispatched = null;
  if (store.notifyLocal) {
    dispatched = await handleNotification(store, { events: [event] }, { dispatch: store.dispatch });
  }
  return { data: { ...put.data, key, event, dispatched } };
}

export async function writeHandoff(store, { from, to, name, body, artifactKey: sourceKey } = {}) {
  const envelope = {
    schemaVersion: 1,
    kind: 'agent-handoff',
    from: slugifyAgent(from || store.config.premiereAgent),
    to: slugifyAgent(to),
    artifactKey: sourceKey || null,
    writtenAt: new Date().toISOString(),
    payload: typeof body === 'string' ? tryJson(body) : body,
  };
  const key = handoffKey({ from: envelope.from, to: envelope.to, id: name });
  return writeArtifact(store, {
    agent: envelope.from,
    lane: LANES.handoffs,
    name: key.replace(/^handoffs\//, ''),
    body: JSON.stringify(envelope, null, 2),
    contentType: 'application/json',
  });
}

function tryJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

export async function createStore(options = {}) {
  const config = loadStorageConfig(options);
  const adapter = options.adapterImpl || (await createAdapter(config));
  const processed = options.processed || createProcessedSet(options.processedFile);
  const store = {
    config,
    adapter,
    processed,
    notifyLocal: options.notifyLocal !== false && adapter.kind !== 'live',
    onDispatch: options.onDispatch || null,
    dispatch: options.dispatch,
  };
  store.dispatch = options.dispatch || ((s, event, got) => defaultDispatch(s, event, got));
  return store;
}

// ─── managed storage (CLI spawn) ─────────────────────────────────────────────

export function tigrisCliAvailable() {
  const which = spawnSync(process.platform === 'win32' ? 'where' : 'which', ['tigris'], {
    encoding: 'utf8',
  });
  return which.status === 0;
}

export function provisionWorkspace({ agentId, bucket, webhookUrl, webhookSecret, filter, dryRun = true } = {}) {
  const agent = slugifyAgent(agentId || PREMIERE_AGENT_ID);
  const name = bucket || `clawd-${agent}-workspace`;
  const notifyFilter = filter || `WHERE \`key\` REGEXP "^agents/${agent}/results/|^handoffs/"`;
  const commands = [
    ['mb', name],
    ...(webhookUrl
      ? [
          [
            'buckets',
            'set-notifications',
            name,
            '--url',
            webhookUrl,
            '--filter',
            notifyFilter,
            ...(webhookSecret ? ['--token', webhookSecret] : []),
          ],
        ]
      : []),
  ];
  const ran = [];
  for (const args of commands) {
    if (dryRun) {
      ran.push({ dryRun: true, argv: ['tigris', ...args] });
      continue;
    }
    const result = spawnSync('tigris', args, { encoding: 'utf8' });
    ran.push({
      argv: ['tigris', ...args],
      status: result.status,
      stdout: result.stdout,
      stderr: result.stderr,
    });
  }
  return {
    agent,
    bucket: name,
    filter: notifyFilter,
    webhookUrl: webhookUrl || null,
    dryRun,
    commands: ran,
  };
}

export function workerPolicy(bucket) {
  return {
    Version: '2012-10-17',
    Statement: [
      {
        Effect: 'Allow',
        Action: ['s3:GetObject', 's3:PutObject', 's3:ListBucket'],
        Resource: [`arn:aws:s3:::${bucket}`, `arn:aws:s3:::${bucket}/*`],
      },
    ],
  };
}

export function provisionWorkers({ count = 2, prefix = 'worker', dryRun = true } = {}) {
  const workers = [];
  for (let i = 1; i <= Number(count); i++) {
    const bucket = `${prefix}-${i}-data`;
    const policy = workerPolicy(bucket);
    const commands = [
      ['mb', bucket],
      ['access-keys', 'create', '--name', `${prefix}-${i}-key`, '--policy', JSON.stringify(policy)],
    ];
    workers.push({
      id: `${prefix}-${i}`,
      bucket,
      policy,
      commands: dryRun ? commands.map((argv) => ({ dryRun: true, argv: ['tigris', ...argv] })) : commands,
    });
  }
  return { count: workers.length, dryRun, workers };
}

// ─── webhook server ──────────────────────────────────────────────────────────

export function createWebhookHandler(store, { secret, filter } = {}) {
  return async function handle(req, res) {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const raw = Buffer.concat(chunks).toString('utf8');
    const auth = verifyWebhookAuth(req.headers, secret ?? store.config.webhookSecret);
    if (!auth.ok) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'unauthorized' }));
      return { status: 401 };
    }
    let body;
    try {
      body = raw ? JSON.parse(raw) : {};
    } catch {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'invalid json' }));
      return { status: 400 };
    }
    try {
      const results = await handleNotification(store, body, { filter });
      const failed = results.some((row) => row.error);
      res.writeHead(failed ? 500 : 200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: !failed, results }));
      return { status: failed ? 500 : 200, results };
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
      return { status: 500 };
    }
  };
}

export function serveWebhook(store, { port = 8788, secret, filter } = {}) {
  const handler = createWebhookHandler(store, { secret, filter });
  const server = http.createServer((req, res) => {
    if (req.method === 'GET' && (req.url === '/health' || req.url === '/')) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, service: 'tigris-agent-storage', premiere: store.config.premiereAgent }));
      return;
    }
    const url = String(req.url || '').split('?')[0];
    if (req.method !== 'POST' || (url !== '/webhook' && url !== '/' && url !== '/tigris')) {
      res.writeHead(405, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'method not allowed' }));
      return;
    }
    handler(req, res);
  });
  return new Promise((resolve) => {
    server.listen(port, () => resolve({ server, port, url: `http://127.0.0.1:${port}/webhook` }));
  });
}

// ─── CLI ─────────────────────────────────────────────────────────────────────

function parseFlags(args) {
  const flags = { _: [] };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--json') flags.json = true;
    else if (a === '--help' || a === '-h') flags.help = true;
    else if (a === '--dry-run') flags['dry-run'] = true;
    else if (a === '--notify-local') flags['notify-local'] = true;
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
    } else flags._.push(a);
  }
  return flags;
}

function printHelp() {
  console.log(`
Usage:
  ct-agents storage status
  ct-agents storage provision --agent elizero [--url https://host/webhook] [--dry-run]
  ct-agents storage workers --count 3 [--dry-run]
  ct-agents storage put --from elizero --file ./report.json [--name report.json]
  ct-agents storage get --key agents/elizero/results/report.json
  ct-agents storage handoff --from elizero --to hedgedna --file ./report.json
  ct-agents storage replay --event ./notification.json
  ct-agents storage webhook --port 8788

Env:
  TIGRIS_STORAGE_BUCKET  TIGRIS_STORAGE_ACCESS_KEY_ID  TIGRIS_STORAGE_SECRET_ACCESS_KEY
  TIGRIS_WEBHOOK_SECRET  TIGRIS_WEBHOOK_URL  TIGRIS_ADAPTER=memory|file|live

Pattern: writer PutObject → Tigris notification POST → watcher GetObject. No polling.
`);
}

export async function runTigrisStorageCli(argv = [], root = PACKAGE_ROOT) {
  const args = [...argv];
  const sub = args[0] && !args[0].startsWith('-') ? args.shift() : 'help';
  const flags = parseFlags(args);
  if (sub === 'help' || flags.help) {
    printHelp();
    return 0;
  }

  const config = loadStorageConfig({
    adapter: flags.adapter,
    bucket: flags.bucket,
    storeDir: flags.store || flags['store-dir'],
    webhookSecret: flags.token || flags.secret,
    webhookUrl: flags.url,
    premiereAgent: flags.from || flags.agent,
  });

  if (sub === 'status') {
    const payload = {
      premiere: config.premiereAgent,
      adapter: config.adapter,
      bucket: config.bucket,
      endpoint: config.endpoint,
      liveCredentials: hasLiveCredentials(config),
      tigrisCli: tigrisCliAvailable(),
      webhookUrl: config.webhookUrl || null,
      lanes: LANES,
      docs: {
        coordination: 'https://www.tigrisdata.com/docs/use-cases/agent-coordination/',
        managed: 'https://www.tigrisdata.com/docs/use-cases/agent-managed-storage/',
      },
    };
    console.log(JSON.stringify(payload, null, 2));
    return 0;
  }

  if (sub === 'provision') {
    const report = provisionWorkspace({
      agentId: flags.agent || flags.from || config.premiereAgent,
      bucket: flags.bucket || config.bucket,
      webhookUrl: flags.url || config.webhookUrl,
      webhookSecret: flags.token || config.webhookSecret,
      filter: flags.filter,
      dryRun: flags['dry-run'] !== false && flags.live !== true,
    });
    console.log(JSON.stringify(report, null, 2));
    return 0;
  }

  if (sub === 'workers') {
    const report = provisionWorkers({
      count: flags.count || 2,
      prefix: flags.prefix || 'worker',
      dryRun: flags['dry-run'] !== false && flags.live !== true,
    });
    console.log(JSON.stringify(report, null, 2));
    return 0;
  }

  const store = await createStore({
    ...config,
    notifyLocal: flags['notify-local'] !== false,
    processedFile: path.join(config.storeDir, '_processed.json'),
  });

  if (sub === 'put') {
    const file = flags.file || flags._[0];
    if (!file) {
      console.error('storage put requires --file');
      return 1;
    }
    const body = fs.readFileSync(file);
    const name = flags.name || path.basename(file);
    const result = await writeArtifact(store, {
      agent: flags.from || flags.agent || config.premiereAgent,
      name,
      body,
      lane: flags.lane || LANES.results,
    });
    if (result.error) {
      console.error(result.error.message || result.error);
      return 1;
    }
    console.log(JSON.stringify({ ok: true, ...result.data }, null, 2));
    return 0;
  }

  if (sub === 'get') {
    const key = flags.key || flags._[0];
    if (!key) {
      console.error('storage get requires --key');
      return 1;
    }
    const result = await store.adapter.get(key, { bucket: flags.bucket || config.bucket });
    if (result.error) {
      console.error(result.error.message || result.error);
      return 1;
    }
    if (flags.json) console.log(JSON.stringify({ ok: true, key, meta: result.meta, data: result.data }, null, 2));
    else process.stdout.write(String(result.data));
    return 0;
  }

  if (sub === 'handoff') {
    const file = flags.file || flags._[0];
    const to = flags.to;
    if (!file || !to) {
      console.error('storage handoff requires --to and --file');
      return 1;
    }
    const body = fs.readFileSync(file, 'utf8');
    const result = await writeHandoff(store, {
      from: flags.from || config.premiereAgent,
      to,
      name: flags.name,
      body,
    });
    if (result.error) {
      console.error(result.error.message || result.error);
      return 1;
    }
    console.log(JSON.stringify({ ok: true, ...result.data }, null, 2));
    return 0;
  }

  if (sub === 'replay') {
    const file = flags.event || flags.file || flags._[0];
    if (!file) {
      console.error('storage replay requires --event <notification.json>');
      return 1;
    }
    const body = JSON.parse(fs.readFileSync(file, 'utf8'));
    const results = await handleNotification(store, body, { filter: flags.filter });
    console.log(JSON.stringify({ ok: true, results }, null, 2));
    return results.some((row) => row.error) ? 1 : 0;
  }

  if (sub === 'webhook' || sub === 'serve') {
    const port = Number(flags.port || 8788);
    const { server } = await serveWebhook(store, {
      port,
      secret: flags.token || config.webhookSecret,
      filter: flags.filter,
    });
    console.log(JSON.stringify({ ok: true, port, premiere: config.premiereAgent, adapter: store.adapter.kind }, null, 2));
    if (flags.once) {
      server.close();
      return 0;
    }
    await new Promise(() => {});
  }

  printHelp();
  return sub === 'help' ? 0 : 1;
}

export {
  DEFAULT_BUCKET,
};
