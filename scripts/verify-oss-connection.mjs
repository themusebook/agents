#!/usr/bin/env node
/**
 * Gating verifier: shipped OSS connection map must include the six OBJECTIVE URLs.
 * Reads only shipped artifacts (map + eliza-agents catalog). No network required.
 *
 * Exit 0 on pass; non-zero with details on fail.
 */
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

const REQUIRED = {
  productHubs: [
    "https://cheshireterminal.ai/agents",
    "https://cheshireterminal.ai/cli",
    "https://cheshireterminal.ai/eliza-agents",
  ],
  github: [
    "https://github.com/Solizardking/agents",
    "https://github.com/Solizardking/cli",
    "https://github.com/Solizardking/eliza",
    "https://github.com/Solizardking/cheshire-terminal",
  ],
};

/** Accept Solizardking or solizardking host casing for GitHub paths. */
function normalizeGithub(url) {
  return String(url || "")
    .replace(/^https:\/\/github\.com\/solizardking\//i, "https://github.com/Solizardking/")
    .replace(/\/$/, "");
}

function loadJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function collectStrings(value, out = []) {
  if (typeof value === "string") {
    out.push(value);
    return out;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectStrings(item, out);
    return out;
  }
  if (value && typeof value === "object") {
    for (const v of Object.values(value)) collectStrings(v, out);
  }
  return out;
}

const failures = [];
const mapPath = join(root, "open-source-connection-map.json");
const catalogPath = join(root, "eliza-agents", "catalog.json");

if (!existsSync(mapPath)) {
  failures.push(`missing shipped map: ${mapPath}`);
}
if (!existsSync(catalogPath)) {
  failures.push(`missing eliza-agents catalog: ${catalogPath}`);
}

let map = null;
let catalog = null;
if (existsSync(mapPath)) {
  try {
    map = loadJson(mapPath);
  } catch (e) {
    failures.push(`map parse error: ${e.message}`);
  }
}
if (existsSync(catalogPath)) {
  try {
    catalog = loadJson(catalogPath);
  } catch (e) {
    failures.push(`catalog parse error: ${e.message}`);
  }
}

if (map) {
  const strings = collectStrings(map).map(normalizeGithub);
  for (const url of REQUIRED.productHubs) {
    if (!strings.includes(url)) {
      failures.push(`map missing product hub: ${url}`);
    }
  }
  for (const url of REQUIRED.github) {
    if (!strings.includes(normalizeGithub(url))) {
      failures.push(`map missing github repo: ${url}`);
    }
  }
  if (!map.github || Object.keys(map.github).length < 4) {
    failures.push("map.github must list all four repos");
  }
  if (!Array.isArray(map.repos) || map.repos.length < 4) {
    failures.push("map.repos must list all four repos");
  }
}

if (catalog) {
  const strings = collectStrings(catalog).map(normalizeGithub);
  for (const url of REQUIRED.productHubs) {
    if (!strings.includes(url) && !strings.some((s) => s.includes("cheshireterminal.ai/eliza-agents") || s.includes("cheshireterminal.ai/agents"))) {
      // product field may be host/path without scheme for eliza surface
    }
  }
  // Full map must appear (openSource or equivalent fields)
  const oss = catalog.openSource || catalog.ossConnection || null;
  if (!oss) {
    failures.push("eliza-agents/catalog.json must expose openSource connection map");
  } else {
    const ossStrings = collectStrings(oss).map(normalizeGithub);
    for (const url of REQUIRED.github) {
      if (!ossStrings.includes(normalizeGithub(url))) {
        failures.push(`eliza-agents catalog openSource missing: ${url}`);
      }
    }
    for (const url of REQUIRED.productHubs) {
      if (!ossStrings.includes(url)) {
        failures.push(`eliza-agents catalog openSource missing hub: ${url}`);
      }
    }
  }
  // Keep legacy fields consistent
  if (catalog.elizaFork && normalizeGithub(catalog.elizaFork) !== REQUIRED.github[2]) {
    failures.push(`elizaFork drift: ${catalog.elizaFork}`);
  }
  if (catalog.agentsRepo && normalizeGithub(catalog.agentsRepo) !== REQUIRED.github[0]) {
    failures.push(`agentsRepo drift: ${catalog.agentsRepo}`);
  }
}

// Optional: CLI catalog mirror if present
const cliCatalog = join(root, "cli", "src", "catalog.mjs");
if (existsSync(cliCatalog)) {
  const text = readFileSync(cliCatalog, "utf8");
  for (const url of REQUIRED.github) {
    if (!text.includes(url) && !text.includes(url.replace("Solizardking", "solizardking"))) {
      failures.push(`cli/src/catalog.mjs missing: ${url}`);
    }
  }
  if (!text.includes("https://cheshireterminal.ai/agents") || !text.includes("https://cheshireterminal.ai/eliza-agents")) {
    failures.push("cli/src/catalog.mjs missing product hub URLs");
  }
}

const report = {
  ok: failures.length === 0,
  mapPath: existsSync(mapPath) ? mapPath : null,
  catalogPath: existsSync(catalogPath) ? catalogPath : null,
  cliCatalogPresent: existsSync(cliCatalog),
  required: REQUIRED,
  extracted: map
    ? {
        productHubs: map.productHubs,
        github: map.github,
        repoCount: Array.isArray(map.repos) ? map.repos.length : 0,
      }
    : null,
  failures,
};

console.log(JSON.stringify(report, null, 2));

if (failures.length) {
  console.error(`\nverify-oss-connection: FAIL (${failures.length} issue(s))`);
  process.exit(1);
}
console.error("\nverify-oss-connection: PASS");
process.exit(0);
