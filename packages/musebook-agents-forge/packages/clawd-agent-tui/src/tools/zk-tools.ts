/**
 * ZK Shark domain tools for the OpenRouter agent harness.
 * Self-contained offline implementations + optional zk-shark-agent shell-out.
 */
import { tool } from '@openrouter/agent/tool';
import { z } from 'zod';
import { existsSync } from 'fs';
import { readFile } from 'fs/promises';
import { resolve, join } from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
import {
  bytesToHex,
  buildPublishPublicInputs,
  computeNullifier,
  hexToBytes,
  loadProofFromFile,
  packPublicInputs,
  parseHex32,
  randomSecret,
  readZkEnv,
  verifyProofShape,
} from './zk-crypto.js';
import { HELP_TEXT, routeIntent, type IntentRoute } from './zk-intent.js';

const execFileAsync = promisify(execFile);

export const zkComputeNullifierTool = tool({
  name: 'zk_compute_nullifier',
  description:
    'Derive a deterministic 32-byte nullifier from a secret and domain-separated context string. Use for anti-double-publish / anti-double-claim contexts.',
  inputSchema: z.object({
    context: z.string().describe('Domain-separated context tag, e.g. model-attest:v1:<hash>'),
    secretHex: z
      .string()
      .optional()
      .describe('Secret as hex (≥16 bytes). If omitted, a random 32-byte secret is used.'),
  }),
  execute: async ({ context, secretHex }) => {
    try {
      const secret = secretHex ? hexToBytes(secretHex) : randomSecret(32);
      const nullifier = computeNullifier(secret, context);
      return {
        nullifierHex: `0x${bytesToHex(nullifier)}`,
        context,
        secretProvided: Boolean(secretHex),
        summary: `Nullifier for context "${context}": 0x${bytesToHex(nullifier)}`,
      };
    } catch (err: any) {
      return { error: err.message };
    }
  },
});

export const zkLoadProofTool = tool({
  name: 'zk_load_proof',
  description:
    'Load a Groth16 proof JSON file and report point sizes. Expected shape: { a, b, c, verifyingKey? } as hex strings.',
  inputSchema: z.object({
    path: z.string().describe('Path to proof.json'),
  }),
  execute: async ({ path }) => {
    try {
      const proof = await loadProofFromFile(path);
      const shape = verifyProofShape(proof);
      return {
        path: resolve(path),
        sizes: shape.sizes,
        ok: shape.ok,
        reason: shape.reason,
        aHexPrefix: `0x${bytesToHex(proof.a).slice(0, 16)}…`,
        bHexPrefix: `0x${bytesToHex(proof.b).slice(0, 16)}…`,
        cHexPrefix: `0x${bytesToHex(proof.c).slice(0, 16)}…`,
      };
    } catch (err: any) {
      return { error: err.message };
    }
  },
});

export const zkVerifyProofShapeTool = tool({
  name: 'zk_verify_proof_shape',
  description:
    'Off-chain Groth16 sanity check: point sizes and optional public-input packing for publish_attestation.',
  inputSchema: z.object({
    proofPath: z.string().describe('Path to proof.json'),
    modelHash: z.string().optional().describe('32-byte model hash hex'),
    payloadCommitment: z.string().optional().describe('32-byte payload commitment hex'),
    nullifierHex: z.string().optional().describe('32-byte nullifier hex'),
    attesterBytesHex: z
      .string()
      .optional()
      .describe('Attester pubkey bytes hex (32 bytes) or any bytes hashed to 32'),
  }),
  execute: async ({ proofPath, modelHash, payloadCommitment, nullifierHex, attesterBytesHex }) => {
    try {
      const proof = await loadProofFromFile(proofPath);
      const shape = verifyProofShape(proof);
      if (!shape.ok) return { ok: false, reason: shape.reason, sizes: shape.sizes };

      let publicInputsPackedHex: string | undefined;
      if (modelHash && payloadCommitment && nullifierHex) {
        const attester = attesterBytesHex ? hexToBytes(attesterBytesHex) : new Uint8Array(32);
        const inputs = buildPublishPublicInputs({
          attester,
          modelHash: parseHex32('modelHash', modelHash),
          payloadCommitment: parseHex32('payloadCommitment', payloadCommitment),
          nullifier: parseHex32('nullifier', nullifierHex),
        });
        publicInputsPackedHex = `0x${bytesToHex(packPublicInputs(inputs))}`;
      }

      return {
        ok: true,
        sizes: shape.sizes,
        publicInputsPackedHex,
        summary: publicInputsPackedHex
          ? `Proof shape OK; public inputs packed (${publicInputsPackedHex.slice(0, 18)}…).`
          : 'Proof shape OK (point sizes within expected bands).',
      };
    } catch (err: any) {
      return { ok: false, error: err.message };
    }
  },
});

