/**
 * Cheshire Terminal CLI commands — pure async functions for tests + entrypoint.
 */
import { readFile } from "node:fs/promises";
import {
  CLI_BRAND,
  CLI_NAME,
  CLI_PACKAGE_NAME,
  CLI_HUB_URL,
  CLI_GATEWAY_URL,
  DEFAULT_SITE_URL,
  resolveSiteUrl,
  resolveApiKey,
  loadCredentials,
  saveCredentials,
  registrationJsonPath,
  loadRegistrationJson,
} from "./config.mjs";
import { createClient, CheshireHttpError } from "./client.mjs";
import {
  API_SURFACES,
  OPEN_SOURCE_REPOS,
  catalogAgentToRegisterBody,
  hubLinks,
  normalizeBrowserAgents,
  openSourceDiscoveryFragment,
  tryLoadLocalPackageCatalog,
  toRegistryName,
} from "./catalog.mjs";

export function usageText() {
  return `${CLI_BRAND} CLI (${CLI_NAME})
Open-source CLI for Cheshire Terminal public APIs.
npm: ${CLI_PACKAGE_NAME} · hub: ${CLI_HUB_URL} · gateway: ${CLI_GATEWAY_URL}

Usage:
  cheshire-cli <command> [options]
  npx cheshire-terminal-cli <command>

Install:
  npm i -g cheshire-terminal-cli
  # or: curl -fsSL ${DEFAULT_SITE_URL}/api/cli/install.sh | bash

Environment:
  CHESHIRE_SITE_URL          Site origin (default: ${DEFAULT_SITE_URL})
  CHESHIRE_API_KEY           Optional developer API key (ct_sk_…) for authenticated calls
  CHESHIRE_CREDENTIALS_PATH  Optional credentials JSON path

Auth (optional — never paste private keys into the CLI):
  SIWS     register:user → sign challenge in your wallet → login
  API key  set-key --api-key ct_sk_…  or  export CHESHIRE_API_KEY=ct_sk_…
           Create keys at ${CLI_GATEWAY_URL} when the site requires them

Discovery (public site surfaces):
  help | status | connect | sync
  skills [query] | skills:search <q>       → /skills · /api/skills
  agents | agents:list | agents:show --id  → /agents · /api/clawd/browser-agents
  registry | registry:list                 → /agent-registry · /api/agent-registry

User registration / auth:
  register:user --wallet <base58>
  login --wallet <pk> --signature <sig> --message <msg>
  whoami | set-key --api-key ct_sk_…

Access verify (public non-holder + holder — stores receipt):
  access --wallet <base58>                 # live tier probe (no sign)
  access:challenge --wallet <base58>       # SIWS challenge for access verify
  access:verify --wallet <pk> --signature <sig> --message <msg>
  access:status --wallet <base58>          # latest stored receipt

Agent registration (public catalog → /agent-registry):
  register:agent --id <catalog-id> [--dry-run|--confirm]
  register:agent --name <slug> [--title …] [--description …] [--confirm]
  register:agent --file reg.json [--confirm]
  register:all [--dry-run|--confirm] [--limit N]
  forge:prepare [--file reg.json]          # hints for optional cheshire-terminal-agents

Agent Arena (rooms + hosted agents on /arena):
  arena:status
  arena:list [--hosted] [--mine]
  arena:register --name <name> [--model kimi-k3] [--provider moonshot]
                 [--wallet <base58>] [--description …] [--room <id>]
                 [--host] [--confirm]
  arena:host --id <agentId> [--room <roomId>]
  arena:enter --id <agentId> --room <roomId>
  arena:rooms

Eliza agents studio (@elizaos/cheshire-eliza → /eliza-agents):
  eliza | eliza:status                     # package + plugins + cloud readiness
  eliza:catalog                            # character seeds (Solizard first)
  eliza:package                            # plugin bundle + ActionPlan examples
  eliza:solizard                           # full Solizard package character
  eliza:generate --name <n> [--archetype operator|trader|forge-smith|researcher|mascot]
                 [--rails solana,robinhood] [--seed solizard] [--no-e2b] [--no-memory]
                 [--no-forge] [--browser-use] [--system-extra "…"]
  eliza:deploy --name <n> [same flags as generate]   # deploy plan + character JSON

Optional dual-rail forge package (separate npm):
  npx cheshire-terminal-agents
  npx cheshire-terminal-agents design --list
  npx cheshire-terminal-agents design --from <id> --id my-bot --out ./my-bot.json

IPFS pin helpers (when Pinata is configured server-side):
  pin | pin:status
  pin:groups
  pin:groups:create --name <group>
  pin:file --path <file> [--name <display>] [--group <id>] [--kv key=val]
  pin:json --file <json> | --data '<json>' [--name …] [--group …] [--kv …]

Public surfaces (runtime uses live HTTP — no local tree required):
  Agents     GET /api/clawd/browser-agents → /agents
  Skills     GET /api/skills → /skills
  Registry   GET /api/agent-registry → /agent-registry
  Eliza      GET /api/eliza-agents/* → /eliza-agents
  Forge npm  cheshire-terminal-agents (optional peer)
  OSS        agents · cli · eliza · cheshire-terminal (Solizardking/*)

Examples:
  cheshire-cli status
  cheshire-cli sync
  cheshire-cli agents:list
  cheshire-cli eliza:status
  cheshire-cli eliza:generate --name ClawdScout --archetype trader
  cheshire-cli register:agent --id airdrop-hunter --dry-run
  cheshire-cli register:all --dry-run
  cheshire-cli arena:register --name my-bot --model kimi-k3 --confirm --host
  cheshire-cli arena:enter --id arena_ag_… --room room_…
`;
}

// ── Agent Arena (user-registered agents on /arena) ───────────────────────────

export async function cmdArenaStatus(options = {}) {
  const client = createClient({ siteUrl: options.siteUrl, apiKey: options.apiKey });
  const hubs = hubLinks(client.siteUrl);
  try {
    const { data } = await client.get(API_SURFACES.arenaStatus);
    return {
      ok: true,
      brand: CLI_BRAND,
      siteUrl: client.siteUrl,
      page: hubs.arena || `${client.siteUrl}/arena`,
      status: data,
    };
  } catch (err) {
    if (err instanceof CheshireHttpError) {
      return { ok: false, error: err.message, status: err.status, body: err.body };
    }
    throw err;
  }
}

export async function cmdArenaList(options = {}) {
  const client = createClient({ siteUrl: options.siteUrl, apiKey: options.apiKey });
  const qs = new URLSearchParams();
  if (options.hosted) qs.set("hosted", "1");
  if (options.mine) qs.set("mine", "1");
  const path = `${API_SURFACES.arenaAgents}${qs.toString() ? `?${qs}` : ""}`;
  try {
    const { data } = await client.get(path);
    return {
      ok: true,
      brand: CLI_BRAND,
      siteUrl: client.siteUrl,
      page: `${client.siteUrl}/arena`,
      ...data,
    };
  } catch (err) {
    if (err instanceof CheshireHttpError) {
      return { ok: false, error: err.message, status: err.status, body: err.body };
    }
    throw err;
  }
}

export async function cmdArenaRooms(options = {}) {
  const client = createClient({ siteUrl: options.siteUrl, apiKey: options.apiKey });
  try {
    const { data } = await client.get(API_SURFACES.arenaRooms);
    return {
      ok: true,
      brand: CLI_BRAND,
      siteUrl: client.siteUrl,
      page: `${client.siteUrl}/arena`,
      rooms: data?.rooms ?? data ?? [],
    };
  } catch (err) {
    if (err instanceof CheshireHttpError) {
      return { ok: false, error: err.message, status: err.status, body: err.body };
    }
    throw err;
  }
}

