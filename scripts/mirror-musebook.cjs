#!/usr/bin/env node
/**
 * mirror-musebook.cjs — mirror the live Musebook agent directory into this repo.
 *
 * Sources (public, no auth):
 *   - https://musebook.trade/live/agents.json   — the on-chain directory snapshot
 *     (Metaplex Core agents: asset, signer, metadata URI, DAS-verified is_agent)
 *   - https://musebook.trade/api/v1/agents      — registered software agents
 *     (directory registrations with owner wallets)
 *
 * Outputs:
 *   - musebook/agents.json   — the full mirror (provenance records, stable order)
 *   - musebook/catalog.json  — the same agents in agents-catalog.json entry shape,
 *     so catalog tooling (list/show/search patterns) works over the mirror
 *
 * Usage:
 *   node scripts/mirror-musebook.cjs            # fetch + write both files
 *   node scripts/mirror-musebook.cjs --def <identifier>
 *                                               # print a schema-v1 agent def
 *                                                 (schema/clawdAgentSchema.v1.json)
 *                                                 for one mirrored agent
 *
 * The mirror is faithful, not curated: every live directory entry is carried,
 * including test/probe entries, flagged only by their own data. Ordering is by
 * identifier so re-syncs produce minimal diffs.
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const OUT_DIR = path.join(ROOT, "musebook");
const SNAPSHOT_URL = "https://musebook.trade/live/agents.json";
const REGISTERED_URL = "https://musebook.trade/api/v1/agents";
const UA = { "User-Agent": "cheshire-terminal-agents/mirror-musebook" };

function slugify(name) {
  const s = String(name || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
    .replace(/-+$/g, "");
  return s || "agent";
}

async function getJson(url) {
  const res = await fetch(url, { headers: UA });
  if (!res.ok) throw new Error(`${url} -> HTTP ${res.status}`);
  return res.json();
}

function toRecord(a, registeredByKey) {
  const assetId = a.assetId || null;
  const identifier = assetId
    ? `${slugify(a.name)}-${assetId.slice(0, 8).toLowerCase()}`
    : slugify(a.softwareKey || a.name);
  const reg = assetId ? null : registeredByKey.get(a.softwareKey);
  const rec = {
    identifier,
    name: a.name || identifier,
    network: a.network || "mainnet",
    source: "musebook",
    assetId,
    assetSigner: a.assetSigner || null,
    updateAuthority: a.update_authority || null,
    metadataUri: a.metadataUri || a.json_uri || null,
    image: a.image || null,
    description: a.description || null,
    externalUrl: a.external_url || null,
  };
  if (a.agentToken) rec.agentToken = a.agentToken;
  if (!assetId) {
    rec.registered = true;
    rec.ownerWallet = a.ownerWallet || null;
    rec.status = a.status || null;
    rec.identityType = a.identityType || null;
    if (a.createdAt) rec.registeredAt = new Date(a.createdAt).toISOString();
  }
  return rec;
}

function toCatalogEntry(rec) {
  return {
    identifier: rec.identifier,
    title: rec.name,
    description: rec.description || `Musebook-registered agent on Solana (${rec.network}).`,
    avatar: rec.image || "",
    tags: ["musebook", "solana", rec.network, rec.registered ? "registered" : "on-chain"].filter(Boolean),
    category: "platform",
    author: "musebook",
    createdAt: rec.registeredAt ? rec.registeredAt.slice(0, 10) : null,
    oneShot: false,
    featured: false,
    openingMessage: rec.description || `${rec.name} — mirrored from the Musebook directory.`,
    openingQuestions: [],
    tokenUsage: 0,
    capabilities: ["musebook-directory"],
    source: "musebook",
    network: rec.network,
    assetId: rec.assetId,
  };
}

function toAgentDef(rec) {
  const systemRole =
    rec.description ||
    `You are ${rec.name}, an agent registered in the Musebook directory on Solana. ` +
      `Your on-chain identity is Metaplex Core asset ${rec.assetId || "(software registration)"}. ` +
      `Be helpful, verify on-chain facts before repeating them, and never claim executions you cannot prove.`;
  return {
    author: "musebook",
    config: {
      systemRole,
      openingMessage: rec.description || `${rec.name} online — mirrored from musebook.trade/agents.`,
      openingQuestions: [`Who is ${rec.name}?`, "Show your on-chain identity"],
    },
    createdAt: new Date().toISOString(),
    examples: [],
    homepage: `https://musebook.trade/agents`,
    identifier: rec.identifier,
    knowledgeCount: 0,
    meta: {
      avatar: rec.image || "🤖",
      description: rec.description || `Musebook-registered agent on Solana (${rec.network}).`,
      tags: ["musebook", "solana", rec.network],
      title: rec.name,
    },
    pluginCount: 0,
    schemaVersion: 1,
    summary: rec.description || "",
    tokenUsage: 0,
  };
}

async function loadMirror() {
  const p = path.join(OUT_DIR, "agents.json");
  if (!fs.existsSync(p)) throw new Error("musebook/agents.json missing — run the mirror first");
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

async function main() {
  const args = process.argv.slice(2);
  if (args[0] === "--def") {
    const id = args[1];
    if (!id) throw new Error("--def requires an identifier");
    const mirror = await loadMirror();
    const rec = mirror.agents.find((a) => a.identifier === id);
    if (!rec) throw new Error(`no mirrored agent with identifier ${id}`);
    console.log(JSON.stringify(toAgentDef(rec), null, 2));
    return;
  }

  const [snapshot, registeredRaw] = await Promise.all([
    getJson(SNAPSHOT_URL),
    getJson(REGISTERED_URL).catch(() => []),
  ]);
  const onchain = Array.isArray(snapshot) ? snapshot : snapshot.agents || [];
  const registered = Array.isArray(registeredRaw)
    ? registeredRaw
    : registeredRaw.agents || registeredRaw.data || [];
  const registeredByKey = new Map(registered.map((r) => [r.softwareKey, r]));

  const records = onchain.map((a) => toRecord(a, registeredByKey));
  for (const r of registered) {
    if (!records.some((x) => x.identifier === slugify(r.softwareKey))) {
      records.push(toRecord(r, registeredByKey));
    }
  }
  records.sort((x, y) => x.identifier.localeCompare(y.identifier));

  const stats = {
    total: records.length,
    onChain: records.filter((r) => r.assetId).length,
    registered: records.filter((r) => r.registered).length,
    mainnet: records.filter((r) => r.network === "mainnet").length,
    devnet: records.filter((r) => r.network === "devnet").length,
    withAgentToken: records.filter((r) => r.agentToken).length,
  };
  const generatedAt = new Date().toISOString();

  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(
    path.join(OUT_DIR, "agents.json"),
    JSON.stringify(
      {
        $schema: "../schema/clawdAgentSchema.v1.json",
        apiVersion: "musebook-mirror/1",
        generatedAt,
        source: { snapshot: SNAPSHOT_URL, registered: REGISTERED_URL },
        stats,
        agents: records,
      },
      null,
      2
    ) + "\n"
  );
  fs.writeFileSync(
    path.join(OUT_DIR, "catalog.json"),
    JSON.stringify(
      {
        $schema: "../schema/clawdAgentSchema.v1.json",
        apiVersion: "musebook-mirror/1",
        generatedAt,
        hub: {
          agents: "https://musebook.trade/agents",
          register: "https://register.musebook.trade",
          install: "https://install.musebook.trade",
          skill: "https://musebook.trade/SKILL.md",
        },
        stats: { totalAgents: stats.total, ...stats },
        agents: records.map(toCatalogEntry),
      },
      null,
      2
    ) + "\n"
  );
  console.log(
    `musebook mirror: ${stats.total} agents (${stats.onChain} on-chain, ${stats.registered} registered, ` +
      `${stats.mainnet} mainnet / ${stats.devnet} devnet) -> musebook/agents.json + musebook/catalog.json`
  );
}

main().catch((e) => {
  console.error(`mirror-musebook: ${e.message}`);
  process.exit(1);
});
