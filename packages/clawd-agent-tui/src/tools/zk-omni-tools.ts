/**
 * ZK Omnichain tools — bridge clawd-agent-tui to robinhood-agents zkOmni protocol.
 * Implemented in-process (no hard dependency on the sibling package path).
 */
import { tool } from '@openrouter/agent/tool';
import { z } from 'zod';
import { createHash, randomBytes } from 'crypto';
import { pathToFileURL } from 'url';
import { resolve } from 'path';

const MSG_ZK_OMNI = 4;
const WORD = 32;

function pad32(hexNo0x: string) {
  return hexNo0x.padStart(WORD * 2, '0');
}

function uintWord(value: bigint, bits: number, label: string) {
  if (value < 0n || value >= 1n << BigInt(bits)) throw new Error(`${label} exceeds uint${bits}`);
  return value.toString(16).padStart(WORD * 2, '0');
}

function encodeDynamicString(str: string, label: string, max: number) {
  const bytes = Buffer.from(str ?? '', 'utf8');
  if (bytes.length > max) throw new Error(`${label} exceeds ${max} UTF-8 bytes`);
  const len = uintWord(BigInt(bytes.length), 256, `${label}.length`);
  const padded = bytes.toString('hex').padEnd(Math.ceil(bytes.length / WORD) * WORD * 2, '0');
  return { hex: len + padded, byteLength: WORD + Math.ceil(bytes.length / WORD) * WORD };
}

function computeNullifier(secretHex: string, context: string) {
  const secret = Buffer.from(secretHex.replace(/^0x/i, ''), 'hex');
  if (secret.length < 16) throw new Error('Secret must be at least 16 bytes');
  const h = createHash('sha256');
  h.update(Buffer.from('clawd-zk-nullifier:v1'));
  h.update(Buffer.from([0]));
  h.update(secret);
  h.update(Buffer.from([0]));
  h.update(Buffer.from(context, 'utf8'));
  return `0x${h.digest('hex')}`;
}

function encodeZkOmni(input: {
  agentId: string;
  controller: string;
  nullifier: string;
  payloadCommitment: string;
  modelHash: string;
  expiresAt: number;
  action: string;
  memo: string;
}) {
  const actionEnc = encodeDynamicString(input.action, 'action', 64);
  const memoEnc = encodeDynamicString(input.memo, 'memo', 200);
  const headBytes = 9 * WORD;
  const head = [
    uintWord(BigInt(MSG_ZK_OMNI), 16, 'msgType'),
    pad32(input.agentId.replace(/^0x/i, '')),
    pad32(input.controller.replace(/^0x/i, '')),
    pad32(input.nullifier.replace(/^0x/i, '')),
    pad32(input.payloadCommitment.replace(/^0x/i, '')),
    pad32(input.modelHash.replace(/^0x/i, '')),
    uintWord(BigInt(input.expiresAt), 64, 'expiresAt'),
    uintWord(BigInt(headBytes), 256, 'action offset'),
    uintWord(BigInt(headBytes + actionEnc.byteLength), 256, 'memo offset'),
  ].join('');
  return `0x${head}${actionEnc.hex}${memoEnc.hex}`;
}

async function tryLoadRobinhoodZkOmni(): Promise<null | {
  planZkOmniMessage: (i: Record<string, unknown>) => unknown;
  createRelayer: (o?: Record<string, unknown>) => {
    init: () => Promise<void>;
    oneshot: (i: Record<string, unknown>) => Promise<unknown>;
    status: () => unknown;
  };
}> {
  const candidates = [
    resolve(process.cwd(), 'robinhood-agents/src/zkOmni/index.js'),
    resolve(process.cwd(), '../robinhood-agents/src/zkOmni/index.js'),
    resolve(process.cwd(), '../../robinhood-agents/src/zkOmni/index.js'),
  ];
  for (const p of candidates) {
    try {
      return await import(pathToFileURL(p).href);
    } catch {
      /* try next */
    }
  }
  return null;
}

