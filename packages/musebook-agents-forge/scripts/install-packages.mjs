#!/usr/bin/env node
/**
 * One-shot installer for nested first-class packages shipped inside
 * musebook-agents-forge (packages/clawd-agent-tui, packages/headless-agent, …).
 *
 * Invoked by:
 *   - postinstall (default; skip with MUSEBOOK_SKIP_PACKAGE_INSTALL=1)
 *   - `npx musebook-agents-forge packages-install`
 *   - `node scripts/install-packages.mjs`
 *
 * Installs production deps into each TypeScript package so CLIs can run via
 * the root bins without a separate monorepo checkout.
 */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MARKER = path.join(ROOT, "packages", ".install-marker.json");

const TYPESCRIPT_PACKAGES = [
  {
    id: "headless-agent",
    dir: "packages/headless-agent",
    /** Runtime deps needed after npm pack (tsx for .ts CLI entry). */
    ensureDeps: { tsx: "^4.21.0" },
  },
  {
    id: "clawd-agent-tui",
    dir: "packages/clawd-agent-tui",
    ensureDeps: {
      tsx: "^4.21.0",
      "@openrouter/agent": "^0.4.0",
      glob: "^13.0.6",
      zod: "^4.3.6",
    },
  },
];

function log(msg) {
  console.log(`[musebook-packages] ${msg}`);
}

function warn(msg) {
  console.warn(`[musebook-packages] ${msg}`);
}

function shouldSkip() {
  const v = String(process.env.MUSEBOOK_SKIP_PACKAGE_INSTALL || "").trim().toLowerCase();
  if (v === "1" || v === "true" || v === "yes") return "MUSEBOOK_SKIP_PACKAGE_INSTALL";
  // CI / offline pack consumers can set this
  if (process.env.MUSEBOOK_SKIP_PACKAGE_INSTALL) return "MUSEBOOK_SKIP_PACKAGE_INSTALL"; // common typo no-op
  if (process.env.npm_config_offline === "true") return "npm offline";
  return null;
}

function readJson(file) {
  return JSON.parse(readFileSync(file, "utf8"));
}

function writeJson(file, value) {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

/**
 * Ensure nested package.json has runtime deps required after one-shot install.
 * Mutates the on-disk package.json only when keys are missing (idempotent).
 */
function ensurePackageJsonDeps(absDir, ensureDeps) {
  const pkgPath = path.join(absDir, "package.json");
  if (!existsSync(pkgPath)) return { ok: false, reason: "missing package.json" };
  const pkg = readJson(pkgPath);
  pkg.dependencies = pkg.dependencies && typeof pkg.dependencies === "object" ? pkg.dependencies : {};
  let changed = false;
  for (const [name, range] of Object.entries(ensureDeps || {})) {
    if (!pkg.dependencies[name]) {
      pkg.dependencies[name] = range;
      changed = true;
    }
  }
  // Mark private nested packages so accidental publish is blocked.
  if (pkg.private !== true) {
    pkg.private = true;
    changed = true;
  }
  if (changed) writeJson(pkgPath, pkg);
  return { ok: true, changed, name: pkg.name, version: pkg.version };
}

function npmInstall(absDir) {
  const args = [
    "install",
    "--omit=dev",
    "--no-audit",
    "--no-fund",
    "--ignore-scripts",
    "--prefix",
    absDir,
  ];
  const result = spawnSync("npm", args, {
    cwd: absDir,
    encoding: "utf8",
    env: {
      ...process.env,
      // Avoid recursive lifecycle noise
      npm_config_fund: "false",
      npm_config_audit: "false",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  return {
    status: result.status ?? 1,
    stdout: result.stdout || "",
    stderr: result.stderr || "",
    error: result.error,
  };
}

function hasNodeModules(absDir) {
  return existsSync(path.join(absDir, "node_modules"));
}

export function installPackages({ dryRun = false, force = false } = {}) {
  const skip = shouldSkip();
  if (skip && !force) {
    return {
      ok: true,
      skipped: true,
      reason: skip,
      packages: [],
    };
  }

  const results = [];
  for (const entry of TYPESCRIPT_PACKAGES) {
    const abs = path.join(ROOT, entry.dir);
    if (!existsSync(abs)) {
      results.push({ id: entry.id, ok: false, error: `missing ${entry.dir}` });
      continue;
    }
    const ensured = ensurePackageJsonDeps(abs, entry.ensureDeps);
    if (!ensured.ok) {
      results.push({ id: entry.id, ok: false, error: ensured.reason });
      continue;
    }

    if (dryRun) {
      results.push({
        id: entry.id,
        ok: true,
        dryRun: true,
        name: ensured.name,
        depsChanged: ensured.changed,
        path: abs,
      });
      continue;
    }

    if (hasNodeModules(abs) && !force && !ensured.changed) {
      results.push({
        id: entry.id,
        ok: true,
        alreadyInstalled: true,
        name: ensured.name,
        path: abs,
      });
      continue;
    }

    log(`Installing production deps for ${entry.id}…`);
    const install = npmInstall(abs);
    if (install.status !== 0) {
      warn(`npm install failed for ${entry.id}: ${install.stderr || install.stdout || install.error}`);
      results.push({
        id: entry.id,
        ok: false,
        status: install.status,
        error: (install.stderr || install.stdout || String(install.error || "npm install failed")).slice(0, 500),
        path: abs,
      });
      continue;
    }
    results.push({
      id: entry.id,
      ok: true,
      installed: true,
      name: ensured.name,
      path: abs,
      hasNodeModules: hasNodeModules(abs),
    });
  }

  const summary = {
    ok: results.every((r) => r.ok),
    root: ROOT,
    at: new Date().toISOString(),
    packages: results,
  };

  if (!dryRun) {
    try {
      writeJson(MARKER, summary);
    } catch {
      /* non-fatal */
    }
  }

  return summary;
}

function main() {
  const dryRun = process.argv.includes("--dry-run");
  const force = process.argv.includes("--force");
  const isPostinstall = process.env.npm_lifecycle_event === "postinstall";
  const summary = installPackages({ dryRun, force });
  if (summary.skipped) {
    log(`skipped (${summary.reason})`);
    process.exit(0);
  }
  console.log(JSON.stringify(summary, null, 2));
  if (!summary.ok) {
    warn(
      "nested package install incomplete. Sources are still present. Fix with:\n" +
        "  npx musebook-agents-forge packages-install --force\n" +
        "or skip entirely: MUSEBOOK_SKIP_PACKAGE_INSTALL=1",
    );
    // Never fail the parent package's postinstall (npm one-shot must succeed).
    if (isPostinstall) process.exit(0);
    process.exit(1);
  }
  process.exit(0);
}

// postinstall / CLI entry
const isMain =
  Boolean(process.argv[1]) &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  main();
}
