/**
 * Robinhood / Cheshire skill pack discovery.
 *
 * Suite (top-level): robinhood-agents/skills/* — registries, forge, launch, zk-omni.
 * Nested pack: robinhood-agents/skills/rh-crypto-agent (vendored from go-bot).
 *
 * Operators running clawdbot can point at either:
 *   export CLAWDBOT_SKILLS_DIR="$(pwd)/robinhood-agents/skills"
 *   export CLAWDBOT_SKILLS_DIR="$(pwd)/robinhood-agents/skills/rh-crypto-agent"
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { resolveRobinhoodAgentsRoot } from "./robinhoodAgentsRoot.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
export const PACKAGE_ROOT = join(__dirname, "..");

function suiteDir() {
  const local = resolveRobinhoodAgentsRoot(PACKAGE_ROOT);
  if (local?.skillsDir && existsSync(local.skillsDir)) return local.skillsDir;
  return join(PACKAGE_ROOT, "skills");
}

/** Absolute path to the full skill suite (registry + forge + launch + packs). */
export const RH_SKILLS_SUITE_DIR = join(PACKAGE_ROOT, "skills");

export const RH_SKILLS_SUITE_INDEX_PATH = join(RH_SKILLS_SUITE_DIR, "suite-index.json");

export function getRhSkillsSuiteDir() {
  return suiteDir();
}

export function getRhSkillsSuiteIndexPath() {
  return join(suiteDir(), "suite-index.json");
}

/** Absolute path to the vendored RH open skill pack (pack-index + skill dirs). */
export const RH_CRYPTO_AGENT_PACK_DIR = join(
  PACKAGE_ROOT,
  "skills",
  "rh-crypto-agent",
);

export function getRhCryptoAgentPackDir() {
  return join(suiteDir(), "rh-crypto-agent");
}

export const RH_CRYPTO_AGENT_PACK_INDEX_PATH = join(
  RH_CRYPTO_AGENT_PACK_DIR,
  "pack-index.json",
);

export const RH_CRYPTO_AGENT_CATALOG_PATH = join(
  RH_CRYPTO_AGENT_PACK_DIR,
  "catalog.json",
);

/**
 * Load pack-index.json from the vendored tree (source of truth for skill ids).
 * @returns {{
 *   name: string,
 *   id: string,
 *   version: number,
 *   description?: string,
 *   skillCount: number,
 *   skills: string[],
 *   anyoneCanUse?: boolean,
 *   license?: string,
 *   source?: object,
 *   clawdbotSkillsDirHint?: string,
 * }}
 */
export function loadRhCryptoAgentPackIndex() {
  const packDir = getRhCryptoAgentPackDir();
  const packIndex = join(packDir, "pack-index.json");
  if (!existsSync(packIndex)) {
    throw new Error(
      `RH skill pack missing pack-index at ${packIndex}`,
    );
  }
  const pack = JSON.parse(readFileSync(packIndex, "utf8"));
  if (!Array.isArray(pack.skills)) {
    throw new Error("pack-index.json skills must be an array");
  }
  return pack;
}

/**
 * Absolute path for CLAWDBOT_SKILLS_DIR (pack root containing skill folders).
 */
export function getRhCryptoAgentSkillsDir() {
  return getRhCryptoAgentPackDir();
}

/**
 * List skill ids from pack-index (ordered).
 * @returns {string[]}
 */
export function listRhCryptoAgentSkillIds() {
  return [...loadRhCryptoAgentPackIndex().skills];
}

/**
 * Validate that every pack skill has a SKILL.md and is a directory.
 * @returns {{
 *   ok: boolean,
 *   packId: string,
 *   skillCount: number,
 *   skills: Array<{ id: string, path: string, skillMd: boolean }>,
 *   missing: string[],
 * }}
 */
