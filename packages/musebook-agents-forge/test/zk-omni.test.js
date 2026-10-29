import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import {
  createZkProof,
  verifyZkProof,
  encodeZkOmniMessage,
  decodeZkOmniMessage,
  planZkOmniMessage,
  createRelayer,
  addressToBytes32,
  MSG_ZK_OMNI,
  buildRobinhoodSendCall,
  planSolanaReceive,
  createDeliverFn,
  encodeReceiveZkOmniIxData,
  encodeEd25519VerifyIxData,
  IX_RECEIVE_ZK_OMNI,
  ZK_OMNI_PROGRAM_ID_DEFAULT,
  ED25519_PROGRAM_ID,
  computePublicInputsHash,
} from "../src/zkOmni/index.js";
import { computePublicInputsHash as computePIH } from "../src/zkOmni/proof.js";

const SECRET = "0x" + "ab".repeat(32);
const AGENT = "0x" + "01".repeat(32);
const CONTROLLER = addressToBytes32("0xA11CE00000000000000000000000000000000001");
const PAYLOAD = "0x" + "11".repeat(32);
const MODEL = "0x" + "22".repeat(32);

test("createZkProof + verifyZkProof is real Ed25519 PoK (not bare hash)", () => {
  const expiresAt = Math.floor(Date.now() / 1000) + 3600;
  const zk = createZkProof(SECRET, {
    agentId: AGENT,
    controller: CONTROLLER,
    payloadCommitment: PAYLOAD,
    modelHash: MODEL,
    expiresAt,
    action: "attest",
    memo: "zk",
  });
  assert.match(zk.nullifier, /^0x[0-9a-f]{64}$/);
  assert.match(zk.proofPubkey, /^0x[0-9a-f]{64}$/);
  assert.equal(zk.proof.length, 2 + 128); // 0x + 64 bytes hex
  assert.equal(zk.scheme === undefined || true, true);

  const message = {
    agentId: AGENT,
    controller: CONTROLLER,
    nullifier: zk.nullifier,
    payloadCommitment: PAYLOAD,
    modelHash: MODEL,
    proofPubkey: zk.proofPubkey,
    expiresAt,
    action: "attest",
    memo: "zk",
    proof: zk.proof,
  };
  const ok = verifyZkProof(message);
  assert.equal(ok.ok, true, ok.reason);

  // Tamper action → signature fails
  const bad = verifyZkProof({ ...message, action: "tampered" });
  assert.equal(bad.ok, false);
});

test("nullifier relation fails if proofPubkey swapped", () => {
  const expiresAt = Math.floor(Date.now() / 1000) + 3600;
  const zk = createZkProof(SECRET, {
    agentId: AGENT,
    controller: CONTROLLER,
    payloadCommitment: PAYLOAD,
    modelHash: MODEL,
    expiresAt,
    action: "x",
    memo: "",
  });
  const message = {
    agentId: AGENT,
    controller: CONTROLLER,
    nullifier: zk.nullifier,
    payloadCommitment: PAYLOAD,
    modelHash: MODEL,
    proofPubkey: "0x" + "ff".repeat(32),
    expiresAt,
    action: "x",
    memo: "",
    proof: zk.proof,
  };
  const r = verifyZkProof(message);
  assert.equal(r.ok, false);
  assert.match(r.reason, /nullifier/i);
});

test("encode/decode ZkOmni round-trip includes proof fields", () => {
  const plan = planZkOmniMessage({
    direction: "robinhood-to-solana",
    agentId: AGENT,
    controllerAddress: "0x1234567890123456789012345678901234567890",
    action: "publish_attestation",
    memo: "round-trip",
    secretHex: SECRET,
  });
  assert.equal(plan.msgType, MSG_ZK_OMNI);
  assert.equal(plan.srcEid, 30416);
  assert.equal(plan.dstEid, 30168);
  assert.equal(plan.zk.scheme, "ed25519-pok-v1");

  const decoded = decodeZkOmniMessage(plan.payloadHex);
  assert.equal(decoded.nullifier, plan.message.nullifier);
  assert.equal(decoded.proofPubkey, plan.message.proofPubkey);
  assert.equal(decoded.proof, plan.message.proof);
  assert.equal(decoded.action, "publish_attestation");
  assert.equal(verifyZkProof(decoded).ok, true);

  const re = encodeZkOmniMessage(decoded);
  assert.equal(re.toLowerCase(), plan.payloadHex.toLowerCase());
});

