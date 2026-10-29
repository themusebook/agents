import { readFileSync } from "node:fs";
import { isAddress, isHex, keccak256 } from "viem";

const MANIFEST_FILES = Object.freeze({
  4663: "agent-registries-mainnet-4663.json",
  46630: "agent-registries-testnet-46630.json",
});

const CONTRACT_KINDS = Object.freeze(["identity", "reputation", "validation"]);
const HASH_32 = /^0x[0-9a-f]{64}$/;

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function fail(file, message) {
  throw new Error(`Invalid deployment manifest ${file}: ${message}`);
}

function loadManifest(chainId, file) {
  const url = new URL(`../deployments/${file}`, import.meta.url);
  let manifest;
  try {
    manifest = JSON.parse(readFileSync(url, "utf8"));
  } catch (error) {
    throw new Error(
      `Unable to load deployment manifest ${file}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  if (manifest?.schemaVersion !== 1) fail(file, "schemaVersion must equal 1");
  if (manifest?.standard !== "ERC-8004") fail(file, "standard must equal ERC-8004");
  if (manifest?.namespace !== "eip155") fail(file, "namespace must equal eip155");
  if (manifest?.chainId !== chainId) fail(file, `chainId must equal ${chainId}`);
  if (!manifest?.verification?.allRuntimeCodeHashesMatch) {
    fail(file, "runtime code hashes must have been independently checked");
  }
  if (!Array.isArray(manifest.broadcastBlockedTargets)
    || !manifest.broadcastBlockedTargets.includes("cheshire-agent-registries")) {
    fail(file, "canonical registry redeployment must be blocked");
  }

  for (const kind of CONTRACT_KINDS) {
    const contract = manifest?.contracts?.[kind];
    if (!contract || !isAddress(contract.address)) fail(file, `${kind}.address is invalid`);
    if (!HASH_32.test(contract.runtimeCodeHash)) fail(file, `${kind}.runtimeCodeHash is invalid`);
    if (!HASH_32.test(contract.createTx)) fail(file, `${kind}.createTx is invalid`);
    if (!Number.isSafeInteger(contract.runtimeBytes) || contract.runtimeBytes <= 0) {
      fail(file, `${kind}.runtimeBytes must be a positive integer`);
    }
  }

  const identity = manifest.contracts.identity.address.toLowerCase();
  for (const kind of ["reputation", "validation"]) {
    if (manifest.contracts[kind].identityRegistry?.toLowerCase() !== identity) {
      fail(file, `${kind}.identityRegistry must bind to the identity contract`);
    }
  }

  return deepFreeze(manifest);
}

export const canonicalDeployments = deepFreeze(Object.fromEntries(
  Object.entries(MANIFEST_FILES).map(([chainId, file]) => [
    chainId,
    loadManifest(Number(chainId), file),
  ]),
));

export function getCanonicalDeployment(chainId) {
  const manifest = canonicalDeployments[String(chainId)];
  if (!manifest) throw new Error("chainId must be 4663 or 46630");
  return manifest;
}

export function getCanonicalContract(chainId, contract = "identity") {
  if (!CONTRACT_KINDS.includes(contract)) {
    throw new Error("contract must be identity, reputation, or validation");
  }
  return getCanonicalDeployment(chainId).contracts[contract];
}

/** Compare eth_getCode output with the reviewed runtime hash in the manifest. */
export function inspectCanonicalRuntimeCode({ chainId, contract = "identity", runtimeCode }) {
  if (!isHex(runtimeCode) || runtimeCode.length % 2 !== 0) {
    throw new Error("runtimeCode must be even-length 0x-prefixed bytecode");
  }
  const expected = getCanonicalContract(chainId, contract);
  const actualRuntimeCodeHash = runtimeCode === "0x" ? null : keccak256(runtimeCode);
  const runtimeBytes = runtimeCode === "0x" ? 0 : (runtimeCode.length - 2) / 2;
  return Object.freeze({
    chainId: Number(chainId),
    contract,
    address: expected.address,
    expectedRuntimeCodeHash: expected.runtimeCodeHash,
    actualRuntimeCodeHash,
    expectedRuntimeBytes: expected.runtimeBytes,
    runtimeBytes,
    matches: actualRuntimeCodeHash === expected.runtimeCodeHash && runtimeBytes === expected.runtimeBytes,
  });
}

export function assertCanonicalRuntimeCode(input) {
  const result = inspectCanonicalRuntimeCode(input);
  if (!result.matches) {
    throw new Error(
      `Runtime code mismatch for ${result.contract} on chain ${result.chainId}: expected ${result.expectedRuntimeCodeHash}/${result.expectedRuntimeBytes} bytes, received ${result.actualRuntimeCodeHash ?? "no code"}/${result.runtimeBytes} bytes`,
    );
  }
  return result;
}
