/**
 * Package tests for Cheshire Terminal CLI — drives shipped modules.
 * Run: npm test   (or: node --test ./cheshire-cli.test.mjs ./arena-register.test.mjs)
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { readFile } from "node:fs/promises";
import {
  resolveSiteUrl,
  DEFAULT_SITE_URL,
  registrationJsonPath,
  loadRegistrationJson,
} from "./src/config.mjs";
import {
  buildAgentRegistryPayload,
  runCommand,
  usageText,
  cmdStatus,
  cmdRegisterUser,
  cmdRegisterAgent,
  cmdRegisterAll,
  cmdAgents,
  cmdSync,
  cmdConnect,
  cmdElizaGenerate,
  cmdElizaDeploy,
} from "./src/commands.mjs";
import {
  normalizeBrowserAgents,
  catalogAgentToRegisterBody,
  toRegistryName,
  hubLinks,
  API_SURFACES,
  SITE_SURFACES,
} from "./src/catalog.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const CLI = join(__dirname, "cheshire-cli.mjs");
const SITE = process.env.CHESHIRE_SITE_URL || DEFAULT_SITE_URL;

// Keep credential side-effects out of the user's home during tests.
if (!process.env.CHESHIRE_CREDENTIALS_PATH) {
  process.env.CHESHIRE_CREDENTIALS_PATH = join(
    process.env.TMPDIR || "/tmp",
    `cheshire-cli-test-creds-${process.pid}.json`,
  );
}

describe("config", () => {
  it("defaults site URL to cheshireterminal.ai", () => {
    const prev = process.env.CHESHIRE_SITE_URL;
    delete process.env.CHESHIRE_SITE_URL;
    delete process.env.CHESHIRE_API_URL;
    try {
      assert.equal(resolveSiteUrl(), "https://cheshireterminal.ai");
      assert.equal(DEFAULT_SITE_URL, "https://cheshireterminal.ai");
      assert.equal(resolveSiteUrl("https://example.test/"), "https://example.test");
    } finally {
      if (prev !== undefined) process.env.CHESHIRE_SITE_URL = prev;
    }
  });

  it("registration JSON points services at cheshireterminal.ai", async () => {
    const reg = await loadRegistrationJson(registrationJsonPath("cheshire-registration.json"));
    assert.equal(reg.name, "cheshire-terminal");
    assert.ok(Array.isArray(reg.services));
    for (const svc of reg.services) {
      assert.match(
        String(svc.endpoint),
        /cheshireterminal\.ai/,
        `service ${svc.name} should host on cheshireterminal.ai`,
      );
      assert.doesNotMatch(String(svc.endpoint), /solanaclawd\.com/);
    }
  });

  it("legacy registration files are rebranded", async () => {
    for (const name of [
      "clawd-registration.json",
      "solana-clawd-registration.json",
      "clawd-openclaw-config.json",
    ]) {
      const raw = await readFile(join(__dirname, name), "utf8");
      assert.match(raw, /cheshireterminal\.ai/);
      assert.doesNotMatch(raw, /solanaclawd\.com/);
    }
  });
});

describe("buildAgentRegistryPayload", () => {
  it("builds DNS-label name and Cheshire register path", () => {
    const payload = buildAgentRegistryPayload(
      {
        name: "My Cool Agent!",
        description: "test",
        services: [{ name: "api", endpoint: "https://cheshireterminal.ai/api" }],
      },
      { siteUrl: "https://cheshireterminal.ai" },
    );
    assert.equal(payload.name, "my-cool-agent");
    assert.equal(payload._cheshire.siteUrl, "https://cheshireterminal.ai");
    assert.equal(payload._cheshire.registerPath, "/api/agent-registry/register");
    assert.equal(payload.labels.app, "cheshire-terminal");
  });
});

describe("usage / help", () => {
  it("usage text documents dual-tier access verify", () => {
    const text = usageText();
    assert.match(text, /access:challenge|access --wallet/);
    assert.match(text, /access:verify/);
    assert.match(text, /access:status/);
    assert.match(text, /public non-holder|public/);
  });

  it("usage text is Cheshire branded without solanaclawd primary host", () => {
    const text = usageText();
    assert.match(text, /Cheshire Terminal/);
    assert.match(text, /cheshireterminal\.ai/);
    assert.doesNotMatch(text, /solanaclawd\.com/);
  });

  it("usage text is open-source public posture (no holder/sandbox funnel)", () => {
    const text = usageText();
    assert.match(text, /Open-source CLI/);
    assert.match(text, /status/);
    assert.match(text, /skills/);
    assert.match(text, /register:user|SIWS/);
    assert.match(text, /https:\/\/cheshireterminal\.ai/);
    // Scrubbed premium / exclusive / sandbox marketing
    assert.doesNotMatch(text, /holder-gated/i);
    assert.doesNotMatch(text, /\$CLAWD holder developer/i);
    assert.doesNotMatch(text, /ct_os_/);
    assert.doesNotMatch(text, /\/api\/e2b\/install\.sh/);
    assert.doesNotMatch(text, /Oneshot terminal claim/i);
    assert.doesNotMatch(text, /exclusive/i);
    assert.doesNotMatch(text, /monorepo tree/i);
  });

  it("usage text documents eliza:* studio commands", () => {
    const text = usageText();
    assert.match(text, /eliza:status/);
    assert.match(text, /eliza:catalog/);
    assert.match(text, /eliza:package/);
    assert.match(text, /eliza:solizard/);
    assert.match(text, /eliza:generate/);
    assert.match(text, /eliza:deploy/);
    assert.match(text, /\/api\/eliza-agents/);
    assert.match(text, /\/eliza-agents/);
    assert.match(text, /@elizaos\/cheshire-eliza|cheshire-eliza/);
  });

  it("runCommand help returns usage", async () => {
    const { exitCode, text, result } = await runCommand(["help"]);
    assert.equal(exitCode, 0);
    assert.ok(text?.includes("Cheshire Terminal") || result?.help);
  });
});

describe("eliza commands (offline)", () => {
  it("cmdElizaGenerate requires --name", async () => {
    await assert.rejects(
      () => cmdElizaGenerate({ siteUrl: "https://example.test" }),
      /eliza:generate requires --name/,
    );
    await assert.rejects(
      () => cmdElizaGenerate({ siteUrl: "https://example.test", name: "x" }),
      /eliza:generate requires --name/,
    );
  });

  it("cmdElizaDeploy requires --name", async () => {
    await assert.rejects(
      () => cmdElizaDeploy({ siteUrl: "https://example.test" }),
      /eliza:deploy requires --name/,
    );
  });

  it("runCommand dispatches eliza:generate missing name as error exit", async () => {
    const { exitCode, result } = await runCommand(["eliza:generate", "--site", "https://example.test"]);
    assert.equal(exitCode, 1);
    assert.ok(result?.error || result?.message);
    const msg = String(result?.error || result?.message || "");
    assert.match(msg, /eliza:generate requires --name/);
  });

  it("cmdConnect maps eliza agents hubs and APIs", async () => {
    const result = await cmdConnect({ siteUrl: "https://cheshireterminal.ai" });
    assert.equal(result.hubs.elizaAgents, "https://cheshireterminal.ai/eliza-agents");
    assert.equal(result.endpoints.elizaAgents, "https://cheshireterminal.ai/eliza-agents");
    assert.equal(
      result.endpoints.elizaStatus,
      "https://cheshireterminal.ai/api/eliza-agents/status",
    );
    assert.equal(
      result.endpoints.elizaCatalog,
      "https://cheshireterminal.ai/api/eliza-agents/catalog",
    );
    assert.equal(
      result.endpoints.elizaPackage,
      "https://cheshireterminal.ai/api/eliza-agents/package",
    );
    assert.match(result.sourceOfTruth.eliza, /eliza-agents/);
  });
});

describe("CLI process entry", () => {
  it("cheshire-cli.mjs help exits 0 with brand", () => {
    const proc = spawnSync(process.execPath, [CLI, "help"], {
      encoding: "utf8",
      env: { ...process.env, CHESHIRE_SITE_URL: SITE },
    });
    assert.equal(proc.status, 0, proc.stderr);
    assert.match(proc.stdout, /Cheshire Terminal/);
    assert.match(proc.stdout, /cheshireterminal\.ai/);
    assert.match(proc.stdout, /\/cli|install\.sh/);
    assert.doesNotMatch(proc.stdout, /solanaclawd\.com/);
    assert.doesNotMatch(proc.stdout, /ct_os_/);
    assert.doesNotMatch(proc.stdout, /\/api\/e2b\/install\.sh/);
    assert.doesNotMatch(proc.stdout, /holder-gated/i);
    assert.doesNotMatch(proc.stdout, /exclusive/i);
  });

  it("cheshire-cli.mjs connect reports hub at cheshireterminal.ai/cli", () => {
    const proc = spawnSync(process.execPath, [CLI, "connect"], {
      encoding: "utf8",
      env: { ...process.env, CHESHIRE_SITE_URL: "https://cheshireterminal.ai" },
    });
    assert.equal(proc.status, 0, proc.stderr);
    assert.match(proc.stdout, /cheshireterminal\.ai/);
    assert.match(proc.stdout, /"cliHub":\s*"https:\/\/cheshireterminal\.ai\/cli"/);
    assert.match(proc.stdout, /"cli":\s*"https:\/\/cheshireterminal\.ai\/cli"/);
    assert.doesNotMatch(proc.stdout, /solanaclawd\.com/);
  });
});

describe("offline connect command", () => {
  it("cmdConnect defaults site and cliHub to cheshireterminal.ai/cli", async () => {
    const result = await cmdConnect({ siteUrl: "https://cheshireterminal.ai" });
    assert.equal(result.siteUrl, "https://cheshireterminal.ai");
    assert.equal(result.endpoints.cliHub, "https://cheshireterminal.ai/cli");
    assert.equal(result.hubs.cli, "https://cheshireterminal.ai/cli");
    assert.equal(result.npm?.hub, "https://cheshireterminal.ai/cli");
  });
});

describe("live site commands (network)", () => {
  it("status returns developer/skills/registry fields", async () => {
    const result = await cmdStatus({ siteUrl: SITE });
    assert.equal(result.brand, "Cheshire Terminal");
    assert.equal(result.siteUrl.replace(/\/$/, ""), SITE.replace(/\/$/, ""));
    assert.ok(
      result.developer?.status === "ok" ||
        (typeof result.skills?.count === "number" && result.skills.count > 0) ||
        result.registry?.ok === true,
      `expected healthy public surface, got ${JSON.stringify(result.errors)}`,
    );
    if (result.developer?.status) {
      assert.equal(result.developer.status, "ok");
    }
    if (typeof result.skills?.count === "number") {
      assert.ok(result.skills.count > 0);
    }
  });

  it("register:user challenge returns signable payload", async () => {
    // Valid ed25519 pubkey shape (from live probe earlier / generated-like)
    const wallet = "HLzhCjtss8z7Ava8fq3nqfpaVSJTEd69HCA9fP1dbSYU";
    const result = await cmdRegisterUser({ siteUrl: SITE, wallet });
    assert.equal(result.mode, "siws-challenge");
    assert.ok(result.challenge?.message);
    assert.ok(result.challenge?.nonce);
    assert.match(result.challenge.message, /Wallet:/);
    assert.match(result.siteUrl, /cheshireterminal\.ai/);
    assert.doesNotMatch(JSON.stringify(result), /solanaclawd\.com/);
  });

  it("register:agent dry-run targets Cheshire register path", async () => {
    const result = await cmdRegisterAgent({
      siteUrl: SITE,
      file: registrationJsonPath("cheshire-registration.json"),
      name: `cli-test-${Date.now().toString(36)}`,
      confirm: false,
    });
    assert.equal(result.mode, "dry-run");
    assert.equal(result.ok, true);
    assert.match(result.targetUrl, /cheshireterminal\.ai\/api\/agent-registry\/register/);
    assert.ok(result.payload?.name);
    assert.doesNotMatch(JSON.stringify(result), /solanaclawd\.com/);
  });

  it("connect surfaces Cheshire endpoints including gateway", async () => {
    const result = await cmdConnect({ siteUrl: SITE });
    assert.match(result.endpoints.api, /cheshireterminal\.ai\/api/);
    assert.match(result.endpoints.gateway, /cheshireterminal\.ai\/gateway/);
    assert.match(result.endpoints.gatewayStatus, /\/api\/gateway\/status/);
    assert.match(result.endpoints.cliHub, /\/cli/);
    assert.match(result.endpoints.elizaAgents || "", /\/eliza-agents/);
    assert.match(result.endpoints.elizaStatus || "", /\/api\/eliza-agents\/status/);
    assert.equal(result.endpoints.agentsGithub, "https://github.com/solizardking/agents");
    assert.equal(result.credentials.envApiKey, "CHESHIRE_API_KEY");
    assert.equal(result.npm?.package, "cheshire-terminal-cli");
    assert.match(result.npm?.install || "", /cheshire-terminal-cli/);
    assert.equal(result.forgePackage.npm, "cheshire-terminal-agents");
  });

  it("eliza:status hits public studio API", async () => {
    const { exitCode, result } = await runCommand(["eliza:status", "--site", SITE]);
    // Live site may or may not expose the route yet; accept ok or structured HTTP error
    if (exitCode === 0 && result?.ok) {
      assert.equal(result.brand, "Cheshire Terminal");
      assert.match(result.page || "", /\/eliza-agents/);
      assert.ok(result.status || result.cli);
      if (result.cli?.commands) {
        assert.ok(result.cli.commands.some((c) => String(c).includes("eliza:")));
      }
    } else {
      assert.ok(
        result?.error || result?.status >= 400 || exitCode === 1,
        `unexpected eliza:status shape: ${JSON.stringify(result)}`,
      );
    }
  });

  it("eliza:catalog returns characters when available", async () => {
    const { exitCode, result } = await runCommand(["eliza:catalog", "--site", SITE]);
    if (exitCode === 0 && result?.ok) {
      const chars = result.catalog?.characters;
      assert.ok(Array.isArray(chars) || result.catalog);
    } else {
      assert.ok(result?.error || exitCode === 1);
    }
  });

  it("runCommand status via dispatcher", async () => {
    const { exitCode, result } = await runCommand(["status", "--site", SITE]);
    assert.equal(exitCode, 0);
    assert.ok(result.siteUrl.includes("cheshireterminal.ai"));
  });

  it("agents:list returns catalog ids from live browser-agents", async () => {
    const result = await cmdAgents({ siteUrl: SITE, list: true });
    assert.ok(result.count > 0);
    assert.ok(Array.isArray(result.identifiers));
    assert.ok(result.identifiers.length > 0);
    assert.match(result.hub, /\/agents$/);
  });

  it("register:agent --id dry-run uses catalog agent", async () => {
    const list = await cmdAgents({ siteUrl: SITE, list: true });
    const id = list.identifiers?.[0];
    assert.ok(id, "need at least one catalog agent");
    const result = await cmdRegisterAgent({
      siteUrl: SITE,
      id,
      confirm: false,
    });
    assert.equal(result.mode, "dry-run");
    assert.equal(result.source, "browser-agents");
    assert.ok(result.payload?.name);
    assert.match(result.frontend?.registry || "", /agent-registry/);
  });

  it("register:all dry-run covers catalog slice", async () => {
    const result = await cmdRegisterAll({
      siteUrl: SITE,
      confirm: false,
      limit: 3,
    });
    assert.equal(result.mode, "dry-run");
    assert.equal(result.attempted, 3);
    assert.equal(result.succeeded, 3);
  });

  it("sync reports skills + agents + registry hubs", async () => {
    const result = await cmdSync({ siteUrl: SITE });
    assert.ok(result.skills?.count > 0 || result.agents?.count > 0);
    assert.match(result.hubs?.skills || "", /\/skills/);
    assert.match(result.hubs?.agents || "", /\/agents/);
    assert.match(result.hubs?.registry || "", /agent-registry/);
    assert.ok(result.sourceOfTruth?.hubUi);
  });
});

describe("catalog helpers", () => {
  it("toRegistryName and hubLinks", () => {
    assert.equal(toRegistryName("Air Drop Hunter!"), "air-drop-hunter");
    const hubs = hubLinks("https://cheshireterminal.ai");
    assert.equal(hubs.cli, "https://cheshireterminal.ai/cli");
    assert.equal(hubs.gateway, "https://cheshireterminal.ai/gateway");
    assert.equal(hubs.agents, "https://cheshireterminal.ai/agents");
    assert.equal(hubs.elizaAgents, "https://cheshireterminal.ai/eliza-agents");
    assert.equal(hubs.api.elizaStatus, "https://cheshireterminal.ai/api/eliza-agents/status");
    assert.equal(hubs.api.elizaGenerate, "https://cheshireterminal.ai/api/eliza-agents/generate");
    assert.equal(SITE_SURFACES.elizaAgents, "/eliza-agents");
    assert.equal(API_SURFACES.elizaDeploy, "/api/eliza-agents/deploy");
  });

  it("normalizeBrowserAgents + register body", () => {
    const n = normalizeBrowserAgents({
      count: 1,
      agents: [
        {
          id: "airdrop-hunter",
          title: "DeFi Airdrop Hunter",
          description: "Hunt airdrops",
          category: "trading",
          tags: ["airdrop"],
        },
      ],
    });
    assert.equal(n.count, 1);
    assert.equal(n.agents[0].registryName, "airdrop-hunter");
    const body = catalogAgentToRegisterBody(n.agents[0]);
    assert.equal(body.name, "airdrop-hunter");
    assert.match(body.title, /Airdrop/);
  });
});

describe("open-source package cleanliness", () => {
  it("tracked package files have no full secrets", async () => {
    const { readdir, readFile, stat } = await import("node:fs/promises");
    const { join } = await import("node:path");
    const secretRes = [
      /ct_sk_[A-Za-z0-9]{16,}/,
      /sk_live_[A-Za-z0-9]{10,}/,
      /BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY/,
      /PRIVATE_KEY\s*=\s*['"]?[A-Za-z0-9+/=]{20,}/i,
    ];
    const skip = new Set([".git", "node_modules"]);
    async function walk(dir, out = []) {
      for (const name of await readdir(dir)) {
        if (skip.has(name) || name.startsWith(".")) continue;
        const full = join(dir, name);
        const st = await stat(full);
        if (st.isDirectory()) await walk(full, out);
        else if (/\.(mjs|js|ts|json|md|sh|svg)$/i.test(name) || name === "LICENSE" || name === ".gitignore") {
          out.push(full);
        }
      }
      return out;
    }
    const files = await walk(__dirname);
    const hits = [];
    for (const file of files) {
      const body = await readFile(file, "utf8");
      for (const re of secretRes) {
        if (re.test(body)) hits.push(`${file}: ${re}`);
      }
    }
    assert.deepEqual(hits, [], `secret-like material: ${hits.join("; ")}`);
  });

  it("README is standalone OSS without premium sandbox funnel", async () => {
    const raw = await readFile(join(__dirname, "README.md"), "utf8");
    assert.match(raw, /Open-source CLI|open-source/i);
    assert.match(raw, /npm i -g cheshire-terminal-cli|npm i -g cheshire-terminal-cli/);
    assert.match(raw, /\/api\/cli\/install\.sh/);
    assert.match(raw, /MIT/);
    assert.doesNotMatch(raw, /holder-gated/i);
    assert.doesNotMatch(raw, /holder mint/i);
    assert.doesNotMatch(raw, /ct_os_/);
    assert.doesNotMatch(raw, /\/api\/e2b\/install\.sh/);
    assert.doesNotMatch(raw, /From this monorepo/);
    assert.doesNotMatch(raw, /pnpm test:cli/);
    assert.doesNotMatch(raw, /server\/routes\/cli\.test/);
  });
});

