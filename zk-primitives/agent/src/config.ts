/**
 * ZK Shark Agent configuration.
 *
 * Loaded from environment variables so the same Shark of All Streets
 * binary works locally, in CI, and in production without code changes.
 *
 * Required:
 *   ZK_SHARK_RPC_URL        - Solana RPC endpoint (Helius recommended)
 *   ZK_SHARK_PROGRAM_ID     - Address of the deployed ZK program
 *
 * Optional:
 *   ZK_SHARK_PHOTON_URL     - Photon indexer URL (defaults to the RPC URL)
 *   ZK_SHARK_API_KEY        - Separate API key for the RPC (some providers)
 *   ZK_SHARK_COMMITMENT     - "processed" | "confirmed" | "finalized" (default "confirmed")
 *   ZK_SHARK_KEYPAIR        - Path to a Solana CLI keypair JSON for signing
 *   ZK_SHARK_NETWORK        - "mainnet" | "devnet" | "localnet" (for intent hints)
 *
 * Legacy CLAWD_ZK_* variables are still accepted as fallbacks.
 */

import { PublicKey } from "@solana/web3.js";

/**
 * Program identity generated alongside the Anchor deploy keypair.
 */
export const DEFAULT_PROGRAM_ID = new PublicKey(
  "HsgY1m4uS64anpDLNwtpACsUMTsyM3xjkCriGbTBNFhk",
);

export interface ZkSharkAgentConfig {
  /** Helius or other Solana RPC URL (api-key may be embedded). */
  rpcUrl: string;
  /** Address of the deployed ZK Shark program. */
  programId: PublicKey;
  /** Photon indexer URL. Defaults to `rpcUrl`. */
  photonUrl: string;
  /** Separate API key for the RPC. */
  apiKey?: string;
  /** Commitment level for RPC calls. */
  commitment: "processed" | "confirmed" | "finalized";
  /** Optional path to a Solana keypair JSON for signing. */
  keypairPath?: string;
  /** Network hint for intent routing. */
  network: "mainnet" | "devnet" | "localnet";
}

export type ZkAgentConfig = ZkSharkAgentConfig;

const KNOWN_PROGRAM_IDS: Record<string, string> = {
  ZK_SHARK_MAINNET: "HsgY1m4uS64anpDLNwtpACsUMTsyM3xjkCriGbTBNFhk",
  ZK_SHARK_DEVNET: "8qbHbw2BbbNa7jTcimsDVjps5M5hc7bdwA2ZJ47wUGEa",
  ZK_SHARK_LOCALNET: "CktRuQ2mN7N5fRTniY5wW84HH6NpisxEZY6e9ckM3XfX",
  ZKSHARK_MAINNET: "HsgY1m4uS64anpDLNwtpACsUMTsyM3xjkCriGbTBNFhk",
  ZKSHARK_DEVNET: "8qbHbw2BbbNa7jTcimsDVjps5M5hc7bdwA2ZJ47wUGEa",
  ZKSHARK_LOCALNET: "CktRuQ2mN7N5fRTniY5wW84HH6NpisxEZY6e9ckM3XfX",
  CLAWDZK_MAINNET: "HsgY1m4uS64anpDLNwtpACsUMTsyM3xjkCriGbTBNFhk",
  CLAWDZK_DEVNET: "8qbHbw2BbbNa7jTcimsDVjps5M5hc7bdwA2ZJ47wUGEa",
  CLAWDZK_LOCALNET: "CktRuQ2mN7N5fRTniY5wW84HH6NpisxEZY6e9ckM3XfX",
};

function asString(v: string | undefined, fallback: string): string {
  if (v == null) return fallback;
  const trimmed = v.trim();
  return trimmed.length === 0 ? fallback : trimmed;
}

function asCommitment(v: string | undefined): ZkSharkAgentConfig["commitment"] {
  const value = (v ?? "confirmed").toLowerCase();
  if (value === "processed" || value === "finalized") return value;
  return "confirmed";
}

function asNetwork(v: string | undefined): ZkSharkAgentConfig["network"] {
  const value = (v ?? "mainnet").toLowerCase();
  if (value === "devnet" || value === "localnet") return value;
  return "mainnet";
}

function firstEnv(
  env: Record<string, string | undefined>,
  names: readonly string[],
): string | undefined {
  for (const name of names) {
    const value = env[name];
    if (value?.trim()) return value;
  }
  return undefined;
}

function resolveProgramId(raw: string | undefined): PublicKey {
  if (!raw) return DEFAULT_PROGRAM_ID;
  const named = KNOWN_PROGRAM_IDS[raw.toUpperCase()];
  if (named) return new PublicKey(named);
  try {
    return new PublicKey(raw);
  } catch {
    throw new Error(
      `Invalid ZK_SHARK_PROGRAM_ID/CLAWD_ZK_PROGRAM_ID: ${raw}. Expected a base58 pubkey or one of: ${Object.keys(KNOWN_PROGRAM_IDS).join(", ")}.`,
    );
  }
}

/**
 * Load ZK Shark agent config from the current `process.env`.
 *
 * Throws if neither `ZK_SHARK_RPC_URL` nor legacy `CLAWD_ZK_RPC_URL` is set.
 */
export function loadAgentConfig(
  env: Record<string, string | undefined> = process.env,
): ZkSharkAgentConfig {
  const rpcUrl = asString(firstEnv(env, ["ZK_SHARK_RPC_URL", "CLAWD_ZK_RPC_URL"]), "");
  if (!rpcUrl) {
    throw new Error(
      "ZK_SHARK_RPC_URL is not set. Add it to your environment, or keep using legacy CLAWD_ZK_RPC_URL.",
    );
  }
  const programId = resolveProgramId(firstEnv(env, ["ZK_SHARK_PROGRAM_ID", "CLAWD_ZK_PROGRAM_ID"]));
  const photonUrl = asString(firstEnv(env, ["ZK_SHARK_PHOTON_URL", "CLAWD_ZK_PHOTON_URL"]), rpcUrl);
  return {
    rpcUrl,
    programId,
    photonUrl,
    apiKey: firstEnv(env, ["ZK_SHARK_API_KEY", "CLAWD_ZK_API_KEY"]),
    commitment: asCommitment(firstEnv(env, ["ZK_SHARK_COMMITMENT", "CLAWD_ZK_COMMITMENT"])),
    keypairPath: firstEnv(env, ["ZK_SHARK_KEYPAIR", "CLAWD_ZK_KEYPAIR"]),
    network: asNetwork(firstEnv(env, ["ZK_SHARK_NETWORK", "CLAWD_ZK_NETWORK"])),
  };
}
