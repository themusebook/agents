#!/usr/bin/env node
/**
 * Headless agent CLI — prompt via --prompt / positional / stdin.
 * Modes: text (default) | --json NDJSON events | --quiet exit code only.
 *
 *   pnpm agent:headless -- --prompt "Resolve SOL mint on Solana"
 *   echo "RH capabilities" | pnpm agent:headless -- --json
 */
import { loadConfig, type OutputMode } from "./config.js";
import { redactSecrets } from "./privacy.js";
import { runHeadlessAgent, type AgentEvent } from "./runner.js";

function parseArgs(argv: string[]) {
  let prompt = "";
  let outputMode: OutputMode = "text";
  let model: string | undefined;
  let maxSteps: number | undefined;
  let persist = false;
  let noZeroRetention = false;

  const rest: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    // pnpm/npm forwards a bare "--" separator; ignore it
    if (a === "--") continue;
    if (a === "--prompt" || a === "-p") {
      prompt = argv[++i] || "";
    } else if (a === "--json" || a === "-j") {
      outputMode = "json";
    } else if (a === "--quiet" || a === "-q") {
      outputMode = "quiet";
    } else if (a === "--model") {
      model = argv[++i];
    } else if (a === "--max-steps") {
      maxSteps = Number(argv[++i]);
    } else if (a === "--persist-session") {
      persist = true;
    } else if (a === "--allow-provider-data") {
      noZeroRetention = true;
    } else if (a === "-h" || a === "--help") {
      printHelp();
      process.exit(0);
    } else if (a.startsWith("-")) {
      console.error(`Unknown flag: ${a}`);
      process.exit(1);
    } else {
      rest.push(a);
    }
  }
  if (!prompt && rest.length) prompt = rest.join(" ");
  return { prompt, outputMode, model, maxSteps, persist, noZeroRetention };
}

function printHelp() {
  console.log(`Cheshire headless agent (Solana + Robinhood EVM 4663)

Usage:
  tsx packages/headless-agent/src/cli.ts --prompt "..."
  echo "..." | tsx packages/headless-agent/src/cli.ts --json

Flags:
  -p, --prompt <text>     User prompt
  -j, --json              NDJSON AgentEvent stream on stdout
  -q, --quiet             No stdout; exit 0/1 only
  --model <slug>          OpenRouter model (default HEADLESS_MODEL)
  --max-steps <n>         Max tool loop steps (default 8)
  --persist-session       Opt-in session persistence (default OFF)
  --allow-provider-data   Disable zero-retention provider preference

Env:
  OPENROUTER_API_KEY      Required for live runs
  HEADLESS_ZERO_RETENTION Default true
  HEADLESS_SESSION_PERSIST Default false
  SOLANA_RPC_URL / ROBINHOOD_RPC_URL optional for live balances
`);
}

async function readStdin(): Promise<string> {
  if (process.stdin.isTTY) return "";
  const chunks: Buffer[] = [];
  for await (const c of process.stdin) chunks.push(c as Buffer);
  return Buffer.concat(chunks).toString("utf8").trim();
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  let prompt = args.prompt;
  if (!prompt) prompt = await readStdin();
  if (!prompt) {
    console.error("Missing prompt. Pass --prompt or pipe stdin.");
    process.exit(1);
  }

  const config = loadConfig({
    outputMode: args.outputMode,
    model: args.model,
    maxSteps: args.maxSteps,
    sessionPersistence: args.persist,
    zeroRetention: !args.noZeroRetention,
  });

  if (!config.openRouterApiKey) {
    // Honest offline mode: still exercise tools path for multi_chain without model
    if (args.outputMode !== "quiet") {
      console.error(
        JSON.stringify({
          ok: false,
          errorClass: "MissingApiKey",
          hint: "Set OPENROUTER_API_KEY for live agent loop. Unit tests cover tools offline.",
        }),
      );
    }
    process.exit(2);
  }

  const onEvent = (ev: AgentEvent) => {
    if (config.outputMode === "json") {
      process.stdout.write(JSON.stringify(ev) + "\n");
    } else if (config.outputMode === "text" && ev.type === "text_delta") {
      process.stdout.write(ev.text);
    }
  };

  try {
    const result = await runHeadlessAgent({ prompt, config, onEvent });
    if (config.outputMode === "text" && result.text) {
      if (!result.text.endsWith("\n")) process.stdout.write("\n");
    }
    if (config.outputMode === "json" && result.ok) {
      // done event already emitted
    }
    process.exit(result.ok ? 0 : 1);
  } catch (e) {
    const msg = redactSecrets(e instanceof Error ? e.message : String(e));
    if (config.outputMode === "json") {
      process.stdout.write(JSON.stringify({ type: "error", errorClass: "Unhandled", detail: msg }) + "\n");
    } else if (config.outputMode !== "quiet") {
      console.error(msg);
    }
    process.exit(1);
  }
}

main();
