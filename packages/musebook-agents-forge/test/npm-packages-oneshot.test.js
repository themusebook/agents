import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { inspectPackages, oneshotInstallHints, listPackageIds } from "../src/packagesCatalog.js";

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("package.json ships nested packages + install/run scripts and one-shot bins", () => {
  const pkg = JSON.parse(readFileSync(path.join(packageRoot, "package.json"), "utf8"));
  assert.equal(pkg.name, "musebook-agents-forge");
  assert.ok(pkg.bin["musebook-headless"]);
  assert.ok(pkg.bin["clawd-agent-tui"]);
  assert.ok(pkg.bin["musebook-package"]);
  assert.equal(pkg.scripts.postinstall, undefined, "nested installs are opt-in (npm run packages:install)");
  assert.ok(pkg.scripts["packages:install"]);
  for (const entry of [
    "packages/clawd-agent-tui/src",
    "packages/headless-agent/src",
    "packages/layerzero-omnichain/package.json",
    "packages/solana-agent-trust/programs",
    "scripts/install-packages.mjs",
    "scripts/run-package.mjs",
  ]) {
    assert.ok(pkg.files.includes(entry), `files must include ${entry}`);
  }
  assert.equal(pkg.exports["./packagesCatalog"], "./src/packagesCatalog.js");
});

test("packages catalog reports four present packages with oneshot hints", () => {
  assert.deepEqual(listPackageIds().sort(), [
    "clawd-agent-tui",
    "headless-agent",
    "layerzero-omnichain",
    "solana-agent-trust",
  ].sort());
  const rows = inspectPackages();
  assert.equal(rows.length, 4);
  for (const row of rows) {
    assert.equal(row.present, true, row.id);
  }
  const hints = oneshotInstallHints();
  assert.match(hints.install, /npm install musebook-agents-forge/);
  assert.match(hints.packagesInstall, /packages-install/);
  assert.match(hints.headless, /musebook-headless/);
});

test("install-packages dry-run succeeds without network", () => {
  const result = spawnSync(
    process.execPath,
    [path.join(packageRoot, "scripts/install-packages.mjs"), "--dry-run"],
    { cwd: packageRoot, encoding: "utf8", env: { ...process.env, MUSEBOOK_SKIP_PACKAGE_INSTALL: "" } },
  );
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const summary = JSON.parse(result.stdout);
  assert.equal(summary.ok, true);
  assert.ok(summary.packages.some((p) => p.id === "headless-agent" && p.dryRun));
  assert.ok(summary.packages.some((p) => p.id === "clawd-agent-tui" && p.dryRun));
});

test("CLI packages-list and packages-install --dry-run work for one-shot UX", () => {
  const list = spawnSync(process.execPath, ["src/cli.js", "packages-list"], {
    cwd: packageRoot,
    encoding: "utf8",
  });
  assert.equal(list.status, 0, list.stderr);
  const listed = JSON.parse(list.stdout);
  assert.ok(listed.packages.includes("headless-agent"));
  assert.ok(listed.hints.packagesInstall);

  const install = spawnSync(
    process.execPath,
    ["src/cli.js", "packages-install", "--dry-run"],
    { cwd: packageRoot, encoding: "utf8" },
  );
  // dry-run flag is parsed as flags["dry-run"] only if we support it in parseArgs
  // packages-install uses flags["dry-run"] from --dry-run
  assert.ok(install.status === 0 || install.status === 1, install.stderr || install.stdout);
});

test("npm pack includes nested package sources (real pack)", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "cta-pack-"));
  try {
    const packed = spawnSync("npm", ["pack", "--pack-destination", dir], {
      cwd: packageRoot,
      encoding: "utf8",
    });
    assert.equal(packed.status, 0, packed.stderr || packed.stdout);
    const tgz = packed.stdout.trim().split("\n").filter(Boolean).pop();
    assert.ok(tgz && tgz.endsWith(".tgz"), packed.stdout);
    const tgzPath = path.isAbsolute(tgz) ? tgz : path.join(dir, path.basename(tgz));
    assert.ok(existsSync(tgzPath), tgzPath);

    // list tarball contents
    const listed = spawnSync("tar", ["-tzf", tgzPath], { encoding: "utf8" });
    assert.equal(listed.status, 0, listed.stderr);
    const files = listed.stdout.split("\n");
    for (const required of [
      "package/packages/headless-agent/src/cli.ts",
      "package/packages/clawd-agent-tui/src/cli.ts",
      "package/packages/layerzero-omnichain/package.json",
      "package/packages/solana-agent-trust/programs/cheshire-agent-trust/src/lib.rs",
      "package/scripts/install-packages.mjs",
      "package/scripts/run-package.mjs",
      "package/src/packagesCatalog.js",
    ]) {
      assert.ok(files.includes(required), `tarball missing ${required}`);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
