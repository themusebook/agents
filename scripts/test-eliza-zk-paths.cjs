#!/usr/bin/env node
/**
 * Structural smoke test for eliza-agents + zk-primitives package surfaces.
 * Ensures nested packages are present, catalog wires OSS repos, and exports resolve.
 */
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const failures = [];

function ok(cond, msg) {
  if (!cond) failures.push(msg);
  else console.log(`OK: ${msg}`);
}

function exists(rel) {
  return fs.existsSync(path.join(ROOT, rel));
}

function readJson(rel) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, rel), "utf8"));
}

// --- eliza-agents ---
ok(exists("eliza-agents/catalog.json"), "eliza-agents/catalog.json present");
ok(exists("eliza-agents/README.md"), "eliza-agents/README.md present");
ok(exists("eliza-agents/docs/KNOWLEDGE_RAG.md"), "eliza-agents knowledge RAG docs");
ok(exists("eliza-agents/characters"), "eliza-agents/characters directory");

if (exists("eliza-agents/catalog.json")) {
  const cat = readJson("eliza-agents/catalog.json");
  ok(cat.premiereCharacter === "elizero", "catalog.premiereCharacter is elizero");
  ok(Array.isArray(cat.characters) && cat.characters[0]?.id === "elizero", "eliZERO leads eliza character list");
  ok(typeof cat.elizaFork === "string" && cat.elizaFork.includes("Solizardking/eliza"), "catalog.elizaFork");
  ok(typeof cat.agentsRepo === "string" && cat.agentsRepo.includes("Solizardking/agents"), "catalog.agentsRepo");
  ok(cat.openSource && cat.openSource.github, "catalog.openSource.github present");
  if (cat.openSource?.github) {
    const g = cat.openSource.github;
    ok(String(g.agents || "").includes("Solizardking/agents"), "openSource.github.agents");
    ok(String(g.cli || "").includes("Solizardking/cli"), "openSource.github.cli");
    ok(String(g.eliza || "").includes("Solizardking/eliza"), "openSource.github.eliza");
    ok(String(g.cheshireTerminal || "").includes("Solizardking/cheshire-terminal"), "openSource.github.cheshireTerminal");
    ok(String(g.skills || "").includes("Solizardking/skills"), "openSource.github.skills");
    ok(String(g.skillhub || "").includes("Solizardking/skillhub-main"), "openSource.github.skillhub");
  }
  if (cat.openSource?.productHubs) {
    ok(cat.openSource.productHubs.agents === "https://cheshireterminal.ai/agents", "productHubs.agents");
    ok(
      cat.openSource.productHubs.elizaAgents === "https://cheshireterminal.ai/eliza-agents",
      "productHubs.elizaAgents",
    );
    ok(cat.openSource.productHubs.skills === "https://cheshireterminal.ai/skills", "productHubs.skills");
  }
}

// --- zk-primitives ---
ok(exists("zk-primitives/package.json"), "zk-primitives/package.json present");
ok(exists("zk-primitives/README.md"), "zk-primitives/README.md present");
ok(exists("zk-primitives/client"), "zk-primitives/client present");
ok(exists("zk-primitives/agent"), "zk-primitives/agent present");
ok(exists("zk-primitives/programs"), "zk-primitives/programs present");

// package.json exports
const pkg = readJson("package.json");
ok(pkg.exports && pkg.exports["./eliza-agents/*"], "package exports eliza-agents/*");
ok(pkg.exports && pkg.exports["./zk-primitives/*"], "package exports zk-primitives/*");
ok(Array.isArray(pkg.files) && pkg.files.includes("eliza-agents/"), "files[] includes eliza-agents/");
ok(Array.isArray(pkg.files) && pkg.files.includes("zk-primitives/"), "files[] includes zk-primitives/");

// OSS map shipped with package
ok(exists("open-source-connection-map.json"), "open-source-connection-map.json present");

if (failures.length) {
  console.error("\ntest-eliza-zk-paths: FAIL");
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log("\nAll eliza-agents + zk-primitives path tests passed.");
process.exit(0);
