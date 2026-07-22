/**
 * Cheshire ZK Omnichain relayer.
 *
 * Observes ZkOmni jobs, verifies Ed25519 ZK proofs, then delivers via
 * production paths (RH sendZkOmni / Solana receive_zk_omni) from deliver.js.
 */
import { randomUUID } from "node:crypto";
import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { createServer } from "node:http";
import {
  decodeZkOmniMessage,
  encodeZkOmniMessage,
  MSG_ZK_OMNI,
  planZkOmniMessage,
  verifyZkProof,
} from "./codec.js";
import { createDeliverFn } from "./deliver.js";

export const RELAY_STATUSES = Object.freeze([
  "observed",
  "verified",
  "queued",
  "relayed",
  "delivered",
  "failed",
]);

function nowIso() {
  return new Date().toISOString();
}

export class ZkOmniJournal {
  constructor(opts = {}) {
    this.path = opts.path || null;
    this.byId = new Map();
    this.consumedNullifiers = new Set();
  }

  async load() {
    if (!this.path) return;
    try {
      const raw = await readFile(this.path, "utf8");
      for (const line of raw.split("\n")) {
        if (!line.trim()) continue;
        const row = JSON.parse(line);
        this.byId.set(row.id, row);
        if (row.nullifier && row.status !== "failed") {
          this.consumedNullifiers.add(row.nullifier.toLowerCase());
        }
      }
    } catch (err) {
      if (err && err.code === "ENOENT") return;
      throw err;
    }
  }

  async append(row) {
    this.byId.set(row.id, row);
    if (row.nullifier && row.status !== "failed") {
      this.consumedNullifiers.add(String(row.nullifier).toLowerCase());
    }
    if (!this.path) return;
    await mkdir(dirname(this.path), { recursive: true });
    await appendFile(this.path, `${JSON.stringify(row)}\n`, "utf8");
  }

  async rewrite() {
    if (!this.path) return;
    await mkdir(dirname(this.path), { recursive: true });
    const body = [...this.byId.values()].map((r) => JSON.stringify(r)).join("\n");
    await writeFile(this.path, body ? `${body}\n` : "", "utf8");
  }

  list(filter = {}) {
    let rows = [...this.byId.values()];
    if (filter.status) rows = rows.filter((r) => r.status === filter.status);
    if (filter.direction) rows = rows.filter((r) => r.direction === filter.direction);
    return rows.sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
  }

  get(id) {
    return this.byId.get(id) ?? null;
  }

  hasNullifier(nullifier) {
    return this.consumedNullifiers.has(String(nullifier).toLowerCase());
  }
}

export class ZkOmniRelayer {
  /**
   * @param {{
   *   journal?: ZkOmniJournal,
   *   journalPath?: string,
   *   deliver?: (job: object) => Promise<object>,
   *   allowSimulateFallback?: boolean,
   *   logger?: Function,
   * }} [opts]
   */
  constructor(opts = {}) {
    this.journal =
      opts.journal ??
      new ZkOmniJournal({
        path: opts.journalPath ?? join(process.cwd(), ".zk-omni-relayer", "journal.jsonl"),
      });
    this.deliver =
      opts.deliver ??
      createDeliverFn({
        allowSimulateFallback: opts.allowSimulateFallback !== false,
        simulate: opts.simulate,
      });
    this.logger = opts.logger ?? (() => {});
    this.running = false;
    this._timer = null;
    this.stats = {
      observed: 0,
      verified: 0,
      delivered: 0,
      failed: 0,
      startedAt: null,
    };
  }

  async init() {
    await this.journal.load();
    this.stats.startedAt = nowIso();
  }

  async observe(input) {
    let plan;
    if (input.payloadHex && !input.message) {
      const decoded = decodeZkOmniMessage(input.payloadHex);
      plan = {
        kind: "zk-omni",
        msgType: MSG_ZK_OMNI,
        direction: input.direction ?? "robinhood-to-solana",
        srcEid: input.srcEid,
        dstEid: input.dstEid,
        message: decoded,
        payloadHex: input.payloadHex,
      };
    } else if (input.message && input.payloadHex) {
      plan = input;
    } else {
      plan = planZkOmniMessage(input);
    }

    const message = plan.message;
    const nullifier = message?.nullifier;
    if (!nullifier) throw new Error("observe requires a nullifier");

    // Mandatory ZK verification at observe time
    const zk = verifyZkProof(message);
    if (!zk.ok) {
      const err = new Error(`ZK proof invalid: ${zk.reason}`);
      err.code = "ZK_VERIFY_FAILED";
      throw err;
    }

    if (this.journal.hasNullifier(nullifier)) {
      const err = new Error(`Nullifier already observed/consumed: ${nullifier}`);
      err.code = "NULLIFIER_REPLAY";
      throw err;
    }

    const expiresAt = Number(message.expiresAt);
    if (expiresAt && expiresAt <= Math.floor(Date.now() / 1000)) {
      const err = new Error("Message already expired");
      err.code = "EXPIRED";
      throw err;
    }

    // Round-trip codec
    const reencoded = encodeZkOmniMessage(message);
    if (reencoded.toLowerCase() !== plan.payloadHex.toLowerCase()) {
      const decoded = decodeZkOmniMessage(plan.payloadHex);
      if (decoded.nullifier.toLowerCase() !== nullifier.toLowerCase()) {
        throw new Error("payloadHex does not decode to the provided nullifier");
      }
    }

    const job = {
      id: randomUUID(),
      status: "observed",
      createdAt: nowIso(),
      updatedAt: nowIso(),
      direction: plan.direction,
      srcEid: plan.srcEid,
      dstEid: plan.dstEid,
      nullifier,
      agentId: message.agentId,
      action: message.action,
      payloadHex: plan.payloadHex,
      message,
      zk: { publicInputsHash: zk.publicInputsHash, binding: zk.binding },
      attempts: 0,
      lastError: null,
      txHash: null,
      deliverPath: null,
      simulated: null,
    };

    await this.journal.append(job);
    this.stats.observed += 1;
    this.logger("observed", { id: job.id, nullifier });
    return job;
  }

