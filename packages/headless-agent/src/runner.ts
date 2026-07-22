/**
 * Headless multi-turn agent loop over OpenRouter Chat Completions.
 * Supports function tools (client-executed) + OpenRouter server tools.
 * Default: zero-retention provider preference, no session files.
 */

import type { HeadlessConfig } from "./config.js";
import {
  confidentialSystemPreamble,
  emitSafeLog,
  isEphemeralOnly,
  zeroRetentionProviderPreferences,
} from "./privacy.js";
import {
  buildToolList,
  executeDomainTool,
  isDomainTool,
  type AnyTool,
} from "./tools/registry.js";

export type AgentEvent =
  | { type: "start"; model: string; zeroRetention: boolean; sessionPersistence: boolean }
  | { type: "step"; step: number }
  | { type: "text_delta"; text: string }
  | { type: "tool_call"; name: string; id: string }
  | { type: "tool_result"; name: string; id: string; ok: boolean }
  | { type: "done"; text: string; finishReason: string; usage?: Usage }
  | { type: "error"; errorClass: string };

export type Usage = {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
  cost?: number;
};

export type RunResult = {
  ok: boolean;
  text: string;
  finishReason: string;
  usage: Usage;
  steps: number;
  events: AgentEvent[];
};

type ChatMessage = {
  role: "system" | "user" | "assistant" | "tool";
  content?: string | null;
  tool_calls?: unknown[];
  tool_call_id?: string;
  name?: string;
};

export type RunOptions = {
  prompt: string;
  config: HeadlessConfig;
  onEvent?: (ev: AgentEvent) => void;
};

function emit(ev: AgentEvent, opts: RunOptions, bag: AgentEvent[]) {
  bag.push(ev);
  opts.onEvent?.(ev);
}

export async function runHeadlessAgent(opts: RunOptions): Promise<RunResult> {
  const { config: cfg, prompt } = opts;
  const events: AgentEvent[] = [];
  const tools = buildToolList(cfg);

  if (!cfg.openRouterApiKey) {
    const err: AgentEvent = { type: "error", errorClass: "MissingApiKey" };
    emit(err, opts, events);
    return {
      ok: false,
      text: "",
      finishReason: "error",
      usage: {},
      steps: 0,
      events,
    };
  }

  // Confidential: refuse to write sessions unless explicitly enabled
  if (!isEphemeralOnly(cfg.sessionPersistence)) {
    emitSafeLog({
      event: "session_persistence_enabled",
      ok: true,
      model: cfg.model,
    });
  }

  emit(
    {
      type: "start",
      model: cfg.model,
      zeroRetention: cfg.zeroRetention,
      sessionPersistence: cfg.sessionPersistence,
    },
    opts,
    events,
  );

  const messages: ChatMessage[] = [
    { role: "system", content: confidentialSystemPreamble() },
    { role: "user", content: prompt },
  ];

  let usage: Usage = {};
  let finalText = "";
  let finishReason = "stop";
  let steps = 0;

  for (let step = 1; step <= cfg.maxSteps; step++) {
    steps = step;
    emit({ type: "step", step }, opts, events);

    const body: Record<string, unknown> = {
      model: cfg.model,
      messages,
      tools: tools as AnyTool[],
      tool_choice: "auto",
      stream: false,
    };

    const provider = zeroRetentionProviderPreferences(cfg.zeroRetention);
    if (provider) body.provider = provider;

    const res = await fetch(`${cfg.openRouterBaseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${cfg.openRouterApiKey}`,
        "HTTP-Referer": cfg.appUrl,
        "X-OpenRouter-Title": cfg.appTitle,
        "X-OpenRouter-Categories": "cli-agent,cloud-agent",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(120_000),
    });

    const json = (await res.json().catch(() => ({}))) as {
      error?: { message?: string };
      choices?: Array<{
        finish_reason?: string;
        message?: {
          content?: string | null;
          tool_calls?: Array<{
            id: string;
            type?: string;
            function?: { name?: string; arguments?: string };
          }>;
        };
      }>;
      usage?: Usage;
    };

    if (!res.ok) {
      emit(
        {
          type: "error",
          errorClass: `OpenRouterHTTP${res.status}`,
        },
        opts,
        events,
      );
      emitSafeLog({
        event: "openrouter_error",
        ok: false,
        model: cfg.model,
        errorClass: `HTTP${res.status}`,
      });
      return {
        ok: false,
        text: "",
        finishReason: "error",
        usage,
        steps,
        events,
      };
    }

    if (json.usage) {
      usage = {
        prompt_tokens: (usage.prompt_tokens || 0) + (json.usage.prompt_tokens || 0),
        completion_tokens:
          (usage.completion_tokens || 0) + (json.usage.completion_tokens || 0),
        total_tokens: (usage.total_tokens || 0) + (json.usage.total_tokens || 0),
        cost: (usage.cost || 0) + (Number(json.usage.cost) || 0),
      };
    }

    const choice = json.choices?.[0];
    const message = choice?.message || {};
    finishReason = choice?.finish_reason || "stop";
    const content = typeof message.content === "string" ? message.content : "";
    const toolCalls = Array.isArray(message.tool_calls) ? message.tool_calls : [];

    if (content) {
      finalText += content;
      emit({ type: "text_delta", text: content }, opts, events);
    }

    if (toolCalls.length === 0 || finishReason === "stop") {
      break;
    }

    // Append assistant turn with tool_calls as-is
    messages.push({
      role: "assistant",
      content: content || null,
      tool_calls: toolCalls,
    });

    for (const tc of toolCalls) {
      const id = tc.id || `tool_${step}`;
      const name = tc.function?.name || "";
      let args: Record<string, unknown> = {};
      try {
        args = JSON.parse(tc.function?.arguments || "{}");
      } catch {
        args = { _raw: tc.function?.arguments };
      }

      emit({ type: "tool_call", name, id }, opts, events);

      let resultText: string;
      let ok = true;
      if (isDomainTool(name)) {
        try {
          resultText = await executeDomainTool(name, args, cfg);
        } catch {
          ok = false;
          resultText = JSON.stringify({ ok: false, error: "tool_execution_failed" });
        }
      } else {
        // Server tools (web_search, subagent, …) are resolved by OpenRouter;
        // if they appear here, return a stub noting server-side handling.
        resultText = JSON.stringify({
          ok: true,
          note: "server_tool",
          name,
        });
      }

      emit({ type: "tool_result", name, id, ok }, opts, events);
      emitSafeLog({
        event: "tool_executed",
        toolName: name,
        step,
        ok,
        model: cfg.model,
      });

      messages.push({
        role: "tool",
        tool_call_id: id,
        name,
        content: resultText,
      });
    }

    if (cfg.maxCostUsd != null && (usage.cost || 0) > cfg.maxCostUsd) {
      finishReason = "max_cost";
      break;
    }
  }

  const done: AgentEvent = {
    type: "done",
    text: finalText,
    finishReason,
    usage,
  };
  emit(done, opts, events);

  return {
    ok: true,
    text: finalText,
    finishReason,
    usage,
    steps,
    events,
  };
}
