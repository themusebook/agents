/**
 * Cheshire ZK Omnichain message codec (msgType 4) — ZK proof edition.
 *
 * abi.encode layout (Solidity / EVM):
 *   uint16  msgType            // = 4
 *   bytes32 agentId
 *   bytes32 controller
 *   bytes32 nullifier
 *   bytes32 payloadCommitment
 *   bytes32 modelHash
 *   bytes32 proofPubkey        // Ed25519 public key (32 bytes left-aligned in word)
 *   uint64  expiresAt
 *   string  action
 *   string  memo
 *   bytes   proof              // 64-byte Ed25519 signature
 */
import { createHash, randomBytes } from "node:crypto";
import {
  createZkProof,
  randomSecretHex,
  verifyZkProof,
  computeBinding,
  computeZkNullifier,
} from "./proof.js";

export const MSG_ZK_OMNI = 4;
export const EID_SOLANA_MAINNET = 30168;
export const EID_ROBINHOOD_MAINNET = 30416;
export const MAX_ACTION_LENGTH = 64;
export const MAX_MEMO_LENGTH = 200;
export const PROOF_BYTES = 64;

export { randomSecretHex, verifyZkProof, createZkProof, computeBinding, computeZkNullifier };

const WORD = 32;

function assertHexBytes32(value, label) {
  const v = String(value ?? "").trim().toLowerCase();
  if (!/^0x[0-9a-f]{64}$/.test(v)) {
    throw new Error(`${label} must be 0x + 64 hex chars`);
  }
  return v;
}

function assertUint64(value, label) {
  const n = typeof value === "bigint" ? value : BigInt(value);
  if (n < 0n || n >= 1n << 64n) throw new Error(`${label} out of uint64 range`);
  return n;
}

function pad32(hexNo0x) {
  return hexNo0x.padStart(WORD * 2, "0");
}

function uintWord(value, bits, label) {
  const n = typeof value === "bigint" ? value : BigInt(value);
  if (n < 0n || n >= 1n << BigInt(bits)) throw new Error(`${label} exceeds uint${bits}`);
  return n.toString(16).padStart(WORD * 2, "0");
}

function encodeDynamicBytes(buf, label, max) {
  if (buf.length > max) throw new Error(`${label} exceeds ${max} bytes`);
  const len = uintWord(BigInt(buf.length), 256, `${label}.length`);
  const padded = buf.toString("hex").padEnd(Math.ceil(Math.max(buf.length, 1) / WORD) * WORD * 2 || WORD * 2, "0");
  // empty bytes still need length word only? abi pads empty to 0 data words after length
  const dataHex = buf.length === 0 ? "" : buf.toString("hex").padEnd(Math.ceil(buf.length / WORD) * WORD * 2, "0");
  const byteLength = WORD + (buf.length === 0 ? 0 : Math.ceil(buf.length / WORD) * WORD);
  return { hex: len + dataHex, byteLength };
}

function encodeDynamicString(str, label, max) {
  const bytes = Buffer.from(str ?? "", "utf8");
  return encodeDynamicBytes(bytes, label, max);
}

/** @deprecated Prefer ZK nullifier via createZkProof — kept for binding helpers. */
export function computeOmniNullifier(secret, context) {
  const secretBuf = Buffer.isBuffer(secret)
    ? secret
    : Buffer.from(String(secret).replace(/^0x/i, ""), "hex");
  if (secretBuf.length < 16) throw new Error("Secret must be at least 16 bytes");
  const h = createHash("sha256");
  h.update(Buffer.from("clawd-zk-nullifier:v1"));
  h.update(Buffer.from([0]));
  h.update(secretBuf);
  h.update(Buffer.from([0]));
  h.update(Buffer.from(String(context), "utf8"));
  return `0x${h.digest("hex")}`;
}

export function payloadCommitmentFrom(parts) {
  const h = createHash("sha256");
  for (const part of parts) {
    h.update(Buffer.from(String(part)));
    h.update(Buffer.from([0]));
  }
  return `0x${h.digest("hex")}`;
}

