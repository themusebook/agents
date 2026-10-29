import assert from "node:assert/strict";
import test from "node:test";
import {
  CLAWD_MINT,
  SOL_MINT,
  USDC_MINT,
  buildSolanaAddressContext,
  isSolanaAddress,
  resolveSolanaSymbolOrMint,
} from "./solana-context.js";
import {
  ROBINHOOD_CHAIN_ID,
  buildRhAddressContext,
  isEvmAddress,
  multiChainCapabilitySummary,
} from "./rh-evm-context.js";
import { buildToolList, executeDomainTool, listDomainToolNames } from "./registry.js";
import { loadConfig } from "../config.js";

test("Solana resolve symbol and mint context (offline)", () => {
  assert.equal(resolveSolanaSymbolOrMint("SOL"), SOL_MINT);
  assert.equal(resolveSolanaSymbolOrMint("usdc"), USDC_MINT);
  assert.equal(resolveSolanaSymbolOrMint("CLAWD"), CLAWD_MINT);
  assert.ok(isSolanaAddress(SOL_MINT));

  const sol = buildSolanaAddressContext("SOL");
  assert.equal(sol.ok, true);
  if (!sol.ok) return;
  assert.equal(sol.chain, "solana");
  assert.equal(sol.address, SOL_MINT);
  assert.equal(sol.kind, "mint");

  const bad = buildSolanaAddressContext("not-an-address");
  assert.equal(bad.ok, false);
});

test("Robinhood EVM chain 4663 address context (offline)", () => {
  const sample = "0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73";
  assert.ok(isEvmAddress(sample));
  const ctx = buildRhAddressContext(sample);
  assert.equal(ctx.ok, true);
  if (!ctx.ok) return;
  assert.equal(ctx.chainId, ROBINHOOD_CHAIN_ID);
  assert.equal(ctx.chain, "robinhood-evm");
  assert.equal(ctx.address, sample.toLowerCase());
  assert.match(ctx.explorerUrl, /0x0bd7/);

  const bad = buildRhAddressContext("So11111111111111111111111111111111111111112");
  assert.equal(bad.ok, false);
});

test("tool registry registers dual-chain tools and executes pure tools", async () => {
  const cfg = loadConfig({ openRouterApiKey: "" });
  const names = listDomainToolNames();
  assert.ok(names.includes("solana_resolve_address"));
  assert.ok(names.includes("rh_resolve_address"));
  assert.ok(names.includes("multi_chain_capabilities"));

  const tools = buildToolList(cfg);
  assert.ok(tools.length >= names.length);

  const sol = await executeDomainTool(
    "solana_resolve_address",
    { address_or_symbol: "USDC" },
    cfg,
  );
  const solJ = JSON.parse(sol);
  assert.equal(solJ.ok, true);
  assert.equal(solJ.address, USDC_MINT);

  const rh = await executeDomainTool(
    "rh_resolve_address",
    { address: "0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73" },
    cfg,
  );
  const rhJ = JSON.parse(rh);
  assert.equal(rhJ.ok, true);
  assert.equal(rhJ.chainId, 4663);

  const caps = JSON.parse(await executeDomainTool("multi_chain_capabilities", {}, cfg));
  assert.equal(caps.ok, true);
  assert.equal(caps.rhChainId, 4663);
  assert.deepEqual(multiChainCapabilitySummary().robinhood.chainId, 4663);
});
