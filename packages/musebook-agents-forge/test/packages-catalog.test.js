import test from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  PACKAGE_CATALOG,
  listPackageIds,
  inspectPackages,
  resolvePackageDir,
} from "../src/packagesCatalog.js";

const monorepoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

test("packages catalog lists four first-class packages", () => {
  assert.deepEqual(listPackageIds().sort(), [
    "clawd-agent-tui",
    "headless-agent",
    "layerzero-omnichain",
    "solana-agent-trust",
  ].sort());
  assert.equal(PACKAGE_CATALOG.length, 4);
});

test("inspectPackages reports present source packages under robinhood-agents/packages", () => {
  const rows = inspectPackages();
  assert.equal(rows.length, 4);
  for (const row of rows) {
    assert.equal(row.present, true, `${row.id} must be present: ${JSON.stringify(row.markers)}`);
    assert.ok(existsSync(row.absolutePath), row.id);
    assert.ok(existsSync(path.join(row.absolutePath, "README.md")), `${row.id} README`);
  }
});

test("monorepo packages/ mirrors each catalog id", () => {
  for (const entry of PACKAGE_CATALOG) {
    const monorepoPath = path.join(monorepoRoot, entry.monorepoPath);
    assert.ok(existsSync(monorepoPath), `missing monorepo ${entry.monorepoPath}`);
    assert.ok(existsSync(path.join(monorepoPath, "README.md")), `${entry.id} monorepo README`);
    if (entry.kind === "typescript") {
      assert.ok(existsSync(path.join(monorepoPath, "package.json")));
      assert.ok(existsSync(path.join(monorepoPath, entry.entry)), entry.entry);
    }
  }
});

test("resolvePackageDir returns absolute path for headless-agent", () => {
  const dir = resolvePackageDir("headless-agent");
  assert.ok(dir.includes("packages/headless-agent"));
  assert.ok(existsSync(path.join(dir, "src/cli.ts")));
});
