/**
 * RH crypto-agent skill pack vendored from go-bot — discovery + completeness.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  RH_CRYPTO_AGENT_PACK_DIR,
  RH_CRYPTO_AGENT_PACK_INDEX_PATH,
  RH_SKILLS_SUITE_DIR,
  RH_SKILLS_SUITE_INDEX_PATH,
  getRhCryptoAgentSkillsDir,
  inspectRhCryptoAgentPack,
  inspectRhSkillsSuite,
  listRhCryptoAgentSkillIds,
  listRhSkillsSuiteIds,
  listSkillDirectoriesWithSkillMd,
  loadRhCryptoAgentCatalog,
  loadRhCryptoAgentPackIndex,
  loadRhSkillsSuiteIndex,
  clawdbotSkillsDirExportLine,
  clawdbotSuiteSkillsDirExportLine,
} from "../src/skillPack.js";
import { listCatalogIdentifiers, validateCatalog } from "../src/agentCatalog.js";

test("RH skill pack pack-index is present and complete", () => {
  assert.ok(
    existsSync(RH_CRYPTO_AGENT_PACK_INDEX_PATH),
    "pack-index.json must be vendored",
  );
  const pack = loadRhCryptoAgentPackIndex();
  assert.equal(pack.id, "rh-crypto-agent");
  assert.ok(Array.isArray(pack.skills));
  assert.equal(pack.skills.length, pack.skillCount);
  assert.ok(pack.skills.length >= 16, `open RH pack expected ≥16, got ${pack.skills.length}`);
  assert.ok(pack.skills.every((s) => typeof s === "string"), "skills must be string ids");
  assert.ok(pack.skills.includes("rh-bonded-launch"));
  assert.ok(pack.skills.includes("rh-launchpad-v3"));
  assert.ok(pack.skills.includes("viem-integration"));
});

test("inspectRhCryptoAgentPack verifies every SKILL.md from pack-index", () => {
  const report = inspectRhCryptoAgentPack();
  assert.equal(report.ok, true, `missing skills: ${report.missing.join(", ")}`);
  assert.equal(report.skillCount, listRhCryptoAgentSkillIds().length);
  for (const skill of report.skills) {
    assert.equal(skill.skillMd, true, `${skill.id} needs SKILL.md`);
    assert.ok(existsSync(join(skill.path, "SKILL.md")));
    const body = readFileSync(join(skill.path, "SKILL.md"), "utf8");
    assert.ok(body.length > 40, `${skill.id} SKILL.md too short`);
  }
  // Pack-index is the source of truth — drive listing from shipped helper
  assert.deepEqual(listRhCryptoAgentSkillIds(), report.skills.map((s) => s.id));
});

test("CLAWDBOT_SKILLS_DIR points at pack root with skill directories", () => {
  const dir = getRhCryptoAgentSkillsDir();
  assert.equal(dir, RH_CRYPTO_AGENT_PACK_DIR);
  assert.ok(existsSync(join(dir, "pack-index.json")));
  const dirs = listSkillDirectoriesWithSkillMd(dir);
  assert.ok(dirs.includes("rh-bonded-launch"));
  assert.ok(dirs.includes("swap-integration"));
  // pack-index skills ⊆ directory listing
  for (const id of listRhCryptoAgentSkillIds()) {
    assert.ok(dirs.includes(id), `directory missing for ${id}`);
  }
  assert.match(clawdbotSkillsDirExportLine(), /CLAWDBOT_SKILLS_DIR=/);
  assert.match(clawdbotSkillsDirExportLine(), /rh-crypto-agent/);
});

test("catalog.json covers classic open RH pack slugs", () => {
  const catalog = loadRhCryptoAgentCatalog();
  assert.ok(catalog.length >= 16);
  const slugs = new Set(catalog.map((e) => e.slug || e.name));
  // catalog.json may lag newer registry skills; require classic open pack core
  for (const id of [
    "rh-bonded-launch",
    "rh-launchpad-v3",
    "swap-integration",
    "viem-integration",
    "copy-trade",
  ]) {
    assert.ok(slugs.has(id), `catalog missing slug ${id}`);
  }
});

test("agent catalog non-regression after skill pack vendoring", () => {
  const ids = listCatalogIdentifiers();
  assert.ok(ids.length >= 50, `expected full agent catalog, got ${ids.length}`);
  const report = validateCatalog();
  assert.equal(report.ok, true, JSON.stringify(report.failed || report, null, 2));
  // forge skill still present
  assert.ok(
    existsSync(
      join(RH_CRYPTO_AGENT_PACK_DIR, "..", "robinhood-agent-forge", "SKILL.md"),
    ),
    "robinhood-agent-forge must remain alongside the RH pack",
  );
});

test("Musebook Robinhood skills suite-index covers all first-class skill dirs", () => {
  assert.ok(existsSync(RH_SKILLS_SUITE_INDEX_PATH), "suite-index.json required");
  const suite = loadRhSkillsSuiteIndex();
  assert.equal(suite.id, "musebook-robinhood-agents-skills");
  const required = [
    "musebook-agent-identity-registry",
    "musebook-agent-registries",
    "musebook-agent-reputation-registry",
    "musebook-agent-validation-registry",
    "musebook-omni-mint",
    "musebook-zk-omni",
    "rh-bonded-launch",
    "rh-crypto-agent",
    "rh-launchpad-v3",
    "robinhood-agent-forge",
    "zk-omni-messaging",
  ];
  assert.equal(suite.skills.length, required.length);
  assert.equal(suite.skillCount, required.length);
  for (const id of required) {
    assert.ok(suite.skills.includes(id), `suite missing ${id}`);
  }
  assert.deepEqual(listRhSkillsSuiteIds().sort(), [...suite.skills].sort());
});

test("inspectRhSkillsSuite verifies suite SKILL.md files and rh-crypto pack", () => {
  const report = inspectRhSkillsSuite();
  assert.equal(report.ok, true, `suite missing: ${report.missing.join(", ")}`);
  assert.equal(report.skillCount, 11);
  assert.equal(report.suiteId, "musebook-robinhood-agents-skills");
  const byId = new Map(report.skills.map((s) => [s.id, s]));
  for (const id of listRhSkillsSuiteIds()) {
    assert.ok(byId.has(id), id);
  }
  assert.equal(byId.get("rh-crypto-agent")?.kind, "pack");
  assert.equal(byId.get("rh-crypto-agent")?.packOk, true);
  assert.equal(byId.get("robinhood-agent-forge")?.skillMd, true);
  assert.equal(byId.get("musebook-agent-identity-registry")?.skillMd, true);
  assert.equal(byId.get("musebook-omni-mint")?.skillMd, true);
  assert.match(clawdbotSuiteSkillsDirExportLine(), /CLAWDBOT_SKILLS_DIR=/);
  assert.match(clawdbotSuiteSkillsDirExportLine(), /robinhood-agents\/skills/);
  assert.ok(existsSync(RH_SKILLS_SUITE_DIR));
});
