import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, basename, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  AGENTS_DIR,
  LOCALES_DIR,
  SCHEMA_PATH,
  PACKAGE_ROOT,
  loadMusebookSchema,
  listCatalogIdentifiers,
  loadCatalog,
  validateMusebookAgent,
  validateCatalog,
  convertCharacterToMusebookAgent,
  normalizeDefiAgent,
  characterIdentifierFromStem,
  expectedCatalogIdentifiers,
  listLocaleAgentIds,
  listLocalesForAgent,
  loadLocaleOverlay,
  applyLocaleOverlay,
  loadAgentWithLocale,
  summarizeLocales,
  localeCodeFromFilename,
} from "../src/agentCatalog.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(PACKAGE_ROOT, "..");
const CHARACTERS_DIR = join(REPO_ROOT, "agents", "characters");
const DEFI_SRC_DIR = join(REPO_ROOT, "agents", "defi-agents", "src");
const DEFI_LOCALES_DIR = join(REPO_ROOT, "agents", "defi-agents", "locales");

function sourceCharacterStems() {
  return readdirSync(CHARACTERS_DIR)
    .filter((f) => f.endsWith(".json") && f !== "package.json")
    .map((f) => basename(f, ".json"))
    .sort();
}

function sourceDefiStems() {
  return readdirSync(DEFI_SRC_DIR)
    .filter((f) => f.endsWith(".json"))
    .map((f) => basename(f, ".json"))
    .sort();
}

test("Musebook schema is vendored under musebook-agents-forge package", () => {
  assert.ok(existsSync(SCHEMA_PATH), `schema missing at ${SCHEMA_PATH}`);
  const schema = loadMusebookSchema();
  assert.equal(schema.type, "object");
  assert.ok(Array.isArray(schema.required));
  assert.ok(schema.required.includes("config"));
  assert.ok(schema.required.includes("identifier"));
  assert.ok(schema.properties?.config?.required?.includes("systemRole"));
  assert.ok(schema.properties?.meta?.required?.includes("title"));
});

test("catalog contains every character + defi source identifier", () => {
  const characterStems = sourceCharacterStems();
  const defiStems = sourceDefiStems();
  assert.equal(characterStems.length, 10, "expected 10 character agents (excluding package.json)");
  assert.ok(defiStems.length >= 40, `expected ~43 defi agents, got ${defiStems.length}`);

  const expected = expectedCatalogIdentifiers(characterStems, defiStems);
  const actual = listCatalogIdentifiers();
  assert.deepEqual(actual, expected, "catalog identifiers must match source stems");

  // package.json must never appear as an agent
  assert.ok(!actual.includes("package"));
  assert.ok(!actual.includes("package.json"));
});

test("every catalog agent validates against Musebook schema contract", () => {
  const report = validateCatalog();
  if (!report.ok) {
    const detail = report.failed
      .map((f) => `${f.identifier}: ${f.errors.join("; ")}`)
      .join("\n");
    assert.fail(`schema validation failed for ${report.failed.length}/${report.total}:\n${detail}`);
  }
  assert.ok(report.total >= 50, `expected full catalog, got ${report.total}`);
  assert.equal(report.passed, report.total);
  console.log(`SCHEMA_PASS total=${report.total} passed=${report.passed}`);
});

test("content preservation: investor character (warrenbuffet)", () => {
  const agent = JSON.parse(readFileSync(join(AGENTS_DIR, "warrenbuffet.json"), "utf8"));
  const role = agent.config.systemRole;
  assert.match(role, /Warren Buffett/i);
  assert.match(role, /margin of safety/i);
  assert.match(role, /Oracle of Omaha|circle of competence|owner earnings/i);
  assert.ok(agent.meta.description.length > 20);
  assert.ok(role.length > 200, "systemRole must carry real persona content");
});

test("content preservation: narrative character (musebook or clawd)", () => {
  const musebookId = listCatalogIdentifiers().find((id) => id.includes("musebook"));
  const clawdId = "clawd";
  assert.ok(musebookId, "musebook character must be in catalog");
  const musebook = JSON.parse(readFileSync(join(AGENTS_DIR, `${musebookId}.json`), "utf8"));
  assert.match(musebook.config.systemRole, /Musebook/i);
  assert.match(musebook.config.systemRole, /Oracle of the Swarm|generative|riddles/i);

  const clawd = JSON.parse(readFileSync(join(AGENTS_DIR, `${clawdId}.json`), "utf8"));
  assert.match(clawd.config.systemRole, /Clawd/i);
  assert.match(clawd.config.systemRole, /Solana|x402|oracle/i);
});

