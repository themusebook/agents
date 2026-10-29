import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import {
  CLAWDBOT_GO_NPM,
  CLAWDBOT_GO_NPM_URL,
  ZERO_CLAWD_HOSTED_URL,
  EXTERNAL_PACKAGE_CATALOG,
  clawdbotGoInstallHints,
  listExternalPackageIds,
  getExternalPackage,
  planClawdbotInstall,
  runClawdbotInstall,
  oneshotInstallHints,
} from "../src/index.js";

const packageJsonPath = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "../package.json",
);

test("clawdbot-go external package is catalogued and not a hard dependency", () => {
  assert.equal(CLAWDBOT_GO_NPM, "clawdbot-go");
  assert.equal(CLAWDBOT_GO_NPM_URL, "https://www.npmjs.com/package/clawdbot-go");
  assert.equal(ZERO_CLAWD_HOSTED_URL, "https://musebook.trade/zero-clawd");
  assert.deepEqual(listExternalPackageIds(), ["clawdbot-go"]);
  const entry = getExternalPackage("clawdbot-go");
  assert.equal(entry.kind, "external-npm");
  assert.equal(entry.npmUrl, CLAWDBOT_GO_NPM_URL);
  assert.match(entry.install, /clawdbot-go/);
  assert.equal(EXTERNAL_PACKAGE_CATALOG.length, 1);
  // Must not pull clawdbot-go into required deps
  const pkg = JSON.parse(readFileSync(packageJsonPath, "utf8"));
  assert.equal(pkg.dependencies?.["clawdbot-go"], undefined);
  assert.equal(pkg.optionalDependencies?.["clawdbot-go"], undefined);
});

test("clawdbotGoInstallHints points at npm package and hosted /zeroclawd", () => {
  const h = clawdbotGoInstallHints();
  assert.equal(h.npmPackage, "clawdbot-go");
  assert.equal(h.npmUrl, "https://www.npmjs.com/package/clawdbot-go");
  assert.equal(h.installLocal, "npm i clawdbot-go");
  assert.equal(h.installGlobal, "npm i -g clawdbot-go");
  assert.equal(h.oneshot, "npx clawdbot-go install");
  assert.equal(h.hosted, "https://musebook.trade/zero-clawd");
  assert.equal(h.github, "https://github.com/Solizardking/Zero-clawd");
  assert.equal(h.installHost, "https://install.cheshireterminal.ai");
  assert.match(h.cors, /CLAWDBOT_CORS_ORIGINS/);
  assert.match(h.bridgeCommands.install, /clawdbot-install/);
});

test("oneshotInstallHints includes clawdbot bridge commands", () => {
  const h = oneshotInstallHints();
  assert.match(h.clawdbotGo, /clawdbot-go/);
  assert.match(h.clawdbotInstall, /clawdbot-install/);
  assert.equal(h.zeroclawd, "https://musebook.trade/zero-clawd");
  assert.equal(h.clawdbotNpm, "https://www.npmjs.com/package/clawdbot-go");
});

test("planClawdbotInstall modes produce npx/npm argv for clawdbot-go", () => {
  const oneshot = planClawdbotInstall({ mode: "oneshot" });
  assert.equal(oneshot.package, "clawdbot-go");
  assert.equal(oneshot.steps[0].argv[0], "npx");
  assert.ok(oneshot.steps[0].argv.includes("clawdbot-go"));
  assert.ok(oneshot.steps[0].argv.includes("install"));

  const skills = planClawdbotInstall({ mode: "skills", force: true });
  assert.ok(skills.steps[0].argv.includes("skills-install"));
  assert.ok(skills.steps[0].argv.includes("--force"));

  const global = planClawdbotInstall({ mode: "npm-global" });
  assert.equal(global.steps[0].argv[0], "npm");
  assert.ok(global.steps[0].argv.includes("-g"));
  assert.ok(global.steps[0].argv.includes("clawdbot-go"));

  const local = planClawdbotInstall({ mode: "npm-local" });
  assert.deepEqual(local.steps[0].argv.slice(0, 3), ["npm", "i", "clawdbot-go"]);
});

test("runClawdbotInstall --dry-run does not spawn and returns plan", () => {
  const result = runClawdbotInstall({ mode: "oneshot", dryRun: true });
  assert.equal(result.ok, true);
  assert.equal(result.dryRun, true);
  assert.equal(result.plan.package, "clawdbot-go");
  assert.equal(result.results.length, 0);
  assert.match(result.plan.after.connect, /zero-clawd|zeroclawd/);
});
