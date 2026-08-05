#!/usr/bin/env node
/**
 * Exercises the real shipped character-file loader against characters/clawd.json.
 * character-file.ts has zero @elizaos/* deps so this runs without monorepo install.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "..");
const CHARACTER_PATH = resolve(REPO_ROOT, "characters", "clawd.json");
const CHARACTER_FILE_TS = resolve(
  REPO_ROOT,
  "eliza/packages/agent/src/runtime/character-file.ts",
);
const OUT_DIR =
  process.env.VERIFY_OUT_DIR ||
  join(
    process.env.TMPDIR || "/tmp",
    "grok-goal-c58f48f60520-verify-eliza-clawd",
  );

// Node cannot import .ts directly; use bun if available, else transpile via dynamic.
async function importCharacterFile() {
  const url = pathToFileURL(CHARACTER_FILE_TS).href;
  try {
    // Prefer bun runtime for TypeScript
    if (typeof Bun !== "undefined") {
      return await import(url);
    }
  } catch {
    /* fall through */
  }
  // Spawn bun to evaluate and print JSON result for the full check below when
  // this script is run under node — but try direct import first for bun.
  return await import(url);
}

const mod = await importCharacterFile();
const {
  loadCharacterFromEnv,
  resolveSandboxCharacterJsonFromEnv,
  resolveSystemFromCharacter,
} = mod;

const env = { ELIZA_AGENT_CHARACTER_PATH: CHARACTER_PATH };
const resolved = resolveSandboxCharacterJsonFromEnv(env);
if (!resolved || resolved.source !== "path") {
  console.error("FAIL resolve from path", resolved);
  process.exit(1);
}
if (resolved.path !== CHARACTER_PATH) {
  console.error("FAIL path mismatch", resolved.path, CHARACTER_PATH);
  process.exit(1);
}

const loaded = loadCharacterFromEnv(env);
if (!loaded || loaded.parsed.name !== "Clawd") {
  console.error("FAIL loadCharacterFromEnv", loaded);
  process.exit(1);
}
if (!loaded.system?.includes("You are Clawd.")) {
  console.error("FAIL system synthesis", loaded.system?.slice(0, 200));
  process.exit(1);
}
if (!loaded.system.includes("solana-gpt-oracle")) {
  console.error("FAIL lore not in system", loaded.system.slice(0, 400));
  process.exit(1);
}

// JSON still wins over path
const prefer = loadCharacterFromEnv({
  ELIZA_AGENT_CHARACTER_JSON: JSON.stringify({
    name: "Override",
    system: "from-json",
  }),
  ELIZA_AGENT_CHARACTER_PATH: CHARACTER_PATH,
});
if (prefer?.parsed.name !== "Override" || prefer.system !== "from-json") {
  console.error("FAIL JSON precedence", prefer);
  process.exit(1);
}

// Missing path is null
const missing = resolveSandboxCharacterJsonFromEnv({
  ELIZA_AGENT_CHARACTER_PATH: "/no/such/character.json",
});
if (missing !== null) {
  console.error("FAIL missing path should be null", missing);
  process.exit(1);
}

const evidence = {
  ok: true,
  module: CHARACTER_FILE_TS,
  characterPath: CHARACTER_PATH,
  source: loaded.source,
  name: loaded.parsed.name,
  bioCount: Array.isArray(loaded.parsed.bio) ? loaded.parsed.bio.length : 0,
  topicsCount: Array.isArray(loaded.parsed.topics)
    ? loaded.parsed.topics.length
    : 0,
  systemLen: loaded.system.length,
  systemPreview: loaded.system.slice(0, 240),
  explicitSystem: resolveSystemFromCharacter({
    system: "keep-me",
    name: "X",
    bio: ["ignored"],
  }),
};
mkdirSync(OUT_DIR, { recursive: true });
const outFile = join(OUT_DIR, "verify-eliza-clawd-runtime.json");
writeFileSync(outFile, JSON.stringify(evidence, null, 2));
console.log("✓ real character-file path loaded Clawd from", CHARACTER_PATH);
console.log("✓ system synthesized from bio/lore (", loaded.system.length, "chars)");
console.log("✓ ELIZA_AGENT_CHARACTER_JSON wins over PATH");
console.log("✓ evidence →", outFile);
