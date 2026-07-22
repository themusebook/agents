/**
 * Layered config: defaults → env. No secrets written to disk by this module.
 */

export type OutputMode = "text" | "json" | "quiet";

export type HeadlessConfig = {
  openRouterApiKey: string;
  openRouterBaseUrl: string;
  /** Orchestrator model slug on OpenRouter */
  model: string;
  /** Optional cheap worker for openrouter:subagent */
  workerModel: string;
  maxSteps: number;
  maxCostUsd: number | null;
  outputMode: OutputMode;
  /** When false (default): no JSONL/session files, no chat DB */
  sessionPersistence: boolean;
  /** Request OpenRouter provider data_collection deny */
  zeroRetention: boolean;
  solanaRpcUrl: string;
  rhRpcUrl: string;
  appUrl: string;
  appTitle: string;
  enableSubagent: boolean;
  enableWebSearch: boolean;
};

const OPENROUTER_BASE = "https://openrouter.ai/api/v1";

export function loadConfig(overrides: Partial<HeadlessConfig> = {}): HeadlessConfig {
  const persistRaw = (process.env.HEADLESS_SESSION_PERSIST || "").trim().toLowerCase();
  const sessionPersistence =
    overrides.sessionPersistence ??
    (persistRaw === "1" || persistRaw === "true" || persistRaw === "on");

  const zeroRaw = (process.env.HEADLESS_ZERO_RETENTION || "true").trim().toLowerCase();
  const zeroRetention =
    overrides.zeroRetention ?? !(zeroRaw === "0" || zeroRaw === "false" || zeroRaw === "off");

  return {
    openRouterApiKey:
      overrides.openRouterApiKey ??
      process.env.OPENROUTER_API_KEY?.trim() ??
      process.env.OPEN_ROUTER_API_KEY?.trim() ??
      "",
    openRouterBaseUrl: (
      overrides.openRouterBaseUrl ??
      process.env.OPENROUTER_BASE_URL ??
      OPENROUTER_BASE
    ).replace(/\/$/, ""),
    model:
      overrides.model ??
      process.env.HEADLESS_MODEL?.trim() ??
      process.env.OPENROUTER_HEADLESS_MODEL?.trim() ??
      "~anthropic/claude-sonnet-latest",
    workerModel:
      overrides.workerModel ??
      process.env.HEADLESS_WORKER_MODEL?.trim() ??
      "~anthropic/claude-haiku-latest",
    maxSteps: overrides.maxSteps ?? Math.max(1, Number(process.env.HEADLESS_MAX_STEPS || 8) || 8),
    maxCostUsd:
      overrides.maxCostUsd ??
      (process.env.HEADLESS_MAX_COST_USD
        ? Number(process.env.HEADLESS_MAX_COST_USD)
        : null),
    outputMode: overrides.outputMode ?? "text",
    sessionPersistence,
    zeroRetention,
    solanaRpcUrl:
      overrides.solanaRpcUrl ??
      process.env.SOLANA_RPC_URL?.trim() ??
      process.env.SECURE_RPC_URL?.trim() ??
      "https://api.mainnet-beta.solana.com",
    rhRpcUrl:
      overrides.rhRpcUrl ??
      process.env.ROBINHOOD_RPC_URL?.trim() ??
      process.env.RH_RPC_URL?.trim() ??
      "https://rpc.robinhood.xyz",
    appUrl: (
      overrides.appUrl ??
      process.env.OPENROUTER_APP_URL ??
      process.env.APP_ORIGIN ??
      "https://cheshireterminal.ai/"
    ).replace(/\/?$/, "/"),
    appTitle: overrides.appTitle ?? process.env.OPENROUTER_APP_TITLE ?? "Cheshire Headless Agent",
    enableSubagent:
      overrides.enableSubagent ??
      (process.env.HEADLESS_SUBAGENT || "true").toLowerCase() !== "false",
    enableWebSearch:
      overrides.enableWebSearch ??
      (process.env.HEADLESS_WEB_SEARCH || "true").toLowerCase() !== "false",
  };
}

export function assertApiKey(cfg: HeadlessConfig): void {
  if (!cfg.openRouterApiKey) {
    throw new Error(
      "OPENROUTER_API_KEY is not set. Export a key from https://openrouter.ai/settings/keys",
    );
  }
}