export async function cmdArenaRegister(options = {}) {
  const siteUrl = resolveSiteUrl(options.siteUrl);
  const name = options.name || options.displayName;
  if (!name) {
    return {
      ok: false,
      error: "arena:register requires --name <agent-name>",
      usage: `${CLI_NAME} arena:register --name my-bot --model kimi-k3 --confirm [--host] [--room <id>]`,
    };
  }

  const payload = {
    name: String(name).slice(0, 64),
    description: options.description || options.title || `Arena agent registered via ${CLI_NAME}`,
    model: options.model || "kimi-k3",
    provider: options.provider || options.modelProvider || "moonshot",
    walletAddress: options.wallet || options.walletAddress || undefined,
    capabilities: options.capabilities
      ? String(options.capabilities)
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean)
      : ["chat", "arena"],
    endpointUrl: options.endpoint || options.endpointUrl || undefined,
    host: Boolean(options.host),
    roomId: options.room || options.roomId || undefined,
    cli: true,
    source: "cheshire-cli",
    slug: options.slug || undefined,
  };

  if (!options.confirm) {
    return {
      ok: true,
      mode: "dry-run",
      brand: CLI_BRAND,
      siteUrl,
      targetUrl: `${siteUrl}${API_SURFACES.arenaAgentsRegister}`,
      method: "POST",
      payload,
      page: `${siteUrl}/arena`,
      note: "Pass --confirm to register. Agent will appear on /arena (and /agent-arena).",
    };
  }

  const client = createClient({ siteUrl, apiKey: options.apiKey });
  try {
    const { data, status } = await client.post(API_SURFACES.arenaAgentsRegister, payload);
    return {
      ok: status >= 200 && status < 300,
      mode: "live",
      brand: CLI_BRAND,
      siteUrl,
      httpStatus: status,
      page: `${siteUrl}/arena`,
      request: payload,
      response: data,
      next: data?.agent?.id
        ? [
            `${CLI_NAME} arena:host --id ${data.agent.id}`,
            `${CLI_NAME} arena:enter --id ${data.agent.id} --room <ROOM_ID>`,
            `Open ${siteUrl}/arena to see hosted agents`,
          ]
        : undefined,
    };
  } catch (err) {
    if (err instanceof CheshireHttpError) {
      return {
        ok: false,
        mode: "live",
        brand: CLI_BRAND,
        siteUrl,
        httpStatus: err.status,
        request: payload,
        error: err.message,
        body: err.body,
      };
    }
    throw err;
  }
}

export async function cmdArenaHost(options = {}) {
  const id = options.id || options.agentId || options.agent;
  if (!id) {
    return { ok: false, error: "arena:host requires --id <agentId>" };
  }
  const client = createClient({ siteUrl: options.siteUrl, apiKey: options.apiKey });
  try {
    const { data, status } = await client.post(`/api/arena/agents/${encodeURIComponent(id)}/host`, {
      roomId: options.room || options.roomId || undefined,
      hosted: options.hosted !== false,
    });
    return {
      ok: status >= 200 && status < 300,
      brand: CLI_BRAND,
      siteUrl: client.siteUrl,
      page: `${client.siteUrl}/arena`,
      response: data,
    };
  } catch (err) {
    if (err instanceof CheshireHttpError) {
      return { ok: false, error: err.message, status: err.status, body: err.body };
    }
    throw err;
  }
}

export async function cmdArenaEnter(options = {}) {
  const id = options.id || options.agentId || options.agent;
  const roomId = options.room || options.roomId;
  if (!id || !roomId) {
    return {
      ok: false,
      error: "arena:enter requires --id <agentId> and --room <roomId>",
      usage: `${CLI_NAME} arena:enter --id arena_ag_… --room room_…`,
    };
  }
  const client = createClient({ siteUrl: options.siteUrl, apiKey: options.apiKey });
  try {
    const { data, status } = await client.post(`/api/arena/agents/${encodeURIComponent(id)}/enter`, {
      roomId,
    });
    return {
      ok: status >= 200 && status < 300,
      brand: CLI_BRAND,
      siteUrl: client.siteUrl,
      page: `${client.siteUrl}/arena`,
      response: data,
    };
  } catch (err) {
    if (err instanceof CheshireHttpError) {
      return { ok: false, error: err.message, status: err.status, body: err.body };
    }
    throw err;
  }
}

function parseFlags(argv) {
  const flags = {};
  const positionals = [];
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === "--") {
      positionals.push(...argv.slice(i + 1));
      break;
    }
    if (token.startsWith("--")) {
      const name = token.slice(2);
      if (name === "json" || name === "dry-run" || name === "confirm" || name === "help") {
        flags[name] = true;
        continue;
      }
      const next = argv[i + 1];
      if (next === undefined || next.startsWith("--")) {
        flags[name] = true;
        continue;
      }
      flags[name] = next;
      i += 1;
      continue;
    }
    positionals.push(token);
  }
  return { flags, positionals };
}

export function buildAgentRegistryPayload(registration, options = {}) {
  const reg = registration && typeof registration === "object" ? registration : {};
  const nameRaw = options.name || reg.name || "cheshire-agent";
  const name = String(nameRaw)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 63) || "cheshire-agent";

  const site = resolveSiteUrl(options.siteUrl);
  const services = Array.isArray(reg.services) ? reg.services : [];
  const description =
    options.description ||
    reg.description ||
    `Cheshire Terminal agent registered via ${CLI_NAME}`;

  return {
    name,
    title: options.title || reg.name || name,
    description: String(description).slice(0, 4000),
    tag: options.tag || "latest",
    modelProvider: options.modelProvider || "clawdrouter",
    modelName: options.modelName || "auto",
    namespace: options.namespace || "default",
    repositoryUrl:
      options.repositoryUrl ||
      (typeof reg.repository === "string" ? reg.repository : undefined) ||
      "https://github.com/Solizardking/Cheshire-Terminal-Agents",
    image:
      options.image ||
      (typeof reg.image === "string" ? reg.image : undefined) ||
      `${site}/og-image.png`,
    labels: {
      app: "cheshire-terminal",
      catalog: "cheshire-terminal-agents",
      source: "cheshire-cli",
    },
    // Echo registration services for local dry-run inspection (not all upstream fields)
    _cheshire: {
      siteUrl: site,
      registerPath: "/api/agent-registry/register",
      services: services.map((s) => ({
        name: s.name,
        endpoint: s.endpoint,
      })),
      registrationType: reg.type || null,
    },
  };
}

