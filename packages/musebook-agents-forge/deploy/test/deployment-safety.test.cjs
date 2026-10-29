"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const {
  assertRegistryBroadcastAvailable,
  probeRpcChainId,
  resolveRpcUrl,
  validateDeploymentIntent,
} = require("../scripts/deployment-safety.cjs");

const AUDIT_DIGEST = `0x${"a".repeat(64)}`;
const QUOTA_RPC = "https://robinhood-mainnet.g.alchemy.com/v2/test-key";

function mainnet(overrides = {}) {
  return {
    expectedChainId: 4663,
    rpcUrl: QUOTA_RPC,
    mode: "broadcast",
    quotaBacked: true,
    confirmation: "DEPLOY ROBINHOOD MAINNET 4663",
    auditSha256: AUDIT_DIGEST,
    ...overrides,
  };
}

test("only explicit Robinhood chain IDs are accepted", () => {
  assert.throws(() => validateDeploymentIntent(mainnet({ expectedChainId: 1 })), /expected 4663 or 46630/);
  assert.throws(() => validateDeploymentIntent(mainnet({ expectedChainId: "" })), /explicit decimal/);
});

test("dry-runs allow local HTTP forks without broadcast approvals", () => {
  const result = validateDeploymentIntent({
    expectedChainId: 46630,
    rpcUrl: "http://127.0.0.1:8545",
    mode: "dry-run",
  });
  assert.equal(result.mode, "dry-run");
  assert.equal(result.chainId, 46630);
});

test("broadcast requires exact chain-specific confirmation", () => {
  assert.throws(() => validateDeploymentIntent(mainnet({ confirmation: "yes" })), /must exactly equal/);
  assert.doesNotThrow(() => validateDeploymentIntent(mainnet()));
});

test("mainnet broadcast rejects public RPC and missing production attestations", () => {
  assert.throws(
    () => validateDeploymentIntent(mainnet({ rpcUrl: "https://rpc.mainnet.chain.robinhood.com" })),
    /rate-limited public RPC/,
  );
  assert.throws(() => validateDeploymentIntent(mainnet({ quotaBacked: false })), /RH_RPC_IS_QUOTA_BACKED=1/);
  assert.throws(() => validateDeploymentIntent(mainnet({ auditSha256: "" })), /DEPLOYMENT_AUDIT_SHA256/);
});

test("testnet broadcast still requires an exact confirmation", () => {
  const intent = {
    expectedChainId: 46630,
    rpcUrl: "https://rpc.testnet.chain.robinhood.com",
    mode: "broadcast",
    confirmation: "DEPLOY ROBINHOOD TESTNET 46630",
  };
  assert.doesNotThrow(() => validateDeploymentIntent(intent));
  assert.throws(
    () => validateDeploymentIntent({ ...intent, confirmation: "DEPLOY ROBINHOOD MAINNET 4663" }),
    /must exactly equal/,
  );
});

test("mainnet RPC resolution never falls back to a public endpoint", () => {
  assert.throws(() => resolveRpcUrl(4663, {}), /never a deploy fallback/);
  assert.equal(resolveRpcUrl(46630, {}), "https://rpc.testnet.chain.robinhood.com");
});

test("RPC chain probe accepts hex chain IDs and rejects malformed results", async () => {
  const fetchOk = async () => ({
    ok: true,
    status: 200,
    json: async () => ({ jsonrpc: "2.0", id: 1, result: "0x1237" }),
  });
  assert.equal(await probeRpcChainId(QUOTA_RPC, fetchOk), 4663);

  const fetchBad = async () => ({
    ok: true,
    status: 200,
    json: async () => ({ jsonrpc: "2.0", id: 1, result: "4663" }),
  });
  await assert.rejects(probeRpcChainId(QUOTA_RPC, fetchBad), /invalid eth_chainId/);
});

test("shipped canonical manifests block duplicate namespace broadcasts", () => {
  assert.throws(() => assertRegistryBroadcastAvailable(4663), /already deployed/);
  assert.throws(() => assertRegistryBroadcastAvailable(46630), /already deployed/);
});

test("a fork with no canonical manifest can perform a guarded first deployment", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "robinhood-agents-safety-"));
  try {
    assert.deepEqual(assertRegistryBroadcastAvailable(46630, root), { chainId: 46630, available: true });
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
