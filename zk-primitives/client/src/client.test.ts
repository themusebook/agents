import { describe, expect, test } from "vitest";
import { PublicKey } from "@solana/web3.js";
import { ClawdZkClient } from "./client";
import type { Bytes32, Groth16Proof } from "./types";

const signer = new PublicKey("11111111111111111111111111111111");
const tree = new PublicKey("SysvarC1ock11111111111111111111111111111111");
const queue = new PublicKey("SysvarRent111111111111111111111111111111111");

const compressedProof = {
  a: new Array(32).fill(1),
  b: new Array(64).fill(2),
  c: new Array(32).fill(3),
};

const rpc = {
  async getAddressTreeV2() { return tree; },
  async getRandomStateTreeInfo() { return { tree, queue }; },
  async getValidityProofV0() {
    return { compressedProof, rootIndices: [7] };
  },
};

function bytes32(fill: number): Bytes32 {
  return new Uint8Array(32).fill(fill) as Bytes32;
}

function proof(publicInputs: number): Groth16Proof {
  return {
    a: new Uint8Array(64).fill(4),
    b: new Uint8Array(128).fill(5),
    c: new Uint8Array(64).fill(6),
    // alpha + beta/gamma/delta + (N + 1) IC points
    verifyingKey: new Uint8Array(448 + (publicInputs + 1) * 64).fill(7),
  };
}

describe("ClawdZkClient Anchor/Borsh instruction encoding", () => {
  test("publishAttestation produces binary Anchor args and one nullifier", async () => {
    const client = new ClawdZkClient({ rpc, programId: undefined as never });
    const ix = await client.publishAttestation({
      signer,
      modelHash: bytes32(10),
      payloadCommitment: bytes32(11),
      nullifier: bytes32(12),
      proof: proof(4),
    });

    expect(ix.programId.toBase58()).toBe("HsgY1m4uS64anpDLNwtpACsUMTsyM3xjkCriGbTBNFhk");
    expect(ix.keys.length).toBeGreaterThan(1);
    expect(ix.data[8]).toBe(10);
    expect(ix.data.readUInt32LE(ix.data.length - 36)).toBe(1);
    expect(ix.data.subarray(ix.data.length - 32)).toEqual(Buffer.from(bytes32(12)));
  });

  test("commitEncryptedState preserves a full u64 version", async () => {
    const client = new ClawdZkClient({ rpc, programId: undefined as never });
    const version = 9_007_199_254_740_999n;
    const ix = await client.commitEncryptedState({
      signer,
      modelHash: bytes32(20),
      ciphertextCommitment: bytes32(21),
      stateVersion: version,
      proof: proof(4),
    });

    expect(ix.data.readBigUInt64LE(72)).toBe(version);
    expect(ix.data[8]).toBe(20);
  });
});
