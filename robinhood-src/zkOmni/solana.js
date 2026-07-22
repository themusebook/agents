/**
 * Solana ZkOmni receiver client — instruction builders + Ed25519 precompile ix.
 * Program: Hfbc3tAGYE5nBUa5UncjSV6hoWd3JoVKdA49jPcreXFJ
 */
import { createHash } from "node:crypto";
import { computePublicInputsHash } from "./proof.js";

export const ZK_OMNI_PROGRAM_ID_DEFAULT = "Hfbc3tAGYE5nBUa5UncjSV6hoWd3JoVKdA49jPcreXFJ";
export const STORE_SEED = Buffer.from("zk_omni_store");
export const NULLIFIER_SEED = Buffer.from("zk_omni_nullifier");
/** Solana Ed25519 Program id */
export const ED25519_PROGRAM_ID = "Ed25519SigVerify111111111111111111111111111";
export const SYSVAR_INSTRUCTIONS = "Sysvar1nstructions1111111111111111111111111";

function anchorDisc(name) {
  return createHash("sha256").update(`global:${name}`).digest().subarray(0, 8);
}

export const IX_RECEIVE_ZK_OMNI = anchorDisc("receive_zk_omni");
export const IX_INIT_STORE = anchorDisc("init_store");
export const IX_SET_PEER = anchorDisc("set_peer");

function hexToBuf(hex) {
  return Buffer.from(String(hex).replace(/^0x/i, ""), "hex");
}

function u32le(n) {
  const b = Buffer.alloc(4);
  b.writeUInt32LE(n >>> 0, 0);
  return b;
}

function u64le(n) {
  const b = Buffer.alloc(8);
  b.writeBigUInt64LE(BigInt(n), 0);
  return b;
}

function u16le(n) {
  const b = Buffer.alloc(2);
  b.writeUInt16LE(n, 0);
  return b;
}

function borshString(s) {
  const raw = Buffer.from(s, "utf8");
  return Buffer.concat([u32le(raw.length), raw]);
}

function borshBytes(buf) {
  return Buffer.concat([u32le(buf.length), buf]);
}

/**
 * Build Ed25519Program instruction data (single signature).
 * Matches solana_sdk::ed25519_instruction::new_ed25519_instruction layout.
 */
export function encodeEd25519VerifyIxData({ publicKey, message, signature }) {
  const pk = Buffer.isBuffer(publicKey) ? publicKey : hexToBuf(publicKey);
  const msg = Buffer.isBuffer(message) ? message : hexToBuf(message);
  const sig = Buffer.isBuffer(signature) ? signature : hexToBuf(signature);
  if (pk.length !== 32) throw new Error("ed25519 publicKey must be 32 bytes");
  if (sig.length !== 64) throw new Error("ed25519 signature must be 64 bytes");
  if (msg.length !== 32) throw new Error("ed25519 message (public inputs hash) must be 32 bytes");

  // Header: num_signatures(1) + padding(1) + SignatureOffsets (14 bytes)
  // Then: signature (64) + pubkey (32) + message (32)
  const HEADER = 16;
  const sigOffset = HEADER;
  const pkOffset = HEADER + 64;
  const msgOffset = HEADER + 64 + 32;

  const header = Buffer.alloc(HEADER);
  header[0] = 1; // num signatures
  header[1] = 0; // padding
  // signature_offset, signature_instruction_index (u16 le each)
  u16le(sigOffset).copy(header, 2);
  u16le(0xffff).copy(header, 4); // instruction index = self
  u16le(pkOffset).copy(header, 6);
  u16le(0xffff).copy(header, 8);
  u16le(msgOffset).copy(header, 10);
  u16le(msg.length).copy(header, 12);
  u16le(0xffff).copy(header, 14);

  return Buffer.concat([header, sig, pk, msg]);
}