export async function cmdStatus(options = {}) {
  const client = createClient({ siteUrl: options.siteUrl, apiKey: options.apiKey });
  const siteUrl = client.siteUrl;

  const result = {
    brand: CLI_BRAND,
    siteUrl,
    checkedAt: new Date().toISOString(),
    developer: null,
    skills: null,
    registry: null,
    metaplex: null,
    gateway: null,
    hubs: {
      cli: `${siteUrl}/cli`,
      gateway: `${siteUrl}/gateway`,
      agents: `${siteUrl}/agents`,
      elizaAgents: `${siteUrl}/eliza-agents`,
      forge: `${siteUrl}/agents/forge`,
      agentsGithub: OPEN_SOURCE_REPOS.agents.url,
      cliGithub: OPEN_SOURCE_REPOS.cli.url,
      elizaGithub: OPEN_SOURCE_REPOS.eliza.url,
      cheshireTerminalGithub: OPEN_SOURCE_REPOS.cheshireTerminal.url,
    },
    openSource: openSourceDiscoveryFragment(),
    errors: [],
  };

  try {
    const { data } = await client.get("/api/developer/status");
    result.developer = {
      status: data?.status ?? null,
      name: data?.name ?? null,
      origin: data?.origin ?? siteUrl,
      principal: data?.principal ?? null,
      routes: data?.routes
        ? {
            skills: data.routes.skills,
            agents: data.routes.agents,
            keys: data.routes.keys,
            docs: data.routes.docs,
          }
        : null,
    };
  } catch (err) {
    result.errors.push({ surface: "developer", message: err.message, status: err.status });
  }

  try {
    const { data } = await client.get("/api/skills");
    result.skills = {
      count: data?.count ?? (Array.isArray(data?.skills) ? data.skills.length : null),
      generatedAt: data?.generatedAt ?? null,
      realtime: data?.realtime ?? null,
    };
  } catch (err) {
    result.errors.push({ surface: "skills", message: err.message, status: err.status });
  }

  try {
    const { data } = await client.get("/api/agent-registry/status");
    result.registry = {
      ok: data?.ok ?? null,
      upstream: data?.upstream ?? null,
      registerPath: data?.registerPath ?? null,
      health: data?.health ?? null,
    };
  } catch (err) {
    result.errors.push({ surface: "registry", message: err.message, status: err.status });
  }

  try {
    const { data } = await client.get("/api/metaplex-agents/health");
    result.metaplex = {
      success: data?.success ?? null,
      mintPolicy: data?.mintPolicy?.gate ?? null,
      network: data?.network ?? data?.rpcNetwork ?? null,
    };
  } catch (err) {
    result.errors.push({ surface: "metaplex", message: err.message, status: err.status });
  }

  try {
    const { data } = await client.get("/api/gateway/status");
    result.gateway = {
      status: data?.status ?? null,
      name: data?.name ?? null,
      origin: data?.origin ?? siteUrl,
      hub: `${siteUrl}/gateway`,
      openapi: `${siteUrl}/api/gateway/openapi.json`,
      routes: data?.routes
        ? {
            docs: data.routes.docs ?? data.routes.gatewayPortal ?? "/gateway",
            openapi: data.routes.gatewayOpenapi ?? "/api/gateway/openapi.json",
            catalog: data.routes.gatewayCatalog ?? data.routes.catalog ?? "/api/gateway/catalog",
          }
        : {
            docs: `${siteUrl}/gateway`,
            openapi: `${siteUrl}/api/gateway/openapi.json`,
            catalog: `${siteUrl}/api/gateway/catalog`,
          },
    };
  } catch (err) {
    result.errors.push({ surface: "gateway", message: err.message, status: err.status });
    result.gateway = {
      status: null,
      hub: `${siteUrl}/gateway`,
      openapi: `${siteUrl}/api/gateway/openapi.json`,
    };
  }

  const healthy =
    result.developer?.status === "ok" ||
    result.gateway?.status === "ok" ||
    (typeof result.skills?.count === "number" && result.skills.count > 0) ||
    result.registry?.ok === true;

  return { ok: healthy, ...result };
}

export async function cmdSkills(options = {}) {
  const client = createClient({ siteUrl: options.siteUrl, apiKey: options.apiKey });
  const hubs = hubLinks(client.siteUrl);
  const query = options.query?.trim();
  if (query) {
    const { data } = await client.get(
      `${API_SURFACES.skillsSearch}?q=${encodeURIComponent(query)}`,
    );
    return {
      siteUrl: client.siteUrl,
      hub: hubs.skills,
      api: `${hubs.api.skills}/search?q=${encodeURIComponent(query)}`,
      query,
      ...normalizeSkillsPayload(data),
    };
  }
  const { data } = await client.get(API_SURFACES.skills);
  return {
    siteUrl: client.siteUrl,
    hub: hubs.skills,
    hubStore: hubs.skillsStore,
    api: hubs.api.skills,
    ...normalizeSkillsPayload(data),
  };
}

function normalizeSkillsPayload(data) {
  if (!data || typeof data !== "object") {
    return { count: 0, skills: data };
  }
  const count =
    typeof data.count === "number"
      ? data.count
      : Array.isArray(data.skills)
        ? data.skills.length
        : Array.isArray(data.items)
          ? data.items.length
          : null;
  return {
    count,
    generatedAt: data.generatedAt ?? null,
    sources: data.sources ?? null,
    skills: data.skills ?? data.items ?? data.results ?? data,
  };
}

async function fetchBrowserCatalog(client) {
  const { data } = await client.get(API_SURFACES.browserAgents);
  return normalizeBrowserAgents(data);
}

export async function cmdAgents(options = {}) {
  const client = createClient({ siteUrl: options.siteUrl, apiKey: options.apiKey });
  const hubs = hubLinks(client.siteUrl);
  const showId = options.id?.trim();
  const listMode = options.list || options.command === "agents:list";

  const catalog = await fetchBrowserCatalog(client);
  let registryHealth = null;
  try {
    const { data } = await client.get(API_SURFACES.registryStatus);
    registryHealth = {
      ok: data?.ok ?? null,
      upstream: data?.upstream ?? null,
      registerPath: data?.registerPath ?? null,
      ui: data?.ui ?? null,
    };
  } catch (err) {
    registryHealth = { error: err.message, status: err.status };
  }

  const localPkg = await tryLoadLocalPackageCatalog();

  if (showId) {
    const agent =
      catalog.agents.find((a) => a.id === showId || a.registryName === showId) || null;
    if (!agent) {
      return {
        ok: false,
        siteUrl: client.siteUrl,
        hub: hubs.agents,
        error: `Agent not found in browser catalog: ${showId}`,
        hint: "Run cheshire-cli agents:list for ids",
        count: catalog.count,
      };
    }
    return {
      ok: true,
      siteUrl: client.siteUrl,
      hub: hubs.agents,
      agent,
      frontend: {
        chat: `${client.siteUrl}${agent.hubPath}`,
        forge: `${client.siteUrl}${agent.forgePath}`,
        mint: `${client.siteUrl}${agent.mintPath}`,
        registry: hubs.registry,
      },
      registerDryRun: catalogAgentToRegisterBody(agent),
    };
  }

  const ids = catalog.agents.map((a) => a.id);
  return {
    ok: true,
    siteUrl: client.siteUrl,
    hub: hubs.agents,
    api: hubs.api.browserAgents,
    count: catalog.count,
    importedAt: catalog.importedAt,
    sourceRoot: catalog.sourceRoot,
    registryHealth,
    localPackage: {
      available: localPkg.available,
      package: localPkg.package,
      count: localPkg.count,
      hint: localPkg.hint || null,
    },
    // Full id list so terminal can register any agent
    identifiers: ids,
    agents: listMode
      ? catalog.agents
      : catalog.agents.slice(0, 40).map((a) => ({
          id: a.id,
          title: a.title,
          category: a.category,
          registryName: a.registryName,
        })),
    truncated: !listMode && catalog.agents.length > 40,
    note: listMode
      ? "Full browser-agents catalog (same as /agents frontend)."
      : "Summary (first 40). Use agents:list for full catalog.",
  };
}

export async function cmdRegistry(options = {}) {
  const client = createClient({ siteUrl: options.siteUrl, apiKey: options.apiKey });
  const hubs = hubLinks(client.siteUrl);
  const { data: status } = await client.get(API_SURFACES.registryStatus);

  let items = null;
  let listError = null;
  if (options.list) {
    try {
      const limit = Math.min(Number(options.limit) || 50, 200);
      const { data } = await client.get(
        `${API_SURFACES.registryAgents}?limit=${limit}`,
      );
      items = Array.isArray(data?.items) ? data.items : data;
    } catch (err) {
      listError = { message: err.message, status: err.status };
    }
  }

  return {
    siteUrl: client.siteUrl,
    hub: hubs.registry,
    hubAliases: hubs.registryAliases,
    api: hubs.api.registryStatus,
    registerPath: status?.registerPath || API_SURFACES.registryRegister,
    ...status,
    items,
    listError,
  };
}

/**
 * Full surface sync report: skills + agents + registry + gateway + frontend hubs.
 */
