/**
 * @clawd/zk-shark-agent - public exports
 *
 * The Shark of All Streets wrapper around `@clawd/zk-client`. Use this when you
 * want your ZK Shark agent (or REPL, or MCP tool) to be able to say
 * "attest this model" / "commit this encrypted state" / "verify this
 * proof" without hand-rolling the underlying nullifier, Groth16, and
 * Light Protocol plumbing.
 *
 * Quick start:
 *
 * ```ts
 * import { ZkSharkAgent } from "@clawd/zk-shark-agent";
 * import { createSolanaRpc } from "@solana/kit";
 *
 * const agent = await ZkSharkAgent.fromEnv();
 * const result = await agent.attestModel({
 *   modelHash: new Uint8Array(32),
 *   payloadCommitment: new Uint8Array(32),
 *   proof: loadProofFromDisk("./proof.json"),
 *   context: "model-attest:v1:my-model",
 * });
 * console.log(result.signature);
 * ```
 *
 * The package also ships a `zk-shark-agent` binary (see `src/cli.ts`)
 * that exposes the same operations as subcommands and as a
 * natural-language intent router.
 */

export {
  ZkSharkAgent,
  ClawdZkAgent,
  type ZkSharkAgentOptions,
  type ClawdZkAgentOptions,
  type AttestModelResult,
  type CommitStateResult,
  type VerifyProofResult,
} from "./agent";
export { routeIntent, type IntentRoute, type IntentContext, KNOWN_INTENTS } from "./intents";
export { loadAgentConfig, type ZkSharkAgentConfig, type ZkAgentConfig, DEFAULT_PROGRAM_ID } from "./config";
export { runCli } from "./cli";
export {
  // Re-export the lower-level SDK so callers can drop down when they
  // need to construct instructions by hand.
  computeNullifier,
  computeNullifierBatch,
  deriveNullifierAddress,
  buildPublishPublicInputs,
  buildCommitPublicInputs,
  buildConsumePublicInputs,
  packPublicInputs,
  serializeProof,
  verifyGroth16Offchain,
  type NullifierInputs,
  type Groth16Proof,
  type Bytes32,
  type PublishAttestationArgs,
  type CommitStateArgs,
} from "@clawd/zk-client";
