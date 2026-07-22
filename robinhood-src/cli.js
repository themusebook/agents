#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import {
  assertSponsoredMintAuthorization,
  canonicalDeployments,
  createAgentForge,
  frameworkCapabilities,
  prepareCanonicalEvmRegistration,
  planOmniAgentMint,
  planOmniIdentityLink,
  listCatalogIdentifiers,
  loadAgentWithLocale,
  validateCatalog,
  summarizeLocales,
  planZkOmniMessage,
  createRelayer,
  computeOmniNullifier,
  randomSecretHex,
  listRhCryptoAgentSkillIds,
  inspectRhCryptoAgentPack,
  getRhCryptoAgentSkillsDir,
  clawdbotSkillsDirExportLine,
  loadRhCryptoAgentPackIndex,
  listPackageIds,
  inspectPackages,
  oneshotInstallHints,
  readInstallMarker,
  EXTERNAL_PACKAGE_CATALOG,
  clawdbotGoInstallHints,
  listExternalPackageIds,
  planClawdbotInstall,
  runClawdbotInstall,
} from "./index.js";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const USAGE = `cheshire-terminal-agents <command> [options]
(aliases: ct-agents, robinhood-agents)

Agent catalog:
  agents-list
  agents-validate
  agents-show --id IDENTIFIER [--locale LOCALE]

RH crypto-agent skill pack (vendored from go-bot):
  skills-list
  skills-inspect
  skills-dir

First-class packages (shipped under packages/, installed on npm one-shot):
  packages-list
  packages-inspect
  packages-install [--force]   # also runs as postinstall; skip with CHESHIRE_SKIP_PACKAGE_INSTALL=1
  package-run --id headless-agent|clawd-agent-tui -- [args…]

Zero Clawd runtime (external npm: clawdbot-go — not a hard dependency):
  clawdbot-info                              # npm page + install/connect hints
  clawdbot-install [--skills-only] [--global] [--force] [--dry-run]
                   # invokes npx clawdbot-go install (or skills-install / npm i -g)
  # Package: https://www.npmjs.com/package/clawdbot-go
  # Hosted:  https://cheshireterminal.ai/zeroclawd

One-shot CLIs after install:
  npx cheshire-headless --help
  npx clawd-agent-tui --oneshot help
  npm i -g clawdbot-go   # or: npx cheshire-terminal-agents clawdbot-install

Read-only / unsigned forge:
  capabilities [--site URL]
  deployments [--chain 4663|46630]
  prepare-local-robinhood --file registration.json [--chain 4663|46630]
  prepare-robinhood --file registration.json [--site URL]
  inspect --platform robinhood|solana --id ID [--chain 4663|46630] [--site URL]

Dual-rail omni (Solana Metaplex + RH ERC-8004 + optional zk-omni link) — local/unsigned:
  omni-mint-plan --file agent.json [--chain 46630|4663] [--solana-network solana-mainnet|solana-devnet]
                 [--confirm-mainnet]   # required when --chain 4663
  omni-link-plan --solana-asset ADDR --rh-agent-id ID [--chain 4663] [--controller 0xEvm]

Live write:
  mint-solana --confirm-live-mint --file signed-mint.json [--site URL]

ZK Omnichain (Robinhood ↔ Solana, msgType 4 + nullifier):
  zk-omni-plan --action TEXT [--direction robinhood-to-solana|solana-to-robinhood]
               [--agent-id 0x..] [--controller 0xEvm] [--memo TEXT] [--secret-hex 0x..]
  zk-omni-nullifier --context TEXT [--secret-hex 0x..]
  zk-omni-oneshot   (same flags as plan; runs local relayer deliver)
  zk-omni-status

Environment:
  CHESHIRE_SITE_URL   default hosted API origin
  CHESHIRE_API_KEY    optional bearer credential for hosted access
  ZK_OMNI_JOURNAL     relayer journal path (default .zk-omni-relayer/journal.jsonl)
  CLAWDBOT_SKILLS_DIR set to skills-dir output for clawdbot RH pack discovery
  CHESHIRE_SKIP_PACKAGE_INSTALL=1  skip nested package npm install on postinstall`;