export async function cmdSync(options = {}) {
  const client = createClient({ siteUrl: options.siteUrl, apiKey: options.apiKey });
  const hubs = hubLinks(client.siteUrl);
  const report = {
    ok: true,
    brand: CLI_BRAND,
    siteUrl: client.siteUrl,
    checkedAt: new Date().toISOString(),
    hubs,
    surfaces: {},
    errors: [],
  };

  async function probe(name, path) {
    try {
      const { data, status } = await client.get(path);
      report.surfaces[name] = { ok: true, httpStatus: status, path };
      return data;
    } catch (err) {
      report.ok = false;
      report.surfaces[name] = {
        ok: false,
        path,
        error: err.message,
        status: err.status,
      };
      report.errors.push({ surface: name, message: err.message });
      return null;
    }
  }

  const skills = await probe("skills", API_SURFACES.skills);
  const browser = await probe("browserAgents", API_SURFACES.browserAgents);
  const registry = await probe("registry", API_SURFACES.registryStatus);
  const gateway = await probe("gateway", API_SURFACES.gatewayStatus);
  const developer = await probe("developer", API_SURFACES.developerStatus);

  const catalog = normalizeBrowserAgents(browser || {});
  report.skills = {
    count: skills?.count ?? null,
    hub: hubs.skills,
  };
  report.agents = {
    count: catalog.count,
    identifiersSample: catalog.agents.slice(0, 12).map((a) => a.id),
    hub: hubs.agents,
    sourceRoot: catalog.sourceRoot,
  };
  report.registry = {
    ok: registry?.ok ?? null,
    registerPath: registry?.registerPath ?? null,
    hub: hubs.registry,
  };
  report.gateway = {
    status: gateway?.status ?? null,
    hub: hubs.gateway,
  };
  report.developer = {
    status: developer?.status ?? null,
  };
  report.sourceOfTruth = {
    hubUi: "GET /api/clawd/browser-agents → /agents",
    skills: "GET /api/skills → /skills",
    registry: "registry.cheshireterminal.ai via /api/agent-registry",
    forgePackage: "npm cheshire-terminal-agents (optional)",
    upstreamPublish: "github.com/solizardking/agents",
  };
  report.next = [
    `${CLI_NAME} agents:list`,
    `${CLI_NAME} register:agent --id <id> --dry-run`,
    `${CLI_NAME} register:all --dry-run`,
    `Open ${hubs.agents} and ${hubs.registry} to verify frontend`,
  ];
  return report;
}

/**
 * Fetch SIWS challenge for wallet registration / login.
 * Does not require private keys — returns signable payload + next steps.
 */
export async function cmdRegisterUser(options = {}) {
  const wallet = options.wallet?.trim();
  if (!wallet) {
    throw new Error("register:user requires --wallet <base58-solana-pubkey>");
  }
  const client = createClient({ siteUrl: options.siteUrl });
  const { data } = await client.get(
    `/api/auth/challenge?wallet=${encodeURIComponent(wallet)}`,
  );

  const result = {
    brand: CLI_BRAND,
    siteUrl: client.siteUrl,
    mode: "siws-challenge",
    wallet,
    challenge: {
      message: data.message,
      nonce: data.nonce,
      expiresAt: data.expiresAt,
    },
    nextSteps: [
      "Sign challenge.message with the wallet (ed25519 detached signature, base58).",
      `Run: ${CLI_NAME} login --wallet ${wallet} --signature <sig> --message <exact-challenge-message>`,
      "Or set CHESHIRE_API_KEY (ct_sk_…) for authenticated API calls when the site requires a key.",
      `${client.siteUrl}/api/developer/status documents key headers and routes.`,
    ],
    verifyPath: "/api/auth/verify",
    developerStatusPath: "/api/developer/status",
  };

  await saveCredentials({
    lastWallet: wallet,
    lastChallengeNonce: data.nonce,
    lastChallengeExpiresAt: data.expiresAt,
    siteUrl: client.siteUrl,
  });

  return result;
}

/**
 * Verify signed SIWS challenge (wallet login).
 */
export async function cmdLogin(options = {}) {
  const wallet = options.wallet?.trim();
  const signature = options.signature?.trim();
  const message = options.message;
  if (!wallet || !signature || !message) {
    throw new Error("login requires --wallet, --signature, and --message");
  }
  const client = createClient({ siteUrl: options.siteUrl });
  // No Origin header — server treats missing origin as trusted for CLI clients.
  const { data, status } = await client.post("/api/auth/verify", {
    walletAddress: wallet,
    signature,
    message,
  });

  await saveCredentials({
    lastWallet: wallet,
    lastLoginAt: new Date().toISOString(),
    siteUrl: client.siteUrl,
    sessionHint: data?.userId || data?.ok ? "verified" : "unknown",
  });

  return {
    brand: CLI_BRAND,
    siteUrl: client.siteUrl,
    httpStatus: status,
    ok: data?.ok !== false && status < 400,
    result: data,
    note:
      "Wallet session may be cookie-based. For headless CLI auth prefer CHESHIRE_API_KEY (optional developer key at /api/developer/keys).",
  };
}

/**
 * Live access tier probe (public | holder | admin). No signature, no storage.
 */
export async function cmdAccessProbe(options = {}) {
  const wallet = options.wallet?.trim();
  if (!wallet) {
    return { ok: false, error: "access requires --wallet <base58-solana-pubkey>" };
  }
  const client = createClient({ siteUrl: options.siteUrl, apiKey: options.apiKey });
  try {
    const { data } = await client.get(
      `/api/auth/access?wallet=${encodeURIComponent(wallet)}`,
    );
    return { ok: true, brand: CLI_BRAND, siteUrl: client.siteUrl, ...data };
  } catch (err) {
    // Fallback to legacy verify-holder shape
    try {
      const { data } = await client.get(
        `/api/auth/verify-holder?wallet=${encodeURIComponent(wallet)}`,
      );
      return {
        ok: true,
        brand: CLI_BRAND,
        siteUrl: client.siteUrl,
        walletAddress: wallet,
        tier: data.isHolder ? "holder" : "public",
        isPublic: true,
        isHolder: Boolean(data.isHolder),
        isAdmin: Boolean(data.isAdmin),
        clawdBalance: data.clawdBalance,
        holderMinimum: data.holderMinimum,
        clawdMint: data.clawdMint,
        source: "verify-holder-fallback",
      };
    } catch (err2) {
      return {
        ok: false,
        error: err2 instanceof CheshireHttpError ? err2.message : String(err2),
        status: err2 instanceof CheshireHttpError ? err2.status : undefined,
      };
    }
  }
}

/** Fetch SIWS challenge for dual-tier access verify (stores after access:verify). */
export async function cmdAccessChallenge(options = {}) {
  const wallet = options.wallet?.trim();
  if (!wallet) {
    return { ok: false, error: "access:challenge requires --wallet <base58>" };
  }
  const client = createClient({ siteUrl: options.siteUrl });
  try {
    const { data } = await client.get(
      `/api/auth/access/challenge?wallet=${encodeURIComponent(wallet)}`,
    );
    return {
      ok: true,
      brand: CLI_BRAND,
      siteUrl: client.siteUrl,
      mode: "access-challenge",
      wallet,
      challenge: data,
      nextSteps: [
        "Sign challenge.message with the wallet (ed25519 detached, base58).",
        `${CLI_NAME} access:verify --wallet ${wallet} --signature <sig> --message '<exact message>'`,
        "Works for public non-holders and holders; receipt is stored server-side.",
      ],
    };
  } catch (err) {
    if (err instanceof CheshireHttpError) {
      return { ok: false, error: err.message, status: err.status, body: err.body };
    }
    throw err;
  }
}

/** Submit signed access verification (public or holder). Stores receipt. */
export async function cmdAccessVerify(options = {}) {
  const wallet = options.wallet?.trim();
  const signature = options.signature?.trim();
  const message = options.message;
  if (!wallet || !signature || !message) {
    return {
      ok: false,
      error: "access:verify requires --wallet, --signature, and --message",
    };
  }
  const client = createClient({ siteUrl: options.siteUrl });
  try {
    const { data, status } = await client.post("/api/auth/access/verify", {
      walletAddress: wallet,
      signature,
      message,
    });
    return {
      ok: data?.ok !== false && status < 400,
      brand: CLI_BRAND,
      siteUrl: client.siteUrl,
      httpStatus: status,
      ...data,
    };
  } catch (err) {
    if (err instanceof CheshireHttpError) {
      return { ok: false, error: err.message, status: err.status, body: err.body };
    }
    throw err;
  }
}

