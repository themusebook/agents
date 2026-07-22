/**
 * Cheshire LayerZero omnichain mesh — Solana ↔ Robinhood Chain.
 *
 * Use with create-lz-oapp / hardhat lz:oapp:wire after deploying:
 * - Robinhood: CheshireOmnichainOApp (+ optional MyOFT)
 * - Solana: OApp Store / OFT Store from LZ Solana examples
 *
 * EIDs (mainnet):
 *   Solana    30168
 *   Robinhood 30416  (chainId 4663)
 *
 * Production: set requiredDVNs to LayerZero Labs + at least one independent DVN
 * on BOTH sides of every pathway. Never ship single-DVN.
 */

export const EID_SOLANA_MAINNET = 30168;
export const EID_ROBINHOOD_MAINNET = 30416;

export const ROBINHOOD_ENDPOINT_V2 = "0x6f475642a6e85809b1c36fa62763669b1b48dd5b";
export const SOLANA_ENDPOINT_V2 = "76y77prsiCMvXMjuoZ5VRrhG5qYBrUMYTE5WgHqgjEn6";

/** Placeholder contract names for wiring tools (replace addresses after deploy). */
export type OmniPoint = {
  eid: number;
  contractName: string;
  address?: string;
};

export const robinhoodOApp: OmniPoint = {
  eid: EID_ROBINHOOD_MAINNET,
  contractName: "CheshireOmnichainOApp",
  // address: process.env.LAYERZERO_OAPP_ROBINHOOD,
};

export const solanaOApp: OmniPoint = {
  eid: EID_SOLANA_MAINNET,
  contractName: "CheshireSolanaOApp",
  // address: process.env.LAYERZERO_OAPP_SOLANA_STORE,
};

/**
 * Bidirectional OApp pathways. When using @layerzerolabs/metadata-tools:
 *
 * generateConnectionsConfig([
 *   [robinhoodOApp, solanaOApp, [['LayerZero Labs', '<SECONDARY_DVN>'], []], [15, 32], [EVM_OPTS, SOL_OPTS]],
 * ])
 */
export const oappPathways = [
  {
    from: robinhoodOApp,
    to: solanaOApp,
    label: "Robinhood → Solana",
  },
  {
    from: solanaOApp,
    to: robinhoodOApp,
    label: "Solana → Robinhood",
  },
] as const;

/** Default enforced lzReceive gas when sending to Robinhood EVM. */
export const EVM_LZ_RECEIVE_GAS = 800_000;

/** Solana lz_receive compute units + lamports (ATA rent when needed). */
export const SOLANA_LZ_RECEIVE = { gas: 500_000, value: 0 };

export default {
  contracts: [robinhoodOApp, solanaOApp],
  connections: oappPathways,
  endpoints: {
    robinhood: ROBINHOOD_ENDPOINT_V2,
    solana: SOLANA_ENDPOINT_V2,
  },
};
