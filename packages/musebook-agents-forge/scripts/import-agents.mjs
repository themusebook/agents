#!/usr/bin/env node
/**
 * Import character + DeFi agents into musebook-agents-forge catalog (agents/ + locales/).
 *
 * Preferred monorepo sources (when present):
 *   - agents/characters/*.json (except package.json)
 *   - agents/defi-agents/src/*.json
 *   - agents/defi-agents/locales/<id>/index*.json
 *   - agents/defi-agents/schema/Musebook_agent_schema.json
 *
 * npm script entry points:
 *   npm run import:agents
 *   npm run agents:import
 */
import {
  copyFileSync,
  cpSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
  existsSync,
} from "node:fs";
import { dirname, join, basename, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  AGENTS_DIR,
  LOCALES_DIR,
  PACKAGE_ROOT,
  SCHEMA_PATH,
  convertCharacterToMusebookAgent,
  normalizeDefiAgent,
  validateMusebookAgent,
  characterIdentifierFromStem,
  summarizeLocales,
  applyLocaleOverlay,
  loadLocaleOverlay,
  listLocaleAgentIds,
  listLocalesForAgent,
} from "../src/agentCatalog.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(PACKAGE_ROOT, "..");
const CHARACTERS_DIR = join(REPO_ROOT, "agents", "characters");
const DEFI_SRC_DIR = join(REPO_ROOT, "agents", "defi-agents", "src");
const DEFI_LOCALES_DIR = join(REPO_ROOT, "agents", "defi-agents", "locales");
const DEFI_SCHEMA = join(REPO_ROOT, "agents", "defi-agents", "schema", "Musebook_agent_schema.json");

function ensureSchema() {
  mkdirSync(dirname(SCHEMA_PATH), { recursive: true });
  if (!existsSync(DEFI_SCHEMA)) {
    throw new Error(`Missing schema at ${DEFI_SCHEMA}`);
  }
  copyFileSync(DEFI_SCHEMA, SCHEMA_PATH);
}

function listJsonStems(dir, exclude = new Set()) {
  return readdirSync(dir)
    .filter((f) => f.endsWith(".json") && !exclude.has(f))
    .map((f) => basename(f, ".json"))
    .sort();
}

/**
 * Mirror agents/defi-agents/locales → package locales/.
 * Replaces destination tree for a clean sync.
 */
function importLocales() {
  if (!existsSync(DEFI_LOCALES_DIR)) {
    throw new Error(`Missing locales source at ${DEFI_LOCALES_DIR}`);
  }
  if (existsSync(LOCALES_DIR)) {
    rmSync(LOCALES_DIR, { recursive: true, force: true });
  }
  mkdirSync(dirname(LOCALES_DIR), { recursive: true });
  cpSync(DEFI_LOCALES_DIR, LOCALES_DIR, { recursive: true });
  return summarizeLocales(LOCALES_DIR);
}

/**
 * Spot-check that localized agents merge onto catalog base and stay schema-valid.
 */
function validateLocaleMerges(sampleLocales = ["ja-JP", "zh-CN", "es-ES", "de-DE"]) {
  const failures = [];
  let checked = 0;
  for (const id of listLocaleAgentIds()) {
    const basePath = join(AGENTS_DIR, `${id}.json`);
    if (!existsSync(basePath)) {
      failures.push({ identifier: id, error: "locale agent missing from catalog" });
      continue;
    }
    const base = JSON.parse(readFileSync(basePath, "utf8"));
    for (const locale of listLocalesForAgent(id)) {
      if (locale !== "en" && !sampleLocales.includes(locale)) continue;
      const overlay = loadLocaleOverlay(id, locale);
      if (!overlay) {
        failures.push({ identifier: id, locale, error: "overlay load failed" });
        continue;
      }
      const merged = applyLocaleOverlay(base, overlay);
      const result = validateMusebookAgent(merged);
      checked += 1;
      if (!result.ok) {
        failures.push({ identifier: id, locale, error: result.errors.join("; ") });
      }
    }
  }
  return { checked, failures };
}

function main() {
  ensureSchema();
  mkdirSync(AGENTS_DIR, { recursive: true });

  const characterStems = listJsonStems(CHARACTERS_DIR, new Set(["package.json"]));
  const defiStems = listJsonStems(DEFI_SRC_DIR);

  const results = { written: [], failed: [] };

  for (const stem of defiStems) {
    const identifier = stem;
    try {
      const source = JSON.parse(readFileSync(join(DEFI_SRC_DIR, `${stem}.json`), "utf8"));
      const agent = normalizeDefiAgent(source, identifier);
      const validation = validateMusebookAgent(agent);
      if (!validation.ok) {
        throw new Error(validation.errors.join("; "));
      }
      const outPath = join(AGENTS_DIR, `${identifier}.json`);
      writeFileSync(outPath, `${JSON.stringify(agent, null, 2)}\n`, "utf8");
      results.written.push({ identifier, source: "defi", path: outPath });
    } catch (err) {
      results.failed.push({ identifier, source: "defi", error: err.message });
    }
  }

  for (const stem of characterStems) {
    const identifier = characterIdentifierFromStem(stem);
    try {
      const source = JSON.parse(readFileSync(join(CHARACTERS_DIR, `${stem}.json`), "utf8"));
      const agent = convertCharacterToMusebookAgent(source, identifier);
      const validation = validateMusebookAgent(agent);
      if (!validation.ok) {
        throw new Error(validation.errors.join("; "));
      }
      const outPath = join(AGENTS_DIR, `${identifier}.json`);
      writeFileSync(outPath, `${JSON.stringify(agent, null, 2)}\n`, "utf8");
      results.written.push({ identifier, source: "character", path: outPath });
    } catch (err) {
      results.failed.push({ identifier, source: "character", error: err.message });
    }
  }

  let localesSummary;
  let localeMerge;
  try {
    localesSummary = importLocales();
    localeMerge = validateLocaleMerges();
    if (localeMerge.failures.length > 0) {
      results.failed.push(
        ...localeMerge.failures.map((f) => ({
          identifier: f.identifier,
          source: "locale",
          error: `${f.locale || "n/a"}: ${f.error}`,
        })),
      );
    }
  } catch (err) {
    results.failed.push({ identifier: "locales", source: "locale", error: err.message });
  }

  const summary = {
    schema: SCHEMA_PATH,
    agentsDir: AGENTS_DIR,
    localesDir: LOCALES_DIR,
    characterSourceCount: characterStems.length,
    defiSourceCount: defiStems.length,
    written: results.written.length,
    failed: results.failed.length,
    identifiers: results.written.map((w) => w.identifier).sort(),
    locales: localesSummary
      ? {
          agentCount: localesSummary.agentCount,
          fileCount: localesSummary.fileCount,
          mergeChecks: localeMerge?.checked ?? 0,
        }
      : null,
    failures: results.failed,
  };

  console.log(JSON.stringify(summary, null, 2));
  if (results.failed.length > 0) {
    process.exitCode = 1;
  }
}

main();