/** Latest stored access verification receipt. */
export async function cmdAccessStatus(options = {}) {
  const wallet = options.wallet?.trim();
  if (!wallet) {
    return { ok: false, error: "access:status requires --wallet <base58>" };
  }
  const client = createClient({ siteUrl: options.siteUrl, apiKey: options.apiKey });
  try {
    const { data } = await client.get(
      `/api/auth/access/status?wallet=${encodeURIComponent(wallet)}`,
    );
    return { ok: true, brand: CLI_BRAND, siteUrl: client.siteUrl, ...data };
  } catch (err) {
    if (err instanceof CheshireHttpError) {
      return { ok: false, error: err.message, status: err.status, body: err.body };
    }
    throw err;
  }
}

export async function cmdWhoami(options = {}) {
  const client = createClient({ siteUrl: options.siteUrl, apiKey: options.apiKey });
  const creds = await loadCredentials();
  const apiKey = await resolveApiKey(options.apiKey);
  let developer = null;
  try {
    const { data } = await client.get("/api/developer/status");
    developer = {
      status: data?.status,
      origin: data?.origin,
      principal: data?.principal,
      apiKeyConfigured: data?.auth?.apiKey?.configured ?? null,
    };
  } catch (err) {
    developer = { error: err.message, status: err.status };
  }
  return {
    brand: CLI_BRAND,
    siteUrl: client.siteUrl,
    hasApiKey: Boolean(apiKey),
    apiKeySource: options.apiKey
      ? "flag"
      : process.env.CHESHIRE_API_KEY
        ? "env"
        : creds.apiKey
          ? "credentials-file"
          : null,
    credentials: {
      path: process.env.CHESHIRE_CREDENTIALS_PATH || "(default ~/.config/cheshire-terminal/credentials.json)",
      lastWallet: creds.lastWallet ?? null,
      lastLoginAt: creds.lastLoginAt ?? null,
      siteUrl: creds.siteUrl ?? null,
    },
    developer,
  };
}

export async function cmdSetKey(options = {}) {
  const apiKey = options.apiKey?.trim() || options.key?.trim();
  if (!apiKey) throw new Error("set-key requires --api-key <ct_sk_…>");
  if (!apiKey.startsWith("ct_sk_") && !options.force) {
    throw new Error("Expected Cheshire developer key prefix ct_sk_… (pass --force to store anyway)");
  }
  const saved = await saveCredentials({
    apiKey,
    siteUrl: resolveSiteUrl(options.siteUrl),
  });
  return {
    ok: true,
    brand: CLI_BRAND,
    siteUrl: saved.siteUrl,
    keyPrefix: `${apiKey.slice(0, 10)}…`,
    stored: true,
    note: "Key written to credentials file (mode 0600). Prefer env CHESHIRE_API_KEY in CI.",
  };
}

export async function cmdRegisterAgent(options = {}) {
  const siteUrl = resolveSiteUrl(options.siteUrl);
  const hubs = hubLinks(siteUrl);
  const catalogId = options.id?.trim();
  let publicBody;
  let source = "file";

  if (catalogId) {
    // Resolve agent from live browser catalog (same source as /agents frontend)
    const client = createClient({ siteUrl, apiKey: options.apiKey });
    const catalog = await fetchBrowserCatalog(client);
    const agent = catalog.agents.find(
      (a) => a.id === catalogId || a.registryName === toRegistryName(catalogId),
    );
    if (!agent) {
      return {
        ok: false,
        brand: CLI_BRAND,
        siteUrl,
        error: `Catalog agent not found: ${catalogId}`,
        availableSample: catalog.agents.slice(0, 20).map((a) => a.id),
        hint: "cheshire-cli agents:list",
      };
    }
    publicBody = catalogAgentToRegisterBody(agent, options);
    source = "browser-agents";
  } else {
    const file = options.file || registrationJsonPath();
    let registration;
    try {
      registration = await loadRegistrationJson(file);
    } catch {
      registration = {
        name: options.name || "cheshire-terminal-agent",
        description: "Cheshire Terminal agent",
        image: `${siteUrl}/og-image.png`,
        services: [
          { name: "web", endpoint: siteUrl },
          { name: "api", endpoint: `${siteUrl}/api` },
          { name: "gateway", endpoint: `${siteUrl}/gateway` },
          { name: "mcp", endpoint: `${siteUrl}/mcp` },
        ],
      };
    }
    const payload = buildAgentRegistryPayload(registration, { ...options, siteUrl });
    const { _cheshire, ...rest } = payload;
    publicBody = rest;
    source = options.file ? "file" : "default-registration";
  }

  const targetUrl = `${siteUrl}${API_SURFACES.registryRegister}`;

  if (!options.confirm) {
    return {
      ok: true,
      mode: "dry-run",
      brand: CLI_BRAND,
      siteUrl,
      source,
      targetUrl,
      method: "POST",
      frontend: {
        registry: hubs.registry,
        agents: hubs.agents,
      },
      payload: publicBody,
      note: "Pass --confirm to POST. Registered agents appear on /agent-registry (frontend polls /api/agent-registry/v0/agents).",
    };
  }

  const client = createClient({ siteUrl, apiKey: options.apiKey });
  try {
    const { data, status } = await client.post(API_SURFACES.registryRegister, publicBody);
    return {
      ok: status >= 200 && status < 300,
      mode: "live",
      brand: CLI_BRAND,
      siteUrl,
      source,
      httpStatus: status,
      request: publicBody,
      response: data,
      frontend: {
        registry: hubs.registry,
        agents: hubs.agents,
        refresh: `${hubs.api.registryAgents}?limit=20`,
      },
    };
  } catch (err) {
    if (err instanceof CheshireHttpError) {
      return {
        ok: false,
        mode: "live",
        brand: CLI_BRAND,
        siteUrl,
        source,
        httpStatus: err.status,
        request: publicBody,
        error: err.message,
        body: err.body,
      };
    }
    throw err;
  }
}

/**
 * Register every agent from the live browser catalog (same list as /agents).
 * Default dry-run; --confirm writes (rate-limited).
 */
export async function cmdRegisterAll(options = {}) {
  const siteUrl = resolveSiteUrl(options.siteUrl);
  const hubs = hubLinks(siteUrl);
  const client = createClient({ siteUrl, apiKey: options.apiKey });
  const catalog = await fetchBrowserCatalog(client);
  const limit = Math.min(
    Math.max(1, Number(options.limit) || catalog.agents.length),
    catalog.agents.length || 1,
  );
  const slice = catalog.agents.slice(0, limit);
  const confirm = Boolean(options.confirm);

  const results = [];
  for (const agent of slice) {
    const body = catalogAgentToRegisterBody(agent, options);
    if (!confirm) {
      results.push({
        id: agent.id,
        mode: "dry-run",
        ok: true,
        payload: body,
      });
      continue;
    }
    try {
      const { data, status } = await client.post(API_SURFACES.registryRegister, body);
      results.push({
        id: agent.id,
        mode: "live",
        ok: status >= 200 && status < 300,
        httpStatus: status,
        name: body.name,
        response: data,
      });
      // Soft pacing for public rate limit (12/min on register)
      await new Promise((r) => setTimeout(r, 350));
    } catch (err) {
      results.push({
        id: agent.id,
        mode: "live",
        ok: false,
        name: body.name,
        error: err.message,
        status: err.status,
      });
      await new Promise((r) => setTimeout(r, 500));
    }
  }

  const okCount = results.filter((r) => r.ok).length;
  return {
    ok: okCount === results.length,
    brand: CLI_BRAND,
    siteUrl,
    mode: confirm ? "live" : "dry-run",
    catalogCount: catalog.count,
    attempted: results.length,
    succeeded: okCount,
    failed: results.length - okCount,
    frontend: {
      agents: hubs.agents,
      registry: hubs.registry,
      note: "After --confirm, open /agent-registry — UI refetches GET /api/agent-registry/v0/agents",
    },
    results,
  };
}

