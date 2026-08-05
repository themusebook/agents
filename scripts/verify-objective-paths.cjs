#!/usr/bin/env node
/**
 * Structural verification for OBJECTIVE package paths.
 * Asserts listed paths exist on disk, are git-tracked (except intentionally
 * ignored src/), and knowledge/ is ordinary tracked files (not a nested git
 * repo / gitlink).
 *
 * Run from package root: node scripts/verify-objective-paths.cjs
 */
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");

const OBJECTIVE_PATHS = [
  "knowledge",
  "dna",
  "eliza-agents",
  "robinhood-schema",
  "robinhood-src",
  "schema",
  "skills",
  "src",
  "agent-template-attested.json",
  "agent-template-full.json",
  "agent-template.json",
  "agents-catalog.json",
  "agents-manifest.json",
  "bun.lock",
  "build-catalog.cjs",
];

/** Paths that must be git-tracked (src/ is intentionally gitignored). */
const MUST_TRACK = OBJECTIVE_PATHS.filter((p) => p !== "src");

function git(args) {
  return execFileSync("git", args, {
    cwd: ROOT,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

const failures = [];

for (const p of OBJECTIVE_PATHS) {
  const abs = path.join(ROOT, p);
  if (!fs.existsSync(abs)) {
    failures.push(`missing on disk: ${p}`);
  }
}

for (const p of MUST_TRACK) {
  const listed = git(["ls-files", "--", p]);
  if (!listed) {
    failures.push(`not tracked by git: ${p}`);
  }
  const status = git(["status", "--short", "--", p]);
  if (status.split("\n").some((line) => line.startsWith("??"))) {
    failures.push(`still untracked (??): ${p}`);
  }
}

// src must exist but may be ignored
if (!fs.existsSync(path.join(ROOT, "src"))) {
  failures.push("src/ missing on disk");
}

const nestedGit = path.join(ROOT, "knowledge", ".git");
if (fs.existsSync(nestedGit)) {
  failures.push("knowledge/.git still exists (nested repo)");
}

const knowledgeModes = git(["ls-files", "-s", "--", "knowledge"]);
if (!knowledgeModes) {
  failures.push("knowledge has no tracked files");
} else if (knowledgeModes.split("\n").some((line) => line.startsWith("160000"))) {
  failures.push("knowledge still recorded as gitlink (mode 160000)");
}

const dnaFiles = git(["ls-files", "--", "dna"]);
if (!dnaFiles) {
  failures.push("dna/ has no tracked files");
}

if (failures.length) {
  console.error("verify-objective-paths FAILED:");
  for (const f of failures) console.error("  -", f);
  process.exit(1);
}

console.log("verify-objective-paths PASS");
console.log(
  JSON.stringify(
    {
      root: ROOT,
      objectiveCount: OBJECTIVE_PATHS.length,
      mustTrackCount: MUST_TRACK.length,
      knowledgeFiles: knowledgeModes.split("\n").length,
      dnaFiles: dnaFiles.split("\n").length,
      knowledgeNestedGit: false,
      srcExists: true,
    },
    null,
    2
  )
);
