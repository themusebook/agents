/**
 * Cheshire agent catalog: load, convert, and validate agents against
 * schema/Cheshire_agent_schema.json (vendored from defi-agents).
 */
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { dirname, join, basename } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
export const PACKAGE_ROOT = join(__dirname, "..");
export const AGENTS_DIR = join(PACKAGE_ROOT, "agents");
export const LOCALES_DIR = join(PACKAGE_ROOT, "locales");
export const SCHEMA_PATH = join(PACKAGE_ROOT, "schema", "Cheshire_agent_schema.json");

const ROOT_ALLOWED = new Set([
  "author",
  "config",
  "createdAt",
  "examples",
  "homepage",
  "identifier",
  "knowledgeCount",
  "meta",
  "openingMessage",
  "openingQuestions",
  "pluginCount",
  "schemaVersion",
  "summary",
  "tokenUsage",
]);

const CONFIG_ALLOWED = new Set([
  "compressThreshold",
  "displayMode",
  "enableCompressThreshold",
  "enableHistoryCount",
  "enableMaxTokens",
  "fewShots",
  "historyCount",
  "inputTemplate",
  "knowledgeBases",
  "model",
  "openingMessage",
  "openingQuestions",
  "params",
  "plugins",
  "systemRole",
]);

const META_ALLOWED = new Set([
  "avatar",
  "backgroundColor",
  "category",
  "description",
  "tags",
  "title",
]);

const ROOT_REQUIRED = [
  "author",
  "config",
  "createdAt",
  "homepage",
  "identifier",
  "knowledgeCount",
  "meta",
  "pluginCount",
  "schemaVersion",
  "tokenUsage",
];

const META_REQUIRED = ["avatar", "description", "tags", "title"];

const DEFAULT_HOMEPAGE = "https://cheshireterminal.ai/agents";
const DEFAULT_AUTHOR = "cheshire-terminal";

/** Estimate rough token usage from text length (chars/4). */
export function estimateTokenUsage(...parts) {
  const text = parts.filter((p) => typeof p === "string").join("\n");
  return Math.max(1, Math.ceil(text.length / 4));
}

export function loadCheshireSchema() {
  const raw = readFileSync(SCHEMA_PATH, "utf8");
  return JSON.parse(raw);
}

/**
 * Validate a Cheshire agent document against the schema contract.
 * Implements the subset of draft-07 needed for Cheshire_agent_schema.json
 * (required fields, types, additionalProperties: false on root/config/meta).
 *
 * @param {unknown} agent
 * @returns {{ ok: true } | { ok: false, errors: string[] }}
 */
