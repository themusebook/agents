/**
 * ClawdZkClient — high-level orchestrator.
 *
 * Glues together nullifier computation, Groth16 proof assembly, and
 * Light Protocol validity-proof fetching into single-method calls
 * that produce ready-to-sign Solana instructions.
 */

import { PublicKey, TransactionInstruction } from "@solana/web3.js";
import { createHash } from "node:crypto";
import {
  ClawdZkClientConfig,
  CommitStateArgs,
  PublishAttestationArgs,
  Groth16Proof,
} from "./types";
import {
  buildCommitPublicInputs,
  buildPublishPublicInputs,
  packPublicInputs,
  serializeProof,
} from "./proof";
import {
  fetchAddressTreeV2,
  fetchRandomStateTreeV2,
  fetchValidityProofV2,
  packAccounts,
} from "./state";
import { computeNullifier, deriveNullifierAddress } from "./nullifier";

const PROGRAM_IDENTITY: PublicKey = new PublicKey(
  "HsgY1m4uS64anpDLNwtpACsUMTsyM3xjkCriGbTBNFhk",
);

export class ClawdZkClient {
  readonly rpc: any;
  readonly programId: PublicKey;
  readonly photonUrl: string;
  readonly apiKey?: string;
  readonly commitment: "processed" | "confirmed" | "finalized";

  constructor(config: ClawdZkClientConfig) {
    this.rpc = config.rpc;
    this.programId = config.programId ?? PROGRAM_IDENTITY;
    this.photonUrl = config.photonUrl ?? "";
    this.apiKey = config.apiKey;
    this.commitment = config.commitment ?? "confirmed";
  }

  /**
   * Build a `publish_attestation` instruction. The caller must supply
   * the Groth16 proof (already generated off-chain). This method does
   * the rest: derives the nullifier address, fetches the validity
   * proof, packs the system accounts.
   */
  async publishAttestation(args: PublishAttestationArgs): Promise<TransactionInstruction> {
    // 1. Sanity-check and serialize the proof.
    const proof = serializeProof(args.proof);

    // 2. Derive the nullifier's compressed-account address.
    const addressTree = await fetchAddressTreeV2(this.rpc);
    const { address: nullifierAddress } = await deriveNullifierAddress(
      this.programId,
      addressTree,
      args.nullifier,
    );

    // 3. Fetch a validity proof (proves the nullifier address does not exist).
    const validity = await fetchValidityProofV2({
      rpc: this.rpc,
      hashes: [],
      addressesWithTrees: [{ address: nullifierAddress, tree: addressTree }],
    });

    // 4. Fetch a random state tree for the new output.
    const stateTree = await fetchRandomStateTreeV2(this.rpc);

    // 5. Pack system accounts.
    const { packed, addressMerkleTreeIndex, outputStateTreeIndex } =
      await packAccounts({
        rpc: this.rpc,
        programId: this.programId,
        treeInfo: {
          addressTree,
          stateTree: stateTree.tree,
          outputQueue: stateTree.queue,
        },
        proof: validity,
      });

    const accountMetas = packed.toAccountMetas();
    const systemAccountsOffset = accountMetas.systemStart;

    // 6. Build the canonical public input vector.
    const publicInputs = buildPublishPublicInputs({
      attester: args.signer.toBytes(),
      modelHash: args.modelHash,
      payloadCommitment: args.payloadCommitment,
      nullifier: args.nullifier,
    });

    // Validate the exact public-input layout before encoding the Anchor args.
    packPublicInputs(publicInputs);

    // 8. Encode the discriminator for `publish_attestation` (Anchor IDL).
    const discriminator = sha256("global:publish_attestation").slice(0, 8);

    const ix = new TransactionInstruction({
      programId: this.programId,
      keys: [
        { pubkey: args.signer, isSigner: true, isWritable: true },
        ...accountMetas.remainingAccounts,
      ],
      data: encodePublishInstruction(discriminator, {
        ...args,
        proof,
        validityProof: validity.compressedProof,
        outputStateTreeIndex,
        systemAccountsOffset,
        addressMerkleTreeIndex,
        addressRootIndex: validity.rootIndices[0] ?? 0,
      }),
    });

    return ix;
  }