export const zkRouteIntentTool = tool({
  name: 'zk_route_intent',
  description:
    'Deterministically map natural language to a ZK Shark intent (attest, commit, verify, nullifier, inspect, help). No model call.',
  inputSchema: z.object({
    text: z.string().describe('Free-form user request'),
    modelHash: z.string().optional(),
    payloadCommitment: z.string().optional(),
    ciphertextCommitment: z.string().optional(),
    stateVersion: z.number().optional(),
    context: z.string().optional(),
    proofPath: z.string().optional(),
    secretHex: z.string().optional(),
  }),
  execute: async (args) => {
    const { text, ...ctx } = args;
    const route = routeIntent(text, ctx);
    return route;
  },
});

export const zkInspectConfigTool = tool({
  name: 'zk_inspect_config',
  description: 'Show ZK Shark configuration from environment variables (RPC, program id, network, signer).',
  inputSchema: z.object({}),
  execute: async () => {
    const env = readZkEnv();
    return {
      banner: 'ZK Shark - Shark of All Streets configuration',
      ...env,
      signer: env.keypair ? env.keypair : '(instruction-only — no keypair path)',
      summary: [
        'ZK Shark configuration',
        `  program   : ${env.programId}`,
        `  network   : ${env.network}`,
        `  rpc       : ${env.rpcUrl || '(not set — ZK_SHARK_RPC_URL)'}`,
        `  photon    : ${env.photonUrl || '(none)'}`,
        `  commitment: ${env.commitment}`,
        `  apiKey    : ${env.apiKey || '(none)'}`,
        `  keypair   : ${env.keypair || '(instruction-only)'}`,
        `  zk dir    : ${env.zkPrimitivesDir || '(not set)'}`,
      ].join('\n'),
    };
  },
});

export const zkReadManifestTool = tool({
  name: 'zk_read_manifest',
  description:
    'Read MANIFEST.json or a docs file from CLAWD_ZK_PRIMITIVES_DIR (or an explicit path).',
  inputSchema: z.object({
    relativePath: z
      .string()
      .optional()
      .describe('Relative path under the zk-primitives root. Default: MANIFEST.json'),
    root: z.string().optional().describe('Override root directory'),
  }),
  execute: async ({ relativePath, root }) => {
    try {
      const env = readZkEnv();
      const base = root || env.zkPrimitivesDir;
      if (!base) {
        return {
          error:
            'No zk-primitives root. Set CLAWD_ZK_PRIMITIVES_DIR or pass root= to this tool.',
        };
      }
      const rel = relativePath || 'MANIFEST.json';
      const abs = resolve(join(base, rel));
      if (!existsSync(abs)) return { error: `Not found: ${abs}` };
      const content = await readFile(abs, 'utf-8');
      if (rel.endsWith('.json')) {
        return { path: abs, json: JSON.parse(content) };
      }
      const lines = content.split('\n');
      return {
        path: abs,
        content: lines.slice(0, 200).join('\n'),
        totalLines: lines.length,
        truncated: lines.length > 200,
      };
    } catch (err: any) {
      return { error: err.message };
    }
  },
});

async function tryZkSharkCli(args: string[]): Promise<{ ok: boolean; output?: string; error?: string }> {
  try {
    const { stdout, stderr } = await execFileAsync('zk-shark-agent', args, {
      timeout: 30_000,
      maxBuffer: 256 * 1024,
      env: process.env,
    });
    return { ok: true, output: (stdout + (stderr ? `\n${stderr}` : '')).trim() };
  } catch (err: any) {
    if (err.code === 'ENOENT') {
      return { ok: false, error: 'zk-shark-agent binary not found on PATH' };
    }
    return {
      ok: false,
      error: err.message,
      output: ((err.stdout ?? '') + (err.stderr ?? '')).trim() || undefined,
    };
  }
}