export function validateCheshireAgent(agent) {
  const errors = [];

  if (agent === null || typeof agent !== "object" || Array.isArray(agent)) {
    return { ok: false, errors: ["agent must be a non-null object"] };
  }

  for (const key of Object.keys(agent)) {
    if (!ROOT_ALLOWED.has(key)) {
      errors.push(`unexpected root property: ${key}`);
    }
  }

  for (const key of ROOT_REQUIRED) {
    if (!(key in agent)) {
      errors.push(`missing required field: ${key}`);
    }
  }

  if ("author" in agent && typeof agent.author !== "string") {
    errors.push("author must be a string");
  }
  if ("createdAt" in agent && typeof agent.createdAt !== "string") {
    errors.push("createdAt must be a string");
  }
  if ("homepage" in agent && typeof agent.homepage !== "string") {
    errors.push("homepage must be a string");
  }
  if ("identifier" in agent && typeof agent.identifier !== "string") {
    errors.push("identifier must be a string");
  }
  if ("knowledgeCount" in agent && typeof agent.knowledgeCount !== "number") {
    errors.push("knowledgeCount must be a number");
  }
  if ("pluginCount" in agent && typeof agent.pluginCount !== "number") {
    errors.push("pluginCount must be a number");
  }
  if ("schemaVersion" in agent && typeof agent.schemaVersion !== "number") {
    errors.push("schemaVersion must be a number");
  }
  if ("tokenUsage" in agent && typeof agent.tokenUsage !== "number") {
    errors.push("tokenUsage must be a number");
  }
  if ("summary" in agent && agent.summary !== undefined && typeof agent.summary !== "string") {
    errors.push("summary must be a string");
  }
  if ("openingMessage" in agent && agent.openingMessage !== undefined && typeof agent.openingMessage !== "string") {
    errors.push("openingMessage must be a string");
  }
  if ("openingQuestions" in agent && agent.openingQuestions !== undefined) {
    if (!Array.isArray(agent.openingQuestions) || !agent.openingQuestions.every((q) => typeof q === "string")) {
      errors.push("openingQuestions must be an array of strings");
    }
  }

  // config
  if ("config" in agent) {
    const config = agent.config;
    if (config === null || typeof config !== "object" || Array.isArray(config)) {
      errors.push("config must be an object");
    } else {
      for (const key of Object.keys(config)) {
        if (!CONFIG_ALLOWED.has(key)) {
          errors.push(`unexpected config property: ${key}`);
        }
      }
      if (typeof config.systemRole !== "string") {
        errors.push("config.systemRole is required and must be a string");
      } else if (!config.systemRole.trim()) {
        errors.push("config.systemRole must be non-empty");
      }
      if (config.openingMessage !== undefined && typeof config.openingMessage !== "string") {
        errors.push("config.openingMessage must be a string");
      }
      if (config.openingQuestions !== undefined) {
        if (!Array.isArray(config.openingQuestions) || !config.openingQuestions.every((q) => typeof q === "string")) {
          errors.push("config.openingQuestions must be an array of strings");
        }
      }
      if (config.displayMode !== undefined && config.displayMode !== "chat" && config.displayMode !== "docs") {
        errors.push('config.displayMode must be "chat" or "docs"');
      }
      if (config.fewShots !== undefined) {
        if (!Array.isArray(config.fewShots)) {
          errors.push("config.fewShots must be an array");
        } else {
          for (let i = 0; i < config.fewShots.length; i++) {
            const shot = config.fewShots[i];
            if (!shot || typeof shot !== "object" || typeof shot.content !== "string" || typeof shot.role !== "string") {
              errors.push(`config.fewShots[${i}] must have content and role strings`);
            }
          }
        }
      }
    }
  }

  // meta
  if ("meta" in agent) {
    const meta = agent.meta;
    if (meta === null || typeof meta !== "object" || Array.isArray(meta)) {
      errors.push("meta must be an object");
    } else {
      for (const key of Object.keys(meta)) {
        if (!META_ALLOWED.has(key)) {
          errors.push(`unexpected meta property: ${key}`);
        }
      }
      for (const key of META_REQUIRED) {
        if (!(key in meta)) {
          errors.push(`missing meta.${key}`);
        }
      }
      if ("avatar" in meta && typeof meta.avatar !== "string") errors.push("meta.avatar must be a string");
      if ("description" in meta && typeof meta.description !== "string") errors.push("meta.description must be a string");
      if ("title" in meta && typeof meta.title !== "string") errors.push("meta.title must be a string");
      if ("tags" in meta) {
        if (!Array.isArray(meta.tags) || !meta.tags.every((t) => typeof t === "string")) {
          errors.push("meta.tags must be an array of strings");
        }
      }
      if ("category" in meta && meta.category !== undefined && typeof meta.category !== "string") {
        errors.push("meta.category must be a string");
      }
    }
  }

  // examples (fewShots shape)
  if ("examples" in agent && agent.examples !== undefined) {
    if (!Array.isArray(agent.examples)) {
      errors.push("examples must be an array");
    } else {
      for (let i = 0; i < agent.examples.length; i++) {
        const ex = agent.examples[i];
        if (!ex || typeof ex !== "object" || typeof ex.content !== "string" || typeof ex.role !== "string") {
          errors.push(`examples[${i}] must have content and role strings`);
        }
      }
    }
  }

  return errors.length === 0 ? { ok: true } : { ok: false, errors };
}

