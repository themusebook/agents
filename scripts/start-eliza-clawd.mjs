#!/usr/bin/env node
/**
 * Start elizaOS (Solizardking/eliza) with the Clawd character and skills at birth.
 *
 * Injects skill packages into the managed state dir and eliza workspace so
 * plugin-agent-skills / @elizaos/skills resolve them on startup:
 *   1. Monorepo suite — <repo>/skills (Cheshire/RH suite)
 *   2. Skill hub      — ELIZA_HUB_SKILLS_DIR or /Users/8bit/skills
 *
 * Nested hub packs (e.g. anthropic-skills/*, helius-skills/*) are flattened
 * into top-level symlinks because FileSystemSkillStore only lists one level.
 *
 * Usage (from repo root):
 *   node scripts/start-eliza-clawd.mjs
 *   node scripts/start-eliza-clawd.mjs --dev
 *   node scripts/start-eliza-clawd.mjs --dry-run
 *   node scripts/start-eliza-clawd.mjs --inject-only
 *
 * Env overrides:
 *   ELIZA_AGENT_CHARACTER_PATH  — default: <repo>/characters/clawd.json
 *   ELIZA_DIR                   — default: <repo>/eliza
 *   ELIZA_STATE_DIR             — default: ~/.local/state/eliza
 *   ELIZA_HUB_SKILLS_DIR        — default: /Users/8bit/skills
 */
import { spawn } from "node:child_process";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "..");
const DEFAULT_ELIZA_DIR = join(REPO_ROOT, "eliza");
const DEFAULT_CHARACTER = join(REPO_ROOT, "characters", "clawd.json");
const DEFAULT_SKILLS = join(REPO_ROOT, "skills");
const DEFAULT_HUB_SKILLS =
  process.env.ELIZA_HUB_SKILLS_DIR?.trim() || "/Users/8bit/skills";

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const injectOnly = args.includes("--inject-only");
const dev = args.includes("--dev");
const elizaDir = resolve(process.env.ELIZA_DIR || DEFAULT_ELIZA_DIR);
const characterPath = resolve(
  process.env.ELIZA_AGENT_CHARACTER_PATH || DEFAULT_CHARACTER,
);

function fail(msg) {
  console.error(`[start-eliza-clawd] ${msg}`);
  process.exit(1);
}

/** @param {string} dir */
function isSkillDir(dir) {
  try {
    return existsSync(join(dir, "SKILL.md")) && statSync(dir).isDirectory();
  } catch {
    return false;
  }
}

/**
 * Collect skill packages from a hub/suite root.
 * Top-level dirs with SKILL.md are included. Pack dirs without SKILL.md are
 * scanned one level deep so nested packs flatten into the managed store.
 *
 * @param {string} root
 * @returns {Map<string, string>} name -> absolute path
 */
function collectSkillsFromRoot(root) {
  /** @type {Map<string, string>} */
  const map = new Map();
  if (!existsSync(root)) return map;

  for (const name of readdirSync(root)) {
    if (name.startsWith(".") || name === "node_modules") continue;
    if (name.endsWith(".json") || name.endsWith(".md")) continue;

    const src = join(root, name);
    let isDir = false;
    try {
      isDir = statSync(src).isDirectory();
    } catch {
      continue;
    }
    if (!isDir) continue;

    if (isSkillDir(src)) {
      map.set(name, src);
      continue;
    }

    // Nested pack (e.g. anthropic-skills/<skill>/SKILL.md)
    try {
      for (const child of readdirSync(src)) {
        if (child.startsWith(".") || child === "node_modules") continue;
        const childPath = join(src, child);
        if (isSkillDir(childPath)) {
          map.set(child, childPath);
        }
      }
    } catch {
      // ignore unreadable packs
    }
  }

  return map;
}

/**
 * Force-replace dest with a symlink to src.
 * @returns {"linked"|"skipped"|"error"}
 */
function linkSkill(src, dest, label) {
  try {
    if (!isSkillDir(src)) return "skipped";
    if (existsSync(dest) || lstatSyncMaybe(dest)) {
      try {
        const st = lstatSync(dest);
        if (st.isSymbolicLink()) unlinkSync(dest);
        else rmSync(dest, { recursive: true, force: true });
      } catch {
        // dest may be a broken symlink — unlink
        try {
          unlinkSync(dest);
        } catch {
          // ignore
        }
      }
    }
    symlinkSync(src, dest);
    return "linked";
  } catch (err) {
    console.warn(
      `[start-eliza-clawd] skill link skipped for ${label}: ${err.message}`,
    );
    return "error";
  }
}

/** @param {string} path */
function lstatSyncMaybe(path) {
  try {
    lstatSync(path);
    return true;
  } catch {
    return false;
  }
}

/**
 * Inject skill map into a destination directory.
 * @param {Map<string, string>} skills
 * @param {string} destDir
 * @param {string} tag
 */
function injectSkillsInto(skills, destDir, tag) {
  mkdirSync(destDir, { recursive: true });
  let linked = 0;
  let errors = 0;
  for (const [name, src] of skills) {
    const result = linkSkill(src, join(destDir, name), `${tag}/${name}`);
    if (result === "linked") linked += 1;
    if (result === "error") errors += 1;
  }
  console.log(
    `[start-eliza-clawd] ${tag}: linked ${linked}/${skills.size} skills → ${destDir}` +
      (errors ? ` (${errors} errors)` : ""),
  );
  return { linked, errors, total: skills.size };
}