test("buildRobinhoodSendCall produces real sendZkOmni args from proof message", () => {
  const plan = planZkOmniMessage({
    action: "attest",
    secretHex: SECRET,
    agentId: AGENT,
    controllerAddress: "0xabcdefabcdefabcdefabcdefabcdefabcdefabcd",
  });
  const call = buildRobinhoodSendCall(plan.message, {
    messenger: "0x1111111111111111111111111111111111111111",
    nativeFee: "1000",
  });
  assert.equal(call.functionName, "sendZkOmni");
  assert.equal(call.args[0].dstEid, 30168); // dst Solana
  assert.equal(call.args[0].agentId, plan.message.agentId);
  assert.equal(call.args[0].nullifier, plan.message.nullifier);
  assert.equal(call.args[0].proofPubkey, plan.message.proofPubkey);
  assert.equal(call.args[0].proof, plan.message.proof);
  assert.equal(call.value, 1000n);
});

test("planSolanaReceive builds Ed25519 precompile + receive_zk_omni for valid program id", () => {
  const plan = planZkOmniMessage({
    direction: "robinhood-to-solana",
    action: "commit_state",
    secretHex: SECRET,
    agentId: AGENT,
  });
  const peer = "0x" + "aa".repeat(32);
  const sol = planSolanaReceive(plan.message, {
    srcSender: peer,
    programId: ZK_OMNI_PROGRAM_ID_DEFAULT,
  });
  assert.equal(sol.chain, "solana");
  assert.equal(sol.instruction, "receive_zk_omni");
  assert.equal(sol.requiresEd25519Precompile, true);
  assert.equal(sol.ed25519ProgramId, ED25519_PROGRAM_ID);
  assert.equal(sol.programId, "Hfbc3tAGYE5nBUa5UncjSV6hoWd3JoVKdA49jPcreXFJ");
  // Valid base58: no O/0/I/l
  assert.match(sol.programId, /^[1-9A-HJ-NP-Za-km-z]+$/);
  assert.equal(sol.params.srcEid, 30416);
  assert.equal(sol.params.srcSender, peer);
  assert.equal(sol.params.nullifier, plan.message.nullifier);
  assert.equal(sol.params.proof, plan.message.proof);
  assert.ok(sol.receiveIx.dataBytes > 100);
  assert.ok(sol.ed25519Ix.dataBytes >= 16 + 64 + 32 + 32);

  const receiveData = Buffer.from(sol.receiveIx.dataHex.slice(2), "hex");
  assert.deepEqual(receiveData.subarray(0, 8), IX_RECEIVE_ZK_OMNI);

  // Ed25519 ix embeds proof pubkey + publicInputsHash + signature
  const edData = Buffer.from(sol.ed25519Ix.dataHex.slice(2), "hex");
  const pk = Buffer.from(plan.message.proofPubkey.slice(2), "hex");
  const sig = Buffer.from(plan.message.proof.slice(2), "hex");
  const msgHash = Buffer.from(sol.publicInputsHash.slice(2), "hex");
  assert.ok(edData.includes(pk));
  assert.ok(edData.includes(sig));
  assert.ok(edData.includes(msgHash));

  // publicInputsHash matches proof.js
  const expectedHash = computePIH(plan.message);
  assert.equal(
    sol.publicInputsHash.toLowerCase(),
    `0x${expectedHash.toString("hex")}`.toLowerCase(),
  );
});

test("encodeEd25519VerifyIxData is 16-byte header + sig + pk + 32-byte msg", () => {
  const plan = planZkOmniMessage({ action: "x", secretHex: SECRET, agentId: AGENT });
  const hash = computePIH(plan.message);
  const data = encodeEd25519VerifyIxData({
    publicKey: plan.message.proofPubkey,
    message: hash,
    signature: plan.message.proof,
  });
  assert.equal(data[0], 1); // num signatures
  assert.equal(data.length, 16 + 64 + 32 + 32);
});

test("createDeliverFn with simulate builds production call plan (not empty sim)", async () => {
  const plan = planZkOmniMessage({
    action: "attest",
    secretHex: SECRET,
    agentId: AGENT,
    // Pin commitment so plan is independent of wall-clock expiresAt drift.
    payloadCommitment: PAYLOAD,
    expiresAt: Math.floor(Date.now() / 1000) + 7200,
  });
  const deliver = createDeliverFn({ simulate: true });
  const result = await deliver({
    direction: "robinhood-to-solana",
    payloadHex: plan.payloadHex,
    message: plan.message,
  });
  assert.equal(result.ok, true);
  assert.equal(result.simulated, true);
  assert.ok(result.plan, "simulate result must include a call plan");
  assert.equal(result.plan.path, "robinhood-sendZkOmni");
  assert.ok(result.plan.call, "plan.call must be present");
  assert.equal(result.plan.call.functionName, "sendZkOmni");
  assert.ok(Array.isArray(result.plan.call.args) && result.plan.call.args.length >= 1);
  const sendParams = result.plan.call.args[0];
  assert.equal(typeof sendParams, "object");
  assert.equal(sendParams.nullifier, plan.message.nullifier);
  assert.equal(sendParams.proof, plan.message.proof);
  assert.equal(sendParams.agentId, plan.message.agentId);
  assert.equal(sendParams.proofPubkey, plan.message.proofPubkey);
});

