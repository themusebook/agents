/**
 * Zero-knowledge proof of knowledge for ZkOmni nullifiers.
 *
 * Construction (Ed25519 PoK of secret):
 *   seed        = SHA-256("clawd-zk-omni-ed25519:v1" || secret)
 *   (sk, pk)    = Ed25519 keypair from seed
 *   binding     = SHA-256(agentId || payloadCommitment || modelHash)
 *   nullifier   = SHA-256("clawd-zk-omni-nullifier:v1" || pk || binding)
 *   publicHash  = SHA-256(msg fields excluding proof)
 *   proof       = Ed25519.Sign(sk, publicHash)   // 64 bytes
 *
 * Verifier checks signature under pk and that nullifier matches (pk, binding).
 * Secret never appears in the message; only pk + proof do.
 */
import {
  createHash,
  createPrivateKey,
  createPublicKey,
  sign as cryptoSign,
  verify as cryptoVerify,
  randomBytes,
} from "node:crypto";

const SEED_DOMAIN = Buffer.from("clawd-zk-omni-ed25519:v1");
const NF_DOMAIN = Buffer.from("clawd-zk-omni-nullifier:v1");
const PUB_DOMAIN = Buffer.from("clawd-zk-omni-public:v1");

/** PKCS#8 prefix for a 32-byte Ed25519 seed (RFC 8410). */
const ED25519_PKCS8_PREFIX = Buffer.from("302e020100300506032b657004220420", "hex");

function sha256(...parts) {
  const h = createHash("sha256");
  for (const p of parts) h.update(p);
  return h.digest();
}

function asBuf(hexOrBuf, label) {
  if (Buffer.isBuffer(hexOrBuf)) return hexOrBuf;
  const s = String(hexOrBuf).trim().replace(/^0x/i, "");
  if (!/^[0-9a-fA-F]*$/.test(s) || s.length % 2 !== 0) {
    throw new Error(`${label} must be hex`);
  }
  return Buffer.from(s, "hex");
}

function toHex(buf) {
  return `0x${Buffer.from(buf).toString("hex")}`;
}

export function randomSecretHex(bytes = 32) {
  return toHex(randomBytes(bytes));
}

/**
 * Derive Ed25519 key material from a secret (≥16 bytes).
 * @returns {{ seed: Buffer, privateKey: import('node:crypto').KeyObject, publicKey: import('node:crypto').KeyObject, publicKeyRaw: Buffer }}
 */
export function deriveProofKeypair(secret) {
  const secretBuf = asBuf(secret, "secret");
  if (secretBuf.length < 16) throw new Error("Secret must be at least 16 bytes");
  const seed = sha256(SEED_DOMAIN, Buffer.from([0]), secretBuf);
  const der = Buffer.concat([ED25519_PKCS8_PREFIX, seed]);
  const privateKey = createPrivateKey({ key: der, format: "der", type: "pkcs8" });
  const publicKey = createPublicKey(privateKey);
  const spki = publicKey.export({ type: "spki", format: "der" });
  // SPKI for Ed25519: last 32 bytes are the raw public key
  const publicKeyRaw = spki.subarray(spki.length - 32);
  return { seed, privateKey, publicKey, publicKeyRaw };
}

export function computeBinding(agentId, payloadCommitment, modelHash) {
  return sha256(
    asBuf(agentId, "agentId"),
    asBuf(payloadCommitment, "payloadCommitment"),
    asBuf(modelHash, "modelHash"),
  );
}

/**
 * Nullifier bound to proof public key + message binding (no secret in clear).
 */
export function computeZkNullifier(publicKeyRaw, binding) {
  const pk = Buffer.isBuffer(publicKeyRaw) ? publicKeyRaw : asBuf(publicKeyRaw, "publicKey");
  const b = Buffer.isBuffer(binding) ? binding : asBuf(binding, "binding");
  if (pk.length !== 32) throw new Error("proofPubkey must be 32 bytes");
  if (b.length !== 32) throw new Error("binding must be 32 bytes");
  return toHex(sha256(NF_DOMAIN, Buffer.from([0]), pk, Buffer.from([0]), b));
}

