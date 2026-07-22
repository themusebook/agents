import { createHash, createPublicKey, verify as verifySignature } from "node:crypto";
import { encodeFunctionData, isAddress } from "viem";
import {
  assertCanonicalRuntimeCode,
  canonicalDeployments,
  getCanonicalContract,
  getCanonicalDeployment,
  inspectCanonicalRuntimeCode,
} from "./deployments.js";

export {
  assertCanonicalRuntimeCode,
  canonicalDeployments,
  getCanonicalContract,
  getCanonicalDeployment,
  inspectCanonicalRuntimeCode,
};

export {
  AGENTS_DIR,
  LOCALES_DIR,
  SCHEMA_PATH,
  PACKAGE_ROOT,
  estimateTokenUsage,
  loadCheshireSchema,
  validateCheshireAgent,
  listCatalogIdentifiers,
  loadCatalog,
  validateCatalog,
  convertCharacterToCheshireAgent,
  normalizeDefiAgent,
  characterIdentifierFromStem,
  expectedCatalogIdentifiers,
  localeCodeFromFilename,
  listLocaleAgentIds,
  listLocalesForAgent,
  loadLocaleOverlay,
  applyLocaleOverlay,
  loadAgentWithLocale,
  summarizeLocales,
} from "./agentCatalog.js";

export {
  PACKAGE_CATALOG,
  listPackageIds,
  resolvePackageDir,
  inspectPackages,
  readInstallMarker,
  oneshotInstallHints,
} from "./packagesCatalog.js";

export {
  CLAWDBOT_GO_NPM,
  CLAWDBOT_GO_NPM_URL,
  CLAWDBOT_GO_REGISTRY_LATEST,
  ZERO_CLAWD_HOSTED_URL,
  ZERO_CLAWD_DEFAULT_AGENT_BASE,
  EXTERNAL_PACKAGE_CATALOG,
  clawdbotGoInstallHints,
  listExternalPackageIds,
  getExternalPackage,
  planClawdbotInstall,
  runClawdbotInstall,
} from "./clawdbotBridge.js";

export {
  RH_CRYPTO_AGENT_PACK_DIR,
  RH_CRYPTO_AGENT_PACK_INDEX_PATH,
  RH_CRYPTO_AGENT_CATALOG_PATH,
  RH_SKILLS_SUITE_DIR,
  RH_SKILLS_SUITE_INDEX_PATH,
  loadRhCryptoAgentPackIndex,
  getRhCryptoAgentSkillsDir,
  listRhCryptoAgentSkillIds,
  inspectRhCryptoAgentPack,
  loadRhCryptoAgentCatalog,
  listSkillDirectoriesWithSkillMd,
  clawdbotSkillsDirExportLine,
  loadRhSkillsSuiteIndex,
  listRhSkillsSuiteIds,
  inspectRhSkillsSuite,
  clawdbotSuiteSkillsDirExportLine,
} from "./skillPack.js";

import {
  MSG_ZK_OMNI,
  EID_SOLANA_MAINNET,
  EID_ROBINHOOD_MAINNET,
  computeOmniNullifier,
  randomSecretHex,
  payloadCommitmentFrom,
  encodeZkOmniMessage,
  decodeZkOmniMessage,
  addressToBytes32,
  planZkOmniMessage,
  verifyZkProof,
  createZkProof,
  RELAY_STATUSES,
  ZkOmniJournal,
  ZkOmniRelayer,
  createRelayer,
  buildRobinhoodSendCall,
  deliverJob,
  createDeliverFn,
  planSolanaReceive,
  ZK_OMNI_PROGRAM_ID_DEFAULT,
} from "./zkOmni/index.js";

export {
  MSG_ZK_OMNI,
  EID_SOLANA_MAINNET,
  EID_ROBINHOOD_MAINNET,
  computeOmniNullifier,
  randomSecretHex,
  payloadCommitmentFrom,
  encodeZkOmniMessage,
  decodeZkOmniMessage,
  addressToBytes32,
  planZkOmniMessage,
  verifyZkProof,
  createZkProof,
  RELAY_STATUSES,
  ZkOmniJournal,
  ZkOmniRelayer,
  createRelayer,
  buildRobinhoodSendCall,
  deliverJob,
  createDeliverFn,
  planSolanaReceive,
  ZK_OMNI_PROGRAM_ID_DEFAULT,
};

/** Published npm package identity for Cheshire Terminal Agents. */
export const PACKAGE_NAME = "cheshire-terminal-agents";
export const PACKAGE_VERSION = "1.48.0";
export const HUB_URL = "https://cheshireterminal.ai/agents";
export const FORGE_URL = "https://cheshireterminal.ai/agents/forge";
export const LIVE_FEED_URL = "https://cheshireterminal.ai/agents/live";
export const MINT_URL = "https://cheshireterminal.ai/agents/mint";
export const ZERO_CLAWD_URL = "https://cheshireterminal.ai/zeroclawd";
export const CATALOG_API = "https://cheshireterminal.ai/api/clawd/browser-agents";

/** Dual-rail omni mint plan schema version (Solana Metaplex + RH ERC-8004 + optional zk-omni). */
export const OMNI_MINT_PLAN_VERSION = 1;

