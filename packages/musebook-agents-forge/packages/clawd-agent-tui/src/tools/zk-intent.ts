/**
 * Deterministic natural-language router for ZK Shark intents.
 * Ported from zk-primitives/agent/src/intents.ts (rule-based, no model calls).
 */

export const KNOWN_INTENTS = [
  'attest-model',
  'commit-state',
  'verify-proof',
  'compute-nullifier',
  'inspect',
  'help',
] as const;
export type KnownIntent = (typeof KNOWN_INTENTS)[number];

export interface IntentRoute {
  intent: KnownIntent;
  action:
    | 'attestModel'
    | 'commitEncryptedState'
    | 'verifyProof'
    | 'computeNullifier'
    | 'describe'
    | 'help';
  args: Record<string, unknown>;
  confidence: number;
  rationale: string;
}

export interface IntentContext {
  modelHash?: string;
  payloadCommitment?: string;
  ciphertextCommitment?: string;
  stateVersion?: number | bigint;
  context?: string;
  proofPath?: string;
  secretHex?: string;
}

function pickHex(s: string): string | undefined {
  const m = s.match(/0x[0-9a-fA-F]+/);
  return m?.[0];
}

function pickProofPath(s: string): string | undefined {
  const m = s.match(/(\S+\.json)\b/);
  return m?.[1];
}

const ATTEST_REGEX = /\b(attest|attestation|publish|publish_attestation)\b/i;
const COMMIT_REGEX = /\b(commit|commit_state|encrypted.?state|ciphertext)\b/i;
const VERIFY_REGEX = /\b(verify|check|validate)\b/i;
const NULLIFIER_REGEX = /\b(nullifier|derive|compute_nullifier)\b/i;
const INSPECT_REGEX = /\b(inspect|config|status|show)\b/i;
const HELP_REGEX = /\b(help|usage|how|what)\b/i;

export function routeIntent(text: string, ctx: IntentContext = {}): IntentRoute {
  type Cand = {
    intent: KnownIntent;
    action: IntentRoute['action'];
    weight: number;
    rationale: string;
    args: Record<string, unknown>;
  };
  const candidates: Cand[] = [];
  const proofFromText = pickProofPath(text);

  if (ATTEST_REGEX.test(text)) {
    const modelHash = pickHex(text) ?? ctx.modelHash;
    const payloadCommitment = ctx.payloadCommitment;
    candidates.push({
      intent: 'attest-model',
      action: 'attestModel',
      weight: 0.7 + (modelHash ? 0.2 : 0) + (payloadCommitment ? 0.1 : 0),
      rationale: `Matched attestation verb${modelHash ? ' + model hash' : ''}.`,
      args: {
        modelHash,
        payloadCommitment,
        context: ctx.context ?? `model-attest:v1:${modelHash ?? 'adhoc'}`,
        proofPath: ctx.proofPath ?? proofFromText,
      },
    });
  }

  if (COMMIT_REGEX.test(text)) {
    const ciphertextCommitment = pickHex(text) ?? ctx.ciphertextCommitment;
    candidates.push({
      intent: 'commit-state',
      action: 'commitEncryptedState',
      weight: 0.7 + (ciphertextCommitment ? 0.2 : 0) + (ctx.modelHash ? 0.1 : 0),
      rationale: `Matched commit verb${ciphertextCommitment ? ' + ciphertext commitment' : ''}.`,
      args: {
        modelHash: ctx.modelHash,
        ciphertextCommitment,
        stateVersion: ctx.stateVersion ?? 1,
        proofPath: ctx.proofPath ?? proofFromText,
      },
    });
  }

  if (VERIFY_REGEX.test(text)) {
    candidates.push({
      intent: 'verify-proof',
      action: 'verifyProof',
      weight: 0.8,
      rationale: 'Matched verify verb.',
      args: {
        proofPath: ctx.proofPath ?? proofFromText,
        modelHash: ctx.modelHash,
        payloadCommitment: ctx.payloadCommitment,
      },
    });
  }

  if (NULLIFIER_REGEX.test(text)) {
    // Prefer quoted context, then remaining free text after the verb.
    const quoted = text.match(/["']([^"']+)["']/)?.[1];
    const after = text.replace(NULLIFIER_REGEX, '').replace(/for|context|derive|compute/gi, '').trim();
    candidates.push({
      intent: 'compute-nullifier',
      action: 'computeNullifier',
      weight: 0.85,
      rationale: 'Matched nullifier verb.',
      args: {
        context: ctx.context ?? quoted ?? (after || 'default'),
        secretHex: ctx.secretHex,
      },
    });
  }

  if (INSPECT_REGEX.test(text) && !ATTEST_REGEX.test(text) && !COMMIT_REGEX.test(text)) {
    candidates.push({
      intent: 'inspect',
      action: 'describe',
      weight: 0.7,
      rationale: 'Matched inspect verb.',
      args: {},
    });
  }

  if (HELP_REGEX.test(text) && !ATTEST_REGEX.test(text) && !COMMIT_REGEX.test(text)) {
    candidates.push({
      intent: 'help',
      action: 'help',
      weight: 0.6,
      rationale: 'Matched help verb.',
      args: {},
    });
  }

  if (candidates.length === 0) {
    return {
      intent: 'help',
      action: 'help',
      args: { reason: `Could not match any known intent in: "${text}"` },
      confidence: 0.1,
      rationale: 'No verb match; defaulting to help.',
    };
  }

  candidates.sort((a, b) => b.weight - a.weight);
  const winner = candidates[0]!;
  return {
    intent: winner.intent,
    action: winner.action,
    args: winner.args,
    confidence: Math.min(1, winner.weight),
    rationale: winner.rationale,
  };
}

export const HELP_TEXT = `ZK Shark — recognised intents

  attest  <modelHash> <payloadCommitment> <proof.json>  → publish_attestation
  commit  <ciphertextCommitment> <version> <proof.json> → commit_encrypted_state
  verify  <proof.json>                                  → proof shape check
  nullifier <context>                                   → compute_nullifier
  inspect                                               → show config
  help                                                  → this text

One-shot examples:
  clawd-agent-tui --oneshot "nullifier for model-attest:v1:demo"
  clawd-agent-tui --oneshot "inspect zk shark config"
  clawd-agent-tui --oneshot "verify ./proof.json"
`;
