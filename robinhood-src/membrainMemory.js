/**
 * Membrain — default selective memory source for Cheshire Terminal agents.
 *
 * Runtime lives in packages/membrain (Go daemon). This module is the Node host
 * that catalog agents, knowledge inject, and `ct-agents memory` talk to.
 *
 * Adapters:
 *  - memory  tests / in-process
 *  - file    local JSON store under .membrain-agent-store/
 *  - live    JSON HTTP to membraned (:9091) when the daemon is up
 *
 * Usage:
 *   ct-agents memory status
 *   ct-agents memory ingest --agent elizero --summary "…"
 *   ct-agents memory retrieve --agent elizero --query "SOL swap"
 *   ct-agents memory context --agent elizero
 *   ct-agents memory start
 */

import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import { spawn, spawnSync } from 'child_process';
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

export const PREMIERE_AGENT_ID = 'elizero';
export const MEMORY_SOURCE = 'membrain';
export const DEFAULT_GRPC = 'localhost:9090';
export const DEFAULT_HTTP = 'http://127.0.0.1:9091';
export const MEMORY_TYPES = ['episodic', 'working', 'semantic', 'competence', 'plan_graph'];
export const DEFAULT_CONTEXT_TYPES = ['episodic', 'semantic', 'competence'];

export function membrainRoot(root = PACKAGE_ROOT) {
  return path.join(root, 'packages', 'membrain');
}

export function agentScope(agentId) {
  return `agent:${agentId || PREMIERE_AGENT_ID}`;
}

export function defaultAgentMemory(agentId = PREMIERE_AGENT_ID) {
  return {
    source: MEMORY_SOURCE,
    agentId: agentId || PREMIERE_AGENT_ID,
    endpoint: process.env.MEMBRAIN_GRPC || DEFAULT_GRPC,
    http: process.env.MEMBRAIN_HTTP_URL || DEFAULT_HTTP,
    autoContext: true,
    contextLimit: 8,
    minSalience: 0.3,
    contextTypes: [...DEFAULT_CONTEXT_TYPES],
    package: 'packages/membrain',
    cli: 'ct-agents memory',
  };
}

export function resolveAgentMemory(agent = {}, fallbackId) {
  const id = agent.identifier || agent.config?.memory?.agentId || fallbackId || PREMIERE_AGENT_ID;
  const configured = agent.memory || agent.config?.memory || {};
  if (configured.source === 'none') {
    return { ...defaultAgentMemory(id), source: 'none', enabled: false };
  }
  return {
    ...defaultAgentMemory(id),
    ...configured,
    source: MEMORY_SOURCE,
    agentId: configured.agentId || id,
    enabled: configured.enabled !== false,
  };
}

export function loadMemoryConfig(overrides = {}) {
  const agentId = overrides.agentId || overrides.agent || process.env.CLAWD_PREMIERE_AGENT || PREMIERE_AGENT_ID;
  const base = defaultAgentMemory(agentId);
  return {
    ...base,
    ...overrides,
    source: MEMORY_SOURCE,
    agentId,
    adapter: overrides.adapter || process.env.MEMBRAIN_ADAPTER || inferAdapter(),
    storeDir:
      overrides.storeDir ||
      process.env.MEMBRAIN_STORE ||
      path.join(process.cwd(), '.membrain-agent-store'),
    grpc: overrides.grpc || overrides.endpoint || process.env.MEMBRAIN_GRPC || DEFAULT_GRPC,
    httpUrl: String(overrides.httpUrl || overrides.http || process.env.MEMBRAIN_HTTP_URL || DEFAULT_HTTP).replace(
      /\/$/,
      '',
    ),
    apiKey: overrides.apiKey || process.env.MEMBRAIN_API_KEY || '',
    dbPath: overrides.dbPath || process.env.MEMBRAIN_DB_PATH || '',
    premiereAgent: overrides.premiereAgent || process.env.CLAWD_PREMIERE_AGENT || PREMIERE_AGENT_ID,
  };
}

function inferAdapter() {
  if (process.env.MEMBRAIN_ADAPTER) return process.env.MEMBRAIN_ADAPTER;
  if (process.env.MEMBRAIN_LIVE === '1' || process.env.MEMBRAIN_HTTP_URL) return 'live';
  return 'file';
}

