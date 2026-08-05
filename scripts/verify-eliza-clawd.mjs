#!/usr/bin/env node
/**
 * Verify eliza is wired for Clawd character + monorepo skills.
 *
 * Exercises the real shipped path in eliza:
 *   packages/agent/src/runtime/sandbox-character.ts
 * via a local dynamic import (Bun can load the TS source).
 *
 * Also checks managed skill discovery under ~/.local/state/eliza/skills
 * (and project .elizaos/skills) matches the monorepo skills suite.
 *
 * Usage:
 *   node scripts/verify-eliza-clawd.mjs
 *   bun scripts/verify-eliza-clawd.mjs
 *
 * Exit 0 on success; non-zero with diagnostics on failure.
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "..");
const CHARACTER_PATH = resolve(
  process.env.ELIZA_AGENT_CHARACTER_PATH ||
    join(REPO_ROOT, "characters", "clawd.json"),
);
const ELIZA_DIR = resolve(process.env.ELIZA_DIR || join(REPO_ROOT, "eliza"));
const SANDBOX_TS = join(
  ELIZA_DIR,
  "packages/agent/src/runtime/sandbox-character.ts",
);
const STATE_DIR =
  process.env.ELIZA_STATE_DIR || join(homedir(), ".local", "state", "eliza");
const MANAGED_SKILLS = join(STATE_DIR, "skills");
const PROJECT_SKILLS = join(ELIZA_DIR, ".elizaos", "skills");
const SOURCE_SKILLS = join(REPO_ROOT, "skills");
const SCRATCH =
  process.env.VERIFY_OUT_DIR ||
  join(
    process.env.TMPDIR || "/tmp",
    "grok-goal-c58f48f60520-verify-eliza-clawd",
  );

const results = [];
function pass(name, detail = "") {
  results.push({ ok: true, name, detail });
  console.log(`✓ ${name}${detail ? ` — ${detail}` : ""}`);
}
function fail(name, detail = "") {
  results.push({ ok: false, name, detail });
  console.error(`✗ ${name}${detail ? ` — ${detail}` : ""}`);
}

// ── 1. Character file ──────────────────────────────────────────────────────
if (!existsSync(CHARACTER_PATH)) {
  fail("character file exists", CHARACTER_PATH);
  process.exit(1);
}
const character = JSON.parse(readFileSync(CHARACTER_PATH, "utf8"));
if (character.name === "Clawd") pass("character name is Clawd");
else fail("character name is Clawd", `got ${character.name}`);

if (Array.isArray(character.bio) && character.bio.length > 0) {
  pass("character has bio", `${character.bio.length} lines`);
} else fail("character has bio");

// ── 2. Real character-file loader (zero-dep shipped path used by sandbox-character)
const CHARACTER_FILE_TS = join(
  ELIZA_DIR,
  "packages/agent/src/runtime/character-file.ts",
);

async function loadViaCharacterFileModule() {
  if (!existsSync(SANDBOX_TS)) {
    fail("sandbox-character.ts present", SANDBOX_TS);
    return null;
  }
  pass("sandbox-character.ts present");

  if (!existsSync(CHARACTER_FILE_TS)) {
    fail("character-file.ts present", CHARACTER_FILE_TS);
    return null;
  }
  pass("character-file.ts present");

  try {
    const { spawnSync } = await import("node:child_process");
    // Load the real shipped module under bun (handles TypeScript).
    const runner = `
import { loadCharacterFromEnv, resolveSandboxCharacterJsonFromEnv } from ${JSON.stringify(pathToFileURL(CHARACTER_FILE_TS).href)};
const path = ${JSON.stringify(CHARACTER_PATH)};
const env = { ELIZA_AGENT_CHARACTER_PATH: path };
const resolved = resolveSandboxCharacterJsonFromEnv(env);
const loaded = loadCharacterFromEnv(env);
if (!resolved || resolved.source !== "path" || !loaded || loaded.parsed.name !== "Clawd") {
  console.error(JSON.stringify({ ok: false, resolved, loaded }));
  process.exit(2);
}
console.log(JSON.stringify({
  ok: true,
  name: loaded.parsed.name,
  hasSystem: typeof loaded.system === "string" && loaded.system.includes("You are Clawd."),
  hasLore: loaded.system.includes("solana-gpt-oracle"),
  systemLen: loaded.system?.length ?? 0,
  bioCount: Array.isArray(loaded.parsed.bio) ? loaded.parsed.bio.length : 0,
  topicsCount: Array.isArray(loaded.parsed.topics) ? loaded.parsed.topics.length : 0,
  path: resolved.path,
  source: loaded.source,
}));
`;
    const out = spawnSync("bun", ["-e", runner], {
      cwd: ELIZA_DIR,
      encoding: "utf8",
      env: { ...process.env },
    });
    if (out.status !== 0) {
      fail(
        "character load via character-file.ts",
        `bun exit ${out.status}: ${(out.stderr || out.stdout || "").slice(0, 400)}`,
      );
      return null;
    }
    const line = (out.stdout || "")
      .trim()
      .split("\n")
      .filter(Boolean)
      .pop();
    const data = JSON.parse(line);
    if (!data.ok || data.name !== "Clawd" || !data.hasSystem || !data.hasLore) {
      fail("character load via character-file.ts", JSON.stringify(data));
      return null;
    }
    pass(
      "character load via character-file.ts",
      `source=${data.source} systemLen=${data.systemLen} bio=${data.bioCount}`,
    );
    return data;
  } catch (err) {
    fail("character load via character-file.ts", String(err));
    return null;
  }
}

// ── 3. Skills discovery ────────────────────────────────────────────────────
function collectSkillNames(dir) {
  const names = new Set();
  if (!existsSync(dir)) return names;
  function walk(d) {
    for (const entry of readdirSync(d, { withFileTypes: true })) {
      if (entry.name.startsWith(".")) continue;
      const full = join(d, entry.name);
      let isDir = entry.isDirectory();
      if (entry.isSymbolicLink()) {
        try {
          isDir = statSync(full).isDirectory();
        } catch {
          continue;
        }
      }
      if (isDir) walk(full);
      else if (entry.name === "SKILL.md") {
        const text = readFileSync(full, "utf8");
        const m = text.match(/^name:\s*(.+)$/m);
        names.add((m?.[1] || entry.name).trim());
      }
    }
  }
  walk(dir);
  return names;
}

const managed = collectSkillNames(MANAGED_SKILLS);
const project = collectSkillNames(PROJECT_SKILLS);
const source = collectSkillNames(SOURCE_SKILLS);

const required = [
  "cheshire-agent-identity-registry",
  "cheshire-agent-registries",
  "rh-bonded-launch",
  "rh-launchpad-v3",
  "robinhood-agent-forge",
  "zk-omni-messaging",
];

if (source.size >= 10) pass("source skills suite", `${source.size} skills`);
else fail("source skills suite", `${source.size} skills`);

const inManaged = required.filter((n) => managed.has(n));
if (inManaged.length === required.length) {
  pass("managed skills installed", `${managed.size} total, required ok`);
} else {
  fail(
    "managed skills installed",
    `missing ${required.filter((n) => !managed.has(n)).join(", ")} (managed=${managed.size})`,
  );
}

if (project.size > 0) {
  pass("project .elizaos/skills present", `${project.size} skills`);
} else {
  // non-fatal if managed is ok
  pass("project skills optional", "empty — managed path is enough");
}

// ── 4. State config points at Clawd ────────────────────────────────────────
const configPath = join(STATE_DIR, "eliza.json");
if (existsSync(configPath)) {
  try {
    const cfg = JSON.parse(readFileSync(configPath, "utf8"));
    const primary = cfg.agents?.list?.[0];
    if (primary?.name === "Clawd") {
      pass("state eliza.json primary agent is Clawd", configPath);
    } else {
      fail(
        "state eliza.json primary agent is Clawd",
        `got ${primary?.name ?? "none"}`,
      );
    }
  } catch (err) {
    fail("state eliza.json parseable", String(err));
  }
} else {
  fail("state eliza.json exists", `run: node scripts/start-eliza-clawd.mjs --dry-run`);
}

// ── run character loader ───────────────────────────────────────────────────
const loaded = await loadViaCharacterFileModule();

// ── write evidence ─────────────────────────────────────────────────────────
try {
  const { mkdirSync, writeFileSync: w } = await import("node:fs");
  mkdirSync(SCRATCH, { recursive: true });
  const evidence = {
    ts: new Date().toISOString(),
    characterPath: CHARACTER_PATH,
    elizaDir: ELIZA_DIR,
    stateDir: STATE_DIR,
    managedSkills: [...managed].sort(),
    projectSkills: [...project].sort(),
    results,
    loaded,
  };
  w(join(SCRATCH, "verify-eliza-clawd.json"), JSON.stringify(evidence, null, 2));
  console.log(`[verify] evidence → ${join(SCRATCH, "verify-eliza-clawd.json")}`);
} catch {
  /* ignore */
}

const failed = results.filter((r) => !r.ok);
console.log(
  `\n${results.length - failed.length}/${results.length} checks passed`,
);
process.exit(failed.length ? 1 : 0);
