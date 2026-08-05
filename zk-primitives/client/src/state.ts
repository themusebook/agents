/**
 * Light Protocol state tree helpers.
 *
 * Wraps the Photon indexer queries (via `@lightprotocol/stateless.js`)
 * and the address derivation / proof-fetching boilerplate for our
 * compressed accounts.
 */

import type { PublicKey } from "@solana/web3.js";
import type { Bytes32 } from "./types";

export interface CompressedValidityProof {
  a: number[];
  b: number[];
  c: number[];
}

export interface ValidityProof {
  /** Compressed proof over the Merkle proof. */
  compressedProof: CompressedValidityProof;
  /** Root indices for each leaf. */
  rootIndices: number[];
}

export interface HashWithTreeInput {
  hash: Bytes32;
  tree: PublicKey;
  queue?: PublicKey;
}

export interface AddressWithTreeInput {
  address: PublicKey | Bytes32;
  tree: PublicKey;
  queue?: PublicKey;
}

export interface PackedAddressTreeInfo {
  addressMerkleTreePubkeyIndex: number;
  addressQueuePubkeyIndex: number;
  rootIndex: number;
}

export interface PackedStateTreeInfo {
  stateTree: PublicKey;
  outputQueue: PublicKey;
  rootIndex: number;
}

/** Fetch a non-inclusion proof for a list of nullifier addresses. */
export async function fetchValidityProofV2(args: {
  rpc: any;
  hashes?: HashWithTreeInput[];
  addressesWithTrees?: AddressWithTreeInput[];
}): Promise<ValidityProof> {
  const sdk = await import("@lightprotocol/stateless.js");
  const hashes = (args.hashes ?? []).map((item) => ({
    hash: sdk.createBN254(item.hash),
    tree: item.tree,
    queue: item.queue ?? item.tree,
  }));
  const addresses = (args.addressesWithTrees ?? []).map((item) => ({
    address: sdk.createBN254(
      item.address instanceof Uint8Array ? item.address : item.address.toBytes(),
    ),
    tree: item.tree,
    queue: item.queue ?? item.tree,
  }));
  if (typeof args.rpc?.getValidityProofV0 !== "function") {
    throw new Error("RPC client does not implement getValidityProofV0");
  }
  const result = await args.rpc.getValidityProofV0(hashes, addresses);
  if (!result.compressedProof) {
    throw new Error("validity proof response missing compressed proof");
  }
  return {
    compressedProof: result.compressedProof,
    rootIndices: result.rootIndices,
  };
}

/** Fetch the current v2 address tree info. */
export async function fetchAddressTreeV2(rpc: any): Promise<PublicKey> {
  return rpc.getAddressTreeV2();
}

/** Fetch a random v2 state tree for new outputs. */
export async function fetchRandomStateTreeV2(rpc: any): Promise<{
  tree: PublicKey;
  queue: PublicKey;
}> {
  const info = await rpc.getRandomStateTreeInfo();
  return { tree: info.tree, queue: info.queue };
}

/** Pack tree info into a `PackedAccounts` struct for the on-chain CPI. */
export async function packAccounts(args: {
  rpc: any;
  programId: PublicKey;
  treeInfo: { addressTree: PublicKey; stateTree: PublicKey; outputQueue: PublicKey };
  proof: ValidityProof;
}) {
  const sdk = await import("@lightprotocol/stateless.js");
  const { PackedAccounts, SystemAccountMetaConfig } = sdk;
  const packed = PackedAccounts.newWithSystemAccounts(
    SystemAccountMetaConfig.new(args.programId),
  );

  const addressMerkleTreeIndex = packed.insertOrGet(args.treeInfo.addressTree);
  const outputStateTreeIndex = packed.insertOrGet(args.treeInfo.stateTree);

  return {
    packed,
    addressMerkleTreeIndex,
    outputStateTreeIndex,
  };
}