/**
 * List agent JSON identifiers currently in the catalog directory.
 * @param {string} [dir]
 * @returns {string[]}
 */
export function listCatalogIdentifiers(dir = AGENTS_DIR) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .map((f) => basename(f, ".json"))
    .sort();
}

/**
 * Load all agents from the catalog directory.
 * @param {string} [dir]
 * @returns {Array<{ identifier: string, path: string, agent: object }>}
 */
export function loadCatalog(dir = AGENTS_DIR) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .sort()
    .map((f) => {
      const path = join(dir, f);
      const agent = JSON.parse(readFileSync(path, "utf8"));
      return { identifier: basename(f, ".json"), path, agent };
    });
}

/**
 * Validate every agent in the catalog.
 * @param {string} [dir]
 * @returns {{ ok: boolean, total: number, passed: number, failed: Array<{ identifier: string, errors: string[] }> }}
 */
export function validateCatalog(dir = AGENTS_DIR) {
  const entries = loadCatalog(dir);
  const failed = [];
  for (const { identifier, agent } of entries) {
    const result = validateCheshireAgent(agent);
    if (!result.ok) {
      failed.push({ identifier, errors: result.errors });
    } else if (agent.identifier !== identifier) {
      failed.push({
        identifier,
        errors: [`file stem "${identifier}" does not match agent.identifier "${agent.identifier}"`],
      });
    }
  }
  return {
    ok: failed.length === 0,
    total: entries.length,
    passed: entries.length - failed.length,
    failed,
  };
}

function humanizeKey(key) {
  return String(key).replace(/_/g, " ");
}

function formatKvSection(title, obj) {
  if (!obj || typeof obj !== "object") return "";
  const lines = Object.entries(obj).map(([k, v]) => {
    const label = humanizeKey(k);
    if (v && typeof v === "object" && !Array.isArray(v)) {
      return `- ${label}: ${JSON.stringify(v)}`;
    }
    if (Array.isArray(v)) {
      return `- ${label}: ${v.join("; ")}`;
    }
    return `- ${label}: ${v}`;
  });
  return `${title}:\n${lines.join("\n")}`;
}

function formatList(title, items) {
  if (!Array.isArray(items) || items.length === 0) return "";
  return `${title}:\n${items.map((i) => `- ${i}`).join("\n")}`;
}

function styleToText(style) {
  if (!style || typeof style !== "object") return "";
  const parts = [];
  for (const [mode, rules] of Object.entries(style)) {
    if (Array.isArray(rules) && rules.length) {
      parts.push(`${mode}:\n${rules.map((r) => `- ${r}`).join("\n")}`);
    }
  }
  return parts.length ? `Style:\n${parts.join("\n\n")}` : "";
}

function extractMessageExamples(messageExamples) {
  if (!Array.isArray(messageExamples)) return [];
  const out = [];
  for (const thread of messageExamples) {
    if (!Array.isArray(thread)) continue;
    for (const turn of thread) {
      const text = turn?.content?.text ?? turn?.content;
      const user = turn?.user ?? "";
      if (typeof text !== "string" || !text.trim()) continue;
      const isUser = typeof user === "string" && (user.includes("{{user") || user.toLowerCase() === "user");
      out.push({
        role: isUser ? "user" : "assistant",
        content: text.trim(),
      });
    }
  }
  return out.slice(0, 8);
}