/**
 * Head words: msgType, agentId, controller, nullifier, payloadCommitment, modelHash,
 * proofPubkey, expiresAt, action offset, memo offset, proof offset = 11 words.
 */
const HEAD_WORDS = 11;

export function encodeZkOmniMessage(input) {
  const msgType = MSG_ZK_OMNI;
  const agentId = assertHexBytes32(input.agentId, "agentId").slice(2);
  const controller = assertHexBytes32(input.controller, "controller").slice(2);
  const nullifier = assertHexBytes32(input.nullifier, "nullifier").slice(2);
  if (/^0{64}$/.test(nullifier)) throw new Error("nullifier cannot be zero");
  const payloadCommitment = assertHexBytes32(
    input.payloadCommitment ?? `0x${"00".repeat(32)}`,
    "payloadCommitment",
  ).slice(2);
  const modelHash = assertHexBytes32(
    input.modelHash ?? `0x${"00".repeat(32)}`,
    "modelHash",
  ).slice(2);
  const proofPubkey = assertHexBytes32(input.proofPubkey, "proofPubkey").slice(2);
  const expiresAt = assertUint64(input.expiresAt, "expiresAt");

  const proofBuf = Buffer.from(String(input.proof).replace(/^0x/i, ""), "hex");
  if (proofBuf.length !== PROOF_BYTES) {
    throw new Error(`proof must be ${PROOF_BYTES} bytes`);
  }

  const actionEnc = encodeDynamicString(input.action ?? "", "action", MAX_ACTION_LENGTH);
  const memoEnc = encodeDynamicString(input.memo ?? "", "memo", MAX_MEMO_LENGTH);
  const proofEnc = encodeDynamicBytes(proofBuf, "proof", PROOF_BYTES);

  const headBytes = HEAD_WORDS * WORD;
  const actionOffset = headBytes;
  const memoOffset = headBytes + actionEnc.byteLength;
  const proofOffset = memoOffset + memoEnc.byteLength;

  const head = [
    uintWord(BigInt(msgType), 16, "msgType"),
    pad32(agentId),
    pad32(controller),
    pad32(nullifier),
    pad32(payloadCommitment),
    pad32(modelHash),
    pad32(proofPubkey),
    uintWord(expiresAt, 64, "expiresAt"),
    uintWord(BigInt(actionOffset), 256, "action offset"),
    uintWord(BigInt(memoOffset), 256, "memo offset"),
    uintWord(BigInt(proofOffset), 256, "proof offset"),
  ].join("");

  return `0x${head}${actionEnc.hex}${memoEnc.hex}${proofEnc.hex}`;
}

function readWord(hex, wordIndex) {
  const start = wordIndex * WORD * 2;
  return hex.slice(start, start + WORD * 2);
}

function decodeDynamicBytes(hex, offsetBytes) {
  const offsetNibbles = offsetBytes * 2;
  const len = Number(BigInt(`0x${hex.slice(offsetNibbles, offsetNibbles + WORD * 2)}`));
  const dataStart = offsetNibbles + WORD * 2;
  const dataHex = hex.slice(dataStart, dataStart + len * 2);
  return Buffer.from(dataHex, "hex");
}

function decodeDynamicString(hex, offsetBytes) {
  return decodeDynamicBytes(hex, offsetBytes).toString("utf8");
}