export const platforms = Object.freeze({
  robinhood: Object.freeze({
    vm: "evm",
    chainId: 4663,
    testnetChainId: 46630,
    identityAsset: "ERC-721 ERC-8004 registry record",
    fungibleTokenLaunch: "not-in-this-package",
    liveFeed: true,
  }),
  solana: Object.freeze({
    vm: "svm",
    cluster: "mainnet-beta",
    testnetCluster: "devnet",
    identityAsset: "Metaplex Core asset + Agent Identity PDA",
    /** Prefer Metaplex API mint-prepare → wallet sign → mint-confirm; treasury mint is fallback. */
    mintPath: "metaplex-api-preferred",
    fungibleTokenLaunch: "available",
    liveFeed: true,
  }),
  /**
   * Dual-rail identity: mint on Solana (Metaplex) and register on Robinhood (ERC-8004),
   * then optionally bind them with LayerZero zk-omni msgType 4.
   */
  omni: Object.freeze({
    rails: Object.freeze(["solana", "robinhood"]),
    solana: "metaplex-core-agent-identity",
    robinhood: "erc-8004-identity-registry",
    link: "zk-omni-msgtype-4",
    layerZeroEids: Object.freeze({ solana: 30168, robinhood: 30416 }),
    liveFeed: true,
  }),
});

export const frameworkCapabilities = Object.freeze({
  robinhood: Object.freeze({
    localUnsignedRegistration: true,
    hostedUnsignedRegistration: "configuration-dependent",
    registryInfrastructureDeployment: "guarded-foundry-tooling",
    identityStandard: "ERC-8004 registration-v1 compatibility",
    fungibleAgentTokenLaunch: false,
    liveFeedReport: true,
  }),
  solana: Object.freeze({
    /** Official Metaplex Agent Registry API: Core asset + Agent Identity in one user-signed tx. */
    metaplexApiMint: true,
    hostedSponsoredCoreMint: "health-and-policy-dependent",
    walletAuthorization: "CLAWD_AGENT_MINT_V2",
    agentIdentityRegistration: "atomic-with-metaplex-api-or-attempted-after-core-mint",
    fungibleAgentTokenLaunch: "available",
    clawdGateSource: "helius-das-or-solana-rpc",
    liveFeedReport: true,
  }),
  omni: Object.freeze({
    dualRailPlan: true,
    solanaPath: "metaplex-api-preferred",
    robinhoodPath: "local-unsigned-erc8004-register",
    zkOmniLink: true,
    msgType: 4,
    neverCustodiesKeys: true,
    liveFeedReport: true,
  }),
});

export const identityRegistryAbi = Object.freeze([
  Object.freeze({
    type: "function",
    name: "register",
    stateMutability: "nonpayable",
    inputs: Object.freeze([{ name: "agentURI", type: "string" }]),
    outputs: Object.freeze([{ name: "agentId", type: "uint256" }]),
  }),
]);

export const SPONSORED_MINT_AUTHORIZATION_VERSION = "CLAWD_AGENT_MINT_V2";
export const SPONSORED_MINT_AUTHORIZATION_MAX_AGE_MS = 5 * 60 * 1_000;
export const SPONSORED_MINT_AUTHORIZATION_MAX_FUTURE_SKEW_MS = 30 * 1_000;

const ZERO_ADDRESS = /^0x0{40}$/i;
const BASE58_ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
const ED25519_SPKI_PREFIX = Buffer.from("302a300506032b6570032100", "hex");