function investorSystemRole(persona) {
  const sections = [
    `You are ${persona.name}${persona.role ? `, ${persona.role}` : ""}.`,
    persona.description ? `Description:\n${persona.description}` : "",
    formatKvSection("Personality traits", persona.personality_traits),
    formatKvSection("Investment principles", persona.investment_principles),
    formatKvSection("Analysis methods", persona.analysis_methods),
    formatKvSection("Valuation framework", persona.valuation_framework),
    formatList("Key metrics", persona.key_metrics),
    formatList("Focus sectors", persona.focus_sectors),
    formatKvSection("Historical context", persona.historical_context),
    formatKvSection("Communication style", persona.communication_style),
  ].filter(Boolean);
  return sections.join("\n\n");
}

function elizaSystemRole(persona) {
  const sections = [
    `You are ${persona.name}.`,
    formatList("Bio", persona.bio),
    formatList("Lore", persona.lore),
    formatList("Adjectives", persona.adjectives),
    formatList("Topics", persona.topics),
    styleToText(persona.style),
  ].filter(Boolean);

  if (Array.isArray(persona.services) && persona.services.length) {
    sections.push(
      "Services:\n" +
        persona.services
          .map((s) => `- ${s.name}${s.endpoint ? ` (${s.endpoint})` : ""}${s.description ? `: ${s.description}` : ""}`)
          .join("\n"),
    );
  }
  if (Array.isArray(persona.skills) && persona.skills.length) {
    sections.push(
      "Skills:\n" +
        persona.skills
          .map((s) => {
            if (typeof s === "string") return `- ${s}`;
            return `- ${s.name}${s.priority ? ` [${s.priority}]` : ""}${s.provides ? `: provides ${s.provides.join(", ")}` : ""}`;
          })
          .join("\n"),
    );
  }
  if (Array.isArray(persona.capabilities) && persona.capabilities.length) {
    sections.push(formatList("Capabilities", persona.capabilities.map((c) => (typeof c === "string" ? c : c.name || JSON.stringify(c)))));
  }
  if (persona.knowledge && typeof persona.knowledge === "object") {
    sections.push(`Knowledge:\n${JSON.stringify(persona.knowledge, null, 2)}`);
  }

  return sections.join("\n\n");
}

const CHARACTER_AVATARS = {
  alice: "🐇",
  "alice-character-json": "🐇",
  bengraham: "📊",
  billackman: "🎯",
  cathiewood: "🚀",
  charliemunger: "🧠",
  cheshire: "😺",
  "cheshire-character-json": "😺",
  clawd: "🐱",
  hedgefund: "📈",
  "mad-hatter": "🎩",
  "mad-hatter-character-json": "🎩",
  warrenbuffet: "💎",
};

const CHARACTER_TAGS = {
  alice: ["trading", "cross-chain", "character", "solana"],
  "alice-character-json": ["trading", "cross-chain", "character", "solana"],
  bengraham: ["value-investing", "fundamentals", "character", "finance"],
  billackman: ["activist-investing", "concentrated", "character", "finance"],
  cathiewood: ["disruptive-innovation", "growth", "character", "finance"],
  charliemunger: ["mental-models", "investing", "character", "finance"],
  cheshire: ["oracle", "generative", "character", "solana"],
  "cheshire-character-json": ["oracle", "generative", "character", "solana"],
  clawd: ["solana", "oracle", "x402", "character"],
  hedgefund: ["hedge-fund", "multi-persona", "investing", "character"],
  "mad-hatter": ["orchestration", "web3", "character", "agents"],
  "mad-hatter-character-json": ["orchestration", "web3", "character", "agents"],
  warrenbuffet: ["value-investing", "long-term", "character", "finance"],
};

/**
 * Map character filename stem → catalog identifier (stable, file-stem based).
 * @param {string} stem
 */
export function characterIdentifierFromStem(stem) {
  // Keep file stems as identifiers for 1:1 mapping from sources.
  return stem;
}

/**
 * Convert a character persona source (object or array) into a Cheshire agent.
 * @param {object|object[]} source
 * @param {string} identifier
 * @param {{ author?: string, homepage?: string, createdAt?: string }} [opts]
 */