export async function dispatchLocalRoute(route: IntentRoute): Promise<unknown> {
  switch (route.action) {
    case 'computeNullifier': {
      const { context, secretHex } = route.args as { context: string; secretHex?: string };
      const secret = secretHex ? hexToBytes(secretHex) : randomSecret(32);
      const nullifier = computeNullifier(secret, String(context));
      return {
        action: 'computeNullifier',
        nullifierHex: `0x${bytesToHex(nullifier)}`,
        context,
        secretProvided: Boolean(secretHex),
      };
    }
    case 'verifyProof': {
      const { proofPath } = route.args as { proofPath?: string };
      if (!proofPath) throw new Error('verifyProof requires proofPath');
      const proof = await loadProofFromFile(proofPath);
      return { action: 'verifyProof', ...verifyProofShape(proof), path: resolve(proofPath) };
    }
    case 'attestModel': {
      const { modelHash, payloadCommitment, context, proofPath } = route.args as {
        modelHash?: string;
        payloadCommitment?: string;
        context: string;
        proofPath?: string;
      };
      if (!modelHash) throw new Error('attestModel requires modelHash');
      if (!payloadCommitment) throw new Error('attestModel requires payloadCommitment');
      if (!proofPath) throw new Error('attestModel requires proofPath');
      const proof = await loadProofFromFile(proofPath);
      const shape = verifyProofShape(proof);
      if (!shape.ok) return { action: 'attestModel', ok: false, reason: shape.reason, sizes: shape.sizes };
      const nullifier = computeNullifier(randomSecret(32), context);
      const model = parseHex32('modelHash', modelHash);
      const payload = parseHex32('payloadCommitment', payloadCommitment);
      const packed = packPublicInputs(
        buildPublishPublicInputs({
          attester: new Uint8Array(32),
          modelHash: model,
          payloadCommitment: payload,
          nullifier,
        }),
      );
      return {
        action: 'attestModel',
        mode: 'instruction-preview',
        nullifierHex: `0x${bytesToHex(nullifier)}`,
        publicInputsPackedHex: `0x${bytesToHex(packed)}`,
        modelHash: `0x${bytesToHex(model)}`,
        payloadCommitment: `0x${bytesToHex(payload)}`,
        proofPath: resolve(proofPath),
        summary:
          'Built offline attestation preview (nullifier + packed public inputs). Wire zk-shark-agent + keypair for on-chain submit.',
      };
    }
    case 'commitEncryptedState': {
      const { ciphertextCommitment, stateVersion, proofPath, modelHash } = route.args as {
        ciphertextCommitment?: string;
        stateVersion: number | bigint;
        proofPath?: string;
        modelHash?: string;
      };
      if (!ciphertextCommitment) throw new Error('commitEncryptedState requires ciphertextCommitment');
      if (!proofPath) throw new Error('commitEncryptedState requires proofPath');
      const proof = await loadProofFromFile(proofPath);
      const shape = verifyProofShape(proof);
      return {
        action: 'commitEncryptedState',
        mode: 'instruction-preview',
        ok: shape.ok,
        reason: shape.reason,
        sizes: shape.sizes,
        ciphertextCommitment,
        stateVersion: String(stateVersion),
        modelHash: modelHash ?? null,
        proofPath: resolve(proofPath),
        summary: 'Built offline commit preview. Wire zk-shark-agent for on-chain submit.',
      };
    }
    case 'describe': {
      const env = readZkEnv();
      return {
        action: 'describe',
        summary: [
          'ZK Shark - Shark of All Streets configuration',
          `  program   : ${env.programId}`,
          `  network   : ${env.network}`,
          `  rpc       : ${env.rpcUrl || '(not set)'}`,
          `  keypair   : ${env.keypair || '(instruction-only)'}`,
        ].join('\n'),
        env,
      };
    }
    case 'help':
      return { action: 'help', summary: HELP_TEXT, reason: route.args.reason };
    default:
      throw new Error(`Unhandled action: ${(route as { action: string }).action}`);
  }
}

export const zkOneshotTool = tool({
  name: 'zk_oneshot',
  description:
    'One-shot execute a ZK Shark natural-language intent. Prefers local offline dispatch; optionally tries the zk-shark-agent CLI when useCli=true.',
  inputSchema: z.object({
    text: z.string().describe('Natural language or verb phrase'),
    modelHash: z.string().optional(),
    payloadCommitment: z.string().optional(),
    ciphertextCommitment: z.string().optional(),
    stateVersion: z.number().optional(),
    context: z.string().optional(),
    proofPath: z.string().optional(),
    secretHex: z.string().optional(),
    useCli: z
      .boolean()
      .optional()
      .describe('If true, try zk-shark-agent on PATH first (default false)'),
  }),
  execute: async (args) => {
    try {
      const { text, useCli, ...ctx } = args;
      if (useCli) {
        const cli = await tryZkSharkCli(['ask', text]);
        if (cli.ok) return { source: 'zk-shark-agent', output: cli.output };
      }
      const route = routeIntent(text, ctx);
      const result = await dispatchLocalRoute(route);
      return { source: 'local', route, result };
    } catch (err: any) {
      return { error: err.message };
    }
  },
});
