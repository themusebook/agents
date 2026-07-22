/**
 * Solana chain context helpers — pure normalization + optional RPC read.
 * Unit tests exercise pure path without network.
 */

export const SOLANA_MAINNET = "solana-mainnet" as const;
export const SOL_MINT = "So11111111111111111111111111111111111111112";
export const USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
export const CLAWD_MINT = "8cHzQHUS2s2h8TzCmfqPKYiM4dSt4roa3n7MyRLApump";

const BASE58_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

export type SolanaNetwork = typeof SOLANA_MAINNET;

export type SolanaAddressContext = {
  ok: true;
  chain: "solana";
  network: SolanaNetwork;
  address: string;
  kind: "wallet" | "mint" | "unknown";
  knownLabel?: string;
};

export type SolanaContextError = {
  ok: false;
  chain: "solana";
  error: string;
};

const KNOWN: Record<string, { kind: "mint" | "wallet"; label: string }> = {
  [SOL_MINT]: { kind: "mint", label: "SOL (wrapped)" },
  [USDC_MINT]: { kind: "mint", label: "USDC" },
  [CLAWD_MINT]: { kind: "mint", label: "CLAWD" },
};

export function isSolanaAddress(value: string): boolean {
  return BASE58_RE.test(String(value || "").trim());
}

export function resolveSolanaSymbolOrMint(input: string): string {
  const raw = String(input || "").trim();
  if (!raw) return "";
  const upper = raw.toUpperCase();
  if (upper === "SOL" || upper === "WSOL") return SOL_MINT;
  if (upper === "USDC") return USDC_MINT;
  if (upper === "CLAWD") return CLAWD_MINT;
  return raw;
}

/**
 * Build a Solana address context from a mint/wallet/symbol.
 * Pure — no RPC. Use for tool validation and offline unit tests.
 */
export function buildSolanaAddressContext(
  input: string,
  options?: { network?: SolanaNetwork },
): SolanaAddressContext | SolanaContextError {
  const resolved = resolveSolanaSymbolOrMint(input);
  if (!resolved) {
    return { ok: false, chain: "solana", error: "address or symbol required" };
  }
  if (!isSolanaAddress(resolved)) {
    return {
      ok: false,
      chain: "solana",
      error: "not a valid Solana base58 address (32–44 chars)",
    };
  }
  const known = KNOWN[resolved];
  return {
    ok: true,
    chain: "solana",
    network: options?.network || SOLANA_MAINNET,
    address: resolved,
    kind: known?.kind || "unknown",
    knownLabel: known?.label,
  };
}

/** Optional live balance read — fails soft with structured error. */
export async function fetchSolanaLamports(
  address: string,
  rpcUrl: string,
  options?: { timeoutMs?: number },
): Promise<{ ok: true; lamports: number; sol: number } | { ok: false; error: string }> {
  const ctx = buildSolanaAddressContext(address);
  if (!ctx.ok) return { ok: false, error: ctx.error };
  try {
    const res = await fetch(rpcUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "getBalance",
        params: [ctx.address],
      }),
      signal: AbortSignal.timeout(options?.timeoutMs ?? 12_000),
    });
    const json = (await res.json()) as { result?: { value?: number }; error?: { message?: string } };
    if (json.error) return { ok: false, error: json.error.message || "rpc error" };
    const lamports = Number(json.result?.value ?? NaN);
    if (!Number.isFinite(lamports)) return { ok: false, error: "invalid balance response" };
    return { ok: true, lamports, sol: lamports / 1e9 };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "rpc fetch failed" };
  }
}