function parseArgs(values) {
  const flags = {};
  for (let index = 0; index < values.length; index += 1) {
    const token = values[index];
    // End of CLI flags — rest is for package-run passthrough (handled separately).
    if (token === "--") break;
    if (!token.startsWith("--")) throw new Error(`Unexpected argument: ${token}`);
    const name = token.slice(2);
    if (
      name === "confirm-live-mint" ||
      name === "force" ||
      name === "dry-run" ||
      name === "confirm-mainnet" ||
      name === "no-link-omni" ||
      name === "skills-only" ||
      name === "global" ||
      name === "local"
    ) {
      flags[name] = true;
      continue;
    }
    const value = values[index + 1];
    if (value === undefined || value.startsWith("--")) throw new Error(`Missing value for --${name}`);
    flags[name] = value;
    index += 1;
  }
  return flags;
}

async function readJsonFile(file, command) {
  if (!file) throw new Error(`${command} requires --file FILE`);
  try {
    return JSON.parse(await readFile(file, "utf8"));
  } catch (error) {
    throw new Error(`Unable to read ${file}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function parseChainId(value, fallback = 4663) {
  const chainId = Number(value ?? fallback);
  if (chainId !== 4663 && chainId !== 46630) throw new Error("--chain must be 4663 or 46630");
  return chainId;
}

const [command = "help", ...rawArgs] = process.argv.slice(2);

try {
  const flags = parseArgs(rawArgs);
  const forge = createAgentForge({
    baseUrl: flags.site || process.env.CHESHIRE_SITE_URL || "https://cheshireterminal.ai",
    apiKey: process.env.CHESHIRE_API_KEY,
  });
  let output;

  if (command === "help" || command === "--help" || command === "-h") {
    console.log(USAGE);
    process.exit(0);
  } else if (command === "agents-list" || command === "list-agents") {
    const ids = listCatalogIdentifiers();
    const locales = summarizeLocales();
    output = {
      package: "cheshire-terminal-agents",
      hub: "https://cheshireterminal.ai/agents",
      count: ids.length,
      localeAgents: locales.agentCount,
      localeFiles: locales.fileCount,
      identifiers: ids,
    };
  } else if (command === "agents-validate" || command === "validate-agents") {
    const report = validateCatalog();
    output = report;
    if (!report.ok) process.exitCode = 1;
  } else if (command === "agents-show" || command === "show-agent") {
    if (!flags.id) throw new Error("agents-show requires --id IDENTIFIER");
    output = loadAgentWithLocale(flags.id, flags.locale || "en");
  } else if (command === "skills-list" || command === "list-skills") {
    const pack = loadRhCryptoAgentPackIndex();
    output = {
      packId: pack.id,
      name: pack.name,
      skillCount: pack.skillCount,
      skillsDir: getRhCryptoAgentSkillsDir(),
      skills: listRhCryptoAgentSkillIds(),
      clawdbot: clawdbotSkillsDirExportLine(),
    };
  } else if (command === "skills-inspect" || command === "inspect-skills") {
    output = inspectRhCryptoAgentPack();
    if (!output.ok) process.exitCode = 1;
  } else if (command === "skills-dir") {
    output = {
      CLAWDBOT_SKILLS_DIR: getRhCryptoAgentSkillsDir(),
      export: clawdbotSkillsDirExportLine(),
    };
  } else if (command === "packages-list" || command === "list-packages") {
    output = {
      packages: listPackageIds(),
      external: listExternalPackageIds(),
      externalCatalog: EXTERNAL_PACKAGE_CATALOG,
      hints: oneshotInstallHints(),
    };
  } else if (command === "packages-inspect" || command === "inspect-packages") {
    output = {
      packages: inspectPackages(),
      external: EXTERNAL_PACKAGE_CATALOG,
      installMarker: readInstallMarker(),
      hints: oneshotInstallHints(),
      clawdbot: clawdbotGoInstallHints(),
    };
  } else if (
    command === "clawdbot-info" ||
    command === "zero-clawd-info" ||
    command === "clawdbot-go-info"
  ) {
    output = {
      package: "cheshire-terminal-agents",
      related: EXTERNAL_PACKAGE_CATALOG.find((e) => e.id === "clawdbot-go"),
      ...clawdbotGoInstallHints(),
      planPreview: planClawdbotInstall({ mode: "oneshot" }),
    };
  } else if (
    command === "clawdbot-install" ||
    command === "zero-clawd-install" ||
    command === "clawdbot-go-install" ||
    command === "install-clawdbot"
  ) {
    /** @type {"oneshot" | "skills" | "npm-global" | "npm-local"} */
    let mode = "oneshot";
    if (flags["skills-only"]) mode = "skills";
    else if (flags.global) mode = "npm-global";
    else if (flags.local) mode = "npm-local";
    output = runClawdbotInstall({
      mode,
      force: Boolean(flags.force),
      dryRun: Boolean(flags["dry-run"]),
    });
    if (!output.ok) process.exitCode = 1;
  } else if (command === "packages-install" || command === "install-packages") {
    const installer = path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      "../scripts/install-packages.mjs",
    );
    const args = [installer];
    if (flags.force) args.push("--force");
    if (flags["dry-run"]) args.push("--dry-run");
    const result = spawnSync(process.execPath, args, {
      encoding: "utf8",
      env: { ...process.env, CHESHIRE_SKIP_PACKAGE_INSTALL: "" },
    });
    const stdout = (result.stdout || "").trim();
    try {
      output = stdout ? JSON.parse(stdout) : { ok: result.status === 0, raw: result.stderr || "" };
    } catch {
      output = { ok: result.status === 0, stdout, stderr: result.stderr || "" };
    }
    if (result.status !== 0) process.exitCode = 1;
  } else if (command === "package-run" || command === "run-package") {
    if (!flags.id) throw new Error("package-run requires --id headless-agent|clawd-agent-tui");
    const runner = path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      "../scripts/run-package.mjs",
    );
    // Everything after a bare "--" is forwarded; otherwise remaining raw flags are not available.
    // Prefer: package-run --id headless-agent -- --help
    const passthroughIndex = process.argv.indexOf("--");
    const passthrough =
      passthroughIndex >= 0 ? process.argv.slice(passthroughIndex + 1) : [];
    const result = spawnSync(
      process.execPath,
      [runner, flags.id, ...passthrough],
      { stdio: "inherit", env: process.env },
    );
    process.exit(result.status ?? 1);
  } else if (command === "capabilities") {
    output = await forge.capabilities();
  } else if (command === "deployments") {
    output = flags.chain
      ? canonicalDeployments[String(parseChainId(flags.chain))]
      : { framework: frameworkCapabilities, deployments: canonicalDeployments };
  } else if (command === "prepare-local-robinhood") {
    const input = await readJsonFile(flags.file, command);
    if (input.platform && input.platform !== "robinhood") {
      throw new Error("prepare-local-robinhood only accepts platform=robinhood");
    }
    output = prepareCanonicalEvmRegistration({
      ...input,
      chainId: parseChainId(flags.chain ?? input.chainId, 46630),
    });
  } else if (command === "prepare-robinhood" || command === "prepare") {
    const input = await readJsonFile(flags.file, command);
    if ((flags.platform || input.platform || "robinhood") !== "robinhood") {
      throw new Error("Use mint-solana for the explicitly live Solana Core mint");
    }
    output = await forge.prepareRobinhood(input);
  } else if (command === "omni-mint-plan") {
    const input = await readJsonFile(flags.file, command);
    output = planOmniAgentMint({
      ...input,
      chainId: parseChainId(flags.chain ?? input.chainId, 46630),
      solanaNetwork: flags["solana-network"] || input.solanaNetwork || "solana-mainnet",
      confirmMainnet: Boolean(flags["confirm-mainnet"] || input.confirmMainnet),
      linkOmni: flags["no-link-omni"] ? false : input.linkOmni !== false,
      controllerAddress: flags.controller || input.controllerAddress,
      ownerPubkey: flags.owner || input.ownerPubkey || input.owner,
      direction: flags.direction || input.direction,
    });
  } else if (command === "omni-link-plan") {
    if (!flags["solana-asset"] && !flags.file) {
      throw new Error("omni-link-plan requires --solana-asset ADDR and --rh-agent-id ID (or --file JSON)");
    }
    let input = {};
    if (flags.file) input = await readJsonFile(flags.file, command);
    output = planOmniIdentityLink({
      ...input,
      solanaAsset: flags["solana-asset"] || input.solanaAsset || input.assetAddress,
      rhAgentId: flags["rh-agent-id"] || input.rhAgentId || input.agentId,
      chainId: parseChainId(flags.chain ?? input.chainId, 4663),
      controllerAddress: flags.controller || input.controllerAddress,
      secretHex: flags["secret-hex"] || input.secretHex,
      direction: flags.direction || input.direction,
      agentSlug: flags["agent-slug"] || input.agentSlug,
    });
  } else if (command === "mint-solana") {
    if (!flags["confirm-live-mint"]) throw new Error("mint-solana requires --confirm-live-mint");
    const input = await readJsonFile(flags.file, command);
    assertSponsoredMintAuthorization(input);
    output = await forge.mintSolana(input);
  } else if (command === "inspect") {
    const platform = flags.platform;
    if (platform !== "robinhood" && platform !== "solana") {
      throw new Error("inspect requires --platform robinhood or --platform solana");
    }
    if (!flags.id) throw new Error("inspect requires --id ID");
    output = await forge.inspect({
      platform,
      id: flags.id,
      chainId: platform === "robinhood" ? parseChainId(flags.chain) : undefined,
    });
  } else if (command === "zk-omni-plan") {
    output = planZkOmniMessage({
      direction: flags.direction || "robinhood-to-solana",
      action: flags.action || "zk_message",
      memo: flags.memo || "",
      agentId: flags["agent-id"],
      controllerAddress: flags.controller,
      secretHex: flags["secret-hex"],
      modelHash: flags["model-hash"],
      context: flags.context,
      ttlSeconds: flags.ttl ? Number(flags.ttl) : 3600,
    });
  } else if (command === "zk-omni-nullifier") {
    if (!flags.context) throw new Error("zk-omni-nullifier requires --context TEXT");
    const secretHex = flags["secret-hex"] || randomSecretHex();
    output = {
      context: flags.context,
      secretProvided: Boolean(flags["secret-hex"]),
      nullifier: computeOmniNullifier(secretHex, flags.context),
    };
  } else if (command === "zk-omni-oneshot") {
    const relayer = createRelayer({
      journalPath: process.env.ZK_OMNI_JOURNAL,
    });
    await relayer.init();
    output = await relayer.oneshot({
      direction: flags.direction || "robinhood-to-solana",
      action: flags.action || "zk_message",
      memo: flags.memo || "",
      agentId: flags["agent-id"],
      controllerAddress: flags.controller,
      secretHex: flags["secret-hex"],
      modelHash: flags["model-hash"],
      context: flags.context,
      ttlSeconds: flags.ttl ? Number(flags.ttl) : 3600,
    });
    if (output.status !== "delivered") process.exitCode = 1;
  } else if (command === "zk-omni-status") {
    const relayer = createRelayer({ journalPath: process.env.ZK_OMNI_JOURNAL });
    await relayer.init();
    output = relayer.status();
  } else {
    throw new Error(`Unknown command: ${command}\n\n${USAGE}`);
  }

  console.log(JSON.stringify(output, null, 2));
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