type OmniPlanArgs = {
  action: string;
  memo?: string;
  direction?: 'robinhood-to-solana' | 'solana-to-robinhood';
  agentId?: string;
  controllerAddress?: string;
  secretHex?: string;
  context?: string;
};

async function buildOmniPlan(args: OmniPlanArgs) {
  const mod = await tryLoadRobinhoodZkOmni();
  if (mod?.planZkOmniMessage) {
    return { source: 'robinhood-agents' as const, plan: mod.planZkOmniMessage(args) };
  }
  const secret = args.secretHex ?? `0x${randomBytes(32).toString('hex')}`;
  const direction = args.direction ?? 'robinhood-to-solana';
  const context =
    args.context ?? `zk-omni:${direction}:${args.action}:${args.agentId ?? '0'}`;
  const nullifier = computeNullifier(secret, context);
  const agentId = args.agentId ?? `0x${'00'.repeat(31)}01`;
  const controller = args.controllerAddress
    ? `0x${args.controllerAddress.replace(/^0x/i, '').toLowerCase().padStart(64, '0')}`
    : `0x${'11'.repeat(32)}`;
  const expiresAt = Math.floor(Date.now() / 1000) + 3600;
  const payloadCommitment = `0x${createHash('sha256')
    .update(args.action)
    .update(args.memo ?? '')
    .digest('hex')}`;
  const message = {
    agentId,
    controller,
    nullifier,
    payloadCommitment,
    modelHash: `0x${'00'.repeat(32)}`,
    expiresAt,
    action: args.action,
    memo: args.memo ?? '',
  };
  return {
    source: 'local' as const,
    plan: {
      kind: 'zk-omni',
      msgType: MSG_ZK_OMNI,
      direction,
      srcEid: direction === 'robinhood-to-solana' ? 30416 : 30168,
      dstEid: direction === 'robinhood-to-solana' ? 30168 : 30416,
      context,
      message,
      payloadHex: encodeZkOmni(message),
    },
  };
}

export const zkOmniPlanTool = tool({
  name: 'zk_omni_plan',
  description:
    'Plan a ZK omnichain message (msgType 4) Robinhood↔Solana with nullifier, payload commitment, and ABI payload hex.',
  inputSchema: z.object({
    action: z.string().describe('Short action verb, e.g. attest, commit_state'),
    memo: z.string().optional(),
    direction: z
      .enum(['robinhood-to-solana', 'solana-to-robinhood'])
      .optional()
      .describe('Default robinhood-to-solana'),
    agentId: z.string().optional().describe('bytes32 hex agent id'),
    controllerAddress: z.string().optional().describe('0x EVM controller'),
    secretHex: z.string().optional(),
    context: z.string().optional(),
  }),
  execute: async (args) => {
    try {
      return await buildOmniPlan(args);
    } catch (err: any) {
      return { error: err.message };
    }
  },
});

export const zkOmniOneshotTool = tool({
  name: 'zk_omni_oneshot',
  description:
    'One-shot plan + local relayer deliver for a ZK omnichain message (nullifier-bound). Uses robinhood-agents relayer when available.',
  inputSchema: z.object({
    action: z.string(),
    memo: z.string().optional(),
    direction: z.enum(['robinhood-to-solana', 'solana-to-robinhood']).optional(),
    agentId: z.string().optional(),
    controllerAddress: z.string().optional(),
    secretHex: z.string().optional(),
    context: z.string().optional(),
  }),
  execute: async (args) => {
    try {
      const mod = await tryLoadRobinhoodZkOmni();
      if (mod?.createRelayer) {
        const relayer = mod.createRelayer({});
        await relayer.init();
        const job = await relayer.oneshot(args);
        return { source: 'robinhood-agents-relayer', job };
      }
      const planned = await buildOmniPlan(args);
      const plan = planned.plan as {
        payloadHex?: string;
        message?: { nullifier?: string };
      };
      return {
        source: 'local-simulated',
        status: 'delivered',
        nullifier: plan?.message?.nullifier,
        payloadHex: plan?.payloadHex,
        note: 'Install/run robinhood-agents relayer for journaled delivery.',
      };
    } catch (err: any) {
      return { error: err.message };
    }
  },
});