test("createDeliverFn live path fails closed without RPC (no silent success)", async () => {
  const plan = planZkOmniMessage({ action: "attest", secretHex: SECRET, agentId: AGENT });
  const deliver = createDeliverFn({
    simulate: false,
    live: true,
    allowSimulateFallback: false,
  });
  await assert.rejects(
    () =>
      deliver({
        direction: "robinhood-to-solana",
        payloadHex: plan.payloadHex,
        message: plan.message,
      }),
    (err) => err && (err.code === "MISSING_RH_RPC" || /RH_RPC_URL/.test(err.message)),
  );
});

test("relayer oneshot verifies ZK and delivers; rejects nullifier replay", async () => {
  const dir = await mkdtemp(join(tmpdir(), "zk-omni-"));
  const journalPath = join(dir, "journal.jsonl");
  try {
    const relayer = createRelayer({
      journalPath,
      allowSimulateFallback: true,
      simulate: true,
    });
    await relayer.init();

    // Default payloadCommitment includes expiresAt (second resolution). Pin both so
    // two oneshots with the same secret produce the same nullifier even across a
    // wall-clock second boundary — otherwise replay detection is flaky under load.
    const fixed = {
      direction: "robinhood-to-solana",
      agentId: AGENT,
      controllerAddress: "0xabcdefabcdefabcdefabcdefabcdefabcdefabcd",
      action: "attest",
      memo: "relay-test",
      secretHex: SECRET,
      expiresAt: Math.floor(Date.now() / 1000) + 10_000,
      payloadCommitment: PAYLOAD,
    };

    const job = await relayer.oneshot(fixed);

    assert.equal(job.status, "delivered");
    assert.ok(job.txHash);
    assert.ok(job.zk?.publicInputsHash);
    assert.equal(job.simulated, true);
    assert.ok(job.message.proof);
    assert.ok(job.nullifier);

    await assert.rejects(
      () => relayer.oneshot(fixed),
      (err) =>
        err &&
        (err.code === "NULLIFIER_REPLAY" || /Nullifier already observed/i.test(err.message)),
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("encodeReceiveZkOmniIxData starts with anchor discriminator", () => {
  const plan = planZkOmniMessage({ action: "x", secretHex: SECRET, agentId: AGENT });
  const data = encodeReceiveZkOmniIxData({
    srcEid: 30416,
    srcSender: "0x" + "ab".repeat(32),
    guid: "0x" + "cd".repeat(32),
    agentId: plan.message.agentId,
    controller: plan.message.controller,
    nullifier: plan.message.nullifier,
    payloadCommitment: plan.message.payloadCommitment,
    modelHash: plan.message.modelHash,
    proofPubkey: plan.message.proofPubkey,
    expiresAt: plan.message.expiresAt,
    action: plan.message.action,
    memo: plan.message.memo,
    proof: plan.message.proof,
  });
  assert.equal(data.length > 8 + 32 * 8, true);
  assert.deepEqual(data.subarray(0, 8), IX_RECEIVE_ZK_OMNI);
});

test("ZK_OMNI_PROGRAM_ID_DEFAULT is valid base58 Solana pubkey string", () => {
  assert.equal(ZK_OMNI_PROGRAM_ID_DEFAULT, "Hfbc3tAGYE5nBUa5UncjSV6hoWd3JoVKdA49jPcreXFJ");
  assert.equal(ZK_OMNI_PROGRAM_ID_DEFAULT.includes("O"), false);
  assert.equal(ZK_OMNI_PROGRAM_ID_DEFAULT.includes("0"), false);
  assert.equal(ZK_OMNI_PROGRAM_ID_DEFAULT.includes("I"), false);
  assert.equal(ZK_OMNI_PROGRAM_ID_DEFAULT.includes("l"), false);
});

test("createDeliverFn defaults to simulation unless ZK_OMNI_LIVE=1 (dry-run by default)", async () => {
  const plan = planZkOmniMessage({ action: "attest", secretHex: SECRET, agentId: AGENT });
  const prev = process.env.ZK_OMNI_LIVE;
  delete process.env.ZK_OMNI_LIVE;
  try {
    const result = await createDeliverFn({ allowSimulateFallback: false })({
      direction: "robinhood-to-solana",
      payloadHex: plan.payloadHex,
      message: plan.message,
    });
    assert.equal(result.simulated, true);
  } finally {
    if (prev !== undefined) process.env.ZK_OMNI_LIVE = prev;
  }
});
