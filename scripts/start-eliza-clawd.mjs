#!/usr/bin/env node
/**
 * Start elizaOS (Solizardking/eliza) with the Clawd character and agents skills.
 *
 * Usage (from repo root):
 *   node scripts/start-eliza-clawd.mjs
 *   node scripts/start-eliza-clawd.mjs --dev
 *   node scripts/start-eliza-clawd.mjs --dry-run
 *
 * Env overrides:
 *   ELIZA_AGENT_CHARACTER_PATH  — default: <repo>/characters/clawd.json
 *   ELIZA_DIR                   — default: <repo>/eliza
 */
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "..");
const DEFAULT_ELIZA_DIR = join(REPO_ROOT, "eliza");
const DEFAULT_CHARACTER = join(REPO_ROOT, "characters", "clawd.json");
const DEFAULT_SKILLS = join(REPO_ROOT, "skills");

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const dev = args.includes("--dev");
const elizaDir = resolve(process.env.ELIZA_DIR || DEFAULT_ELIZA_DIR);
const characterPath = resolve(
  process.env.ELIZA_AGENT_CHARACTER_PATH || DEFAULT_CHARACTER,
);

function fail(msg) {
  console.error(`[start-eliza-clawd] ${msg}`);
  process.exit(1);
}

if (!existsSync(characterPath)) {
  fail(`Character not found: ${characterPath}`);
}
if (!existsSync(elizaDir)) {
  fail(`Eliza directory not found: ${elizaDir}`);
}

// Ensure managed skills dir has the monorepo suite (symlinks if missing).
const stateDir =
  process.env.ELIZA_STATE_DIR || join(homedir(), ".local", "state", "eliza");
const managedSkills = join(stateDir, "skills");
mkdirSync(managedSkills, { recursive: true });

if (existsSync(DEFAULT_SKILLS)) {
  const { readdirSync, lstatSync, symlinkSync, unlinkSync, rmSync } =
    await import("node:fs");
  for (const name of readdirSync(DEFAULT_SKILLS)) {
    if (name.endsWith(".json")) continue;
    const src = join(DEFAULT_SKILLS, name);
    const dest = join(managedSkills, name);
    try {
      if (!lstatSync(src).isDirectory()) continue;
    } catch {
      continue;
    }
    try {
      if (existsSync(dest)) {
        const st = lstatSync(dest);
        if (st.isSymbolicLink()) unlinkSync(dest);
        else rmSync(dest, { recursive: true, force: true });
      }
      symlinkSync(src, dest);
    } catch (err) {
      console.warn(
        `[start-eliza-clawd] skill link skipped for ${name}: ${err.message}`,
      );
    }
  }
}

// Persist a pointer config so non-env boots still see Clawd as primary.
const character = JSON.parse(readFileSync(characterPath, "utf8"));
const configPath = join(stateDir, "eliza.json");
let config = {};
if (existsSync(configPath)) {
  try {
    config = JSON.parse(readFileSync(configPath, "utf8"));
  } catch {
    config = {};
  }
}
const systemParts = [];
if (character.name) systemParts.push(`You are ${character.name}.`);
if (Array.isArray(character.bio)) systemParts.push(character.bio.join("\n"));
if (Array.isArray(character.lore)) systemParts.push(character.lore.join("\n"));
const agentEntry = {
  id: "clawd",
  default: true,
  name: character.name || "Clawd",
  system: systemParts.join("\n\n"),
  bio: character.bio,
  topics: character.topics,
  adjectives: character.adjectives,
  style: character.style,
};
config.agents = {
  ...(config.agents || {}),
  list: [
    agentEntry,
    ...((config.agents?.list || []).filter(
      (a) => a && a.id !== "clawd" && a.name !== character.name,
    ) || []),
  ],
};
config.ui = {
  ...(config.ui || {}),
  assistant: { ...((config.ui && config.ui.assistant) || {}), name: agentEntry.name },
};
mkdirSync(stateDir, { recursive: true });
writeFileSync(configPath, JSON.stringify(config, null, 2) + "\n");

const clawdBrowserTools =
  process.env.CLAWDBROWSER_TOOLS_MD ||
  "/Users/8bit/ClawdBrowser/tools.md";

const env = {
  ...process.env,
  ELIZA_AGENT_CHARACTER_PATH: characterPath,
  ELIZA_STATE_DIR: stateDir,
  // Project skills also load when cwd is eliza
  ELIZA_NAMESPACE: process.env.ELIZA_NAMESPACE || "eliza",
  // Official @elizaos/plugin-clawdbrowser catalog
  CLAWDBROWSER_TOOLS_MD:
    process.env.CLAWDBROWSER_TOOLS_MD || clawdBrowserTools,
};

console.log("[start-eliza-clawd] character:", characterPath);
console.log("[start-eliza-clawd] name:     ", agentEntry.name);
console.log("[start-eliza-clawd] state:    ", stateDir);
console.log("[start-eliza-clawd] skills:   ", managedSkills);
console.log("[start-eliza-clawd] tools.md: ", env.CLAWDBROWSER_TOOLS_MD);
console.log("[start-eliza-clawd] eliza:    ", elizaDir);

if (dryRun) {
  console.log("[start-eliza-clawd] dry-run ok — not starting process");
  process.exit(0);
}

const script = dev ? "dev" : "start";
const child = spawn("bun", ["run", script], {
  cwd: elizaDir,
  env,
  stdio: "inherit",
});
child.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  process.exit(code ?? 1);
});