function nowIso() {
  return new Date().toISOString();
}

function makeRecord({ type, summary, source, tags, scope, sensitivity, payload, confidence, salience }) {
  const ts = nowIso();
  return {
    id: randomUUID(),
    type: type || 'episodic',
    sensitivity: sensitivity || 'low',
    confidence: confidence ?? 0.8,
    salience: salience ?? 0.7,
    scope: scope || '',
    tags: Array.isArray(tags) ? tags : [],
    created_at: ts,
    updated_at: ts,
    lifecycle: {
      last_accessed_at: ts,
      access_count: 0,
      reinforce_count: 0,
    },
    provenance: { source: source || MEMORY_SOURCE },
    payload: payload || { summary: summary || '' },
    audit_log: [{ action: 'ingest', actor: source || MEMORY_SOURCE, at: ts }],
  };
}

function recordSummary(record) {
  const payload = record?.payload && typeof record.payload === 'object' ? record.payload : {};
  if (typeof payload.summary === 'string' && payload.summary) return payload.summary;
  if (typeof payload.content === 'string' && payload.content) return payload.content;
  if (typeof payload.object === 'string' && payload.object) return payload.object;
  if (Array.isArray(payload.timeline)) {
    const hit = payload.timeline.find((e) => typeof e?.summary === 'string' && e.summary);
    if (hit) return hit.summary;
  }
  if (payload.subject && payload.predicate) {
    return `${payload.subject} ${payload.predicate} ${payload.object ?? ''}`.trim();
  }
  return record?.id || '';
}

function tokenize(text) {
  return String(text || '')
    .toLowerCase()
    .split(/[^a-z0-9$]+/i)
    .filter((t) => t.length > 1);
}

function scoreRecord(record, queryTokens) {
  if (!queryTokens.length) return record.salience || 0;
  const hay = tokenize(
    [recordSummary(record), ...(record.tags || []), record.type, record.scope, JSON.stringify(record.payload || {})].join(
      ' ',
    ),
  );
  const haySet = new Set(hay);
  let hits = 0;
  for (const tok of queryTokens) if (haySet.has(tok)) hits += 1;
  const overlap = hits / queryTokens.length;
  return overlap * 0.7 + (Number(record.salience) || 0) * 0.2 + (Number(record.confidence) || 0) * 0.1;
}

class MemoryAdapter {
  constructor() {
    this.kind = 'memory';
    this.records = [];
  }
  async list() {
    return this.records;
  }
  async put(record) {
    this.records.push(record);
    return record;
  }
  async get(id) {
    return this.records.find((r) => r.id === id) || null;
  }
  async update(id, mutator) {
    const rec = this.records.find((r) => r.id === id);
    if (!rec) return null;
    mutator(rec);
    rec.updated_at = nowIso();
    return rec;
  }
}

class FileAdapter {
  constructor(storeDir, agentId) {
    this.kind = 'file';
    this.dir = storeDir;
    this.file = path.join(storeDir, `${agentId || 'shared'}.json`);
    this.records = this.load();
  }
  load() {
    try {
      if (!fs.existsSync(this.file)) return [];
      const parsed = JSON.parse(fs.readFileSync(this.file, 'utf8'));
      return Array.isArray(parsed) ? parsed : parsed.records || [];
    } catch {
      return [];
    }
  }
  persist() {
    fs.mkdirSync(this.dir, { recursive: true });
    fs.writeFileSync(this.file, `${JSON.stringify(this.records, null, 2)}\n`, 'utf8');
  }
  async list() {
    return this.records;
  }
  async put(record) {
    this.records.push(record);
    this.persist();
    return record;
  }
  async get(id) {
    return this.records.find((r) => r.id === id) || null;
  }
  async update(id, mutator) {
    const rec = this.records.find((r) => r.id === id);
    if (!rec) return null;
    mutator(rec);
    rec.updated_at = nowIso();
    this.persist();
    return rec;
  }
}

