#!/usr/bin/env node
/**
 * Sync the open-source Robinhood crypto-agent skill pack from go-bot into this package.
 *
 * Usage (from robinhood-agents root):
 *   node scripts/sync-rh-skill-pack.mjs
 *   GO_BOT_SKILLS=/path/to/go-bot/skills node scripts/sync-rh-skill-pack.mjs
 *
 * Only copies pack-index skills + pack metadata. Does not copy go-bot binaries,
 * build/, dist/, or web frontends.
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
const DEST = join(PACKAGE_ROOT, "skills", "rh-crypto-agent");

const CANDIDATE_SOURCES = [
  process.env.GO_BOT_SKILLS,
  process.env.CLAWD_GO_BOT_SKILLS,
  // Sibling monorepo layouts
  resolve(PACKAGE_ROOT, "../../ClawdBrowser/go-bot/skills"),
  resolve(PACKAGE_ROOT, "../../../ClawdBrowser/go-bot/skills"),
  "/Users/8bit/ClawdBrowser/go-bot/skills",
].filter(Boolean);

function resolveSource() {
  for (const candidate of CANDIDATE_SOURCES) {
    const packIndex = join(candidate, "pack-index.json");
    if (existsSync(packIndex)) return candidate;
  }
  throw new Error(
    "Could not find go-bot skills pack-index.json. Set GO_BOT_SKILLS=/path/to/go-bot/skills",
  );
}

function main() {
  const source = resolveSource();
  const pack = JSON.parse(readFileSync(join(source, "pack-index.json"), "utf8"));
  if (!Array.isArray(pack.skills) || pack.skills.length === 0) {
    throw new Error("pack-index.json has no skills[] array");
  }
  const skillIds = pack.skills.map((entry) => {
    if (typeof entry === "string") return entry;
    if (entry && typeof entry === "object") {
      const id = entry.path || entry.name || entry.id || entry.slug;
      if (typeof id === "string" && id.trim()) return id.trim();
    }
    throw new Error(`invalid pack-index skill entry: ${JSON.stringify(entry)}`);
  });

  mkdirSync(DEST, { recursive: true });

  for (const name of ["pack-index.json", "catalog.json", "README.md"]) {
    const from = join(source, name);
    if (!existsSync(from)) {
      if (name === "README.md") continue;
      throw new Error(`missing ${name} in ${source}`);
    }
    cpSync(from, join(DEST, name));
  }

  for (const skillId of skillIds) {
    const from = join(source, skillId);
    const to = join(DEST, skillId);
    if (!existsSync(join(from, "SKILL.md"))) {
      throw new Error(`skill ${skillId} missing SKILL.md at ${from}`);
    }
    rmSync(to, { recursive: true, force: true });
    cpSync(from, to, { recursive: true });
  }

  // Stamp vendoring metadata (does not change skill ids).
  const stamped = {
    ...pack,
    skills: skillIds,
    skillCount: skillIds.length,
    source: {
      upstream: "go-bot/skills",
      upstreamPath: source,
      upstreamId: pack.id || "rh-crypto-agent",
      vendoredInto: "musebook-agents-forge/skills/rh-crypto-agent",
      syncScript: "scripts/sync-rh-skill-pack.mjs",
      syncedAt: new Date().toISOString(),
    },
    clawdbotSkillsDirHint: "skills/rh-crypto-agent",
  };
  writeFileSync(join(DEST, "pack-index.json"), `${JSON.stringify(stamped, null, 2)}\n`);

  console.log(
    JSON.stringify(
      {
        ok: true,
        source,
        dest: DEST,
        skillCount: skillIds.length,
        skills: skillIds,
      },
      null,
      2,
    ),
  );
}

main();