function text(value, field, max) {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${field} is required`);
  const result = value.trim();
  if (result.length > max) throw new Error(`${field} exceeds ${max} characters`);
  return result;
}

function optionalText(value, field, max) {
  if (value === undefined || value === null || value === "") return undefined;
  return text(value, field, max);
}

function boundedTextArray(value, field, maxItems, maxLength) {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) throw new Error(`${field} must be an array`);
  if (value.length > maxItems) throw new Error(`${field} cannot contain more than ${maxItems} entries`);
  return value.map((item, index) => text(item, `${field}[${index}]`, maxLength));
}

export function buildRegistration(input) {
  if (!input || typeof input !== "object") throw new Error("registration input is required");
  const image = text(input.image, "image", 2_048);
  if (!/^(https:\/\/|ipfs:\/\/|data:image\/)/i.test(image)) {
    throw new Error("image must use https://, ipfs://, or a data:image URI");
  }

  const rawServices = input.services ?? [];
  if (!Array.isArray(rawServices)) throw new Error("services must be an array");
  if (rawServices.length > 20) throw new Error("services cannot contain more than 20 entries");
  const services = rawServices.map((item, index) => ({
    name: text(item?.name, `services[${index}].name`, 64),
    endpoint: text(item?.endpoint, `services[${index}].endpoint`, 2_048),
    ...(optionalText(item?.version, `services[${index}].version`, 64)
      ? { version: optionalText(item.version, `services[${index}].version`, 64) }
      : {}),
    ...(item?.skills !== undefined
      ? { skills: boundedTextArray(item.skills, `services[${index}].skills`, 64, 128) }
      : {}),
    ...(item?.domains !== undefined
      ? { domains: boundedTextArray(item.domains, `services[${index}].domains`, 64, 128) }
      : {}),
  }));
  const supportedTrust = boundedTextArray(input.supportedTrust, "supportedTrust", 32, 64);

  return {
    type: "https://eips.ethereum.org/EIPS/eip-8004#registration-v1",
    name: text(input.name, "name", 160),
    description: text(input.description, "description", 4_000),
    image,
    services,
    x402Support: input.x402Support === true,
    active: input.active !== false,
    registrations: [],
    ...(supportedTrust.length ? { supportedTrust } : {}),
  };
}

export const registrationDataUri = (document) => (
  `data:application/json;base64,${Buffer.from(JSON.stringify(document), "utf8").toString("base64")}`
);

export function prepareEvmRegistration({ chainId = 46630, registry, agentURI, ...input }) {
  const manifest = getCanonicalDeployment(chainId);
  if (!isAddress(registry) || ZERO_ADDRESS.test(registry)) {
    throw new Error("a valid, nonzero trusted registry address is required");
  }
  const registration = buildRegistration(input);
  const uri = agentURI ? text(agentURI, "agentURI", 16_384) : registrationDataUri(registration);
  const canonicalIdentity = manifest.contracts.identity;
  const canonicalRegistry = registry.toLowerCase() === canonicalIdentity.address.toLowerCase();

  return Object.freeze({
    vm: "evm",
    network: "robinhood",
    chainId: Number(chainId),
    to: registry,
    data: encodeFunctionData({
      abi: identityRegistryAbi,
      functionName: "register",
      args: [uri],
    }),
    value: "0x0",
    agentURI: uri,
    registration,
    canonicalRegistry,
    canonicalAddress: canonicalIdentity.address,
    expectedRuntimeCodeHash: canonicalRegistry ? canonicalIdentity.runtimeCodeHash : null,
    expectedRuntimeBytes: canonicalRegistry ? canonicalIdentity.runtimeBytes : null,
  });
}

/** Prepare against the reviewed manifest address without contacting an RPC or wallet. */
export function prepareCanonicalEvmRegistration({ chainId = 46630, ...input }) {
  const registry = getCanonicalContract(chainId, "identity").address;
  return prepareEvmRegistration({ ...input, chainId, registry });
}

/**
 * URL-safe agent slug for dual-rail discovery (1–64 chars).
 * @param {string} name
 * @returns {string}
 */
export function agentSlugFromName(name) {
  const slug = String(name ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
  if (!slug) throw new Error("name must produce a non-empty URL-safe agent slug");
  return slug;
}

/**
 * Deterministic bytes32 agent id seed from slug (provisional until RH register returns tokenId).
 * @param {string} slug
 * @returns {`0x${string}`}
 */
export function provisionalOmniAgentId(slug) {
  const digest = createHash("sha256")
    .update(Buffer.from("cheshire-omni-agent-id:v1", "utf8"))
    .update(Buffer.from([0]))
    .update(Buffer.from(String(slug), "utf8"))
    .digest("hex");
  return `0x${digest}`;
}

/**
 * Map Solana cluster / Metaplex API network string.
 * @param {"mainnet-beta"|"devnet"|"solana-mainnet"|"solana-devnet"|string|undefined} network
 */
function resolveSolanaMetaplexNetwork(network) {
  const n = String(network || "solana-mainnet").trim().toLowerCase();
  if (n === "devnet" || n === "solana-devnet") return "solana-devnet";
  if (n === "mainnet-beta" || n === "solana-mainnet" || n === "mainnet") return "solana-mainnet";
  throw new Error("solana network must be solana-mainnet or solana-devnet");
}

/**
 * Plan a dual-rail omni agent mint: Solana Metaplex Core+Agent Identity + Robinhood ERC-8004
 * register, with optional LayerZero zk-omni link envelope (msgType 4).
 *
 * Pure / local — never signs, never submits, never asks for private keys.
 * Callers still need wallet signatures on each rail, then planOmniIdentityLink after both ids exist.
 *
 * @param {object} input
 * @param {string} input.name
 * @param {string} input.description
 * @param {string} input.image
 * @param {Array} [input.services]
 * @param {string[]} [input.supportedTrust]
 * @param {number} [input.chainId=46630] Robinhood chain (testnet default)
 * @param {string} [input.ownerPubkey] Solana owner (required for sponsored mint auth envelope later)
 * @param {string} [input.uri] Core asset NFT metadata URI (Metaplex `uri` field)
 * @param {string} [input.solanaNetwork="solana-mainnet"]
 * @param {string} [input.agentType]
 * @param {string} [input.personality]
 * @param {string[]|string} [input.capabilities]
 * @param {string} [input.symbol]
 * @param {boolean} [input.linkOmni=true]
 * @param {string} [input.controllerAddress] EVM controller for zk-omni
 * @param {string} [input.secretHex] optional zk secret (generated if linkOmni and omitted)
 * @param {"robinhood-to-solana"|"solana-to-robinhood"} [input.direction]
 * @param {string} [input.agentSlug]
 * @param {boolean} [input.x402Support]
 */
export function planOmniAgentMint(input) {
  if (!input || typeof input !== "object") throw new Error("omni mint input is required");

  const name = text(input.name, "name", 160);
  const description = text(input.description, "description", 4_000);
  const image = text(input.image, "image", 2_048);
  if (!/^(https:\/\/|ipfs:\/\/|data:image\/)/i.test(image)) {
    throw new Error("image must use https://, ipfs://, or a data:image URI");
  }

  const agentSlug = input.agentSlug
    ? text(input.agentSlug, "agentSlug", 64).toLowerCase().replace(/[^a-z0-9-]/g, "")
    : agentSlugFromName(name);
  if (!agentSlug) throw new Error("agentSlug is empty after normalization");

  const chainId = Number(input.chainId ?? 46630);
  if (chainId !== 4663 && chainId !== 46630) {
    throw new Error("chainId must be 46630 (testnet) or 4663 (mainnet)");
  }
  if (chainId === 4663 && input.confirmMainnet !== true) {
    throw new Error(
      "Robinhood mainnet (4663) requires confirmMainnet: true — prefer 46630 for experiments",
    );
  }

  const solanaNetwork = resolveSolanaMetaplexNetwork(input.solanaNetwork);
  const uri =
    optionalText(input.uri, "uri", 2_048) ||
    optionalText(input.metadataUri, "metadataUri", 2_048) ||
    image;

  const services = Array.isArray(input.services) ? input.services : [];
  const supportedTrust = Array.isArray(input.supportedTrust)
    ? input.supportedTrust
    : ["reputation", "tee"];

  const dualRegistrations = [
    { agentId: agentSlug, agentRegistry: "cheshire-omni" },
    {
      agentId: agentSlug,
      agentRegistry: "robinhood-erc8004",
      chainId,
    },
    {
      agentId: agentSlug,
      agentRegistry: "metaplex-agent-identity",
      network: solanaNetwork,
    },
  ];

  // Cross-link hints inside ERC-8004 registration document (metadata; not on-chain ids yet).
  const rhRegistrations = [
    {
      agentId: agentSlug,
      agentRegistry: "cheshire-omni",
    },
    {
      agentId: agentSlug,
      agentRegistry: "metaplex-agent-identity",
      network: solanaNetwork,
    },
  ];

  // Build registration document first so calldata agentURI includes omni cross-links.
  const rhRegistrationWithOmni = {
    ...buildRegistration({
      name,
      description,
      image,
      services,
      supportedTrust,
      x402Support: input.x402Support === true,
      active: input.active !== false,
    }),
    registrations: rhRegistrations,
  };
  const rhAgentURI = registrationDataUri(rhRegistrationWithOmni);

  // --- Robinhood ERC-8004 unsigned register (calldata uses omni-linked agentURI) ---
  const robinhoodBase = prepareCanonicalEvmRegistration({
    chainId,
    name,
    description,
    image,
    services,
    supportedTrust,
    x402Support: input.x402Support === true,
    active: input.active !== false,
    agentURI: rhAgentURI,
  });
  const robinhood = {
    ...robinhoodBase,
    registration: rhRegistrationWithOmni,
    agentURI: rhAgentURI,
    data: encodeFunctionData({
      abi: identityRegistryAbi,
      functionName: "register",
      args: [rhAgentURI],
    }),
  };

  // --- Solana Metaplex API mint input (mintAndSubmitAgent / mint-prepare shape) ---
  const agentMetadata = {
    type: "agent",
    name,
    description,
    services: services.map((item, index) => ({
      name: text(item?.name, `services[${index}].name`, 64),
      endpoint: text(item?.endpoint, `services[${index}].endpoint`, 2_048),
    })),
    registrations: dualRegistrations,
    supportedTrust: supportedTrust.map((t, i) => text(String(t), `supportedTrust[${i}]`, 64)),
  };

  const ownerPubkey = String(
    input.ownerPubkey || input.ownerAddress || input.owner || "",
  ).trim();

  const metaplexMintInput = Object.freeze({
    wallet: ownerPubkey || undefined,
    name: name.slice(0, 32),
    uri,
    network: solanaNetwork,
    agentMetadata: Object.freeze(agentMetadata),
  });

  let sponsoredMintIntent = null;
  let sponsoredMintReady = false;
  if (ownerPubkey) {
    try {
      sponsoredMintIntent = normalizeSponsoredMintIntent({
        ownerPubkey,
        name,
        symbol: input.symbol,
        description,
        agentType: input.agentType || "omni",
        personality: input.personality || "cheshire",
        capabilities: input.capabilities || ["omni", "mcp", "a2a"],
        imageUri: image,
        registrationUri: registrationDataUri(rhRegistrationWithOmni),
      });
      sponsoredMintReady = Boolean(sponsoredMintIntent.owner);
    } catch {
      sponsoredMintIntent = null;
      sponsoredMintReady = false;
    }
  }

  // --- Optional provisional zk-omni plan (replace agentId after RH mint) ---
  const linkOmni = input.linkOmni !== false;
  let omniLink = null;
  if (linkOmni) {
    const provisionalId = provisionalOmniAgentId(agentSlug);
    omniLink = planZkOmniMessage({
      direction: input.direction || "robinhood-to-solana",
      action: "dual_identity_link",
      memo: `omni:${agentSlug}:pending`.slice(0, 200),
      agentId: input.agentId || provisionalId,
      controllerAddress: input.controllerAddress,
      secretHex: input.secretHex,
      modelHash: input.modelHash,
      ttlSeconds: input.ttlSeconds ?? 7_200,
      context: input.context || `cheshire-omni-mint:${agentSlug}`,
    });
    // Do not leak secretHex in the plan object — planZkOmniMessage returns secret only if present
    // in its return; strip if the codec includes it.
    if (omniLink && typeof omniLink === "object" && "secretHex" in omniLink) {
      const { secretHex: _omit, ...rest } = omniLink;
      omniLink = { ...rest, secretRetainedLocally: Boolean(input.secretHex) };
    }
  }

  return Object.freeze({
    kind: "omni-agent-mint",
    version: OMNI_MINT_PLAN_VERSION,
    rails: Object.freeze(["solana", "robinhood"]),
    agent: Object.freeze({
      name,
      description,
      image,
      agentSlug,
      provisionalAgentId: provisionalOmniAgentId(agentSlug),
    }),
    surfaces: Object.freeze({
      hub: HUB_URL,
      forge: FORGE_URL,
      mint: MINT_URL,
      live: LIVE_FEED_URL,
    }),
    robinhood: Object.freeze({
      ...robinhood,
      steps: Object.freeze([
        "Review chainId, registry address, and calldata (register(agentURI))",
        "Connect EVM wallet on Robinhood Chain",
        "Submit unsigned tx { to, data, value } — owner becomes ERC-721 holder",
        "Read Registered event + ownerOf / agentURI / getAgentWallet",
      ]),
    }),
    solana: Object.freeze({
      mintPath: "metaplex-api-preferred",
      network: solanaNetwork,
      metaplexMintInput,
      sponsoredMintIntent,
      sponsoredMintReady,
      ownerPubkey: ownerPubkey || null,
      steps: Object.freeze([
        "Prefer mintSolanaPrepare → owner wallet signs Metaplex API tx → mintSolanaConfirm",
        "Fallback: CLAWD_AGENT_MINT_V2 authorization + mintSolana (treasury-sponsored)",
        "Verify Core asset + AgentIdentity plugin (transfer/update/execute hooks)",
        "Report to /agents/live via mint-confirm or reportLive",
      ]),
      note:
        "Metaplex API stores agentMetadata off-chain and returns an unsigned tx that creates the Core asset + Agent Identity PDA atomically. Private keys never leave the wallet.",
    }),
    omniLink: omniLink
      ? Object.freeze({
          status: "provisional",
          note:
            "Provisional nullifier plan for dual_identity_link. After both rails confirm, call planOmniIdentityLink with real solanaAsset + rhAgentId.",
          plan: omniLink,
        })
      : null,
    crossRegistration: Object.freeze({
      solanaAgentMetadataRegistrations: dualRegistrations,
      rhRegistrations,
    }),
    executionOrder: Object.freeze([
      "1. Review this plan — no private keys; both rails are wallet-signed writes",
      "2. Solana: mintSolanaPrepare (or local mintAndSubmitAgent) → sign → confirm; keep assetAddress",
      "3. Robinhood: broadcast prepareCanonicalEvmRegistration calldata; keep agentId from Registered",
      "4. planOmniIdentityLink({ solanaAsset, rhAgentId, controllerAddress }) → sendZkOmni / relayer",
      "5. reportLive on both rails with chain metadata linking the pair",
    ]),
    safety: Object.freeze({
      neverCustodiesKeys: true,
      mainnetConfirmed: chainId !== 4663 || input.confirmMainnet === true,
      identityIsNotFungibleToken: true,
      linkRequiresBothConfirmed: true,
    }),
  });
}

/**
 * After both rails are confirmed, plan a zk-omni dual_identity_link message
 * that binds Solana asset address ↔ Robinhood agent id.
 *
 * @param {object} input
 * @param {string} input.solanaAsset Metaplex Core asset address (base58)
 * @param {string|number|bigint} input.rhAgentId ERC-8004 agent token id
 * @param {number} [input.chainId=4663]
 * @param {string} [input.controllerAddress] EVM controller (0x…)
 * @param {string} [input.agentSlug]
 * @param {string} [input.secretHex]
 * @param {"robinhood-to-solana"|"solana-to-robinhood"} [input.direction]
 */
export function planOmniIdentityLink(input) {
  if (!input || typeof input !== "object") throw new Error("omni identity link input is required");
  const solanaAsset = text(input.solanaAsset || input.assetAddress, "solanaAsset", 64);
  const rhAgentIdRaw = input.rhAgentId ?? input.agentId;
  if (rhAgentIdRaw === undefined || rhAgentIdRaw === null || rhAgentIdRaw === "") {
    throw new Error("rhAgentId is required");
  }

  const chainId = Number(input.chainId ?? 4663);
  const memo = `omni:rh:${chainId}:${String(rhAgentIdRaw)}|sol:${solanaAsset}`.slice(0, 200);

  // Prefer explicit bytes32; else hash rhAgentId string for agentId field.
  let agentIdHex = input.agentIdHex;
  if (!agentIdHex) {
    const asNum = typeof rhAgentIdRaw === "bigint" ? rhAgentIdRaw : BigInt(String(rhAgentIdRaw));
    if (asNum >= 0n && asNum < 1n << 256n) {
      agentIdHex = `0x${asNum.toString(16).padStart(64, "0")}`;
    } else {
      agentIdHex = provisionalOmniAgentId(String(rhAgentIdRaw));
    }
  }

  const payloadCommitment = payloadCommitmentFrom([
    "dual_identity_link",
    String(chainId),
    String(rhAgentIdRaw),
    solanaAsset,
    input.agentSlug || "",
  ]);

  const plan = planZkOmniMessage({
    direction: input.direction || "robinhood-to-solana",
    action: "dual_identity_link",
    memo,
    agentId: agentIdHex,
    controllerAddress: input.controllerAddress,
    secretHex: input.secretHex,
    payloadCommitment,
    modelHash: input.modelHash,
    ttlSeconds: input.ttlSeconds ?? 3_600,
    context: input.context || `cheshire-omni-link:${solanaAsset}:${rhAgentIdRaw}`,
  });

  let safePlan = plan;
  if (plan && typeof plan === "object" && "secretHex" in plan) {
    const { secretHex: _omit, ...rest } = plan;
    safePlan = { ...rest, secretRetainedLocally: Boolean(input.secretHex) };
  }

  return Object.freeze({
    kind: "omni-identity-link",
    version: OMNI_MINT_PLAN_VERSION,
    solanaAsset,
    rhAgentId: String(rhAgentIdRaw),
    chainId,
    payloadCommitment,
    plan: safePlan,
    next: Object.freeze([
      "Deliver via zk-omni-relayer oneshot or buildRobinhoodSendCall + wallet send",
      "On Solana, receive_zk_omni consumes the nullifier PDA",
      "reportLive with metadata.omniPair = { solanaAsset, rhAgentId, nullifier }",
    ]),
  });
}

function normalizeSponsoredMintName(value) {
  return String(value ?? "").trim().replace(/\s+/g, " ").slice(0, 64);
}

function normalizeSponsoredMintSymbol(value) {
  const symbol = String(value || "AGENT")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 10);
  return symbol || "AGENT";
}

function normalizeSponsoredMintCapabilities(value) {
  const values = Array.isArray(value) ? value : typeof value === "string" ? value.split(",") : [];
  return values.map((item) => String(item).trim()).filter(Boolean).slice(0, 12);
}

function normalizeSponsoredMintImageUri(value) {
  if (typeof value !== "string") return "";
  const trimmed = value.trim().slice(0, 2_048);
  return /^(https:\/\/|ipfs:\/\/|ar:\/\/|data:image\/)/i.test(trimmed) ? trimmed : "";
}

function normalizeSponsoredMintRegistrationUri(input) {
  if (typeof input.customRegistrationUri === "string" && input.customRegistrationUri.trim()) {
    return input.customRegistrationUri.trim();
  }
  if (typeof input.agentRegistrationUri === "string" && input.agentRegistrationUri.trim()) {
    return input.agentRegistrationUri.trim();
  }
  // SDK-facing alias. serializeSponsoredMintRequest maps this normalized value
  // to the server-recognized customRegistrationUri field before submission.
  if (typeof input.registrationUri === "string" && input.registrationUri.trim()) {
    return input.registrationUri.trim();
  }
  if (typeof input.registrationDoc !== "string" || !input.registrationDoc) return "";
  if (/^(https:\/\/|data:)/.test(input.registrationDoc)) return input.registrationDoc;
  return `data:text/plain;base64,${Buffer.from(input.registrationDoc, "utf8").toString("base64")}`;
}

export function normalizeSponsoredMintIntent(input) {
  if (!input || typeof input !== "object") throw new Error("sponsored mint input is required");
  const owner = String(input.ownerPubkey || input.ownerAddress || input.owner || "").trim();
  const name = normalizeSponsoredMintName(input.name);
  const agentType = String(input.agentType || "general").trim().slice(0, 48) || "general";
  return Object.freeze({
    owner,
    name,
    symbol: normalizeSponsoredMintSymbol(input.symbol),
    description: String(input.description || `${agentType} AI agent on Solana`).trim().slice(0, 600),
    agentType,
    personality: String(input.personality || "neutral").trim().slice(0, 48) || "neutral",
    capabilities: Object.freeze(normalizeSponsoredMintCapabilities(input.capabilities)),
    imageUri: normalizeSponsoredMintImageUri(input.imageUri),
    registrationUri: normalizeSponsoredMintRegistrationUri(input),
  });
}

function canonicalSponsoredMintIntent(intent) {
  return JSON.stringify({
    owner: intent.owner,
    name: intent.name,
    symbol: intent.symbol,
    description: intent.description,
    agentType: intent.agentType,
    personality: intent.personality,
    capabilities: intent.capabilities,
    imageUri: intent.imageUri,
    registrationUri: intent.registrationUri,
  });
}

export function sponsoredMintIntentSha256(input) {
  return sponsoredMintNormalizedIntentSha256(normalizeSponsoredMintIntent(input));
}

function sponsoredMintNormalizedIntentSha256(intent) {
  return createHash("sha256").update(canonicalSponsoredMintIntent(intent), "utf8").digest("hex");
}

/** Build exact bytes for a wallet to sign. This function never signs or submits. */
export function buildSponsoredMintAuthorization(input, timestamp = Date.now()) {
  if (!Number.isSafeInteger(timestamp) || timestamp <= 0) {
    throw new Error("Sponsored mint timestamp must be a positive integer");
  }
  if (!String(input?.name ?? "").trim()) throw new Error("name is required");
  if (!String(input?.agentType ?? "").trim()) throw new Error("agentType is required");
  const intent = normalizeSponsoredMintIntent(input);
  if (decodeBase58(intent.owner).length !== 32) {
    throw new Error("ownerPubkey must be a valid 32-byte Solana public key");
  }
  const message = [
    SPONSORED_MINT_AUTHORIZATION_VERSION,
    `owner:${intent.owner}`,
    `name:${encodeURIComponent(intent.name)}`,
    `timestamp:${timestamp}`,
    `intent-sha256:${sponsoredMintNormalizedIntentSha256(intent)}`,
  ].join("\n");
  return Object.freeze({ intent, message, timestamp });
}

function decodeBase58(value) {
  const textValue = String(value ?? "");
  if (!textValue) return Buffer.alloc(0);
  let number = 0n;
  for (const character of textValue) {
    const digit = BASE58_ALPHABET.indexOf(character);
    if (digit < 0) return Buffer.alloc(0);
    number = number * 58n + BigInt(digit);
  }
  let encoded = Buffer.alloc(0);
  if (number > 0n) {
    let hex = number.toString(16);
    if (hex.length % 2) hex = `0${hex}`;
    encoded = Buffer.from(hex, "hex");
  }
  let leadingZeros = 0;
  while (textValue[leadingZeros] === "1") leadingZeros += 1;
  return Buffer.concat([Buffer.alloc(leadingZeros), encoded]);
}

function decodeCanonicalSignature(value) {
  if (typeof value !== "string" || value.length < 80 || value.length > 100) return null;
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(value)) return null;
  const bytes = Buffer.from(value, "base64");
  if (bytes.length !== 64 || bytes.toString("base64") !== value) return null;
  return bytes;
}

/**
 * Verify the complete signed Solana mint envelope before it is sent to Cheshire.
 * The server still enforces freshness, holder policy, and durable replay protection.
 */
export function assertSponsoredMintAuthorization(input, { now = Date.now() } = {}) {
  if (typeof input?.walletMessage !== "string" || input.walletMessage.length > 2_048) {
    throw new Error("walletMessage must be a CLAWD_AGENT_MINT_V2 message");
  }
  const match = /^CLAWD_AGENT_MINT_V2\nowner:([^\n]+)\nname:([^\n]*)\ntimestamp:([1-9][0-9]{0,15})\nintent-sha256:([a-f0-9]{64})$/.exec(input.walletMessage);
  if (!match) throw new Error("walletMessage is not a canonical CLAWD_AGENT_MINT_V2 message");
  const timestamp = Number(match[3]);
  if (!Number.isSafeInteger(timestamp)) throw new Error("walletMessage timestamp is invalid");
  if (timestamp < now - SPONSORED_MINT_AUTHORIZATION_MAX_AGE_MS) {
    throw new Error("walletMessage has expired; sign a fresh authorization");
  }
  if (timestamp > now + SPONSORED_MINT_AUTHORIZATION_MAX_FUTURE_SKEW_MS) {
    throw new Error("walletMessage timestamp is too far in the future");
  }

  const expected = buildSponsoredMintAuthorization(input, timestamp);
  if (expected.message !== input.walletMessage) {
    throw new Error("walletMessage does not approve the complete normalized mint intent");
  }
  const signature = decodeCanonicalSignature(input.walletSignature);
  if (!signature) throw new Error("walletSignature must be canonical base64 for a 64-byte Ed25519 signature");
  const publicKeyBytes = decodeBase58(expected.intent.owner);
  if (publicKeyBytes.length !== 32) throw new Error("ownerPubkey must be a valid 32-byte Solana public key");

  const publicKey = createPublicKey({
    key: Buffer.concat([ED25519_SPKI_PREFIX, publicKeyBytes]),
    format: "der",
    type: "spki",
  });
  if (!verifySignature(null, Buffer.from(expected.message, "utf8"), publicKey, signature)) {
    throw new Error("walletSignature does not verify for ownerPubkey and walletMessage");
  }
  return expected;
}

/**
 * Serialize the signed normalized intent to fields accepted by the hosted
 * `/mint` route. In particular, the SDK alias `registrationUri` is sent as
 * `customRegistrationUri`, so the server reconstructs the exact signed digest.
 */
export function serializeSponsoredMintRequest(input, verifiedIntent) {
  const intent = verifiedIntent ?? assertSponsoredMintAuthorization(input).intent;
  const request = {
    ...input,
    ownerPubkey: intent.owner,
    name: intent.name,
    symbol: intent.symbol,
    description: intent.description,
    agentType: intent.agentType,
    personality: intent.personality,
    capabilities: [...intent.capabilities],
    imageUri: intent.imageUri,
    customRegistrationUri: intent.registrationUri,
  };
  delete request.owner;
  delete request.ownerAddress;
  delete request.registrationUri;
  delete request.agentRegistrationUri;
  delete request.registrationDoc;
  return request;
}

function normalizeBaseUrl(value) {
  const url = new URL(value || "https://cheshireterminal.ai");
  if (!/^https?:$/.test(url.protocol)) throw new Error("baseUrl must use HTTPS or HTTP");
  if (url.username || url.password) throw new Error("baseUrl must not contain credentials");
  if (url.hash) throw new Error("baseUrl must not contain a fragment");
  return url;
}

export function createCheshireClient({
  baseUrl = "https://cheshireterminal.ai",
  apiKey,
  fetchImpl = globalThis.fetch,
} = {}) {
  if (typeof fetchImpl !== "function") throw new Error("a fetch implementation is required");
  const origin = normalizeBaseUrl(baseUrl);
  const request = async (path, init) => {
    const headers = new Headers(init?.headers);
    if (apiKey) headers.set("authorization", `Bearer ${apiKey}`);
    const response = await fetchImpl(new URL(path, origin), {
      ...init,
      headers,
      credentials: "include",
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || `Request failed (${response.status})`);
    return data;
  };
  const post = (path, body) => request(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return Object.freeze({
    capabilities: async () => {
      const [robinhood, solana] = await Promise.all([
        request("/api/robinhood/agents/config"),
        request("/api/metaplex-agents/health"),
      ]);
      return {
        framework: frameworkCapabilities,
        platforms,
        surfaces: {
          hub: HUB_URL,
          forge: FORGE_URL,
          mint: MINT_URL,
          live: LIVE_FEED_URL,
        },
        robinhood,
        solana,
      };
    },
    prepareRobinhood: (input) => post("/api/robinhood/agents/prepare-registration", input),
    /**
     * Preferred Solana path: Metaplex API builds an unsigned tx (Core + Agent Identity).
     * Caller signs with the owner wallet, submits on-chain, then calls mintSolanaConfirm.
     */
    mintSolanaPrepare: (input) => {
      const verified = assertSponsoredMintAuthorization(input);
      return post(
        "/api/metaplex-agents/mint-prepare",
        serializeSponsoredMintRequest(input, verified.intent),
      );
    },
    /** After wallet-signed Metaplex API mint confirms, publish to /agents/live. */
    mintSolanaConfirm: (input) => {
      if (!input || typeof input !== "object") throw new Error("mint confirm input is required");
      const assetAddress = text(input.assetAddress, "assetAddress", 64);
      return post("/api/metaplex-agents/mint-confirm", {
        assetAddress,
        signature: optionalText(input.signature, "signature", 200),
        name: optionalText(input.name, "name", 64),
        description: optionalText(input.description, "description", 600),
        ownerWallet: optionalText(input.ownerWallet || input.ownerPubkey, "ownerWallet", 64),
        image: optionalText(input.image || input.imageUri, "image", 500),
        template: optionalText(input.template, "template", 128),
      });
    },
    /**
     * Treasury-sponsored Core mint + registerIdentity attempt (fallback when Metaplex API is down).
     * Still Metaplex on-chain; still reports to the live feed.
     */
    mintSolana: (input) => {
      const verified = assertSponsoredMintAuthorization(input);
      return post("/api/metaplex-agents/mint", serializeSponsoredMintRequest(input, verified.intent));
    },
    /** Wallet-signed Genesis/DBC agent token launch (identity asset must already exist). */
    launchAgentToken: (input, options = {}) => {
      if (!input || typeof input !== "object") throw new Error("launch input is required");
      const headers = new Headers({ "content-type": "application/json" });
      if (apiKey) headers.set("authorization", `Bearer ${apiKey}`);
      const idempotencyKey =
        options.idempotencyKey ||
        input.idempotencyKey ||
        `launch-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
      headers.set("idempotency-key", String(idempotencyKey));
      return request("/api/metaplex-agents/launch-token", {
        method: "POST",
        headers,
        body: JSON.stringify({
          assetAddress: text(input.assetAddress, "assetAddress", 64),
          tokenName: text(input.tokenName || input.name, "tokenName", 64),
          tokenSymbol: text(input.tokenSymbol || input.symbol, "tokenSymbol", 10),
          tokenUri: optionalText(input.tokenUri || input.uri, "tokenUri", 500),
          userWallet: text(input.userWallet || input.ownerWallet, "userWallet", 64),
          setToken: Boolean(input.setToken),
          creatorFeeWallet: optionalText(input.creatorFeeWallet, "creatorFeeWallet", 64),
        }),
      });
    },
    /** Dual-rail report into the site live feed (Solana mint, RH forge, etc.). */
    reportLive: (input) => {
      if (!input || typeof input !== "object") throw new Error("live report input is required");
      return post("/api/agent-explorer/report", {
        name: text(input.name, "name", 160),
        assetAddress: text(input.assetAddress || input.agentAddress || input.id, "assetAddress", 200),
        description: optionalText(input.description, "description", 2000),
        image: optionalText(input.image, "image", 500),
        ownerWallet: optionalText(input.ownerWallet, "ownerWallet", 128),
        signature: optionalText(input.signature, "signature", 200),
        chain: optionalText(input.chain, "chain", 32) || "platform",
        network: optionalText(input.network, "network", 64),
        source: optionalText(input.source, "source", 64) || "cheshire-terminal-agents",
        template: optionalText(input.template, "template", 128),
        agentId: optionalText(input.agentId, "agentId", 64),
        explorerUrl: optionalText(input.explorerUrl, "explorerUrl", 500),
        solscanUrl: optionalText(input.solscanUrl, "solscanUrl", 500),
        chainId: input.chainId,
        metadata: input.metadata && typeof input.metadata === "object" ? input.metadata : undefined,
      });
    },
    clawdGate: (ownerAddress) =>
      request(`/api/metaplex-agents/gate/${encodeURIComponent(text(ownerAddress, "ownerAddress", 64))}`),
    getRobinhood: (id, chainId = 4663) => {
      getCanonicalDeployment(chainId);
      return request(`/api/robinhood/agents/${encodeURIComponent(id)}?chainId=${chainId}`);
    },
    getSolana: (asset) => request(`/api/metaplex-agents/fetch/${encodeURIComponent(asset)}`),
    liveFeed: (limit = 50) =>
      request(`/api/agent-explorer/feed?limit=${Math.min(Math.max(Number(limit) || 50, 1), 100)}`),
  });
}