export function encodeReceiveZkOmniIxData(params) {
  const parts = [
    IX_RECEIVE_ZK_OMNI,
    u32le(params.srcEid),
    hexToBuf(params.srcSender),
    hexToBuf(params.guid),
    hexToBuf(params.agentId),
    hexToBuf(params.controller),
    hexToBuf(params.nullifier),
    hexToBuf(params.payloadCommitment),
    hexToBuf(params.modelHash),
    hexToBuf(params.proofPubkey),
    u64le(params.expiresAt),
    borshString(params.action ?? ""),
    borshString(params.memo ?? ""),
    borshBytes(hexToBuf(params.proof)),
  ];
  return Buffer.concat(parts);
}

/**
 * Plan a Solana receive delivery: Ed25519 verify ix + receive_zk_omni ix.
 */
export function planSolanaReceive(message, opts = {}) {
  const srcEid = opts.srcEid ?? 30416;
  const srcSender =
    opts.srcSender ??
    opts.robinhoodMessengerBytes32 ??
    `0x${"00".repeat(32)}`;
  const guid =
    opts.guid ?? `0x${createHash("sha256").update(hexToBuf(message.nullifier)).digest("hex")}`;

  const publicInputsHash = computePublicInputsHash({
    agentId: message.agentId,
    controller: message.controller,
    nullifier: message.nullifier,
    payloadCommitment: message.payloadCommitment,
    modelHash: message.modelHash,
    proofPubkey: message.proofPubkey,
    expiresAt: message.expiresAt,
    action: message.action,
    memo: message.memo,
  });

  const params = {
    srcEid,
    srcSender,
    guid,
    agentId: message.agentId,
    controller: message.controller,
    nullifier: message.nullifier,
    payloadCommitment: message.payloadCommitment,
    modelHash: message.modelHash,
    proofPubkey: message.proofPubkey,
    expiresAt: message.expiresAt,
    action: message.action,
    memo: message.memo,
    proof: message.proof,
  };

  const programId = opts.programId ?? ZK_OMNI_PROGRAM_ID_DEFAULT;
  const receiveData = encodeReceiveZkOmniIxData(params);
  const ed25519Data = encodeEd25519VerifyIxData({
    publicKey: message.proofPubkey,
    message: publicInputsHash,
    signature: message.proof,
  });

  return {
    chain: "solana",
    programId,
    instruction: "receive_zk_omni",
    requiresEd25519Precompile: true,
    ed25519ProgramId: ED25519_PROGRAM_ID,
    instructionsSysvar: SYSVAR_INSTRUCTIONS,
    publicInputsHash:
      typeof publicInputsHash === "string"
        ? publicInputsHash
        : `0x${Buffer.from(publicInputsHash).toString("hex")}`,
    params,
    ed25519Ix: {
      programId: ED25519_PROGRAM_ID,
      keys: [],
      dataHex: `0x${ed25519Data.toString("hex")}`,
      dataBytes: ed25519Data.length,
    },
    receiveIx: {
      programId,
      dataHex: `0x${receiveData.toString("hex")}`,
      dataBytes: receiveData.length,
      accounts: ["payer", "store", "nullifierAccount", "instructionsSysvar", "systemProgram"],
    },
    // Back-compat alias
    dataHex: `0x${receiveData.toString("hex")}`,
    dataBytes: receiveData.length,
    seeds: {
      store: ["zk_omni_store"],
      nullifier: ["zk_omni_nullifier", message.nullifier],
    },
  };
}

export function buildReceiveZkOmniInstruction(accounts, params) {
  return {
    programId: accounts.programId,
    keys: [
      { pubkey: accounts.payer, isSigner: true, isWritable: true },
      { pubkey: accounts.store, isSigner: false, isWritable: true },
      { pubkey: accounts.nullifierAccount, isSigner: false, isWritable: true },
      { pubkey: accounts.instructionsSysvar ?? SYSVAR_INSTRUCTIONS, isSigner: false, isWritable: false },
      { pubkey: accounts.systemProgram, isSigner: false, isWritable: false },
    ],
    data: encodeReceiveZkOmniIxData(params),
  };
}

export function deriveStorePda(programId, web3) {
  return web3.findProgramAddressSync([STORE_SEED], programId);
}

export function deriveNullifierPda(programId, nullifierHex, web3) {
  return web3.findProgramAddressSync([NULLIFIER_SEED, hexToBuf(nullifierHex)], programId);
}