// ── Eliza agents studio (@elizaos/cheshire-eliza) ───────────────────────────

function parseRailsFlag(raw) {
  if (!raw) return undefined;
  const parts = String(raw)
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  const rails = parts.filter((p) => p === "solana" || p === "robinhood");
  return rails.length ? rails : undefined;
}

/**
 * GET /api/eliza-agents/status — package + plugins + readiness.
 */
export async function cmdElizaStatus(options = {}) {
  const client = createClient({ siteUrl: options.siteUrl, apiKey: options.apiKey });
  const hubs = hubLinks(client.siteUrl);
  try {
    const { data } = await client.get(API_SURFACES.elizaStatus);
    return {
      ok: true,
      brand: CLI_BRAND,
      siteUrl: client.siteUrl,
      page: hubs.elizaAgents,
      cli: {
        package: CLI_PACKAGE_NAME,
        hub: CLI_HUB_URL,
        commands: [
          `${CLI_NAME} eliza:status`,
          `${CLI_NAME} eliza:catalog`,
          `${CLI_NAME} eliza:generate --name <n> --archetype trader`,
          `${CLI_NAME} eliza:deploy --name <n>`,
        ],
      },
      status: data,
    };
  } catch (err) {
    if (err instanceof CheshireHttpError) {
      return { ok: false, error: err.message, status: err.status, body: err.body };
    }
    throw err;
  }
}

export async function cmdElizaCatalog(options = {}) {
  const client = createClient({ siteUrl: options.siteUrl, apiKey: options.apiKey });
  const hubs = hubLinks(client.siteUrl);
  try {
    const { data } = await client.get(API_SURFACES.elizaCatalog);
    return {
      ok: true,
      brand: CLI_BRAND,
      siteUrl: client.siteUrl,
      page: hubs.elizaAgents,
      catalog: data,
    };
  } catch (err) {
    if (err instanceof CheshireHttpError) {
      return { ok: false, error: err.message, status: err.status, body: err.body };
    }
    throw err;
  }
}

export async function cmdElizaPackage(options = {}) {
  const client = createClient({ siteUrl: options.siteUrl, apiKey: options.apiKey });
  try {
    const { data } = await client.get(API_SURFACES.elizaPackage);
    return {
      ok: true,
      brand: CLI_BRAND,
      siteUrl: client.siteUrl,
      page: hubLinks(client.siteUrl).elizaAgents,
      package: data,
    };
  } catch (err) {
    if (err instanceof CheshireHttpError) {
      return { ok: false, error: err.message, status: err.status, body: err.body };
    }
    throw err;
  }
}

export async function cmdElizaSolizard(options = {}) {
  const client = createClient({ siteUrl: options.siteUrl, apiKey: options.apiKey });
  try {
    const { data } = await client.get(API_SURFACES.elizaSolizard);
    return {
      ok: true,
      brand: CLI_BRAND,
      siteUrl: client.siteUrl,
      page: hubLinks(client.siteUrl).elizaAgents,
      solizard: data,
    };
  } catch (err) {
    if (err instanceof CheshireHttpError) {
      return { ok: false, error: err.message, status: err.status, body: err.body };
    }
    throw err;
  }
}

/**
 * POST /api/eliza-agents/generate — body generator (cheshire-eliza).
 */
export async function cmdElizaGenerate(options = {}) {
  const client = createClient({ siteUrl: options.siteUrl, apiKey: options.apiKey });
  const name = String(options.name || "").trim();
  if (!name || name.length < 2) {
    throw new Error("eliza:generate requires --name <agent-name> (min 2 chars)");
  }
  const body = {
    name,
    archetype: options.archetype || "operator",
    rails: parseRailsFlag(options.rails) || ["solana", "robinhood"],
    includeE2B: options.noE2b ? false : options.includeE2B !== false,
    includeMemory: options.noMemory ? false : options.includeMemory !== false,
    includeForge: options.noForge ? false : options.includeForge !== false,
    includeBrowserUse: Boolean(options.browserUse || options.includeBrowserUse),
    systemExtra: options.systemExtra || options["system-extra"] || undefined,
    seedCharacterId: options.seed || options.seedCharacterId || undefined,
  };
  try {
    const { data } = await client.post(API_SURFACES.elizaGenerate, body);
    return {
      ok: true,
      brand: CLI_BRAND,
      siteUrl: client.siteUrl,
      page: hubLinks(client.siteUrl).elizaAgents,
      request: body,
      result: data,
    };
  } catch (err) {
    if (err instanceof CheshireHttpError) {
      return { ok: false, error: err.message, status: err.status, body: err.body };
    }
    throw err;
  }
}

/**
 * POST /api/eliza-agents/deploy — deploy plan + character.
 */
export async function cmdElizaDeploy(options = {}) {
  const client = createClient({ siteUrl: options.siteUrl, apiKey: options.apiKey });
  const name = String(options.name || "").trim();
  if (!name || name.length < 2) {
    throw new Error("eliza:deploy requires --name <agent-name> (min 2 chars)");
  }
  const body = {
    name,
    archetype: options.archetype || "operator",
    rails: parseRailsFlag(options.rails) || ["solana", "robinhood"],
    includeE2B: options.noE2b ? false : options.includeE2B !== false,
    includeMemory: options.noMemory ? false : options.includeMemory !== false,
    includeForge: options.noForge ? false : options.includeForge !== false,
    includeBrowserUse: Boolean(options.browserUse || options.includeBrowserUse),
    systemExtra: options.systemExtra || options["system-extra"] || undefined,
    seedCharacterId: options.seed || options.seedCharacterId || undefined,
    preferCloud: options.preferCloud !== false,
  };
  try {
    const { data } = await client.post(API_SURFACES.elizaDeploy, body);
    return {
      ok: true,
      brand: CLI_BRAND,
      siteUrl: client.siteUrl,
      page: hubLinks(client.siteUrl).elizaAgents,
      request: body,
      result: data,
    };
  } catch (err) {
    if (err instanceof CheshireHttpError) {
      return { ok: false, error: err.message, status: err.status, body: err.body };
    }
    throw err;
  }
}

