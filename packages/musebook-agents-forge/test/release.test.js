import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const monorepoRoot = path.resolve(packageRoot, "..");

function source(relativePath, root = packageRoot) {
  return readFileSync(path.join(root, relativePath), "utf8");
}

test("license contains the complete canonical MIT grant, notice, and warranty terms", () => {
  const license = source("LICENSE");
  assert.match(license, /subject to the following conditions/);
  assert.match(license, /copyright notice and this permission notice shall be included/);
  assert.match(license, /IN NO EVENT SHALL THE\s+AUTHORS OR COPYRIGHT HOLDERS BE LIABLE/);
});

test("package exposes deployment pins and ships standalone Foundry tooling", () => {
  const pkg = JSON.parse(source("package.json"));
  assert.equal(pkg.name, "musebook-agents-forge");
  assert.equal(pkg.license, "MIT");
  assert.equal(pkg.publishConfig.access, "public");
  assert.ok(pkg.bin["musebook-agents-forge"]);
  assert.ok(pkg.bin["ct-agents"]);
  assert.equal(pkg.exports["./deployments"], "./src/deployments.js");
  assert.equal(pkg.exports["./skillPack"], "./src/skillPack.js");
  assert.ok(pkg.files.includes("agents"), "catalog agents/ must ship");
  assert.ok(pkg.files.includes("locales"), "locales/ must ship");
  assert.ok(pkg.files.includes("schema"), "schema/ must ship");
  assert.ok(pkg.files.includes("skills"), "skills/ (forge + RH pack) must ship");
  assert.ok(pkg.scripts["import:agents"]);
  assert.ok(pkg.scripts["agents:validate"]);
  assert.ok(pkg.scripts["skills:list"]);
  assert.ok(pkg.scripts["skills:sync"]);
  assert.ok(
    existsSync(path.join(packageRoot, "skills/rh-crypto-agent/pack-index.json")),
    "RH crypto-agent pack-index must be vendored",
  );
  assert.ok(
    existsSync(path.join(packageRoot, "skills/robinhood-agent-forge/SKILL.md")),
    "forge skill must remain",
  );
  // npm surface must not ship go-bot binaries or build trees
  assert.ok(!pkg.files.includes("build"));
  assert.ok(!pkg.files.includes("dist"));
  assert.ok(!pkg.files.includes("go-bot"));
  for (const entry of [
    "deploy/script",
    "deploy/scripts",
    "deploy/test",
    "deployments",
    "foundry.toml",
    "remappings.txt",
  ]) {
    assert.ok(pkg.files.includes(entry), `${entry} must be included in npm files`);
  }
  assert.ok(!pkg.files.includes("deploy"), "npm files must not include ignored deploy/lib dependencies");
  for (const file of [
    "foundry.toml",
    "deploy/script/DeployCheshireAgentRegistries.s.sol",
    "deploy/script/RobinhoodDeploymentSafety.s.sol",
    "deploy/scripts/deploy-agent-registries.sh",
    "deploy/scripts/deployment-safety.cjs",
  ]) {
    assert.ok(existsSync(path.join(packageRoot, file)), `${file} must exist`);
  }
});

test("deployment entrypoint is fixed, dry-run by default, and blocks canonical rebroadcasts", () => {
  const runner = source("deploy/scripts/deploy-agent-registries.sh");
  assert.match(runner, /MODE="dry-run"/);
  assert.match(runner, /only the optional --broadcast flag is accepted/);
  assert.match(runner, /assertRegistryBroadcastAvailable/);
  assert.match(runner, /node deploy\/scripts\/deployment-safety\.cjs/);
  assert.doesNotMatch(runner, /eval|source .*\.env/);

  const blocked = spawnSync("bash", [path.join(packageRoot, "deploy/scripts/deploy-agent-registries.sh"), "--broadcast"], {
    cwd: packageRoot,
    encoding: "utf8",
    env: { PATH: process.env.PATH, EXPECTED_CHAIN_ID: "4663" },
  });
  assert.notEqual(blocked.status, 0);
  assert.match(blocked.stderr, /already deployed|competing namespace/);
  assert.doesNotMatch(blocked.stderr, /PRIVATE_KEY is required/);
});

test("standalone manifests and contracts do not drift from the operator source when tested in the monorepo", (t) => {
  const operatorDeployments = path.join(monorepoRoot, "packages/robinhood-deploy/deployments");
  if (!existsSync(operatorDeployments)) {
    t.skip("operator source is not present in a standalone clone");
    return;
  }
  for (const file of [
    "agent-registries-mainnet-4663.json",
    "agent-registries-testnet-46630.json",
  ]) {
    assert.equal(
      source(`deployments/${file}`),
      source(`packages/robinhood-deploy/deployments/${file}`, monorepoRoot),
      `${file} drifted`,
    );
  }
  for (const file of [
    "CheshireAgentIdentityRegistry.sol",
    "CheshireAgentReputationRegistry.sol",
    "CheshireAgentValidationRegistry.sol",
  ]) {
    assert.equal(
      source(`contracts/${file}`),
      source(`packages/robinhood-deploy/src/${file}`, monorepoRoot),
      `${file} drifted`,
    );
  }
});

test("CLI reads canonical deployments and rejects example placeholders without network access", () => {
  const deployment = spawnSync(process.execPath, ["src/cli.js", "deployments", "--chain", "4663"], {
    cwd: packageRoot,
    encoding: "utf8",
  });
  assert.equal(deployment.status, 0, deployment.stderr);
  assert.equal(JSON.parse(deployment.stdout).chainId, 4663);

  const mint = spawnSync(process.execPath, [
    "src/cli.js",
    "mint-solana",
    "--confirm-live-mint",
    "--file",
    "examples/solana-agent.json",
    "--site",
    "https://example.invalid",
  ], {
    cwd: packageRoot,
    encoding: "utf8",
  });
  assert.notEqual(mint.status, 0);
  assert.match(mint.stderr, /CLAWD_AGENT_MINT_V2/);
});
