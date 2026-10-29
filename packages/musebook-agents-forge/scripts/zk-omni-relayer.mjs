#!/usr/bin/env node
/**
 * Deployable ZK Omnichain relayer service.
 *
 *   node scripts/zk-omni-relayer.mjs serve --port 8787
 *   node scripts/zk-omni-relayer.mjs oneshot --action attest --agent-id 0x…
 *   node scripts/zk-omni-relayer.mjs status
 */
import { resolve } from "node:path";
import { createRelayer, planZkOmniMessage } from "../src/zkOmni/index.js";

function parseArgs(argv) {
  const [cmd, ...rest] = argv;
  const flags = {};
  const positionals = [];
  for (let i = 0; i < rest.length; i++) {
    const t = rest[i];
    if (t.startsWith("--")) {
      const key = t.slice(2);
      const next = rest[i + 1];
      if (next && !next.startsWith("--")) {
        flags[key] = next;
        i++;
      } else {
        flags[key] = true;
      }
    } else {
      positionals.push(t);
    }
  }
  return { cmd: cmd || "help", flags, positionals };
}

function journalPath(flags) {
  return (
    flags.journal ||
    process.env.ZK_OMNI_JOURNAL ||
    resolve(process.cwd(), ".zk-omni-relayer", "journal.jsonl")
  );
}

async function main() {
  const { cmd, flags } = parseArgs(process.argv.slice(2));

  if (cmd === "help" || cmd === "--help" || cmd === "-h") {
    console.log(`zk-omni-relayer — Musebook ZK Omnichain relayer

Commands:
  serve [--port 8787] [--host 127.0.0.1] [--poll-ms 2000]
  oneshot --action <verb> [--agent-id 0x..] [--direction robinhood-to-solana|solana-to-robinhood]
          [--memo text] [--secret-hex 0x..] [--controller 0xEvmAddress]
  plan    (same flags as oneshot; prints plan JSON only)
  status
  process [--limit 10]

Env:
  ZK_OMNI_JOURNAL   path to JSONL journal
`);
    return;
  }

  const relayer = createRelayer({
    journalPath: journalPath(flags),
    logger: (msg, meta) => {
      if (flags.quiet) return;
      console.error(`[zk-omni] ${msg}`, meta ? JSON.stringify(meta) : "");
    },
  });
  await relayer.init();

  if (cmd === "status") {
    console.log(JSON.stringify(relayer.status(), null, 2));
    return;
  }

  if (cmd === "plan" || cmd === "oneshot") {
    const input = {
      direction: flags.direction || "robinhood-to-solana",
      action: flags.action || "zk_message",
      memo: flags.memo || "",
      agentId: flags["agent-id"],
      controllerAddress: flags.controller,
      secretHex: flags["secret-hex"],
      modelHash: flags["model-hash"],
      context: flags.context,
      ttlSeconds: flags.ttl ? Number(flags.ttl) : 3600,
    };
    if (cmd === "plan") {
      console.log(JSON.stringify(planZkOmniMessage(input), null, 2));
      return;
    }
    const job = await relayer.oneshot(input);
    console.log(JSON.stringify(job, null, 2));
    process.exit(job.status === "delivered" ? 0 : 1);
  }

  if (cmd === "process") {
    const results = await relayer.processQueue(Number(flags.limit || 10));
    console.log(JSON.stringify(results, null, 2));
    return;
  }

  if (cmd === "serve") {
    const port = Number(flags.port || process.env.PORT || 8787);
    const host = flags.host || "127.0.0.1";
    const pollMs = Number(flags["poll-ms"] || 2000);
    relayer.startPolling(pollMs);
    const server = relayer.listen(port, host);
    console.error(`[zk-omni] relayer listening on http://${host}:${port}`);
    console.error(`[zk-omni] health: http://${host}:${port}/health`);
    const shutdown = () => {
      relayer.stopPolling();
      server.close(() => process.exit(0));
    };
    process.on("SIGINT", shutdown);
    process.on("SIGTERM", shutdown);
    return;
  }

  console.error(`Unknown command: ${cmd}. Run with help.`);
  process.exit(1);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