export function convertCharacterToCheshireAgent(source, identifier, opts = {}) {
  const author = opts.author ?? DEFAULT_AUTHOR;
  const homepage = opts.homepage ?? DEFAULT_HOMEPAGE;
  const createdAt = opts.createdAt ?? new Date().toISOString().slice(0, 10);

  let systemRole;
  let title;
  let description;
  let examples = [];
  let tags = CHARACTER_TAGS[identifier] ?? ["character", "agent"];
  let category = "character";
  let openingMessage;
  let openingQuestions;

  if (Array.isArray(source)) {
    // Multi-persona hedge fund pack
    const personas = source;
    title = "Hedge Fund Desk";
    description =
      personas.map((p) => p.name).filter(Boolean).join(", ") ||
      "Multi-persona hedge fund investment desk";
    const parts = [
      "You are a multi-persona hedge fund investment desk. Embody the appropriate persona when asked, or synthesize consensus across the desk.",
      "",
      ...personas.map((p, i) => {
        return `=== Persona ${i + 1}: ${p.name}${p.role ? ` (${p.role})` : ""} ===\n${investorSystemRole(p)}`;
      }),
    ];
    systemRole = parts.join("\n\n");
    tags = CHARACTER_TAGS.hedgefund;
    openingMessage = `I'm the hedge fund desk — ${personas.map((p) => p.name).join(", ")}. Ask for a thesis, valuation, or multi-persona debate.`;
    openingQuestions = [
      "Give me a value-investing screen for this name",
      "How would Buffett vs Ackman view this business?",
      "What is the margin of safety?",
      "Which persona disagrees and why?",
    ];
  } else if (source && typeof source === "object") {
    title = source.name || identifier;
    if (source.role || source.investment_principles || source.personality_traits) {
      // Investor role style
      description =
        source.description ||
        `${source.name}${source.role ? ` — ${source.role}` : ""} investment persona`;
      systemRole = investorSystemRole(source);
      if (source.communication_style?.signature_phrases) {
        openingMessage = `I'm ${source.name}. ${source.communication_style.signature_phrases[0] || ""}`.trim();
      } else {
        openingMessage = `I'm ${source.name}${source.role ? `, ${source.role}` : ""}. How can I help with your analysis?`;
      }
      openingQuestions = [
        "Walk me through your investment framework",
        "How do you value this business?",
        "What would make you pass on a stock?",
        "What are your key risk factors?",
      ];
    } else {
      // Eliza-style bio/lore
      description =
        (Array.isArray(source.bio) && source.bio[0]) ||
        `${source.name || identifier} character agent`;
      systemRole = elizaSystemRole(source);
      examples = extractMessageExamples(source.messageExamples);
      openingMessage = `Hello — I'm ${source.name || identifier}. ${Array.isArray(source.bio) && source.bio[1] ? source.bio[1] : "What shall we explore?"}`;
      openingQuestions = (source.topics || []).slice(0, 4).map((t) => `Tell me about ${t}`);
      if (openingQuestions.length === 0) {
        openingQuestions = ["Who are you?", "What can you help with?", "What's your style?"];
      }
    }
  } else {
    throw new Error(`Unsupported character source for ${identifier}`);
  }

  const avatar = CHARACTER_AVATARS[identifier] ?? "🤖";
  const tokenUsage = estimateTokenUsage(systemRole, description);

  /** @type {Record<string, unknown>} */
  const agent = {
    author,
    config: {
      systemRole,
      openingMessage,
      openingQuestions,
    },
    createdAt,
    homepage,
    identifier,
    knowledgeCount: 0,
    meta: {
      title,
      description: typeof description === "string" ? description.slice(0, 500) : String(description),
      avatar,
      tags,
      category,
    },
    pluginCount: 0,
    schemaVersion: 1,
    summary: `${title}: ${typeof description === "string" ? description.slice(0, 200) : ""}`,
    tokenUsage,
  };

  if (examples.length > 0) {
    agent.examples = examples;
  }

  return agent;
}