export async function cmdConnect(options = {}) {
  const siteUrl = resolveSiteUrl(options.siteUrl);
  const hubs = hubLinks(siteUrl);
  return {
    brand: CLI_BRAND,
    siteUrl,
    hubs,
    sourceOfTruth: {
      hubUi: "GET /api/clawd/browser-agents → /agents",
      skills: "GET /api/skills → /skills",
      registry: "registry.cheshireterminal.ai → /api/agent-registry → /agent-registry",
      eliza: "GET /api/eliza-agents/* → /eliza-agents (@elizaos/cheshire-eliza)",
      forge: "npm cheshire-terminal-agents (optional peer)",
      upstream: OPEN_SOURCE_REPOS.agents.url,
      openSource: "agents · cli · eliza · cheshire-terminal",
    },
    openSource: hubs.openSource || openSourceDiscoveryFragment(),
    endpoints: {
      web: siteUrl,
      api: `${siteUrl}/api`,
      cliHub: hubs.cli,
      gateway: hubs.gateway,
      gatewayApi: `${siteUrl}/api/gateway`,
      gatewayStatus: `${siteUrl}/api/gateway/status`,
      gatewayOpenapi: `${siteUrl}/api/gateway/openapi.json`,
      gatewayLlms: `${siteUrl}/api/gateway/llms.txt`,
      gatewayCatalog: `${siteUrl}/api/gateway/catalog`,
      developerStatus: `${siteUrl}/api/developer/status`,
      skills: hubs.api.skills,
      skillsHub: hubs.skills,
      browserAgents: hubs.api.browserAgents,
      agentsHub: hubs.agents,
      agentForge: hubs.forge,
      elizaAgents: hubs.elizaAgents,
      elizaStatus: hubs.api.elizaStatus,
      elizaCatalog: hubs.api.elizaCatalog,
      elizaPackage: hubs.api.elizaPackage,
      agentRegistry: hubs.registry,
      registryApi: hubs.api.registryStatus,
      registryRegister: hubs.api.register,
      agentsGithub: OPEN_SOURCE_REPOS.agents.url,
      cliGithub: OPEN_SOURCE_REPOS.cli.url,
      elizaGithub: OPEN_SOURCE_REPOS.eliza.url,
      cheshireTerminalGithub: OPEN_SOURCE_REPOS.cheshireTerminal.url,
      registryNative: "https://registry.cheshireterminal.ai/",
      mcp: `${siteUrl}/mcp`,
      x402: `${siteUrl}/x402`,
      authChallenge: `${siteUrl}/api/auth/challenge?wallet=<base58>`,
      authVerify: `${siteUrl}/api/auth/verify`,
      metaplexHealth: `${siteUrl}/api/metaplex-agents/health`,
    },
    credentials: {
      envApiKey: "CHESHIRE_API_KEY",
      envSite: "CHESHIRE_SITE_URL",
      headers: ["Authorization: Bearer ct_sk_…", "x-api-key: ct_sk_…"],
      note: "Same ct_sk_ keys work on /api/* and the branded /api/gateway/* alias (see /gateway).",
    },
    npm: {
      package: CLI_PACKAGE_NAME,
      install: `npm i -g ${CLI_PACKAGE_NAME}`,
      npx: `npx ${CLI_PACKAGE_NAME}`,
      registry: "https://www.npmjs.com/package/cheshire-terminal-cli",
      hub: CLI_HUB_URL,
      gateway: CLI_GATEWAY_URL,
    },
    forgePackage: {
      npm: "cheshire-terminal-agents",
      bin: "cheshire-terminal-agents",
      docs: "https://www.npmjs.com/package/cheshire-terminal-agents",
    },
    next: [
      `npm i -g ${CLI_PACKAGE_NAME}`,
      `${CLI_NAME} status`,
      `${CLI_NAME} register:user --wallet <pubkey>`,
      `${CLI_NAME} set-key --api-key ct_sk_…`,
      `${CLI_NAME} register:agent --dry-run`,
      `Open ${siteUrl}/gateway for scoped API keys + OpenAPI`,
    ],
  };
}

export async function cmdForgePrepare(options = {}) {
  const siteUrl = resolveSiteUrl(options.siteUrl);
  const file = options.file || registrationJsonPath();
  let registration;
  try {
    registration = JSON.parse(await readFile(file, "utf8"));
  } catch {
    registration = null;
  }
  return {
    brand: CLI_BRAND,
    siteUrl,
    mode: "prepare-hints",
    file,
    registrationName: registration?.name ?? null,
    services: registration?.services ?? null,
    commands: {
      localEvm: `npx cheshire-terminal-agents prepare-local-robinhood --file ${file} --chain 46630`,
      hostedEvm: `npx cheshire-terminal-agents prepare-robinhood --file ${file} --site ${siteUrl}`,
      omni: `npx cheshire-terminal-agents omni-mint-plan --file ${file} --chain 46630 --solana-network solana-devnet`,
      catalog: "npx cheshire-terminal-agents agents-list",
      capabilities: `npx cheshire-terminal-agents capabilities --site ${siteUrl}`,
    },
    env: {
      CHESHIRE_SITE_URL: siteUrl,
      CHESHIRE_API_KEY: process.env.CHESHIRE_API_KEY ? "(set)" : "(unset)",
    },
    note: "Heavy forge work lives in cheshire-terminal-agents; this CLI prepares site registry + user auth.",
  };
}

function parseKvFlags(kvRaw) {
  const out = {};
  const list = Array.isArray(kvRaw) ? kvRaw : kvRaw ? [kvRaw] : [];
  for (const entry of list) {
    const s = String(entry || "").trim();
    if (!s) continue;
    const eq = s.indexOf("=");
    if (eq <= 0) continue;
    out[s.slice(0, eq).trim()] = s.slice(eq + 1).trim();
  }
  return out;
}

/**
 * Pinata Cloud via site /api/ipfs (PINATA_JWT stays on the server).
 * Actions: status | groups | groups:create | file | json
 */
export async function cmdPin(options = {}) {
  const client = createClient({ siteUrl: options.siteUrl, apiKey: options.apiKey });
  const action = String(options.action || "status").toLowerCase();
  const keyvalues = {
    source: "cheshire-cli",
    ...parseKvFlags(options.kv),
  };
  const groupId = options.group || options.groupId || null;
  const name = options.name || null;

  if (action === "status" || action === "pin" || action === "") {
    const { data } = await client.get("/api/ipfs/status");
    return {
      ok: true,
      action: "status",
      siteUrl: client.siteUrl,
      pinata: data,
      tips: [
        `${CLI_NAME} pin:file --path ./agent.json --name my-agent --group <id> --kv env=prod`,
        `${CLI_NAME} pin:json --file ./meta.json --name agent-meta --kv source=cli`,
        `${CLI_NAME} pin:groups:create --name cheshire-agents`,
      ],
    };
  }

  if (action === "groups" || action === "groups:list") {
    const { data } = await client.get("/api/ipfs/groups");
    return {
      ok: true,
      action: "groups",
      count: data?.count ?? data?.groups?.length ?? 0,
      groups: data?.groups || [],
    };
  }

  if (action === "groups:create" || action === "group:create") {
    const groupName = name || options.groupName;
    if (!groupName) {
      return { ok: false, error: "pin:groups:create requires --name <group>" };
    }
    const { data } = await client.post("/api/ipfs/groups", { name: groupName });
    return { ok: true, action: "groups:create", group: data?.group || data };
  }

  if (action === "file" || action === "upload") {
    const path = options.path || options.file;
    if (!path) {
      return { ok: false, error: "pin:file requires --path <file>" };
    }
    const { readFile: rf } = await import("node:fs/promises");
    const { basename } = await import("node:path");
    const bytes = await rf(path);
    const filename = basename(path);
    const displayName = name || filename;

    // Multipart via undici/native FormData + Blob (Node 18+)
    const form = new FormData();
    form.append("file", new Blob([bytes]), filename);
    form.append("name", displayName);
    if (groupId) form.append("group_id", groupId);
    form.append("keyvalues", JSON.stringify(keyvalues));

    const url = `${client.siteUrl}/api/ipfs/upload`;
    const key = options.apiKey || (await resolveApiKey());
    const headers = {
      Accept: "application/json",
      "User-Agent": "cheshire-terminal-cli/1.0",
      ...(key
        ? { Authorization: `Bearer ${key}`, "x-api-key": key }
        : {}),
    };
    const res = await fetch(url, { method: "POST", headers, body: form });
    const text = await res.text();
    let data = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = { raw: text.slice(0, 500) };
    }
    if (!res.ok) {
      return {
        ok: false,
        action: "file",
        error: data?.error || res.statusText,
        status: res.status,
        body: data,
      };
    }
    return {
      ok: true,
      action: "file",
      path,
      name: displayName,
      groupId: groupId || data?.groupId || null,
      keyvalues,
      ...data,
    };
  }

  if (action === "json") {
    let content = null;
    if (options.data) {
      try {
        content = JSON.parse(String(options.data));
      } catch {
        return { ok: false, error: "--data must be valid JSON" };
      }
    } else {
      const path = options.path || options.file;
      if (!path) {
        return { ok: false, error: "pin:json requires --file <json> or --data '<json>'" };
      }
      content = JSON.parse(await readFile(path, "utf8"));
    }
    const { data } = await client.post("/api/ipfs/json", {
      content,
      name: name || "cheshire-cli-json",
      group_id: groupId || undefined,
      keyvalues,
    });
    return {
      ok: true,
      action: "json",
      name: name || "cheshire-cli-json",
      groupId: groupId || data?.groupId || null,
      keyvalues,
      ...data,
    };
  }

  return {
    ok: false,
    error: `Unknown pin action: ${action}`,
    usage: "pin | pin:status | pin:groups | pin:groups:create | pin:file | pin:json",
  };
}