export function inspectRhCryptoAgentPack() {
  const pack = loadRhCryptoAgentPackIndex();
  const skills = [];
  const missing = [];
  for (const id of pack.skills) {
    const skillDir = join(getRhCryptoAgentPackDir(), id);
    const skillMd = join(skillDir, "SKILL.md");
    const okDir = existsSync(skillDir) && statSync(skillDir).isDirectory();
    const okMd = existsSync(skillMd);
    skills.push({ id, path: skillDir, skillMd: okMd });
    if (!okDir || !okMd) missing.push(id);
  }
  // skillCount in pack-index must match skills array length
  if (pack.skillCount != null && pack.skillCount !== pack.skills.length) {
    missing.push(`skillCount mismatch (${pack.skillCount} vs ${pack.skills.length})`);
  }
  return {
    ok: missing.length === 0,
    packId: pack.id,
    skillCount: pack.skills.length,
    skills,
    missing,
  };
}

/**
 * Flat catalog entries from catalog.json (if present).
 * @returns {Array<{ slug: string, name: string, description?: string, tags?: string[] }>}
 */
export function loadRhCryptoAgentCatalog() {
  const catalogPath = join(getRhCryptoAgentPackDir(), "catalog.json");
  if (!existsSync(catalogPath)) return [];
  const raw = JSON.parse(readFileSync(catalogPath, "utf8"));
  return Array.isArray(raw) ? raw : [];
}

/**
 * Directory entries under the pack that look like skills (have SKILL.md),
 * including any not listed in pack-index (diagnostic only).
 */
export function listSkillDirectoriesWithSkillMd(root = getRhCryptoAgentPackDir()) {
  if (!existsSync(root)) return [];
  return readdirSync(root)
    .filter((name) => {
      const dir = join(root, name);
      return (
        existsSync(dir) &&
        statSync(dir).isDirectory() &&
        existsSync(join(dir, "SKILL.md"))
      );
    })
    .sort();
}

/**
 * Environment snippet operators can export for clawdbot discovery.
 */
export function clawdbotSkillsDirExportLine() {
  return `export CLAWDBOT_SKILLS_DIR="${getRhCryptoAgentPackDir()}"`;
}

/**
 * Load suite-index.json for top-level robinhood-agents skills.
 */
export function loadRhSkillsSuiteIndex() {
  const indexPath = getRhSkillsSuiteIndexPath();
  if (!existsSync(indexPath)) {
    throw new Error(`suite-index missing at ${indexPath}`);
  }
  const pack = JSON.parse(readFileSync(indexPath, "utf8"));
  if (!Array.isArray(pack.skills)) {
    throw new Error("suite-index.json skills must be an array");
  }
  return pack;
}

/**
 * Ordered skill ids from the Cheshire Robinhood suite index.
 */
export function listRhSkillsSuiteIds() {
  return [...loadRhSkillsSuiteIndex().skills];
}

/**
 * Validate every suite skill entry:
 * - Directory exists under robinhood-agents/skills
 * - SKILL.md present, OR (rh-crypto-agent) pack-index + nested skills OK
 */
export function inspectRhSkillsSuite() {
  const suite = loadRhSkillsSuiteIndex();
  const skills = [];
  const missing = [];

  for (const id of suite.skills) {
    const skillDir = join(getRhSkillsSuiteDir(), id);
    const skillMd = join(skillDir, "SKILL.md");
    const okDir = existsSync(skillDir) && statSync(skillDir).isDirectory();

    if (id === "rh-crypto-agent") {
      const packReport = inspectRhCryptoAgentPack();
      skills.push({
        id,
        path: skillDir,
        skillMd: false,
        kind: "pack",
        packOk: packReport.ok,
        packSkillCount: packReport.skillCount,
      });
      if (!okDir || !packReport.ok) missing.push(id);
      continue;
    }

    const okMd = existsSync(skillMd);
    skills.push({ id, path: skillDir, skillMd: okMd, kind: "skill" });
    if (!okDir || !okMd) missing.push(id);
  }

  if (suite.skillCount != null && suite.skillCount !== suite.skills.length) {
    missing.push(`skillCount mismatch (${suite.skillCount} vs ${suite.skills.length})`);
  }

  return {
    ok: missing.length === 0,
    suiteId: suite.id,
    skillCount: suite.skills.length,
    skills,
    missing,
    product: suite.product || null,
  };
}

/** CLAWDBOT export pointing at the full suite (includes nested packs). */
export function clawdbotSuiteSkillsDirExportLine() {
  return `export CLAWDBOT_SKILLS_DIR="${getRhSkillsSuiteDir()}"`;
}
