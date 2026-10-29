/**
 * Tool registry: OpenAI-compatible tool definitions + local executors.
 * Domain tools are client-executed; OpenRouter server tools are declared only.
 */

import type { HeadlessConfig } from "../config.js";
import {
  buildSolanaAddressContext,
  fetchSolanaLamports,
  isSolanaAddress,
  resolveSolanaSymbolOrMint,
} from "./solana-context.js";
import {
  ROBINHOOD_CHAIN_ID,
  buildRhAddressContext,
  fetchRhEthBalance,
  multiChainCapabilitySummary,
} from "./rh-evm-context.js";

export type ToolDefinition = {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
};

export type ServerToolDefinition =
  | { type: "openrouter:web_search" }
  | { type: "openrouter:web_fetch" }
  | { type: "openrouter:datetime" }
  | {
      type: "openrouter:subagent";
      parameters: {
        model: string;
        max_completion_tokens?: number;
        instructions?: string;
      };
    };

export type AnyTool = ToolDefinition | ServerToolDefinition;

const DOMAIN_TOOLS: ToolDefinition[] = [
  {
    type: "function",
    function: {
      name: "solana_resolve_address",
      description:
        "Normalize a Solana mint/wallet or symbol (SOL, USDC, CLAWD) into a structured address context. Offline-safe.",
      parameters: {
        type: "object",
        properties: {
          address_or_symbol: {
            type: "string",
            description: "Base58 address or symbol SOL/USDC/CLAWD",
          },
        },
        required: ["address_or_symbol"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "solana_get_balance",
      description:
        "Fetch SOL lamports balance for a Solana wallet via JSON-RPC. Read-only.",
      parameters: {
        type: "object",
        properties: {
          address: { type: "string", description: "Solana wallet address" },
        },
        required: ["address"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "rh_resolve_address",
      description:
        "Normalize a Robinhood Chain (EVM chain id 4663) 0x address and return explorer URL. Offline-safe.",
      parameters: {
        type: "object",
        properties: {
          address: { type: "string", description: "0x-prefixed EVM address" },
        },
        required: ["address"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "rh_get_balance",
      description:
        "Fetch native ETH balance on Robinhood Chain (4663) via eth_getBalance. Read-only.",
      parameters: {
        type: "object",
        properties: {
          address: { type: "string", description: "0x address on RH chain" },
        },
        required: ["address"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "multi_chain_capabilities",
      description:
        "Return which chains this harness supports (Solana mainnet + Robinhood EVM 4663) and address formats.",
      parameters: {
        type: "object",
        properties: {},
        additionalProperties: false,
      },
    },
  },
];

export function listDomainToolNames(): string[] {
  return DOMAIN_TOOLS.map((t) => t.function.name);
}

export function buildToolList(cfg: HeadlessConfig): AnyTool[] {
  const tools: AnyTool[] = [...DOMAIN_TOOLS];
  if (cfg.enableWebSearch) {
    tools.push({ type: "openrouter:web_search" });
    tools.push({ type: "openrouter:datetime" });
  }
  if (cfg.enableSubagent) {
    tools.push({
      type: "openrouter:subagent",
      parameters: {
        model: cfg.workerModel,
        max_completion_tokens: 1024,
        instructions:
          "Complete the subtask exactly. Be concise. No private keys. Return structured findings only.",
      },
    });
  }
  return tools;
}

export async function executeDomainTool(
  name: string,
  args: Record<string, unknown>,
  cfg: HeadlessConfig,
): Promise<string> {
  switch (name) {
    case "solana_resolve_address": {
      const input = String(args.address_or_symbol ?? args.address ?? "");
      return JSON.stringify(buildSolanaAddressContext(input));
    }
    case "solana_get_balance": {
      const address = String(args.address ?? "");
      if (!isSolanaAddress(resolveSolanaSymbolOrMint(address)) && !isSolanaAddress(address)) {
        return JSON.stringify({ ok: false, error: "invalid Solana address" });
      }
      const bal = await fetchSolanaLamports(address, cfg.solanaRpcUrl);
      return JSON.stringify(bal);
    }
    case "rh_resolve_address": {
      return JSON.stringify(buildRhAddressContext(String(args.address ?? "")));
    }
    case "rh_get_balance": {
      const bal = await fetchRhEthBalance(String(args.address ?? ""), cfg.rhRpcUrl);
      return JSON.stringify(bal);
    }
    case "multi_chain_capabilities": {
      return JSON.stringify({
        ok: true,
        ...multiChainCapabilitySummary(),
        rhChainId: ROBINHOOD_CHAIN_ID,
      });
    }
    default:
      return JSON.stringify({ ok: false, error: `unknown domain tool: ${name}` });
  }
}

export function isDomainTool(name: string): boolean {
  return DOMAIN_TOOLS.some((t) => t.function.name === name);
}