/**
 * Dispatch a CLI command. Returns { exitCode, result }.
 */
export async function runCommand(argv) {
  const [command = "help", ...rest] = argv;
  const { flags, positionals } = parseFlags(rest);
  const siteUrl = flags.site;
  const apiKey = flags["api-key"] || flags.apiKey;

  const opts = {
    siteUrl,
    apiKey,
    wallet: flags.wallet,
    signature: flags.signature,
    message: flags.message,
    file: flags.file,
    id: flags.id,
    name: flags.name || (!flags.id ? positionals[0] : undefined),
    query: flags.query || positionals[0],
    title: flags.title,
    description: flags.description,
    tag: flags.tag,
    limit: flags.limit,
    list: Boolean(flags.list),
    dryRun: flags["dry-run"] || !flags.confirm,
    confirm: Boolean(flags.confirm),
    force: Boolean(flags.force),
    key: flags.key,
    path: flags.path,
    group: flags.group || flags["group-id"] || flags.groupId,
    kv: (() => {
      // Support repeated --kv and comma-separated values
      const raw = [];
      for (let i = 0; i < rest.length; i += 1) {
        if (rest[i] === "--kv" && rest[i + 1]) {
          raw.push(rest[i + 1]);
          i += 1;
        }
      }
      if (flags.kv) raw.push(flags.kv);
      return raw;
    })(),
    data: flags.data,
    model: flags.model,
    provider: flags.provider,
    host: Boolean(flags.host),
    hosted: flags.hosted === undefined ? undefined : flags.hosted !== "false" && flags.hosted !== false,
    room: flags.room || flags["room-id"] || flags.roomId,
    roomId: flags.room || flags["room-id"] || flags.roomId,
    mine: Boolean(flags.mine),
    capabilities: flags.capabilities,
    endpoint: flags.endpoint || flags["endpoint-url"] || flags.endpointUrl,
    endpointUrl: flags.endpoint || flags["endpoint-url"] || flags.endpointUrl,
    slug: flags.slug,
    agentId: flags["agent-id"] || flags.agentId,
    agent: flags.agent,
    archetype: flags.archetype,
    rails: flags.rails,
    seed: flags.seed || flags["seed-id"] || flags.seedId,
    seedCharacterId: flags.seed || flags["seed-id"] || flags.seedId,
    systemExtra: flags["system-extra"] || flags.systemExtra,
    noE2b: Boolean(flags["no-e2b"] || flags.noE2b),
    noMemory: Boolean(flags["no-memory"] || flags.noMemory),
    noForge: Boolean(flags["no-forge"] || flags.noForge),
    browserUse: Boolean(flags["browser-use"] || flags.browserUse),
    includeBrowserUse: Boolean(flags["browser-use"] || flags.browserUse),
    preferCloud: flags["prefer-cloud"] !== "false" && flags.preferCloud !== false,
    command,
  };

  try {
    let result;
    switch (command) {
      case "help":
      case "-h":
      case "--help":
        return { exitCode: 0, result: { help: true, text: usageText() }, text: usageText() };
      case "status":
        result = await cmdStatus(opts);
        break;
      case "sync":
      case "surfaces":
        result = await cmdSync(opts);
        break;
      case "skills":
      case "skills:list":
        result = await cmdSkills(opts);
        break;
      case "skills:search":
        result = await cmdSkills({ ...opts, query: positionals[0] || flags.query });
        break;
      case "agents":
        result = await cmdAgents(opts);
        break;
      case "agents:list":
      case "list-agents":
        result = await cmdAgents({ ...opts, list: true });
        break;
      case "agents:show":
      case "show-agent":
        result = await cmdAgents({
          ...opts,
          id: flags.id || positionals[0],
        });
        break;
      case "registry":
      case "agent-registry":
        result = await cmdRegistry(opts);
        break;
      case "registry:list":
      case "list-registry":
        result = await cmdRegistry({ ...opts, list: true });
        break;
      case "connect":
        result = await cmdConnect(opts);
        break;
      case "register:user":
      case "register-user":
      case "auth:challenge":
        result = await cmdRegisterUser(opts);
        break;
      case "login":
      case "auth:verify":
      case "register:user:verify":
        result = await cmdLogin(opts);
        break;
      case "whoami":
        result = await cmdWhoami(opts);
        break;
      case "access":
      case "access:probe":
      case "verify-access":
        result = await cmdAccessProbe(opts);
        break;
      case "access:challenge":
        result = await cmdAccessChallenge(opts);
        break;
      case "access:verify":
        result = await cmdAccessVerify(opts);
        break;
      case "access:status":
        result = await cmdAccessStatus(opts);
        break;
      case "set-key":
      case "login:key":
        result = await cmdSetKey(opts);
        break;
      case "register":
      case "register:agent":
      case "register-agent":
      case "register:prepare":
        result = await cmdRegisterAgent({
          ...opts,
          confirm: command === "register:prepare" ? false : opts.confirm,
        });
        break;
      case "register:all":
      case "register-all":
      case "sync:register":
        result = await cmdRegisterAll(opts);
        break;
      case "forge:prepare":
      case "forge-prepare":
        result = await cmdForgePrepare(opts);
        break;
      case "eliza":
      case "eliza:status":
      case "eliza-agents":
        result = await cmdElizaStatus(opts);
        break;
      case "eliza:catalog":
        result = await cmdElizaCatalog(opts);
        break;
      case "eliza:package":
        result = await cmdElizaPackage(opts);
        break;
      case "eliza:solizard":
        result = await cmdElizaSolizard(opts);
        break;
      case "eliza:generate":
      case "eliza:body":
        result = await cmdElizaGenerate({
          ...opts,
          name: flags.name || positionals[0],
        });
        break;
      case "eliza:deploy":
      case "eliza:plan":
        result = await cmdElizaDeploy({
          ...opts,
          name: flags.name || positionals[0],
        });
        break;
      case "arena":
      case "arena:status":
        result = await cmdArenaStatus(opts);
        break;
      case "arena:list":
      case "arena:agents":
        result = await cmdArenaList(opts);
        break;
      case "arena:rooms":
        result = await cmdArenaRooms(opts);
        break;
      case "arena:register":
      case "arena:register-agent":
        result = await cmdArenaRegister(opts);
        break;
      case "arena:host":
        result = await cmdArenaHost(opts);
        break;
      case "arena:enter":
      case "arena:join":
        result = await cmdArenaEnter(opts);
        break;
      case "pin":
      case "pin:status":
        result = await cmdPin({ ...opts, action: "status" });
        break;
      case "pin:groups":
      case "pin:groups:list":
        result = await cmdPin({ ...opts, action: "groups" });
        break;
      case "pin:groups:create":
      case "pin:group:create":
        result = await cmdPin({
          ...opts,
          action: "groups:create",
          name: flags.name || positionals[0],
        });
        break;
      case "pin:file":
      case "pin:upload":
        result = await cmdPin({
          ...opts,
          action: "file",
          path: flags.path || flags.file || positionals[0],
        });
        break;
      case "pin:json":
        result = await cmdPin({
          ...opts,
          action: "json",
          path: flags.path || flags.file || positionals[0],
          data: flags.data,
        });
        break;
      default:
        return {
          exitCode: 1,
          result: { error: `Unknown command: ${command}` },
          text: `Unknown command: ${command}\n\n${usageText()}`,
        };
    }
    return { exitCode: result?.ok === false ? 1 : 0, result };
  } catch (err) {
    return {
      exitCode: 1,
      result: {
        error: err instanceof Error ? err.message : String(err),
        status: err?.status,
        body: err?.body,
      },
    };
  }
}
