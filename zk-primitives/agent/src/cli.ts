#!/usr/bin/env node
/**
 * zk-shark-agent - CLI entry point for ZK Shark, the Shark of All Streets.
 *
 * Subcommands:
 *
 *   zk-shark-agent inspect
 *     Print the active configuration (RPC, program, network, signer).
 *
 *   zk-shark-agent attest <modelHash> <payloadCommitment> <proof.json> [--context <ctx>]
 *     Build and (when a signer is attached) submit a publish_attestation
 *     instruction. The proof is read from <proof.json> as
 *     `{ a, b, c, verifyingKey }` (hex strings).
 *
 *   zk-shark-agent commit <ciphertextCommitment> <stateVersion> <proof.json> [--model <modelHash>]
 *     Build a commit_encrypted_state instruction.
 *
 *   zk-shark-agent verify <proof.json>
 *     Off-chain Groth16 sanity check (point sizes + public input packing).
 *
 *   zk-shark-agent nullifier <context>
 *     Derive a deterministic 32-byte nullifier for the given context.
 *
 *   zk-shark-agent ask "<natural language>"
 *     Use the deterministic intent router to map the text to an action,
 *     then dispatch it.
 *
 *   zk-shark-agent help
 *     Print this help.
 */

import { Buffer } from "node:buffer";
import { resolve as resolvePath } from "node:path";
import { fileURLToPath } from "node:url";
import { ZkSharkAgent } from "./agent";
import { routeIntent } from "./intents";

const CLI_NAME = "zk-shark-agent";
const BANNER = "ZK Shark - Shark of All Streets";

function printUsage(): void {
  console.log(`${BANNER} — subcommands

  inspect
      Show the active configuration.

  attest <modelHash> <payloadCommitment> <proof.json> [--context <ctx>]
      Build a publish_attestation instruction.

  commit <ciphertextCommitment> <stateVersion> <proof.json> [--model <modelHash>]
      Build a commit_encrypted_state instruction.

  verify <proof.json>
      Off-chain Groth16 sanity check.

  nullifier <context>
      Derive a deterministic 32-byte nullifier for the given context.

  ask "<natural language>"
      Use the intent router to map free-form text to an action.

  help
      Print this help.

Environment:
  ZK_SHARK_RPC_URL          (required)  Solana RPC endpoint.
  ZK_SHARK_PROGRAM_ID       (optional)  ZK Shark program id.
  ZK_SHARK_PHOTON_URL       (optional)  Photon indexer URL.
  ZK_SHARK_API_KEY          (optional)  RPC API key.
  ZK_SHARK_COMMITMENT       (optional)  processed | confirmed | finalized.
  ZK_SHARK_KEYPAIR          (optional)  Path to a Solana keypair JSON.
  ZK_SHARK_NETWORK          (optional)  mainnet | devnet | localnet.

Legacy CLAWD_ZK_* variables are still accepted as fallbacks.
`);
}

function readFlag(args: string[], flag: string): string | undefined {
  const i = args.indexOf(flag);
  return i === -1 ? undefined : args[i + 1];
}

function parseHex32(label: string, hex: string): Uint8Array {
  const cleaned = hex.trim().replace(/^0x/i, "");
  if (cleaned.length !== 64) {
    throw new Error(`${label} must be 32 bytes (64 hex chars); got ${cleaned.length}.`);
  }
  return Uint8Array.from(cleaned.match(/.{1,2}/g)!.map((b) => parseInt(b, 16)));
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  if (argv.length === 0 || argv[0] === "help" || argv[0] === "--help" || argv[0] === "-h") {
    printUsage();
    return;
  }

  const sub = argv[0];
  const tail = argv.slice(1);

  if (sub === "inspect") {
    const agent = await ZkSharkAgent.fromEnv();
    console.log(agent.describe());
    return;
  }

  if (sub === "ask") {
    const text = tail.join(" ").trim();
    if (!text) throw new Error(`Usage: ${CLI_NAME} ask "<natural language>"`);
    const agent = await ZkSharkAgent.fromEnv();
    const route = routeIntent(text, agent);
    console.log(JSON.stringify({ route }, null, 2));
    return;
  }

  if (sub === "verify") {
    const proofPath = tail[0];
    if (!proofPath) throw new Error(`Usage: ${CLI_NAME} verify <proof.json>`);
    const agent = await ZkSharkAgent.fromEnv();
    const proof = await ZkSharkAgent.loadProof(proofPath);
    const result = agent.verifyProof({ proof });
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  if (sub === "nullifier") {
    const context = tail[0];
    if (!context) throw new Error(`Usage: ${CLI_NAME} nullifier <context>`);
    const agent = await ZkSharkAgent.fromEnv();
    const nullifier = await agent.computeNullifierFor(new Uint8Array(32), context);
    console.log(`ZK Shark nullifier: 0x${Buffer.from(nullifier).toString("hex")}`);
    return;
  }

  if (sub === "attest") {
    const [modelHashHex, payloadCommitmentHex, proofPath] = tail;
    if (!modelHashHex || !payloadCommitmentHex || !proofPath) {
      throw new Error(`Usage: ${CLI_NAME} attest <modelHash> <payloadCommitment> <proof.json> [--context <ctx>]`);
    }
    const context = readFlag(tail, "--context") ?? `model-attest:v1:${modelHashHex.slice(0, 12)}`;
    const agent = await ZkSharkAgent.fromEnv();
    const proof = await ZkSharkAgent.loadProof(proofPath);
    const result = await agent.attestModel({
      modelHash: parseHex32("modelHash", modelHashHex) as never,
      payloadCommitment: parseHex32("payloadCommitment", payloadCommitmentHex) as never,
      proof,
      context,
    });
    console.log(result.summary);
    if (result.signature) console.log(`signature: ${result.signature}`);
    return;
  }

  if (sub === "commit") {
    const [ciphertextCommitmentHex, stateVersionStr, proofPath] = tail;
    if (!ciphertextCommitmentHex || !stateVersionStr || !proofPath) {
      throw new Error(`Usage: ${CLI_NAME} commit <ciphertextCommitment> <stateVersion> <proof.json> [--model <modelHash>]`);
    }
    const modelHashHex = readFlag(tail, "--model");
    const stateVersion = BigInt(stateVersionStr);
    const agent = await ZkSharkAgent.fromEnv();
    const proof = await ZkSharkAgent.loadProof(proofPath);
    const result = await agent.commitEncryptedState({
      modelHash: (modelHashHex
        ? parseHex32("modelHash", modelHashHex)
        : new Uint8Array(32)) as never,
      ciphertextCommitment: parseHex32("ciphertextCommitment", ciphertextCommitmentHex) as never,
      stateVersion,
      proof,
      context: `commit-state:v1:${stateVersion}`,
    });
    console.log(result.summary);
    return;
  }

  throw new Error(`Unknown subcommand: ${sub}. Run "${CLI_NAME} help".`);
}

/** Exported for testing — wraps the CLI body in a try/catch and exits with the right code. */
export async function runCli(argv: string[] = process.argv.slice(2)): Promise<number> {
  try {
    process.argv = ["node", CLI_NAME, ...argv];
    await main();
    return 0;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`${BANNER} error: ${msg}`);
    return 1;
  }
}

// Only run main when invoked as a binary (not when imported by tests).
const invokedAsBinary =
  typeof process !== "undefined" &&
  process.argv[1] != null &&
  resolvePath(process.argv[1]) === fileURLToPath(import.meta.url);

if (invokedAsBinary) {
  runCli().then((code) => {
    if (code !== 0) process.exit(code);
  });
}
