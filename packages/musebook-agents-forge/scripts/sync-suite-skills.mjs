#!/usr/bin/env node
/**
 * Mirror Robinhood / Musebook agent skills into monorepo /skills hub discovery roots:
 *   skills/<id>/SKILL.md
 *   .agents/skills/<id>/SKILL.md
 *
 * Sources (in order of preference per skill id):
 *   1. robinhood-agents/skills/<id>/           (top-level suite)
 *   2. robinhood-agents/skills/rh-crypto-agent/<id>/  (flattened go-bot pack)
 *   3. $GO_BOT_SKILLS/<id>/ or ClawdBrowser/go-bot/skills/<id>/
 *
 * The nested rh-crypto-agent pack is intentionally flattened so every go-bot
 * skill is a first-class /skills hub entry (not only nested under the pack).
 *
 * Usage:
 *   node robinhood-agents/scripts/sync-suite-skills.mjs
 *   GO_BOT_SKILLS=/path/to/go-bot/skills node robinhood-agents/scripts/sync-suite-skills.mjs
 */
import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = resolve(__dirname, "..");
const REPO_ROOT = resolve(PACKAGE_ROOT, "..");
const SUITE_DIR = join(PACKAGE_ROOT, "skills");
const SUITE_INDEX = join(SUITE_DIR, "suite-index.json");
const PACK_DIR = join(SUITE_DIR, "rh-crypto-agent");
const PACK_INDEX = join(PACK_DIR, "pack-index.json");

const GO_BOT_CANDIDATES = [
  process.env.GO_BOT_SKILLS,
  process.env.CLAWD_GO_BOT_SKILLS,
  "/Users/8bit/ClawdBrowser/go-bot/skills",
  resolve(REPO_ROOT, "../ClawdBrowser/go-bot/skills"),
  resolve(PACKAGE_ROOT, "../../ClawdBrowser/go-bot/skills"),
].filter(Boolean);

function relativeSafe(abs) {
  return abs.startsWith(REPO_ROOT) ? abs.slice(REPO_ROOT.length + 1) : abs;
}

function resolveGoBotSkills() {
  for (const candidate of GO_BOT_CANDIDATES) {
    if (existsSync(join(candidate, "pack-index.json")) || existsSync(join(candidate, "copy-trade", "SKILL.md"))) {
      return candidate;
    }
  }
  return null;
}

function loadJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function skillSourceFor(id, goBotRoot) {
  const suiteSkill = join(SUITE_DIR, id);
  if (existsSync(join(suiteSkill, "SKILL.md"))) {
    return { from: suiteSkill, source: "suite" };
  }
  const packSkill = join(PACK_DIR, id);
  if (existsSync(join(packSkill, "SKILL.md"))) {
    return { from: packSkill, source: "rh-crypto-agent-pack" };
  }
  if (goBotRoot) {
    const goBotSkill = join(goBotRoot, id);
    if (existsSync(join(goBotSkill, "SKILL.md"))) {
      return { from: goBotSkill, source: "go-bot" };
    }
  }
  return null;
}

function collectSkillIds(suite, pack) {
  const ids = new Set();
  for (const id of suite.skills || []) {
    if (id !== "rh-crypto-agent") ids.add(id);
  }
  for (const id of pack.skills || []) {
    ids.add(id);
  }
  // Always include classic open-pack core even if indexes drift
  for (const id of [
    "copy-trade",
    "dca-bot",
    "deployer",
    "index-bot",
    "liquidity-planner",
    "lp-integration",
    "pay-with-any-token",
    "pay-with-app",
    "swap-integration",
    "swap-planner",
    "v4-hook-generator",
    "v4-sdk-integration",
    "v4-security-foundations",
    "viem-integration",
    "rh-bonded-launch",
    "rh-launchpad-v3",
  ]) {
    ids.add(id);
  }
  return [...ids].sort();
}

const suite = loadJson(SUITE_INDEX);
const pack = existsSync(PACK_INDEX)
  ? loadJson(PACK_INDEX)
  : { skills: [], id: "rh-crypto-agent", skillCount: 0 };
const goBotRoot = resolveGoBotSkills();
const skillIds = collectSkillIds(suite, pack);

const targets = [join(REPO_ROOT, "skills"), join(REPO_ROOT, ".agents", "skills")];

const copied = [];
const skipped = [];
const sources = {};

for (const targetRoot of targets) {
  mkdirSync(targetRoot, { recursive: true });
  for (const id of skillIds) {
    const resolved = skillSourceFor(id, goBotRoot);
    if (!resolved) {
      skipped.push({ id, reason: "missing SKILL.md in suite/pack/go-bot" });
      continue;
    }
    sources[id] = resolved.source;
    const to = join(targetRoot, id);
    rmSync(to, { recursive: true, force: true });
    cpSync(resolved.from, to, { recursive: true });
    copied.push({ id, to: relativeSafe(to), source: resolved.source });
  }
}

const uniqueSkillIds = [...new Set(copied.map((c) => c.id))].sort();
const stamp = {
  suiteId: suite.id,
  packId: pack.id || "rh-crypto-agent",
  syncedAt: new Date().toISOString(),
  source: {
    suite: "robinhood-agents/skills",
    pack: "robinhood-agents/skills/rh-crypto-agent",
    goBot: goBotRoot || null,
  },
  skillCount: uniqueSkillIds.length,
  skills: uniqueSkillIds,
  sources,
  note: "First-class /skills hub mirrors — flattened pack + suite skills via sync-suite-skills.mjs",
};

writeFileSync(
  join(REPO_ROOT, "skills", "robinhood-agents-suite.json"),
  `${JSON.stringify(stamp, null, 2)}\n`,
);

const hubMissing = skillIds.filter(
  (id) =>
    !existsSync(join(REPO_ROOT, "skills", id, "SKILL.md")) ||
    !existsSync(join(REPO_ROOT, ".agents", "skills", id, "SKILL.md")),
);

const result = {
  ok: skipped.length === 0 && hubMissing.length === 0,
  suiteId: suite.id,
  packId: pack.id,
  goBotRoot,
  skillIds: uniqueSkillIds,
  skillCount: uniqueSkillIds.length,
  copied: copied.length,
  skipped,
  hubMissing,
  targets: targets.map(relativeSafe),
  stamp: "skills/robinhood-agents-suite.json",
};

console.log(JSON.stringify(result, null, 2));
if (!result.ok) process.exitCode = 1;