/**
 * Canonical public-input hash signed by the proof key.
 */
export function computePublicInputsHash(fields) {
  const action = Buffer.from(fields.action ?? "", "utf8");
  const memo = Buffer.from(fields.memo ?? "", "utf8");
  const expires = Buffer.alloc(8);
  expires.writeBigUInt64BE(BigInt(fields.expiresAt));
  return sha256(
    PUB_DOMAIN,
    asBuf(fields.agentId, "agentId"),
    asBuf(fields.controller, "controller"),
    asBuf(fields.nullifier, "nullifier"),
    asBuf(fields.payloadCommitment, "payloadCommitment"),
    asBuf(fields.modelHash, "modelHash"),
    asBuf(fields.proofPubkey, "proofPubkey"),
    expires,
    Buffer.from([action.length]),
    action,
    Buffer.from([memo.length]),
    memo,
  );
}

/**
 * Create a ZK proof package from a secret and message fields (without nullifier/proof yet).
 */
export function createZkProof(secret, partial) {
  const { privateKey, publicKeyRaw } = deriveProofKeypair(secret);
  const modelHash = partial.modelHash ?? `0x${"00".repeat(32)}`;
  const payloadCommitment = partial.payloadCommitment;
  const agentId = partial.agentId;
  const binding = computeBinding(agentId, payloadCommitment, modelHash);
  const nullifier = computeZkNullifier(publicKeyRaw, binding);
  const proofPubkey = toHex(publicKeyRaw);

  const fieldsForHash = {
    agentId,
    controller: partial.controller,
    nullifier,
    payloadCommitment,
    modelHash,
    proofPubkey,
    expiresAt: partial.expiresAt,
    action: partial.action ?? "",
    memo: partial.memo ?? "",
  };
  const publicHash = computePublicInputsHash(fieldsForHash);
  const proof = cryptoSign(null, publicHash, privateKey);
  if (proof.length !== 64) throw new Error(`Unexpected proof length ${proof.length}`);

  return {
    nullifier,
    proofPubkey,
    proof: toHex(proof),
    publicInputsHash: toHex(publicHash),
    binding: toHex(binding),
  };
}

/**
 * Verify ZK proof against message fields. Throws or returns { ok, reason }.
 */
export function verifyZkProof(message) {
  try {
    const proofPubkey = asBuf(message.proofPubkey, "proofPubkey");
    const proof = asBuf(message.proof, "proof");
    if (proofPubkey.length !== 32) return { ok: false, reason: "proofPubkey must be 32 bytes" };
    if (proof.length !== 64) return { ok: false, reason: "proof must be 64 bytes (Ed25519 signature)" };

    const binding = computeBinding(
      message.agentId,
      message.payloadCommitment,
      message.modelHash ?? `0x${"00".repeat(32)}`,
    );
    const expectedNf = computeZkNullifier(proofPubkey, binding);
    if (expectedNf.toLowerCase() !== String(message.nullifier).toLowerCase()) {
      return { ok: false, reason: "nullifier does not match proofPubkey binding (ZK relation failed)" };
    }

    const publicHash = computePublicInputsHash({
      agentId: message.agentId,
      controller: message.controller,
      nullifier: message.nullifier,
      payloadCommitment: message.payloadCommitment,
      modelHash: message.modelHash ?? `0x${"00".repeat(32)}`,
      proofPubkey: message.proofPubkey,
      expiresAt: message.expiresAt,
      action: message.action,
      memo: message.memo,
    });

    // SPKI wrap for raw 32-byte Ed25519 public key
    const spkiPrefix = Buffer.from("302a300506032b6570032100", "hex");
    const spki = Buffer.concat([spkiPrefix, proofPubkey]);
    const keyObject = createPublicKey({ key: spki, format: "der", type: "spki" });
    const ok = cryptoVerify(null, publicHash, keyObject, proof);
    if (!ok) return { ok: false, reason: "Ed25519 proof verification failed" };

    return {
      ok: true,
      publicInputsHash: toHex(publicHash),
      binding: toHex(binding),
    };
  } catch (err) {
    return { ok: false, reason: err instanceof Error ? err.message : String(err) };
  }
}
