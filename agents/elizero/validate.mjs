/**
 * Validates the eliZERO agent bundle: eliza character, catalog manifest,
 * $CLAWD powering config, and DNA continuity files. Compares mint to the
 * Go birthfund default when zero-clawd is a sibling checkout.
 */
import assert from "node:assert/strict";
import { readFile, readdir, realpath, stat } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const agentDir = dirname(fileURLToPath(import.meta.url));
const packageRoot = resolve(agentDir, "../..");
const zeroClawdRoot = resolve(packageRoot, "../zero-clawd");
const DEFAULT_CLAWD_MINT = "8cHzQHUS2s2h8TzCmfqPKYiM4dSt4roa3n7MyRLApump";
const DEFAULT_CLAWD_AMOUNT = "1000";
const DEFAULT_SOL_AMOUNT = "0.069420";

const requiredFiles = [
  "character.json",
  "elizero.json",
  "clawd-power.json",
  "IDENTITY.md",
  "SOUL.md",
  "USER.md",
  "TOOLS.md",
  "README.md",
];

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

async function main() {
  for (const name of requiredFiles) {
    const p = join(agentDir, name);
    const st = await stat(p);
    assert.ok(st.isFile(), `missing required file: ${name}`);
    const body = await readFile(p, "utf8");
    assert.ok(body.trim().length > 0, `empty file: ${name}`);
  }

  const character = await readJson(join(agentDir, "character.json"));
  assert.equal(character.name, "eliZERO", "character.name must be eliZERO");
  assert.ok(Array.isArray(character.bio) && character.bio.length > 0, "character.bio required");
  assert.ok(Array.isArray(character.lore) && character.lore.length > 0, "character.lore required");
  assert.equal(typeof character.system, "string", "character.system required");
  assert.equal(character.eliza?.premiere, true, "character.eliza.premiere");
  assert.ok(character.system.includes("premiere"), "system prompt must name premiere rank");
  assert.equal(
    character.settings?.clawd?.mint,
    DEFAULT_CLAWD_MINT,
    "character settings.clawd.mint mismatch",
  );
  assert.ok(
    character.bio.some((line) => line.includes("$CLAWD") || line.includes("CLAWD")),
    "bio must reference $CLAWD powering",
  );
  assert.ok(
    character.lore.some((line) => line.includes(DEFAULT_CLAWD_MINT)),
    "lore must include $CLAWD mint",
  );

  const catalog = await readJson(join(agentDir, "elizero.json"));
  assert.equal(catalog.identifier, "elizero", "catalog identifier");
  assert.equal(catalog.schemaVersion, 1, "schemaVersion");
  assert.equal(catalog.meta?.title, "eliZERO", "meta.title");
  assert.equal(catalog.config?.clawdPower?.mint, DEFAULT_CLAWD_MINT, "catalog clawdPower.mint");
  assert.equal(catalog.solana?.token?.mint, DEFAULT_CLAWD_MINT, "catalog solana.token.mint");
  assert.equal(catalog.oneShot, true, "premiere oneShot");
  assert.equal(catalog.featured, true, "premiere featured");
  assert.ok(
    Array.isArray(catalog.meta?.tags) && catalog.meta.tags.includes("premiere"),
    "meta.tags must include premiere",
  );
  assert.ok(
    typeof catalog.config?.systemRole === "string" && catalog.config.systemRole.includes("eliZERO"),
    "systemRole must describe eliZERO",
  );
  assert.ok(
    catalog.config?.runtime?.smokeCommand?.includes("validate.mjs"),
    "runtime.smokeCommand must point at validate.mjs",
  );

  const hubPath = join(agentDir, "..", "elizero.json");
  const hub = await readJson(hubPath);
  assert.equal(hub.identifier, "elizero", "hub catalog identifier");
  assert.equal(hub.oneShot, true, "hub oneShot");
  assert.equal(hub.featured, true, "hub featured");
  assert.ok(hub.config?.systemRole?.includes("$CLAWD"), "hub systemRole must name $CLAWD");

  const power = await readJson(join(agentDir, "clawd-power.json"));
  assert.equal(power.agent, "eliZERO", "power.agent");
  assert.equal(power.poweredBy, "$CLAWD", "poweredBy");
  assert.equal(power.required, true, "power.required must be true");
  assert.equal(power.token?.mint, DEFAULT_CLAWD_MINT, "power.token.mint");
  assert.equal(power.token?.symbol, "CLAWD", "power.token.symbol");
  assert.equal(power.birthFunding?.clawdAmount, DEFAULT_CLAWD_AMOUNT, "birth clawd amount");
  assert.equal(power.birthFunding?.solAmount, DEFAULT_SOL_AMOUNT, "birth sol amount");
  assert.equal(power.payments?.protocol, "x402", "payments.protocol");
  assert.equal(power.token?.decimalsHint, null, "do not invent CLAWD decimals");

  const fundingGo = join(zeroClawdRoot, "pkg/birthfund/funding.go");
  try {
    const goSrc = await readFile(fundingGo, "utf8");
    assert.ok(
      goSrc.includes("DefaultCLAWDMint") && goSrc.includes(DEFAULT_CLAWD_MINT),
      "Go DefaultCLAWDMint must match clawd-power mint",
    );
    assert.ok(
      goSrc.includes("DefaultCLAWDAmount") && goSrc.includes(`"${DEFAULT_CLAWD_AMOUNT}"`),
      "Go DefaultCLAWDAmount must match clawd-power amount",
    );
    assert.ok(
      goSrc.includes("DefaultSOLAmount") && goSrc.includes(`"${DEFAULT_SOL_AMOUNT}"`),
      "Go DefaultSOLAmount must match clawd-power amount",
    );
  } catch (err) {
    if (err && err.code !== "ENOENT") throw err;
    console.warn("warn: pkg/birthfund/funding.go not found; skipped Go mint parity");
  }

  for (const md of ["IDENTITY.md", "SOUL.md"]) {
    const body = await readFile(join(agentDir, md), "utf8");
    assert.ok(body.includes("eliZERO"), `${md} must name eliZERO`);
    assert.ok(body.includes("CLAWD") || body.includes("$CLAWD"), `${md} must reference $CLAWD`);
  }

  const realAgent = (await realpath(agentDir)).replaceAll("\\", "/");
  const okPath =
    realAgent.endsWith("/agent/eliza/eliZERO") || realAgent.endsWith("/agents/elizero");
  assert.ok(okPath, `agent path must be agent/eliza/eliZERO or agents/elizero, got ${realAgent}`);

  const listing = await readdir(agentDir);
  assert.ok(listing.includes("validate.mjs"), "validate.mjs present");

  console.log(
    JSON.stringify(
      {
        ok: true,
        agent: "eliZERO",
        identifier: "elizero",
        premiere: true,
        path: "agents/elizero",
        mint: DEFAULT_CLAWD_MINT,
        birth: { sol: DEFAULT_SOL_AMOUNT, clawd: DEFAULT_CLAWD_AMOUNT },
        files: requiredFiles.length,
        checks: [
          "character.json",
          "elizero.json",
          "hub-elizero.json",
          "clawd-power.json",
          "dna-files",
          "go-mint-parity",
          "path-invariant",
        ],
      },
      null,
      2,
    ),
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