export function createAgentForge(options) {
  const client = createCheshireClient(options);
  return Object.freeze({
    capabilities: client.capabilities,
    prepareRobinhood: client.prepareRobinhood,
    prepareLocalRobinhood: prepareCanonicalEvmRegistration,
    mintSolanaPrepare: client.mintSolanaPrepare,
    mintSolanaConfirm: client.mintSolanaConfirm,
    mintSolana: client.mintSolana,
    launchAgentToken: client.launchAgentToken,
    reportLive: client.reportLive,
    clawdGate: client.clawdGate,
    liveFeed: client.liveFeed,
    /** Dual-rail plan: Solana Metaplex + RH ERC-8004 + optional zk-omni (local, unsigned). */
    planOmniMint: planOmniAgentMint,
    /** Post-confirm zk-omni dual_identity_link plan. */
    planOmniIdentityLink,
    prepare: ({ platform, ...input }) => {
      if (platform === "robinhood") return client.prepareRobinhood(input);
      if (platform === "omni") {
        return Promise.resolve(planOmniAgentMint(input));
      }
      if (platform === "solana") {
        return Promise.reject(new Error(
          "Solana minting is a live write; call mintSolanaPrepare (Metaplex API) or mintSolana (treasury fallback) with a fresh CLAWD_AGENT_MINT_V2 authorization",
        ));
      }
      return Promise.reject(new Error("platform must be robinhood, solana, or omni"));
    },
    inspect: ({ platform, id, chainId }) => {
      if (platform === "robinhood") return client.getRobinhood(id, chainId);
      if (platform === "solana") return client.getSolana(id);
      return Promise.reject(new Error("platform must be robinhood or solana"));
    },
  });
}