/**
 * Normalize a defi-agents source document (already Cheshire-shaped) for the catalog.
 * Ensures identifier matches file stem and required fields are present.
 * @param {object} source
 * @param {string} identifier
 */
export function normalizeDefiAgent(source, identifier) {
  if (!source || typeof source !== "object") {
    throw new Error(`Invalid defi agent for ${identifier}`);
  }
  const agent = structuredClone(source);
  agent.identifier = identifier;
  if (!agent.author) agent.author = DEFAULT_AUTHOR;
  if (!agent.homepage) agent.homepage = DEFAULT_HOMEPAGE;
  if (!agent.createdAt) agent.createdAt = new Date().toISOString().slice(0, 10);
  if (typeof agent.knowledgeCount !== "number") agent.knowledgeCount = 0;
  if (typeof agent.pluginCount !== "number") agent.pluginCount = 0;
  if (typeof agent.schemaVersion !== "number") agent.schemaVersion = 1;
  if (typeof agent.tokenUsage !== "number") {
    agent.tokenUsage = estimateTokenUsage(agent.config?.systemRole, agent.meta?.description);
  }
  if (!agent.config || typeof agent.config.systemRole !== "string") {
    throw new Error(`Defi agent ${identifier} missing config.systemRole`);
  }
  if (!agent.meta) {
    throw new Error(`Defi agent ${identifier} missing meta`);
  }
  // Strip any unexpected root keys that would fail additionalProperties
  for (const key of Object.keys(agent)) {
    if (!ROOT_ALLOWED.has(key)) {
      delete agent[key];
    }
  }
  if (agent.config) {
    for (const key of Object.keys(agent.config)) {
      if (!CONFIG_ALLOWED.has(key)) {
        delete agent.config[key];
      }
    }
  }
  if (agent.meta) {
    for (const key of Object.keys(agent.meta)) {
      if (!META_ALLOWED.has(key)) {
        delete agent.meta[key];
      }
    }
  }
  return agent;
}

/**
 * Build full expected identifier set from character stems + defi stems.
 * @param {string[]} characterStems
 * @param {string[]} defiStems
 */
export function expectedCatalogIdentifiers(characterStems, defiStems) {
  return [...new Set([...characterStems.map(characterIdentifierFromStem), ...defiStems])].sort();
}

/**
 * Parse a locale filename into a locale code.
 * index.json → "en" (default)
 * index.ja-JP.json → "ja-JP"
 * @param {string} filename
 * @returns {string|null}
 */
export function localeCodeFromFilename(filename) {
  if (filename === "index.json") return "en";
  const match = /^index\.(.+)\.json$/.exec(filename);
  return match ? match[1] : null;
}

/**
 * List agent identifiers that have a locales/ directory entry.
 * @param {string} [dir]
 * @returns {string[]}
 */
export function listLocaleAgentIds(dir = LOCALES_DIR) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort();
}

/**
 * List available locale codes for an agent.
 * @param {string} identifier
 * @param {string} [dir]
 * @returns {string[]}
 */
export function listLocalesForAgent(identifier, dir = LOCALES_DIR) {
  const agentDir = join(dir, identifier);
  if (!existsSync(agentDir)) return [];
  return readdirSync(agentDir)
    .map(localeCodeFromFilename)
    .filter(Boolean)
    .sort();
}

/**
 * Load a partial locale overlay (config/meta/examples/summary only).
 * @param {string} identifier
 * @param {string} [locale] locale code; "en" or omitted loads index.json
 * @param {string} [dir]
 * @returns {object|null}
 */
export function loadLocaleOverlay(identifier, locale = "en", dir = LOCALES_DIR) {
  const agentDir = join(dir, identifier);
  const filename = !locale || locale === "en" ? "index.json" : `index.${locale}.json`;
  const path = join(agentDir, filename);
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, "utf8"));
}