class LiveAdapter {
  constructor(config) {
    this.kind = 'live';
    this.config = config;
  }
  async call(method, pathname, body) {
    const url = `${this.config.httpUrl}${pathname}`;
    const res = await fetch(url, {
      method,
      headers: {
        'content-type': 'application/json',
        ...(this.config.apiKey ? { authorization: `Bearer ${this.config.apiKey}` } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    let data = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = { error: text };
    }
    if (!res.ok) {
      const err = new Error(data?.error || `membrain http ${res.status}`);
      err.status = res.status;
      err.body = data;
      throw err;
    }
    return data;
  }
  async health() {
    return this.call('GET', '/health');
  }
  async metrics() {
    return this.call('GET', '/metrics');
  }
  async ingestEvent(body) {
    return this.call('POST', '/v1/ingest/event', body);
  }
  async ingestObservation(body) {
    return this.call('POST', '/v1/ingest/observation', body);
  }
  async ingestTool(body) {
    return this.call('POST', '/v1/ingest/tool', body);
  }
  async ingestWorking(body) {
    return this.call('POST', '/v1/ingest/working', body);
  }
  async retrieve(body) {
    return this.call('POST', '/v1/retrieve', body);
  }
  async retrieveById(body) {
    return this.call('POST', '/v1/retrieve/id', body);
  }
  async reinforce(body) {
    return this.call('POST', '/v1/reinforce', body);
  }
  async penalize(body) {
    return this.call('POST', '/v1/penalize', body);
  }
}

function localMetrics(records) {
  const byType = {};
  let salience = 0;
  let confidence = 0;
  for (const rec of records) {
    byType[rec.type] = (byType[rec.type] || 0) + 1;
    salience += Number(rec.salience) || 0;
    confidence += Number(rec.confidence) || 0;
  }
  const n = records.length || 1;
  return {
    total_records: records.length,
    records_by_type: byType,
    avg_salience: salience / n,
    avg_confidence: confidence / n,
    source: MEMORY_SOURCE,
  };
}

export async function createStore(overrides = {}) {
  const config = loadMemoryConfig(overrides);
  let adapter;
  if (config.adapter === 'memory') adapter = new MemoryAdapter();
  else if (config.adapter === 'live') adapter = new LiveAdapter(config);
  else adapter = new FileAdapter(config.storeDir, config.agentId);

  return {
    config,
    adapter,
    async ingestEvent(opts = {}) {
      const source = opts.source || config.agentId;
      const scope = opts.scope || agentScope(config.agentId);
      const tags = [...new Set([...(opts.tags || []), `agent:${config.agentId}`, MEMORY_SOURCE])];
      if (adapter.kind === 'live') {
        return adapter.ingestEvent({
          source,
          event_kind: opts.eventKind || opts.kind || 'agent_event',
          ref: opts.ref || `${source}:${Date.now()}`,
          summary: opts.summary || '',
          tags,
          scope,
          sensitivity: opts.sensitivity || 'low',
        });
      }
      return adapter.put(
        makeRecord({
          type: 'episodic',
          summary: opts.summary,
          source,
          tags,
          scope,
          sensitivity: opts.sensitivity,
          payload: {
            summary: opts.summary || '',
            event_kind: opts.eventKind || opts.kind || 'agent_event',
            ref: opts.ref || `${source}:${Date.now()}`,
            timeline: [{ summary: opts.summary || '', at: nowIso() }],
          },
        }),
      );
    },
    async ingestObservation(opts = {}) {
      const source = opts.source || config.agentId;
      const scope = opts.scope || agentScope(config.agentId);
      const tags = [...new Set([...(opts.tags || []), `agent:${config.agentId}`, MEMORY_SOURCE])];
      const object = opts.object ?? opts.summary ?? '';
      if (adapter.kind === 'live') {
        return adapter.ingestObservation({
          source,
          subject: opts.subject || config.agentId,
          predicate: opts.predicate || 'observed',
          object,
          tags,
          scope,
          sensitivity: opts.sensitivity || 'low',
        });
      }
      return adapter.put(
        makeRecord({
          type: 'semantic',
          summary: typeof object === 'string' ? object : JSON.stringify(object),
          source,
          tags,
          scope,
          sensitivity: opts.sensitivity,
          payload: {
            subject: opts.subject || config.agentId,
            predicate: opts.predicate || 'observed',
            object,
            summary: typeof object === 'string' ? object : opts.summary || '',
          },
        }),
      );
    },
    async ingestToolOutput(opts = {}) {
      const source = opts.source || config.agentId;
      const scope = opts.scope || agentScope(config.agentId);
      const tags = [...new Set([...(opts.tags || []), `agent:${config.agentId}`, 'tool', MEMORY_SOURCE])];
      if (adapter.kind === 'live') {
        return adapter.ingestTool({
          source,
          tool_name: opts.toolName || opts.tool || 'tool',
          args: opts.args || {},
          result: opts.result ?? null,
          tags,
          scope,
          sensitivity: opts.sensitivity || 'low',
        });
      }
      return adapter.put(
        makeRecord({
          type: 'episodic',
          summary: opts.summary || `tool ${opts.toolName || 'tool'}`,
          source,
          tags,
          scope,
          sensitivity: opts.sensitivity,
          payload: {
            tool_name: opts.toolName || opts.tool || 'tool',
            args: opts.args || {},
            result: opts.result ?? null,
            summary: opts.summary || `tool ${opts.toolName || 'tool'}`,
          },
        }),
      );
    },
    async ingestWorkingState(opts = {}) {
      const source = opts.source || config.agentId;
      const scope = opts.scope || agentScope(config.agentId);
      const tags = [...new Set([...(opts.tags || []), `agent:${config.agentId}`, MEMORY_SOURCE])];
      if (adapter.kind === 'live') {
        return adapter.ingestWorking({
          source,
          thread_id: opts.threadId || config.agentId,
          state: opts.state || 'executing',
          next_actions: opts.nextActions || [],
          open_questions: opts.openQuestions || [],
          context_summary: opts.contextSummary || opts.summary || '',
          tags,
          scope,
          sensitivity: opts.sensitivity || 'low',
        });
      }
      return adapter.put(
        makeRecord({
          type: 'working',
          summary: opts.contextSummary || opts.summary || '',
          source,
          tags,
          scope,
          sensitivity: opts.sensitivity,
          payload: {
            thread_id: opts.threadId || config.agentId,
            state: opts.state || 'executing',
            next_actions: opts.nextActions || [],
            summary: opts.contextSummary || opts.summary || '',
          },
        }),
      );
    },
    async retrieve(query, opts = {}) {
      const limit = Number(opts.limit || config.contextLimit || 8);
      const minSalience = opts.minSalience ?? config.minSalience ?? 0.3;
      const types = opts.memoryTypes || opts.types;
      if (adapter.kind === 'live') {
        const resp = await adapter.retrieve({
          task_descriptor: query,
          memory_types: types || DEFAULT_CONTEXT_TYPES,
          min_salience: minSalience,
          limit,
          actor_id: config.agentId,
          max_sensitivity: opts.maxSensitivity || 'medium',
        });
        return Array.isArray(resp?.records) ? resp.records : [];
      }
      const records = await adapter.list();
      const tokens = tokenize(query);
      const scoped = records.filter((rec) => {
        if ((Number(rec.salience) || 0) < minSalience) return false;
        if (types?.length && !types.includes(rec.type)) return false;
        if (rec.scope && rec.scope !== agentScope(config.agentId) && rec.scope !== 'global') {
          return rec.tags?.includes(`agent:${config.agentId}`);
        }
        return true;
      });
      return scoped
        .map((rec) => ({ rec, score: scoreRecord(rec, tokens) }))
        .sort((a, b) => b.score - a.score)
        .slice(0, limit)
        .map((row) => row.rec);
    },
    async contextForAgent(agentId = config.agentId, opts = {}) {
      const records = await this.retrieve(`context for agent ${agentId}`, {
        limit: opts.limit || config.contextLimit,
        memoryTypes: opts.memoryTypes || config.contextTypes || DEFAULT_CONTEXT_TYPES,
        minSalience: opts.minSalience ?? config.minSalience,
      });
      if (!records.length) return null;
      const lines = records.map((r, i) => `${i + 1}. [${r.type}] ${recordSummary(r)}`);
      return `Membrain memory for ${agentId}:\n${lines.join('\n')}`;
    },
    async getMetrics() {
      if (adapter.kind === 'live') return adapter.metrics();
      return localMetrics(await adapter.list());
    },
    async reinforce(id, rationale = 'reinforced') {
      if (adapter.kind === 'live') {
        return adapter.reinforce({ id, actor: config.agentId, rationale });
      }
      return adapter.update(id, (rec) => {
        rec.salience = Math.min(2, (Number(rec.salience) || 0) + 0.15);
        rec.lifecycle = rec.lifecycle || {};
        rec.lifecycle.reinforce_count = (rec.lifecycle.reinforce_count || 0) + 1;
        rec.audit_log = rec.audit_log || [];
        rec.audit_log.push({ action: 'reinforce', actor: config.agentId, rationale, at: nowIso() });
      });
    },
    async penalize(id, rationale = 'penalized') {
      if (adapter.kind === 'live') {
        return adapter.penalize({ id, actor: config.agentId, rationale, amount: 0.1 });
      }
      return adapter.update(id, (rec) => {
        rec.salience = Math.max(0, (Number(rec.salience) || 0) - 0.1);
        rec.audit_log = rec.audit_log || [];
        rec.audit_log.push({ action: 'penalize', actor: config.agentId, rationale, at: nowIso() });
      });
    },
  };
}

export async function ingestKnowledgeFacts(facts, options = {}) {
  if (!Array.isArray(facts) || !facts.length) return { ingested: 0 };
  if (process.env.MEMBRAIN_SKIP_KNOWLEDGE_INGEST === '1') return { ingested: 0, skipped: true };
  const store = await createStore({
    adapter: options.adapter || process.env.MEMBRAIN_ADAPTER || 'file',
    agentId: options.agentId || PREMIERE_AGENT_ID,
    storeDir: options.storeDir,
  });
  let ingested = 0;
  for (const fact of facts.slice(0, options.limit || 200)) {
    const summary = fact.fact || fact.summary || '';
    if (!summary) continue;
    await store.ingestObservation({
      subject: fact.id || store.config.agentId,
      predicate: fact.type || 'knowledge',
      object: summary,
      tags: [...(fact.tags || []), 'knowledge-inject'],
      source: options.source || 'knowledge-inject',
    });
    ingested += 1;
  }
  return { ingested, adapter: store.adapter.kind, agentId: store.config.agentId };
}

export function daemonAvailable(root = PACKAGE_ROOT) {
  const dir = membrainRoot(root);
  const binary = path.join(dir, 'bin', 'membraned');
  return {
    root: dir,
    binary,
    hasBinary: fs.existsSync(binary),
    hasGoMod: fs.existsSync(path.join(dir, 'go.mod')),
    go: Boolean(spawnSync('go', ['version'], { encoding: 'utf8' }).status === 0),
  };
}

export async function probeLive(config) {
  try {
    const adapter = new LiveAdapter(config);
    const health = await adapter.health();
    return { ok: true, health };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

function parseFlags(args) {
  const flags = { _: [] };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--json') flags.json = true;
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
    } else flags._.push(a);
  }
  return flags;
}

function printHelp() {
  console.log(`
Usage:
  ct-agents memory status
  ct-agents memory ingest --agent elizero --summary "Jupiter swap filled" [--kind swap_executed]
  ct-agents memory observe --agent elizero --subject $CLAWD --predicate liquidity --object "peaks 2-4pm UTC"
  ct-agents memory retrieve --agent elizero --query "evaluate SOL swap"
  ct-agents memory context --agent elizero
  ct-agents memory start [--db ./membrane.db]

Env:
  MEMBRAIN_ADAPTER=file|memory|live
  MEMBRAIN_HTTP_URL  MEMBRAIN_GRPC  MEMBRAIN_API_KEY  MEMBRAIN_STORE

Membrain is the default memory source for catalog agents (packages/membrain).
`);
}

export async function runMembrainCli(argv = [], root = PACKAGE_ROOT) {
  const args = [...argv];
  const sub = args[0] && !args[0].startsWith('-') ? args.shift() : 'help';
  const flags = parseFlags(args);
  if (sub === 'help' || flags.help) {
    printHelp();
    return 0;
  }

  const config = loadMemoryConfig({
    adapter: flags.adapter,
    agentId: flags.agent || flags.from,
    storeDir: flags.store || flags['store-dir'],
    httpUrl: flags.http || flags.url,
    grpc: flags.grpc || flags.endpoint,
    apiKey: flags['api-key'] || flags.token,
  });

  if (sub === 'status') {
    const daemon = daemonAvailable(root);
    const live = config.adapter === 'live' || flags.live ? await probeLive(config) : { ok: false, skipped: true };
    const payload = {
      source: MEMORY_SOURCE,
      premiere: config.premiereAgent,
      adapter: config.adapter,
      agentId: config.agentId,
      grpc: config.grpc,
      http: config.httpUrl,
      storeDir: config.storeDir,
      daemon,
      live,
      types: MEMORY_TYPES,
      default: defaultAgentMemory(config.agentId),
    };
    if (config.adapter !== 'live') {
      const store = await createStore(config);
      payload.metrics = await store.getMetrics();
    } else if (live.ok) {
      try {
        const store = await createStore({ ...config, adapter: 'live' });
        payload.metrics = await store.getMetrics();
      } catch (err) {
        payload.metricsError = err.message;
      }
    }
    console.log(JSON.stringify(payload, null, 2));
    return 0;
  }

  if (sub === 'start') {
    const daemon = daemonAvailable(root);
    if (!daemon.hasGoMod) {
      console.error(`membrain tree missing at ${daemon.root}`);
      return 1;
    }
    const httpAddr = flags['http-addr'] || ':9091';
    const grpcAddr = flags.addr || flags.grpc || ':9090';
    const db = flags.db || config.dbPath || path.join(daemon.root, 'membrane.db');
    const cmd = daemon.hasBinary ? daemon.binary : 'go';
    const cmdArgs = daemon.hasBinary
      ? ['--addr', grpcAddr, '--http-addr', httpAddr, '--db', db]
      : ['run', './cmd/membraned', '--addr', grpcAddr, '--http-addr', httpAddr, '--db', db];
    console.log(JSON.stringify({ ok: true, cmd, args: cmdArgs, cwd: daemon.root, source: MEMORY_SOURCE }, null, 2));
    if (flags['dry-run']) return 0;
    const child = spawn(cmd, cmdArgs, { cwd: daemon.root, stdio: 'inherit', env: process.env });
    return await new Promise((resolve) => {
      child.on('exit', (code) => resolve(code ?? 1));
    });
  }

  const store = await createStore(config);

  if (sub === 'ingest' || sub === 'event') {
    const summary = flags.summary || flags._.join(' ');
    if (!summary) {
      console.error('memory ingest requires --summary');
      return 1;
    }
    const record = await store.ingestEvent({
      summary,
      eventKind: flags.kind || flags['event-kind'] || 'agent_event',
      tags: String(flags.tags || '')
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean),
    });
    console.log(JSON.stringify({ ok: true, record }, null, 2));
    return 0;
  }

  if (sub === 'observe' || sub === 'observation') {
    const object = flags.object || flags.summary || flags._.join(' ');
    if (!object) {
      console.error('memory observe requires --object or --summary');
      return 1;
    }
    const record = await store.ingestObservation({
      subject: flags.subject || config.agentId,
      predicate: flags.predicate || 'observed',
      object,
      tags: String(flags.tags || '')
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean),
    });
    console.log(JSON.stringify({ ok: true, record }, null, 2));
    return 0;
  }

  if (sub === 'retrieve' || sub === 'search') {
    const query = flags.query || flags.q || flags._.join(' ');
    if (!query) {
      console.error('memory retrieve requires --query');
      return 1;
    }
    const records = await store.retrieve(query, {
      limit: flags.limit ? Number(flags.limit) : undefined,
      memoryTypes: flags.types ? String(flags.types).split(',').map((t) => t.trim()) : undefined,
    });
    console.log(JSON.stringify({ ok: true, query, count: records.length, records }, null, 2));
    return 0;
  }

  if (sub === 'context') {
    const text = await store.contextForAgent(flags.agent || config.agentId);
    if (flags.json) {
      console.log(JSON.stringify({ ok: true, context: text }, null, 2));
    } else {
      console.log(text || '(no memories yet)');
    }
    return 0;
  }

  if (sub === 'metrics') {
    console.log(JSON.stringify(await store.getMetrics(), null, 2));
    return 0;
  }

  printHelp();
  return sub === 'help' ? 0 : 1;
}

export { recordSummary };
