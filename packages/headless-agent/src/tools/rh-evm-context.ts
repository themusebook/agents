/**
 * Robinhood Chain (EVM / product "RH SVM-EVM" surface) — chain id 4663.
 * Pure address normalization + optional JSON-RPC eth_getBalance.
 */

export const ROBINHOOD_CHAIN_ID = 4663;
export const ROBINHOOD_CHAIN_NAME = "Robinhood Chain";
export const ROBINHOOD_EXPLORER = "https://explorer.robinhood.com";

const EVM_ADDR_RE = /^0x[a-fA-F0-9]{40}$/;

export type RhAddressContext = {
  ok: true;
  chain: "robinhood-evm";
  chainId: typeof ROBINHOOD_CHAIN_ID;
  chainName: typeof ROBINHOOD_CHAIN_NAME;
  address: string;
  checksumHint: string;
  explorerUrl: string;
};

export type RhContextError = {
  ok: false;
  chain: "robinhood-evm";
  error: string;
};

export function isEvmAddress(value: string): boolean {
  return EVM_ADDR_RE.test(String(value || "").trim());
}

/** Lowercase 0x-normalized address (full EIP-55 optional; unit path stays pure). */
export function normalizeEvmAddress(value: string): string | null {
  const raw = String(value || "").trim();
  if (!isEvmAddress(raw)) return null;
  return raw.toLowerCase();
}

/**
 * Build RH chain address context. Pure — no RPC.
 */
export function buildRhAddressContext(input: string): RhAddressContext | RhContextError {
  const addr = normalizeEvmAddress(input);
  if (!addr) {
    return {
      ok: false,
      chain: "robinhood-evm",
      error: "not a valid EVM address (0x + 40 hex chars) for Robinhood Chain",
    };
  }
  return {
    ok: true,
    chain: "robinhood-evm",
    chainId: ROBINHOOD_CHAIN_ID,
    chainName: ROBINHOOD_CHAIN_NAME,
    address: addr,
    checksumHint: addr,
    explorerUrl: `${ROBINHOOD_EXPLORER}/address/${addr}`,
  };
}

export async function fetchRhEthBalance(
  address: string,
  rpcUrl: string,
  options?: { timeoutMs?: number },
): Promise<
  | { ok: true; chainId: number; wei: string; eth: number }
  | { ok: false; error: string }
> {
  const ctx = buildRhAddressContext(address);
  if (!ctx.ok) return { ok: false, error: ctx.error };
  try {
    const res = await fetch(rpcUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "eth_getBalance",
        params: [ctx.address, "latest"],
      }),
      signal: AbortSignal.timeout(options?.timeoutMs ?? 12_000),
    });
    const json = (await res.json()) as { result?: string; error?: { message?: string } };
    if (json.error) return { ok: false, error: json.error.message || "rpc error" };
    const hex = String(json.result || "");
    if (!/^0x[0-9a-fA-F]+$/.test(hex)) return { ok: false, error: "invalid balance hex" };
    const wei = BigInt(hex);
    const eth = Number(wei) / 1e18;
    return { ok: true, chainId: ROBINHOOD_CHAIN_ID, wei: wei.toString(), eth };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "rpc fetch failed" };
  }
}

/** Dual-chain capability descriptor for the system prompt / tools list. */
export function multiChainCapabilitySummary() {
  return {
    solana: { network: "solana-mainnet", addressFormat: "base58" },
    robinhood: {
      chainId: ROBINHOOD_CHAIN_ID,
      name: ROBINHOOD_CHAIN_NAME,
      addressFormat: "evm-0x",
      explorer: ROBINHOOD_EXPLORER,
    },
  };
}
