import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';

export interface LoaderConfig {
  text: string;
  style: 'gradient' | 'spinner' | 'minimal';
}

export interface DisplayConfig {
  toolDisplay: 'emoji' | 'grouped' | 'minimal' | 'hidden';
  reasoning: boolean;
  inputStyle: 'block' | 'bordered' | 'plain';
  loader: LoaderConfig;
}

export interface AgentConfig {
  apiKey: string;
  model: string;
  name: string;
  systemPrompt: string;
  maxSteps: number;
  maxCost: number;
  sessionDir: string;
  showBanner: boolean;
  display: DisplayConfig;
  slashCommands: boolean;
  /** Optional path to a local zk-primitives checkout. */
  zkPrimitivesDir: string;
}

const SYSTEM_PROMPT = [
  'You are **ZK Shark** — the Shark of All Streets — a Clawd agent for Solana zero-knowledge primitives.',
  '',
  'You help users one-shot nullifiers, Groth16 proof checks, model attestations, and encrypted-state commits',
  'built on Light Protocol compressed state (clawd-zk program).',
  '',
  'Current working directory: {cwd}',
  'ZK primitives dir (if set): {zkDir}',
  '',
  '## Domain tools (prefer these over shell for ZK work)',
  '- `zk_compute_nullifier` — deterministic 32-byte nullifier from (secret, context)',
  '- `zk_load_proof` — load and validate Groth16 proof JSON `{ a, b, c, verifyingKey }`',
  '- `zk_verify_proof_shape` — off-chain point-size + public-input packing sanity check',
  '- `zk_route_intent` — map natural language to a typed intent (attest / commit / verify / nullifier / inspect)',
  '- `zk_inspect_config` — show ZK Shark env (RPC, program id, network, signer path)',
  '- `zk_oneshot` — run a single deterministic intent or shell out to `zk-shark-agent` when installed',
  '- `zk_read_manifest` — read MANIFEST.json / docs from CLAWD_ZK_PRIMITIVES_DIR',
  '- `zk_omni_plan` — plan Robinhood↔Solana ZK omnichain message (msgType 4 + nullifier)',
  '- `zk_omni_oneshot` — plan + local relayer deliver for omnichain messaging',
  '',
  '## Coding tools',
  'You also have file_read, file_write, file_edit, glob, grep, list_dir, shell, web_search, and datetime.',
  '',
  '## Guidelines',
  '- Prefer domain tools for ZK ops; use file/shell tools for repo exploration and proof JSON paths.',
  '- Never invent hex hashes or proofs — load them from files or ask for the path.',
  '- Hex values must be 32 bytes (64 hex chars) unless the user clearly provides a different length for secrets.',
  '- Instruction-only mode is fine when no keypair is configured; return summaries, not fake signatures.',
  '- Be concise. When a one-shot succeeds, print the key fields (nullifierHex, publicInputsPackedHex, summary).',
  '- Do not guess on-chain results. If RPC/keypair is missing, say so and return the built instruction summary.',
].join('\n');

const DEFAULTS: AgentConfig = {
  apiKey: '',
  model: 'anthropic/claude-sonnet-4',
  name: 'ZK Shark',
  systemPrompt: SYSTEM_PROMPT,
  maxSteps: 25,
  maxCost: 2.0,
  sessionDir: '.sessions',
  showBanner: true,
  display: {
    toolDisplay: 'grouped',
    reasoning: false,
    inputStyle: 'block',
    loader: { text: 'Hunting', style: 'gradient' },
  },
  slashCommands: true,
  zkPrimitivesDir:
    process.env.CLAWD_ZK_PRIMITIVES_DIR ??
    process.env.CLAWDBOT_ZK_PRIMITIVES_DIR ??
    '',
};

export function loadConfig(
  overrides: Partial<AgentConfig> = {},
  opts?: { skipApiKey?: boolean },
): AgentConfig {
  let config: AgentConfig = {
    ...DEFAULTS,
    display: { ...DEFAULTS.display, loader: { ...DEFAULTS.display.loader } },
  };

  const configPath = resolve('agent.config.json');
  if (existsSync(configPath)) {
    const file = JSON.parse(readFileSync(configPath, 'utf-8')) as Partial<AgentConfig>;
    if (file.display) {
      config.display = {
        ...config.display,
        ...file.display,
        loader: { ...config.display.loader, ...(file.display.loader ?? {}) },
      };
    }
    const { display: _d, ...rest } = file;
    config = { ...config, ...rest, display: config.display };
  }

  if (process.env.OPENROUTER_API_KEY) config.apiKey = process.env.OPENROUTER_API_KEY;
  if (process.env.AGENT_MODEL) config.model = process.env.AGENT_MODEL;
  if (process.env.AGENT_MAX_STEPS) config.maxSteps = Number(process.env.AGENT_MAX_STEPS);
  if (process.env.AGENT_MAX_COST) config.maxCost = Number(process.env.AGENT_MAX_COST);
  if (process.env.CLAWD_ZK_PRIMITIVES_DIR) config.zkPrimitivesDir = process.env.CLAWD_ZK_PRIMITIVES_DIR;

  if (overrides.display) {
    config.display = {
      ...config.display,
      ...overrides.display,
      loader: { ...config.display.loader, ...(overrides.display.loader ?? {}) },
    };
  }
  const { display: _od, ...restOverrides } = overrides;
  config = { ...config, ...restOverrides, display: config.display };

  if (!config.apiKey && !opts?.skipApiKey) {
    throw new Error('OPENROUTER_API_KEY is required. Copy .env.example → .env or export the key.');
  }
  return config;
}

export function resolveSystemPrompt(config: AgentConfig): string {
  return config.systemPrompt
    .replaceAll('{cwd}', process.cwd())
    .replaceAll('{zkDir}', config.zkPrimitivesDir || '(not set — set CLAWD_ZK_PRIMITIVES_DIR)');
}