test("content preservation: defi agent (defi-yield-farmer)", () => {
  const agent = JSON.parse(readFileSync(join(AGENTS_DIR, "defi-yield-farmer.json"), "utf8"));
  assert.equal(agent.identifier, "defi-yield-farmer");
  assert.match(agent.config.systemRole, /yield farming/i);
  assert.match(agent.config.systemRole, /Aave|Compound|Curve|Impermanent loss/i);
  assert.match(agent.meta.description, /yield farming/i);
});

test("convertCharacterToMusebookAgent produces valid agents from source files", () => {
  for (const stem of sourceCharacterStems()) {
    const source = JSON.parse(readFileSync(join(CHARACTERS_DIR, `${stem}.json`), "utf8"));
    const identifier = characterIdentifierFromStem(stem);
    const agent = convertCharacterToMusebookAgent(source, identifier);
    const result = validateMusebookAgent(agent);
    assert.equal(result.ok, true, `${identifier}: ${(result.errors || []).join("; ")}`);
    assert.equal(agent.identifier, identifier);
    assert.ok(agent.config.systemRole.length > 50);
  }
});

test("normalizeDefiAgent preserves systemRole from real defi sources", () => {
  const stem = "defi-yield-farmer";
  const source = JSON.parse(readFileSync(join(DEFI_SRC_DIR, `${stem}.json`), "utf8"));
  const agent = normalizeDefiAgent(source, stem);
  const result = validateMusebookAgent(agent);
  assert.equal(result.ok, true, (result.errors || []).join("; "));
  assert.equal(agent.config.systemRole, source.config.systemRole);
});

test("validateMusebookAgent rejects incomplete agents", () => {
  const bad = { identifier: "x" };
  const result = validateMusebookAgent(bad);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => e.includes("missing required field")));
});

test("loadCatalog returns schema-valid entries with matching file stems", () => {
  const entries = loadCatalog();
  assert.ok(entries.length > 0);
  for (const { identifier, agent } of entries) {
    assert.equal(agent.identifier, identifier);
  }
});

test("locales tree is synced from defi-agents/locales", () => {
  assert.ok(existsSync(LOCALES_DIR), `locales missing at ${LOCALES_DIR}`);
  const sourceIds = readdirSync(DEFI_LOCALES_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort();
  const localIds = listLocaleAgentIds();
  assert.deepEqual(localIds, sourceIds, "locale agent folders must match source");

  const summary = summarizeLocales();
  assert.ok(summary.agentCount >= 40, `expected ~43 locale agents, got ${summary.agentCount}`);
  assert.ok(summary.fileCount > 100, `expected hundreds of locale files, got ${summary.fileCount}`);
  console.log(`LOCALES_PASS agents=${summary.agentCount} files=${summary.fileCount}`);
});

test("localeCodeFromFilename maps index patterns", () => {
  assert.equal(localeCodeFromFilename("index.json"), "en");
  assert.equal(localeCodeFromFilename("index.ja-JP.json"), "ja-JP");
  assert.equal(localeCodeFromFilename("index.zh-CN.json"), "zh-CN");
  assert.equal(localeCodeFromFilename("readme.md"), null);
});

test("locale overlays merge into schema-valid agents with preserved identity", () => {
  const id = "defi-yield-farmer";
  assert.ok(listLocaleAgentIds().includes(id));
  const locales = listLocalesForAgent(id);
  assert.ok(locales.includes("en"));
  assert.ok(locales.includes("ja-JP"));

  const base = JSON.parse(readFileSync(join(AGENTS_DIR, `${id}.json`), "utf8"));
  const jaOverlay = loadLocaleOverlay(id, "ja-JP");
  assert.ok(jaOverlay?.config?.systemRole);
  assert.match(jaOverlay.config.systemRole, /利回り|DeFi/);

  const merged = applyLocaleOverlay(base, jaOverlay);
  const result = validateMusebookAgent(merged);
  assert.equal(result.ok, true, (result.errors || []).join("; "));
  assert.equal(merged.identifier, id);
  assert.equal(merged.author, base.author);
  assert.equal(merged.schemaVersion, base.schemaVersion);
  assert.match(merged.config.systemRole, /利回り|あなたは/);
  assert.match(merged.meta.title, /利回り|農業|戦略/);
});

test("loadAgentWithLocale returns localized systemRole for non-en locales", () => {
  const id = "defi-yield-farmer";
  const en = loadAgentWithLocale(id, "en");
  const ja = loadAgentWithLocale(id, "ja-JP");
  assert.equal(en.identifier, id);
  assert.equal(ja.identifier, id);
  assert.notEqual(ja.config.systemRole, en.config.systemRole);
  assert.match(ja.config.systemRole, /あなたは|利回り/);
  assert.equal(validateMusebookAgent(ja).ok, true);
});

test("every locale agent folder has a matching catalog agent", () => {
  const catalog = new Set(listCatalogIdentifiers());
  for (const id of listLocaleAgentIds()) {
    assert.ok(catalog.has(id), `locale agent ${id} missing from agents/ catalog`);
  }
});
