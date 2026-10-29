import test from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync, sign } from "node:crypto";
import {
  assertCanonicalRuntimeCode,
  assertSponsoredMintAuthorization,
  buildRegistration,
  buildSponsoredMintAuthorization,
  canonicalDeployments,
  createAgentForge,
  createMusebookClient,
  frameworkCapabilities,
  getCanonicalContract,
  inspectCanonicalRuntimeCode,
  normalizeSponsoredMintIntent,
  prepareCanonicalEvmRegistration,
  prepareEvmRegistration,
  serializeSponsoredMintRequest,
} from "../src/index.js";

const registration = {
  name: "Researcher",
  description: "Research agent",
  image: "ipfs://bafy",
  services: [],
};

const BASE58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

function encodeBase58(bytes) {
  let value = BigInt(`0x${Buffer.from(bytes).toString("hex")}`);
  let encoded = "";
  while (value > 0n) {
    encoded = BASE58[Number(value % 58n)] + encoded;
    value /= 58n;
  }
  for (const byte of bytes) {
    if (byte !== 0) break;
    encoded = `1${encoded}`;
  }
  return encoded || "1";
}

function signedMint(now = Date.now()) {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const publicDer = publicKey.export({ type: "spki", format: "der" });
  const input = {
    ownerPubkey: encodeBase58(publicDer.subarray(-32)),
    name: "  Open   Research Agent ",
    symbol: "ora!",
    description: "Publishes verifiable research.",
    agentType: "research",
    personality: "precise",
    capabilities: ["research", "MCP"],
    imageUri: "ipfs://bafy-example",
    registrationDoc: "agent registration",
  };
  const authorization = buildSponsoredMintAuthorization(input, now);
  return {
    ...input,
    walletMessage: authorization.message,
    walletSignature: sign(null, Buffer.from(authorization.message, "utf8"), privateKey).toString("base64"),
  };
}

test("builds bounded ERC-8004 registration metadata", () => {
  const document = buildRegistration({
    ...registration,
    services: [{ name: "MCP", endpoint: "https://example.test/mcp", skills: ["research"] }],
    supportedTrust: ["reputation", "validation"],
  });
  assert.equal(document.type, "https://eips.ethereum.org/EIPS/eip-8004#registration-v1");
  assert.deepEqual(document.registrations, []);
  assert.deepEqual(document.supportedTrust, ["reputation", "validation"]);
  assert.throws(() => buildRegistration({ ...registration, services: "not-an-array" }), /services must be an array/);
});

test("builds a reviewable explicit EVM intent without claiming an arbitrary registry is canonical", () => {
  const intent = prepareEvmRegistration({
    ...registration,
    registry: "0x0000000000000000000000000000000000000001",
  });
  assert.equal(intent.vm, "evm");
  assert.match(intent.data, /^0x/);
  assert.equal(intent.value, "0x0");
  assert.equal(intent.canonicalRegistry, false);
  assert.equal(intent.expectedRuntimeCodeHash, null);
});

test("fails closed without a valid nonzero registry", () => {
  assert.throws(() => prepareEvmRegistration({ ...registration }), /trusted registry/);
  assert.throws(
    () => prepareEvmRegistration({
      ...registration,
      registry: "0x0000000000000000000000000000000000000000",
    }),
    /nonzero trusted registry/,
  );
});

test("canonical EVM preparation consumes reviewed address and runtime pins", () => {
  const intent = prepareCanonicalEvmRegistration({ ...registration, chainId: 4663 });
  const pinned = getCanonicalContract(4663, "identity");
  assert.equal(intent.to, pinned.address);
  assert.equal(intent.canonicalRegistry, true);
  assert.equal(intent.expectedRuntimeCodeHash, pinned.runtimeCodeHash);
  assert.equal(intent.expectedRuntimeBytes, pinned.runtimeBytes);
});

test("canonical manifests pin both suites and immutable registry bindings", () => {
  assert.deepEqual(Object.keys(canonicalDeployments).sort(), ["4663", "46630"]);
  assert.equal(
    canonicalDeployments[4663].contracts.identity.address,
    "0x70361a37951d66f8c44cfb45873df2ba8b9fc950",
  );
  assert.equal(
    canonicalDeployments[46630].contracts.reputation.createTx,
    "0xe21f750118bea24f8da1e5475e41bf588dba55b94c721ced219592ec26f7bab6",
  );
  for (const deployment of Object.values(canonicalDeployments)) {
    assert.equal(deployment.contracts.reputation.identityRegistry, deployment.contracts.identity.address);
    assert.equal(deployment.contracts.validation.identityRegistry, deployment.contracts.identity.address);
    assert.equal(deployment.verification.allRuntimeCodeHashesMatch, true);
    assert.ok(deployment.broadcastBlockedTargets.includes("cheshire-agent-registries"));
  }
});

test("runtime verification fails closed on missing or unexpected bytecode", () => {
  const result = inspectCanonicalRuntimeCode({ chainId: 4663, contract: "identity", runtimeCode: "0x" });
  assert.equal(result.matches, false);
  assert.equal(result.actualRuntimeCodeHash, null);
  assert.throws(
    () => assertCanonicalRuntimeCode({ chainId: 4663, contract: "identity", runtimeCode: "0x1234" }),
    /Runtime code mismatch/,
  );
});

