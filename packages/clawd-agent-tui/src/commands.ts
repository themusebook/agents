import type { Interface } from 'readline';
import type { AgentConfig } from './config.js';
import type { ChatMessage } from './agent.js';

const DIM = '\x1b[2m';
const RESET = '\x1b[0m';
const CYAN = '\x1b[36m';
const GREEN = '\x1b[32m';

export interface CommandContext {
  config: AgentConfig;
  rl: Interface;
  messages: ChatMessage[];
  sessionPath: string;
  resetSession: () => string;
  totalTokens: { input: number; output: number };
}

export interface SlashCommand {
  name: string;
  description: string;
  execute: (args: string, ctx: CommandContext) => Promise<void>;
}

const commands: SlashCommand[] = [];

function ask(rl: Interface, prompt: string): Promise<string> {
  return new Promise((r) => {
    process.stdin.resume();
    rl.question(prompt, (answer) => {
      r(answer);
    });
  });
}

commands.push({
  name: '/model',
  description: 'Switch to a different model',
  execute: async (_args, ctx) => {
    console.log(`  ${DIM}Current:${RESET} ${CYAN}${ctx.config.model}${RESET}`);
    const query = await ask(ctx.rl, `  ${DIM}Search models:${RESET} `);
    if (!query.trim()) return;
    process.stdout.write(`  ${DIM}Fetching…${RESET}`);
    const res = await fetch('https://openrouter.ai/api/v1/models');
    const { data } = await res.json() as { data: { id: string; name: string }[] };
    process.stdout.write('\r\x1b[K');
    const q = query.toLowerCase();
    const matches = data
      .filter((m) => m.id.toLowerCase().includes(q) || m.name.toLowerCase().includes(q))
      .slice(0, 15);
    if (!matches.length) { console.log(`  ${DIM}No models matching "${query}".${RESET}`); return; }
    matches.forEach((m, i) => console.log(`  ${DIM}${String(i + 1).padStart(2)})${RESET} ${m.id}`));
    const pick = await ask(ctx.rl, `\n  ${DIM}Select (1-${matches.length}):${RESET} `);
    const idx = parseInt(pick) - 1;
    if (idx >= 0 && idx < matches.length) {
      ctx.config.model = matches[idx].id;
      console.log(`  ${DIM}Model →${RESET} ${CYAN}${ctx.config.model}${RESET}`);
    } else { console.log(`  ${DIM}Cancelled.${RESET}`); }
  },
});

commands.push({
  name: '/new',
  description: 'Start a fresh conversation',
  execute: async (_args, ctx) => {
    ctx.messages.length = 0;
    ctx.sessionPath = ctx.resetSession();
    console.log(`  ${GREEN}✓${RESET} ${DIM}New session started.${RESET}`);
  },
});

commands.push({
  name: '/help',
  description: 'List available commands',
  execute: async () => {
    for (const cmd of commands) {
      console.log(`  ${CYAN}${cmd.name.padEnd(12)}${RESET}${DIM}${cmd.description}${RESET}`);
    }
  },
});

commands.push({
  name: '/zk',
  description: 'One-shot a ZK Shark intent (no model): /zk nullifier for foo',
  execute: async (args) => {
    const text = args.trim();
    if (!text) {
      console.log(`  ${DIM}Usage: /zk <natural language intent>${RESET}`);
      console.log(`  ${DIM}Example: /zk nullifier for model-attest:v1:demo${RESET}`);
      return;
    }
    const { routeIntent } = await import('./tools/zk-intent.js');
    const { dispatchLocalRoute } = await import('./tools/zk-tools.js');
    const route = routeIntent(text);
    console.log(`  ${DIM}route${RESET}  ${CYAN}${route.intent}${RESET}  ${DIM}(${route.confidence.toFixed(2)}) ${route.rationale}${RESET}`);
    try {
      const result = await dispatchLocalRoute(route);
      console.log(JSON.stringify(result, null, 2));
    } catch (err: any) {
      console.log(`  ${DIM}Error: ${err.message}${RESET}`);
    }
  },
});

commands.push({
  name: '/inspect',
  description: 'Show ZK Shark env configuration',
  execute: async () => {
    const { readZkEnv } = await import('./tools/zk-crypto.js');
    const env = readZkEnv();
    console.log(`  ${CYAN}ZK Shark configuration${RESET}`);
    for (const [k, v] of Object.entries(env)) {
      console.log(`  ${DIM}${k.padEnd(16)}${RESET}${v || '(empty)'}`);
    }
  },
});

export async function dispatch(input: string, ctx: CommandContext): Promise<boolean> {
  const [name, ...rest] = input.split(' ');
  const cmd = commands.find((c) => c.name === name);
  if (!cmd) {
    console.log(`  ${DIM}Unknown command: ${name}. Type /help for available commands.${RESET}`);
    return true;
  }
  await cmd.execute(rest.join(' '), ctx);
  return true;
}
