#!/usr/bin/env node
/**
 * One-shot launcher for nested package CLIs after npm install of
 * musebook-agents-forge.
 *
 * Usage (via package.json bins):
 *   musebook-headless --help
 *   clawd-agent-tui --oneshot help
 *   musebook-package headless-agent --help
 */
import { spawnSync, spawn } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const PACKAGE_BINS = {
  "headless-agent": {
    entry: "packages/headless-agent/src/cli.ts",
    label: "musebook-headless",
  },
  "clawd-agent-tui": {
    entry: "packages/clawd-agent-tui/src/cli.ts",
    label: "clawd-agent-tui",
  },
};

function resolvePackageIdFromArgv() {
  const base = path.basename(process.argv[1] || "");
  if (base === "musebook-headless" || base === "musebook-headless.js") return "headless-agent";
  if (base === "clawd-agent-tui" || base === "clawd-agent-tui.js" || base === "zk-shark-tui") {
    return "clawd-agent-tui";
  }
  // musebook-package <id> …
  const id = process.argv[2];
  if (id && PACKAGE_BINS[id]) {
    process.argv.splice(2, 1);
    return id;
  }
  return null;
}

function findTsx(packageDir) {
  const require = createRequire(import.meta.url);
  const candidates = [
    path.join(packageDir, "node_modules", "tsx", "dist", "cli.mjs"),
    path.join(packageDir, "node_modules", "tsx", "dist", "cli.js"),
    path.join(ROOT, "node_modules", "tsx", "dist", "cli.mjs"),
    path.join(ROOT, "node_modules", "tsx", "dist", "cli.js"),
  ];
  for (const c of candidates) {
    if (existsSync(c)) return c;
  }
  try {
    const resolved = require.resolve("tsx/cli", { paths: [packageDir, ROOT] });
    if (resolved) return resolved;
  } catch {
    /* continue */
  }
  return null;
}

function ensureInstalled(packageDir) {
  if (existsSync(path.join(packageDir, "node_modules", "tsx"))) return true;
  // Lazy one-shot install for this package only
  const installer = path.join(ROOT, "scripts", "install-packages.mjs");
  if (!existsSync(installer)) return false;
  const result = spawnSync(process.execPath, [installer, "--force"], {
    cwd: ROOT,
    encoding: "utf8",
    stdio: "inherit",
    env: { ...process.env, MUSEBOOK_SKIP_PACKAGE_INSTALL: "" },
  });
  return result.status === 0;
}

function main() {
  const packageId = resolvePackageIdFromArgv();
  if (!packageId || !PACKAGE_BINS[packageId]) {
    console.error(
      "Usage: musebook-package <headless-agent|clawd-agent-tui> [args…]\n" +
        "   or: musebook-headless [args…]\n" +
        "   or: clawd-agent-tui [args…]\n" +
        "If packages are missing deps, run: npx musebook-agents-forge packages-install",
    );
    process.exit(1);
  }

  const meta = PACKAGE_BINS[packageId];
  const entry = path.join(ROOT, meta.entry);
  const packageDir = path.dirname(path.dirname(entry)); // …/packages/<id>
  if (!existsSync(entry)) {
    console.error(`Package entry missing: ${entry}`);
    process.exit(1);
  }

  let tsxCli = findTsx(packageDir);
  if (!tsxCli) {
    process.stderr.write(`[${meta.label}] installing package deps (one-shot)…\n`);
    ensureInstalled(packageDir);
    tsxCli = findTsx(packageDir);
  }
  if (!tsxCli) {
    console.error(
      `tsx not found for ${packageId}. Run:\n` +
        `  npx musebook-agents-forge packages-install\n` +
        `or:\n` +
        `  npm install --prefix node_modules/musebook-agents-forge/packages/${packageId}`,
    );
    process.exit(1);
  }

  const args = [tsxCli, entry, ...process.argv.slice(2)];
  const child = spawn(process.execPath, args, {
    stdio: "inherit",
    env: process.env,
    cwd: process.cwd(),
  });
  child.on("exit", (code, signal) => {
    if (signal) process.kill(process.pid, signal);
    process.exit(code ?? 1);
  });
}

main();
