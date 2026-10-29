import test from "node:test";
import assert from "node:assert/strict";
import {
  agentSlugFromName,
  createAgentForge,
  frameworkCapabilities,
  platforms,
  planOmniAgentMint,
  planOmniIdentityLink,
  provisionalOmniAgentId,
  OMNI_MINT_PLAN_VERSION,
  getCanonicalContract,
  MSG_ZK_OMNI,
} from "../src/index.js";

const BASE = {
  name: "Omni Musebook Scout",
  description: "Dual-rail agent on Solana Metaplex + Robinhood ERC-8004",
  image: "ipfs://bafy-omni-example",
  services: [{ name: "MCP", endpoint: "https://example.test/mcp" }],
  ownerPubkey: "11111111111111111111111111111112",
};

test("agentSlugFromName normalizes and rejects empty", () => {
  assert.equal(agentSlugFromName("Omni Musebook Scout"), "omni-musebook-scout");
  assert.throws(() => agentSlugFromName("!!!"), /non-empty/);
});

test("provisionalOmniAgentId is stable bytes32", () => {
  const a = provisionalOmniAgentId("omni-musebook-scout");
  const b = provisionalOmniAgentId("omni-musebook-scout");
  assert.equal(a, b);
  assert.match(a, /^0x[0-9a-f]{64}$/);
});

test("planOmniAgentMint builds dual-rail local plan with Metaplex + ERC-8004", () => {
  const plan = planOmniAgentMint({
    ...BASE,
    chainId: 46630,
    solanaNetwork: "solana-devnet",
  });
  assert.equal(plan.kind, "omni-agent-mint");
  assert.equal(plan.version, OMNI_MINT_PLAN_VERSION);
  assert.deepEqual([...plan.rails], ["solana", "robinhood"]);
  assert.equal(plan.agent.agentSlug, "omni-musebook-scout");

  // Robinhood rail
  const pinned = getCanonicalContract(46630, "identity");
  assert.equal(plan.robinhood.vm, "evm");
  assert.equal(plan.robinhood.chainId, 46630);
  assert.equal(plan.robinhood.to, pinned.address);
  assert.match(plan.robinhood.data, /^0x/);
  assert.equal(plan.robinhood.canonicalRegistry, true);
  assert.ok(
    plan.robinhood.registration.registrations.some((r) => r.agentRegistry === "musebook-omni"),
  );

  // Solana rail
  assert.equal(plan.solana.mintPath, "metaplex-api-preferred");
  assert.equal(plan.solana.network, "solana-devnet");
  assert.equal(plan.solana.metaplexMintInput.agentMetadata.type, "agent");
  assert.ok(
    plan.solana.metaplexMintInput.agentMetadata.registrations.some(
      (r) => r.agentRegistry === "robinhood-erc8004",
    ),
  );
  assert.equal(plan.solana.sponsoredMintReady, true);

  // Omni link provisional
  assert.equal(plan.omniLink.status, "provisional");
  assert.equal(plan.omniLink.plan.msgType, MSG_ZK_OMNI);
  assert.equal(plan.omniLink.plan.message?.action || plan.omniLink.plan.action, "dual_identity_link");
  assert.ok(plan.executionOrder.length >= 4);
  assert.equal(plan.safety.neverCustodiesKeys, true);
  assert.equal(plan.safety.identityIsNotFungibleToken, true);
});

test("planOmniAgentMint requires confirmMainnet for RH 4663", () => {
  assert.throws(
    () => planOmniAgentMint({ ...BASE, chainId: 4663 }),
    /confirmMainnet/,
  );
  const plan = planOmniAgentMint({ ...BASE, chainId: 4663, confirmMainnet: true });
  assert.equal(plan.robinhood.chainId, 4663);
  assert.equal(plan.safety.mainnetConfirmed, true);
});

test("planOmniAgentMint can skip zk-omni provisional link", () => {
  const plan = planOmniAgentMint({ ...BASE, chainId: 46630, linkOmni: false });
  assert.equal(plan.omniLink, null);
});

test("planOmniIdentityLink binds solana asset + rh agent id", () => {
  const link = planOmniIdentityLink({
    solanaAsset: "So11111111111111111111111111111111111111112",
    rhAgentId: 42,
    chainId: 4663,
    controllerAddress: "0xA11CE00000000000000000000000000000000001",
  });
  assert.equal(link.kind, "omni-identity-link");
  assert.equal(link.rhAgentId, "42");
  assert.equal(link.solanaAsset, "So11111111111111111111111111111111111111112");
  assert.match(link.payloadCommitment, /^0x[0-9a-f]{64}$/);
  assert.equal(link.plan.msgType, MSG_ZK_OMNI);
  assert.ok(link.next.length >= 2);
});

test("createAgentForge exposes planOmniMint and platform=omni prepare", async () => {
  const forge = createAgentForge({ baseUrl: "https://example.test" });
  assert.equal(typeof forge.planOmniMint, "function");
  assert.equal(typeof forge.planOmniIdentityLink, "function");
  const plan = await forge.prepare({
    platform: "omni",
    ...BASE,
    chainId: 46630,
    linkOmni: false,
  });
  assert.equal(plan.kind, "omni-agent-mint");
  assert.equal(frameworkCapabilities.omni.dualRailPlan, true);
  assert.equal(frameworkCapabilities.omni.zkOmniLink, true);
  assert.deepEqual([...platforms.omni.rails], ["solana", "robinhood"]);
  assert.equal(platforms.omni.link, "zk-omni-msgtype-4");
});