export function decodeZkOmniMessage(payloadHex) {
  const hex = String(payloadHex).replace(/^0x/i, "").toLowerCase();
  const minNibbles = HEAD_WORDS * WORD * 2;
  if (hex.length < minNibbles) {
    throw new Error("payload too short for ZkOmni message");
  }
  const msgType = Number(BigInt(`0x${readWord(hex, 0)}`));
  if (msgType !== MSG_ZK_OMNI) {
    throw new Error(`Invalid msgType ${msgType}; expected ${MSG_ZK_OMNI}`);
  }
  const agentId = `0x${readWord(hex, 1)}`;
  const controller = `0x${readWord(hex, 2)}`;
  const nullifier = `0x${readWord(hex, 3)}`;
  const payloadCommitment = `0x${readWord(hex, 4)}`;
  const modelHash = `0x${readWord(hex, 5)}`;
  const proofPubkey = `0x${readWord(hex, 6)}`;
  const expiresAt = Number(BigInt(`0x${readWord(hex, 7)}`));
  const actionOffset = Number(BigInt(`0x${readWord(hex, 8)}`));
  const memoOffset = Number(BigInt(`0x${readWord(hex, 9)}`));
  const proofOffset = Number(BigInt(`0x${readWord(hex, 10)}`));
  const action = decodeDynamicString(hex, actionOffset);
  const memo = decodeDynamicString(hex, memoOffset);
  const proofBuf = decodeDynamicBytes(hex, proofOffset);
  return {
    msgType,
    agentId,
    controller,
    nullifier,
    payloadCommitment,
    modelHash,
    proofPubkey,
    expiresAt,
    action,
    memo,
    proof: `0x${proofBuf.toString("hex")}`,
  };
}

export function addressToBytes32(address) {
  const a = String(address).trim().toLowerCase();
  if (!/^0x[0-9a-f]{40}$/.test(a)) throw new Error("Invalid EVM address");
  return `0x${a.slice(2).padStart(64, "0")}`;
}

/**
 * Plan a ZK-attested omnichain message (creates real Ed25519 proof).
 */
export function planZkOmniMessage(input) {
  const direction = input.direction ?? "robinhood-to-solana";
  const srcEid =
    direction === "robinhood-to-solana" ? EID_ROBINHOOD_MAINNET : EID_SOLANA_MAINNET;
  const dstEid =
    direction === "robinhood-to-solana" ? EID_SOLANA_MAINNET : EID_ROBINHOOD_MAINNET;

  const secret = input.secretHex ?? randomSecretHex();
  const expiresAt =
    input.expiresAt ?? Math.floor(Date.now() / 1000) + (input.ttlSeconds ?? 3600);

  const controller =
    input.controller ??
    (input.controllerAddress
      ? addressToBytes32(input.controllerAddress)
      : `0x${"11".repeat(32)}`);

  const agentId = assertHexBytes32(
    input.agentId ?? `0x${"00".repeat(31)}01`,
    "agentId",
  );

  const action = input.action ?? "zk_message";
  const memo = input.memo ?? "";
  const modelHash = input.modelHash ?? `0x${"00".repeat(32)}`;
  const payloadCommitment =
    input.payloadCommitment ??
    payloadCommitmentFrom([action, memo, agentId, String(expiresAt)]);

  const zk = createZkProof(secret, {
    agentId,
    controller,
    payloadCommitment,
    modelHash,
    expiresAt,
    action,
    memo,
  });

  const message = {
    agentId,
    controller,
    nullifier: zk.nullifier,
    payloadCommitment,
    modelHash,
    proofPubkey: zk.proofPubkey,
    expiresAt,
    action,
    memo,
    proof: zk.proof,
  };

  // Fail closed if self-verify fails
  const verified = verifyZkProof(message);
  if (!verified.ok) {
    throw new Error(`Internal ZK proof failed: ${verified.reason}`);
  }

  const payloadHex = encodeZkOmniMessage(message);
  return {
    kind: "zk-omni",
    msgType: MSG_ZK_OMNI,
    direction,
    srcEid,
    dstEid,
    secretProvided: Boolean(input.secretHex),
    zk: {
      publicInputsHash: zk.publicInputsHash,
      binding: zk.binding,
      scheme: "ed25519-pok-v1",
    },
    message,
    payloadHex,
    payloadBytes: (payloadHex.length - 2) / 2,
    options: {
      lzReceiveGas: direction === "robinhood-to-solana" ? 500_000 : 800_000,
      note: "Nullifier is ZK-bound to proofPubkey; Ed25519 proof attests public inputs.",
    },
  };
}