  /**
   * Build a `commit_encrypted_state` instruction. The off-chain
   * committer must supply a Groth16 proof that they know the
   * plaintext (or have a valid license).
   */
  async commitEncryptedState(args: CommitStateArgs): Promise<TransactionInstruction> {
    const proof = serializeProof(args.proof);
    const stateTree = await fetchRandomStateTreeV2(this.rpc);

    // Validity proof for a write (no address creation).
    const validity = await fetchValidityProofV2({
      rpc: this.rpc,
      hashes: [],
      addressesWithTrees: [],
    });

    const { packed, outputStateTreeIndex } = await packAccounts({
      rpc: this.rpc,
      programId: this.programId,
      treeInfo: {
        addressTree: stateTree.tree, // dummy; not used for write-without-address
        stateTree: stateTree.tree,
        outputQueue: stateTree.queue,
      },
      proof: validity,
    });

    const publicInputs = buildCommitPublicInputs({
      committer: args.signer.toBytes(),
      modelHash: args.modelHash,
      ciphertextCommitment: args.ciphertextCommitment,
      stateVersion: args.stateVersion,
    });

    const accountMetas = packed.toAccountMetas();
    packPublicInputs(publicInputs);

    const discriminator = sha256("global:commit_encrypted_state").slice(0, 8);
    return new TransactionInstruction({
      programId: this.programId,
      keys: [
        { pubkey: args.signer, isSigner: true, isWritable: true },
        ...accountMetas.remainingAccounts,
      ],
      data: encodeCommitInstruction(discriminator, {
        ...args,
        proof,
        validityProof: validity.compressedProof,
        outputStateTreeIndex,
        systemAccountsOffset: accountMetas.systemStart,
      }),
    });
  }
}

// ============================================================================
// Internal encoding helpers
// ============================================================================

function sha256(s: string): Uint8Array {
  return createHash("sha256").update(s).digest();
}

class BorshWriter {
  private readonly chunks: Buffer[] = [];
  bytes(value: Uint8Array, length?: number) {
    if (length !== undefined && value.length !== length) {
      throw new Error(`Expected ${length} bytes, got ${value.length}`);
    }
    this.chunks.push(Buffer.from(value));
  }
  u8(value: number) {
    if (!Number.isInteger(value) || value < 0 || value > 255) throw new Error(`Invalid u8: ${value}`);
    this.chunks.push(Buffer.from([value]));
  }
  u16(value: number) {
    const b = Buffer.alloc(2); b.writeUInt16LE(value); this.chunks.push(b);
  }
  u32(value: number) {
    const b = Buffer.alloc(4); b.writeUInt32LE(value); this.chunks.push(b);
  }
  u64(value: number | bigint) {
    const n = BigInt(value);
    if (n < 0n || n > 0xffff_ffff_ffff_ffffn) throw new Error(`Invalid u64: ${value}`);
    const b = Buffer.alloc(8); b.writeBigUInt64LE(n); this.chunks.push(b);
  }
  vec(value: Uint8Array) { this.u32(value.length); this.bytes(value); }
  finish() { return Buffer.concat(this.chunks); }
}

type CompressedProofLike = { a: number[] | Uint8Array; b: number[] | Uint8Array; c: number[] | Uint8Array };

function writeValidityProof(w: BorshWriter, proof: CompressedProofLike | null | undefined) {
  if (!proof) { w.u8(0); return; }
  w.u8(1);
  w.bytes(Uint8Array.from(proof.a), 32);
  w.bytes(Uint8Array.from(proof.b), 64);
  w.bytes(Uint8Array.from(proof.c), 32);
}

function writeGroth16(w: BorshWriter, proof: ReturnType<typeof serializeProof>) {
  w.bytes(proof.proofA, 64);
  w.bytes(proof.proofB, 128);
  w.bytes(proof.proofC, 64);
  w.vec(proof.verifyingKey);
}

function writeNewState(w: BorshWriter, args: {
  validityProof: CompressedProofLike;
  outputStateTreeIndex: number;
  systemAccountsOffset: number;
}) {
  writeValidityProof(w, args.validityProof);
  w.u8(args.outputStateTreeIndex);
  w.u8(args.systemAccountsOffset);
  w.u8(0); // address: None
  w.u8(0); // address_tree_info: None
}

function encodePublishInstruction(discriminator: Uint8Array, args: Omit<PublishAttestationArgs, "proof"> & {
  proof: ReturnType<typeof serializeProof>;
  validityProof: CompressedProofLike;
  outputStateTreeIndex: number;
  systemAccountsOffset: number;
  addressMerkleTreeIndex: number;
  addressRootIndex: number;
}) {
  const w = new BorshWriter();
  w.bytes(discriminator, 8);
  w.bytes(args.modelHash, 32);
  w.bytes(args.payloadCommitment, 32);
  writeGroth16(w, args.proof);
  writeNewState(w, args);
  writeValidityProof(w, args.validityProof);
  w.u8(args.addressMerkleTreeIndex);
  w.u8(args.addressMerkleTreeIndex);
  w.u16(args.addressRootIndex);
  w.u8(args.outputStateTreeIndex);
  w.u8(args.systemAccountsOffset);
  w.u32(1);
  w.bytes(args.nullifier, 32);
  return w.finish();
}

function encodeCommitInstruction(discriminator: Uint8Array, args: Omit<CommitStateArgs, "proof"> & {
  proof: ReturnType<typeof serializeProof>;
  validityProof: CompressedProofLike;
  outputStateTreeIndex: number;
  systemAccountsOffset: number;
}) {
  const w = new BorshWriter();
  w.bytes(discriminator, 8);
  w.bytes(args.modelHash, 32);
  w.bytes(args.ciphertextCommitment, 32);
  w.u64(args.stateVersion);
  writeGroth16(w, args.proof);
  writeNewState(w, args);
  return w.finish();
}
