/**
 * Offline ZK helpers used by domain tools.
 * Mirrors the shapes used by @clawd/zk-client / zk-shark-agent without
 * requiring that package to be installed in this monorepo.
 */
import { createHash, randomBytes } from 'crypto';
import { readFile } from 'fs/promises';
import { resolve } from 'path';

export type Bytes32 = Uint8Array & { readonly __brand?: 'Bytes32' };

export interface Groth16ProofJson {
  a: string;
  b: string;
  c: string;
  verifyingKey?: string;
}

export interface Groth16Proof {
  a: Uint8Array;
  b: Uint8Array;
  c: Uint8Array;
  verifyingKey: Uint8Array;
}

export function hexToBytes(hex: string): Uint8Array {
  const cleaned = hex.trim().replace(/^0x/i, '');
  if (cleaned.length % 2 !== 0) {
    throw new Error(`Hex string must have even length, got ${cleaned.length}.`);
  }
  if (!/^[0-9a-fA-F]*$/.test(cleaned)) {
    throw new Error('Hex string contains non-hex characters.');
  }
  const out = new Uint8Array(cleaned.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(cleaned.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

export function bytesToHex(b: Uint8Array): string {
  return Buffer.from(b).toString('hex');
}

export function ensure32(label: string, b: Uint8Array): Bytes32 {
  if (b.length === 32) return b as Bytes32;
  throw new Error(`${label} must be exactly 32 bytes (got ${b.length}).`);
}

export function parseHex32(label: string, hex: string): Bytes32 {
  return ensure32(label, hexToBytes(hex));
}

/**
 * Domain-separated nullifier: SHA-256("clawd-zk-nullifier:v1" || secret || context).
 * Compatible intent with zk-primitives computeNullifier; exact on-chain
 * hashing may differ — use for offline derivation / demos / one-shots.
 */
export function computeNullifier(secret: Uint8Array, context: string): Bytes32 {
  if (secret.length < 16) {
    throw new Error('Secret must be at least 16 bytes.');
  }
  const h = createHash('sha256');
  h.update(Buffer.from('clawd-zk-nullifier:v1'));
  h.update(Buffer.from([0]));
  h.update(secret);
  h.update(Buffer.from([0]));
  h.update(Buffer.from(context, 'utf8'));
  return ensure32('nullifier', h.digest());
}

export function randomSecret(bytes = 32): Uint8Array {
  return randomBytes(bytes);
}

export async function loadProofFromFile(path: string): Promise<Groth16Proof> {
  const abs = resolve(path);
  const raw = await readFile(abs, 'utf-8');
  const json = JSON.parse(raw) as Groth16ProofJson;
  if (!json.a || !json.b || !json.c) {
    throw new Error('Proof JSON must include a, b, and c (hex strings).');
  }
  return {
    a: hexToBytes(json.a),
    b: hexToBytes(json.b),
    c: hexToBytes(json.c),
    verifyingKey: json.verifyingKey ? hexToBytes(json.verifyingKey) : new Uint8Array(0),
  };
}

/** Expected G1/G2 point lengths for a well-formed Groth16 export. */
export function verifyProofShape(proof: Groth16Proof): {
  ok: boolean;
  reason?: string;
  sizes: { a: number; b: number; c: number; verifyingKey: number };
} {
  const sizes = {
    a: proof.a.length,
    b: proof.b.length,
    c: proof.c.length,
    verifyingKey: proof.verifyingKey.length,
  };
  // Common encodings: compressed G1=32/48/64, G2=64/96/128 depending on curve/export.
  // We accept a wide band and flag obvious trash (empty or tiny).
  if (sizes.a < 32 || sizes.c < 32) {
    return { ok: false, reason: 'proof.a and proof.c must be ≥ 32 bytes (G1).', sizes };
  }
  if (sizes.b < 64) {
    return { ok: false, reason: 'proof.b must be ≥ 64 bytes (G2).', sizes };
  }
  return { ok: true, sizes };
}

export function packPublicInputs(inputs: Bytes32[]): Uint8Array {
  const out = new Uint8Array(inputs.length * 32);
  for (let i = 0; i < inputs.length; i++) {
    out.set(inputs[i], i * 32);
  }
  return out;
}

export function buildPublishPublicInputs(args: {
  attester: Uint8Array;
  modelHash: Bytes32;
  payloadCommitment: Bytes32;
  nullifier: Bytes32;
}): Bytes32[] {
  const attester32 = createHash('sha256').update(args.attester).digest() as Bytes32;
  return [attester32, args.modelHash, args.payloadCommitment, args.nullifier];
}

export function readZkEnv(): Record<string, string> {
  const pick = (...keys: string[]) => {
    for (const k of keys) {
      const v = process.env[k];
      if (v) return v;
    }
    return '';
  };
  return {
    rpcUrl: pick('ZK_SHARK_RPC_URL', 'CLAWD_ZK_RPC_URL'),
    programId: pick('ZK_SHARK_PROGRAM_ID', 'CLAWD_ZK_PROGRAM_ID') || 'CLAWDzk11111111111111111111111111111111111',
    photonUrl: pick('ZK_SHARK_PHOTON_URL', 'CLAWD_ZK_PHOTON_URL'),
    apiKey: pick('ZK_SHARK_API_KEY', 'CLAWD_ZK_API_KEY') ? '***' : '',
    commitment: pick('ZK_SHARK_COMMITMENT', 'CLAWD_ZK_COMMITMENT') || 'confirmed',
    keypair: pick('ZK_SHARK_KEYPAIR', 'CLAWD_ZK_KEYPAIR'),
    network: pick('ZK_SHARK_NETWORK', 'CLAWD_ZK_NETWORK') || 'mainnet',
    zkPrimitivesDir: pick('CLAWD_ZK_PRIMITIVES_DIR', 'CLAWDBOT_ZK_PRIMITIVES_DIR'),
  };
}