  async verify(id) {
    const job = this.journal.get(id);
    if (!job) throw new Error(`Unknown job ${id}`);
    const decoded = decodeZkOmniMessage(job.payloadHex);
    if (decoded.msgType !== MSG_ZK_OMNI) throw new Error("bad msgType");
    const zk = verifyZkProof(decoded);
    if (!zk.ok) throw new Error(`ZK proof invalid: ${zk.reason}`);
    job.status = "verified";
    job.updatedAt = nowIso();
    job.zk = { publicInputsHash: zk.publicInputsHash, binding: zk.binding };
    await this.journal.rewrite();
    this.stats.verified += 1;
    this.logger("verified", { id });
    return job;
  }

  async queue(id) {
    const job = this.journal.get(id);
    if (!job) throw new Error(`Unknown job ${id}`);
    if (job.status === "observed") await this.verify(id);
    const j = this.journal.get(id);
    j.status = "queued";
    j.updatedAt = nowIso();
    await this.journal.rewrite();
    return j;
  }

  async processOne(id) {
    const job = this.journal.get(id);
    if (!job) throw new Error(`Unknown job ${id}`);
    if (job.status === "observed") await this.verify(id);
    if (job.status === "verified") await this.queue(id);

    const current = this.journal.get(id);
    current.attempts += 1;
    current.status = "relayed";
    current.updatedAt = nowIso();
    await this.journal.rewrite();
    this.logger("relayed", { id: current.id, attempt: current.attempts });

    try {
      const result = await this.deliver(current);
      if (!result?.ok) throw new Error(result?.error || "deliver failed");
      current.status = "delivered";
      current.txHash = result.txHash ?? null;
      current.deliverPath = result.path ?? result.plan?.path ?? null;
      current.simulated = result.simulated === true;
      current.updatedAt = nowIso();
      current.lastError = null;
      await this.journal.rewrite();
      this.stats.delivered += 1;
      this.logger("delivered", {
        id: current.id,
        txHash: current.txHash,
        simulated: current.simulated,
        path: current.deliverPath,
      });
      return current;
    } catch (err) {
      current.status = "failed";
      current.lastError = err instanceof Error ? err.message : String(err);
      current.updatedAt = nowIso();
      await this.journal.rewrite();
      this.stats.failed += 1;
      this.logger("failed", { id: current.id, error: current.lastError });
      return current;
    }
  }

  async processQueue(limit = 10) {
    const queued = this.journal
      .list()
      .filter((j) => ["observed", "verified", "queued"].includes(j.status))
      .slice(0, limit);
    const results = [];
    for (const job of queued) {
      results.push(await this.processOne(job.id));
    }
    return results;
  }

  async oneshot(input) {
    const job = await this.observe(input);
    return this.processOne(job.id);
  }

  status() {
    const byStatus = Object.fromEntries(RELAY_STATUSES.map((s) => [s, 0]));
    for (const row of this.journal.list()) {
      byStatus[row.status] = (byStatus[row.status] ?? 0) + 1;
    }
    return {
      running: this.running,
      stats: this.stats,
      byStatus,
      journalPath: this.journal.path,
      jobs: this.journal.list().length,
    };
  }

  startPolling(intervalMs = 2000) {
    if (this.running) return;
    this.running = true;
    this._timer = setInterval(() => {
      this.processQueue().catch((err) => {
        this.logger("poll_error", { error: err instanceof Error ? err.message : String(err) });
      });
    }, intervalMs);
    if (typeof this._timer.unref === "function") this._timer.unref();
  }

  stopPolling() {
    this.running = false;
    if (this._timer) clearInterval(this._timer);
    this._timer = null;
  }

  listen(port = 8787, host = "127.0.0.1") {
    const server = createServer(async (req, res) => {
      const url = new URL(req.url || "/", `http://${host}:${port}`);
      res.setHeader("content-type", "application/json");
      try {
        if (url.pathname === "/health") {
          res.end(JSON.stringify({ ok: true, service: "zk-omni-relayer", ...this.status() }));
          return;
        }
        if (url.pathname === "/jobs") {
          res.end(JSON.stringify({ jobs: this.journal.list() }));
          return;
        }
        if (url.pathname.startsWith("/jobs/") && req.method === "GET") {
          const id = url.pathname.slice("/jobs/".length);
          const job = this.journal.get(id);
          if (!job) {
            res.statusCode = 404;
            res.end(JSON.stringify({ error: "not found" }));
            return;
          }
          res.end(JSON.stringify(job));
          return;
        }
        if (url.pathname === "/oneshot" && req.method === "POST") {
          const chunks = [];
          for await (const c of req) chunks.push(c);
          const body = JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
          const job = await this.oneshot(body);
          res.end(JSON.stringify(job));
          return;
        }
        res.statusCode = 404;
        res.end(JSON.stringify({ error: "not found" }));
      } catch (err) {
        res.statusCode = 500;
        res.end(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }));
      }
    });
    server.listen(port, host);
    this.logger("listen", { host, port });
    return server;
  }
}

export function createRelayer(opts) {
  return new ZkOmniRelayer(opts);
}