/**
 * Deep-merge a locale overlay onto a base Cheshire agent.
 * Preserves identity fields (author, identifier, schemaVersion, …) from base;
 * overlays config/meta/examples/summary/opening* when present in locale.
 * @param {object} baseAgent
 * @param {object} overlay
 * @returns {object}
 */
export function applyLocaleOverlay(baseAgent, overlay) {
  if (!baseAgent || typeof baseAgent !== "object") {
    throw new Error("baseAgent is required");
  }
  if (!overlay || typeof overlay !== "object") {
    return structuredClone(baseAgent);
  }

  const merged = structuredClone(baseAgent);

  if (overlay.config && typeof overlay.config === "object") {
    merged.config = { ...merged.config, ...overlay.config };
    // Strip unexpected config keys after merge
    for (const key of Object.keys(merged.config)) {
      if (!CONFIG_ALLOWED.has(key)) delete merged.config[key];
    }
  }

  if (overlay.meta && typeof overlay.meta === "object") {
    merged.meta = { ...merged.meta, ...overlay.meta };
    // Preserve avatar from base when locale omits it
    if (!merged.meta.avatar && baseAgent.meta?.avatar) {
      merged.meta.avatar = baseAgent.meta.avatar;
    }
    for (const key of Object.keys(merged.meta)) {
      if (!META_ALLOWED.has(key)) delete merged.meta[key];
    }
  }

  if (Array.isArray(overlay.examples)) {
    merged.examples = overlay.examples;
  }
  if (typeof overlay.summary === "string") {
    merged.summary = overlay.summary;
  }
  if (typeof overlay.openingMessage === "string") {
    merged.openingMessage = overlay.openingMessage;
  }
  if (Array.isArray(overlay.openingQuestions)) {
    merged.openingQuestions = overlay.openingQuestions;
  }

  // Recompute token usage from localized system role when present
  if (merged.config?.systemRole) {
    merged.tokenUsage = estimateTokenUsage(merged.config.systemRole, merged.meta?.description);
  }

  return merged;
}

/**
 * Load a catalog agent with an optional locale overlay applied.
 * @param {string} identifier
 * @param {string} [locale]
 * @param {{ agentsDir?: string, localesDir?: string }} [opts]
 * @returns {object}
 */
export function loadAgentWithLocale(identifier, locale = "en", opts = {}) {
  const agentsDir = opts.agentsDir ?? AGENTS_DIR;
  const localesDir = opts.localesDir ?? LOCALES_DIR;
  const basePath = join(agentsDir, `${identifier}.json`);
  if (!existsSync(basePath)) {
    throw new Error(`Agent not found in catalog: ${identifier}`);
  }
  const base = JSON.parse(readFileSync(basePath, "utf8"));
  if (!locale || locale === "en") {
    // Prefer locales/en (index.json) when present; else catalog base
    const enOverlay = loadLocaleOverlay(identifier, "en", localesDir);
    return enOverlay ? applyLocaleOverlay(base, enOverlay) : base;
  }
  const overlay = loadLocaleOverlay(identifier, locale, localesDir);
  if (!overlay) {
    throw new Error(`Locale "${locale}" not found for agent ${identifier}`);
  }
  return applyLocaleOverlay(base, overlay);
}

/**
 * Summarize locale tree coverage for agents that have locales.
 * @param {string} [dir]
 * @returns {{ agentCount: number, fileCount: number, byAgent: Record<string, string[]> }}
 */
export function summarizeLocales(dir = LOCALES_DIR) {
  const byAgent = {};
  let fileCount = 0;
  for (const id of listLocaleAgentIds(dir)) {
    const locales = listLocalesForAgent(id, dir);
    byAgent[id] = locales;
    fileCount += locales.length;
  }
  return {
    agentCount: Object.keys(byAgent).length,
    fileCount,
    byAgent,
  };
}