test("builds and verifies the exact fresh CLAWD_AGENT_MINT_V2 authorization", () => {
  const now = 1_800_000_000_000;
  const input = signedMint(now);
  const verified = assertSponsoredMintAuthorization(input, { now });
  assert.equal(verified.intent.name, "Open Research Agent");
  assert.equal(verified.intent.symbol, "ORA");
  assert.match(verified.message, /^CLAWD_AGENT_MINT_V2\n/);
  assert.match(verified.message, /\nintent-sha256:[a-f0-9]{64}$/);
});

test("rejects stale, tampered, noncanonical, and placeholder Solana authorizations", () => {
  const now = 1_800_000_000_000;
  const valid = signedMint(now);
  assert.throws(
    () => assertSponsoredMintAuthorization(valid, { now: now + 5 * 60_000 + 1 }),
    /expired/,
  );
  assert.throws(
    () => assertSponsoredMintAuthorization({ ...valid, description: "tampered" }, { now }),
    /does not approve/,
  );
  assert.throws(
    () => assertSponsoredMintAuthorization({ ...valid, walletSignature: valid.walletSignature.replace(/=+$/, "") }, { now }),
    /canonical base64/,
  );
  assert.throws(
    () => assertSponsoredMintAuthorization({
      ...valid,
      walletMessage: "REPLACE_WITH_FRESH_CLAWD_AGENT_MINT_V2_MESSAGE",
      walletSignature: "REPLACE_WITH_BASE64_SIGNATURE",
    }, { now }),
    /canonical CLAWD_AGENT_MINT_V2/,
  );
});

test("SDK registrationUri alias serializes to the server-recognized customRegistrationUri field", () => {
  const base = {
    ownerPubkey: "11111111111111111111111111111111",
    name: "Agent",
    agentType: "general",
  };
  const normalized = normalizeSponsoredMintIntent({ ...base, registrationUri: "https://used.test" });
  assert.equal(normalized.registrationUri, "https://used.test");
  const request = serializeSponsoredMintRequest(
    { ...base, registrationUri: "https://used.test", walletMessage: "message", walletSignature: "signature" },
    normalized,
  );
  assert.equal(request.customRegistrationUri, normalized.registrationUri);
  assert.equal("registrationUri" in request, false);
  assert.equal(
    normalizeSponsoredMintIntent({ ...base, customRegistrationUri: "https://used.test" }).registrationUri,
    "https://used.test",
  );
});

test("does not disguise a live Solana Core mint as preparation", async () => {
  const forge = createAgentForge({ baseUrl: "https://example.test" });
  await assert.rejects(() => forge.prepare({ platform: "solana" }), /live write/);
  await assert.rejects(() => forge.prepare({ platform: "unknown" }), /platform must be/);
  assert.equal(frameworkCapabilities.robinhood.fungibleAgentTokenLaunch, false);
  assert.equal(frameworkCapabilities.solana.fungibleAgentTokenLaunch, "available");
  assert.equal(frameworkCapabilities.solana.metaplexApiMint, true);
  assert.equal(frameworkCapabilities.solana.liveFeedReport, true);
});

test("hosted client returns dynamic rail status and sends API authentication", async () => {
  const observed = [];
  const fetchImpl = async (url, init) => {
    observed.push({ url: String(url), init });
    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };
  const client = createMusebookClient({
    baseUrl: "https://example.test",
    apiKey: "test-key",
    fetchImpl,
  });
  const capabilities = await client.capabilities();
  assert.equal(capabilities.framework, frameworkCapabilities);
  assert.deepEqual(observed.map((entry) => entry.url), [
    "https://example.test/api/robinhood/agents/config",
    "https://example.test/api/metaplex-agents/health",
  ]);
  for (const entry of observed) {
    assert.equal(entry.init.credentials, "include");
    assert.equal(entry.init.headers.get("authorization"), "Bearer test-key");
  }
});

test("hosted mint validates wallet authorization before any network request", async () => {
  let called = false;
  const client = createMusebookClient({
    baseUrl: "https://example.test",
    fetchImpl: async () => {
      called = true;
      return new Response("{}", { status: 200 });
    },
  });
  assert.throws(
    () => client.mintSolana({
      ownerPubkey: "placeholder",
      walletMessage: "placeholder",
      walletSignature: "placeholder",
    }),
    /CLAWD_AGENT_MINT_V2/,
  );
  assert.equal(called, false);
});

test("hosted mint submits the exact signed registration URI under customRegistrationUri", async () => {
  const input = signedMint();
  input.registrationUri = "https://example.test/agent.json";
  delete input.registrationDoc;
  const authorization = buildSponsoredMintAuthorization(input);

  // signedMint generated a different key, so construct a fresh signed fixture
  // specifically for the registrationUri alias.
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const publicDer = publicKey.export({ type: "spki", format: "der" });
  const aliasInput = {
    ...input,
    ownerPubkey: encodeBase58(publicDer.subarray(-32)),
  };
  const aliasAuthorization = buildSponsoredMintAuthorization(aliasInput);
  aliasInput.walletMessage = aliasAuthorization.message;
  aliasInput.walletSignature = sign(
    null,
    Buffer.from(aliasAuthorization.message, "utf8"),
    privateKey,
  ).toString("base64");

  let body;
  const client = createMusebookClient({
    baseUrl: "https://example.test",
    fetchImpl: async (_url, init) => {
      body = JSON.parse(init.body);
      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    },
  });
  await client.mintSolana(aliasInput);
  assert.equal(body.customRegistrationUri, aliasAuthorization.intent.registrationUri);
  assert.equal("registrationUri" in body, false);
  assert.equal(body.walletMessage, aliasAuthorization.message);
  assert.equal(authorization.intent.registrationUri, "https://example.test/agent.json");
});