// ---------------------------------------------------------------------------
// Validate paths
// ---------------------------------------------------------------------------

if (!existsSync(characterPath) && !injectOnly) {
  fail(`Character not found: ${characterPath}`);
}
if (!existsSync(elizaDir)) {
  fail(`Eliza directory not found: ${elizaDir}`);
}

// ---------------------------------------------------------------------------
// Birth-time skill injection
// ---------------------------------------------------------------------------

const stateDir =
  process.env.ELIZA_STATE_DIR || join(homedir(), ".local", "state", "eliza");
const managedSkills = join(stateDir, "skills");
const workspaceSkills = join(elizaDir, "skills");
const hubSkillsDir = resolve(DEFAULT_HUB_SKILLS);

/** @type {Map<string, string>} */
const skillMap = new Map();

// Monorepo suite first (lower precedence)
for (const [name, src] of collectSkillsFromRoot(DEFAULT_SKILLS)) {
  skillMap.set(name, src);
}
// Hub last (overrides suite on name collision)
for (const [name, src] of collectSkillsFromRoot(hubSkillsDir)) {
  skillMap.set(name, src);
}

console.log(
  `[start-eliza-clawd] collected ${skillMap.size} skills` +
    ` (suite=${DEFAULT_SKILLS}, hub=${hubSkillsDir})`,
);

const managedStats = injectSkillsInto(skillMap, managedSkills, "managed");
const workspaceStats = injectSkillsInto(skillMap, workspaceSkills, "workspace");

// Persist extraDirs so boots that skip this script still see the hub.
const skillsJsonPath = join(stateDir, "skills.json");
mkdirSync(stateDir, { recursive: true });
/** @type {{ extraDirs: string[] }} */
let skillsJson = { extraDirs: [] };
if (existsSync(skillsJsonPath)) {
  try {
    skillsJson = JSON.parse(readFileSync(skillsJsonPath, "utf8"));
    if (!Array.isArray(skillsJson.extraDirs)) skillsJson.extraDirs = [];
  } catch {
    skillsJson = { extraDirs: [] };
  }
}
const extraSet = new Set(skillsJson.extraDirs.map((d) => resolve(d)));
if (existsSync(hubSkillsDir)) extraSet.add(hubSkillsDir);
if (existsSync(DEFAULT_SKILLS)) extraSet.add(DEFAULT_SKILLS);
skillsJson.extraDirs = [...extraSet];
writeFileSync(skillsJsonPath, JSON.stringify(skillsJson, null, 2) + "\n");
console.log(
  `[start-eliza-clawd] skills.json extraDirs: ${skillsJson.extraDirs.join(", ")}`,
);

if (injectOnly) {
  console.log("[start-eliza-clawd] inject-only complete");
  console.log(
    JSON.stringify(
      {
        managed: managedStats,
        workspace: workspaceStats,
        skillCount: skillMap.size,
        managedSkills,
        workspaceSkills,
        skillsJsonPath,
      },
      null,
      2,
    ),
  );
  process.exit(managedStats.errors + workspaceStats.errors > 0 ? 1 : 0);
}

// ---------------------------------------------------------------------------
// Persist Clawd as primary agent
// ---------------------------------------------------------------------------

if (!existsSync(characterPath)) {
  fail(`Character not found: ${characterPath}`);
}

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
  assistant: {
    ...((config.ui && config.ui.assistant) || {}),
    name: agentEntry.name,
  },
};
// Keep skills.load.extraDirs in eliza.json as well (runtime-settings path).
if (!config.skills) config.skills = {};
if (!config.skills.load) config.skills.load = {};
config.skills.load.extraDirs = skillsJson.extraDirs;
writeFileSync(configPath, JSON.stringify(config, null, 2) + "\n");

const clawdBrowserTools =
  process.env.CLAWDBROWSER_TOOLS_MD || "/Users/8bit/ClawdBrowser/tools.md";

const env = {
  ...process.env,
  ELIZA_AGENT_CHARACTER_PATH: characterPath,
  ELIZA_STATE_DIR: stateDir,
  ELIZA_NAMESPACE: process.env.ELIZA_NAMESPACE || "eliza",
  EXTRA_SKILLS_DIRS: skillsJson.extraDirs.join(","),
  CLAWDBROWSER_TOOLS_MD:
    process.env.CLAWDBROWSER_TOOLS_MD || clawdBrowserTools,
  ...(process.env.DEEPSEEK_API_KEY
    ? { DEEPSEEK_API_KEY: process.env.DEEPSEEK_API_KEY }
    : {}),
  ...(process.env.DFLOW_API_KEY
    ? { DFLOW_API_KEY: process.env.DFLOW_API_KEY }
    : {}),
  ...(process.env.HELIUS_RPC_URL
    ? { HELIUS_RPC_URL: process.env.HELIUS_RPC_URL }
    : {}),
};

console.log("[start-eliza-clawd] character:", characterPath);
console.log("[start-eliza-clawd] name:     ", agentEntry.name);
console.log("[start-eliza-clawd] state:    ", stateDir);
console.log("[start-eliza-clawd] managed:  ", managedSkills);
console.log("[start-eliza-clawd] workspace:", workspaceSkills);
console.log("[start-eliza-clawd] hub:      ", hubSkillsDir);
console.log("[start-eliza-clawd] tools.md: ", env.CLAWDBROWSER_TOOLS_MD);
console.log("[start-eliza-clawd] eliza:    ", elizaDir);

if (dryRun) {
  console.log("[start-eliza-clawd] dry-run ok — skills injected, not starting");
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
