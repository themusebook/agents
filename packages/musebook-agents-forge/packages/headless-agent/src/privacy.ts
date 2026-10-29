/**
 * Confidential / zero-retention helpers for the headless harness.
 * - No durable conversation store by default
 * - OpenRouter request provider data_collection deny
 * - Telemetry redaction: never log prompts, keys, cookies, full tool dumps
 */

export type SafeLogFields = {
  event: string;
  model?: string;
  workerModel?: string;
  step?: number;
  toolName?: string;
  finishReason?: string;
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  cost?: number;
  chain?: string;
  ok?: boolean;
  /** Opaque error class only — never raw message if it may contain secrets */
  errorClass?: string;
};

const SECRET_PATTERNS = [
  /sk-or-[a-zA-Z0-9_-]+/g,
  /sk-[a-zA-Z0-9]{20,}/g,
  /Bearer\s+[A-Za-z0-9._\-]+/gi,
  /ct_sk_[A-Za-z0-9_]+/g,
  /ct_os_[A-Za-z0-9._\-]+/g,
  /OPENROUTER_API_KEY\s*=\s*\S+/gi,
];

/** Strip secrets from free-form strings before any stderr write. */
export function redactSecrets(text: string): string {
  let out = String(text ?? "");
  for (const re of SECRET_PATTERNS) {
    out = out.replace(re, "[REDACTED]");
  }
  return out;
}

/**
 * Reject logging of high-risk fields. Returns a safe shallow object for JSON logs.
 */
export function sanitizeLogPayload(input: Record<string, unknown>): SafeLogFields {
  const forbidden = [
    "prompt",
    "messages",
    "content",
    "toolResult",
    "outcome",
    "apiKey",
    "cookie",
    "authorization",
    "raw",
  ];
  for (const key of Object.keys(input)) {
    if (forbidden.includes(key.toLowerCase()) || /prompt|message|secret|key|cookie/i.test(key)) {
      // drop
      continue;
    }
  }
  return {
    event: String(input.event || "event"),
    model: input.model != null ? String(input.model) : undefined,
    workerModel: input.workerModel != null ? String(input.workerModel) : undefined,
    step: typeof input.step === "number" ? input.step : undefined,
    toolName: input.toolName != null ? String(input.toolName) : undefined,
    finishReason: input.finishReason != null ? String(input.finishReason) : undefined,
    promptTokens: typeof input.promptTokens === "number" ? input.promptTokens : undefined,
    completionTokens:
      typeof input.completionTokens === "number" ? input.completionTokens : undefined,
    totalTokens: typeof input.totalTokens === "number" ? input.totalTokens : undefined,
    cost: typeof input.cost === "number" ? input.cost : undefined,
    chain: input.chain != null ? String(input.chain) : undefined,
    ok: typeof input.ok === "boolean" ? input.ok : undefined,
    errorClass: input.errorClass != null ? String(input.errorClass).slice(0, 80) : undefined,
  };
}

export function emitSafeLog(payload: Record<string, unknown>, stream: NodeJS.WritableStream = process.stderr) {
  const safe = sanitizeLogPayload(payload);
  stream.write(JSON.stringify(safe) + "\n");
}

/**
 * OpenRouter Chat Completions body fragment for zero retention / no provider training storage.
 * See OpenRouter provider routing docs: data_collection deny when supported.
 */
export function zeroRetentionProviderPreferences(enabled: boolean): Record<string, unknown> | undefined {
  if (!enabled) return undefined;
  return {
    // Prefer providers that do not collect/store prompts when the router supports it
    data_collection: "deny",
  };
}

/** System instructions reinforcing confidentiality for the model. */
export function confidentialSystemPreamble(): string {
  return [
    "You are CLAWD headless — a confidential multi-chain agent (Solana + Robinhood EVM chain 4663).",
    "Privacy: do not ask users to paste private keys or seed phrases. Do not invent tx signatures.",
    "Default mode is observe/paper. Prefer read-only tools unless explicitly asked to prepare a tx plan.",
    "Never claim a live trade executed without a signature the user provided.",
    "Keep answers concise and structured for CLI/automation consumption.",
  ].join(" ");
}

/** True when session persistence is disabled (default). */
export function isEphemeralOnly(sessionPersistence: boolean): boolean {
  return sessionPersistence !== true;
}
