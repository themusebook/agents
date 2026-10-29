# Robinhood Crypto Agent Open Stack

Open-source skill pack for **anyone** building Robinhood Chain / EVM trading and launch agents with Zero Clawd (`go-bot` / `clawdbot`).

This pack is redistributable with the go-bot tree. No private monorepo paths required.

## Skills (16)

- `copy-trade` — This skill should be used when the user asks to "copy trades from" a wallet, "mirror a wallet", "follow this address", s
- `dca-bot` — This skill should be used when the user wants to "dca into" a token, "buy X every day", set up a "recurring buy", "dolla
- `deployer` — Deploy CCA (Continuous Clearing Auction) smart contracts using the Factory pattern. Use when user says "deploy auction",
- `index-bot` — This skill should be used when the user asks to "create an index", "build a basket of top assets", "buy a weighted baske
- `liquidity-planner` — This skill should be used when the user asks to "provide liquidity", "create LP position", "add liquidity to pool", "bec
- `lp-integration` — Integrate Uniswap liquidity provisioning (LP) into applications via the LP REST API. Use when the user says "LP API", "l
- `pay-with-any-token` — Pay HTTP 402 payment challenges using tokens via the Tempo CLI and Uniswap Trading API. Use when the user encounters a 4
- `pay-with-app` — Pay HTTP 402 payment challenges issued by OKX's Agent Payments Protocol (APP) on X Layer using tokens from any chain via
- `rh-bonded-launch` — Launch a permissionless bonding-curve token on Robinhood Chain (4663) via the live BondingCurveLaunchpad, or guide a use
- `rh-launchpad-v3` — Launch a permissionless bonding-curve token on Robinhood Chain (4663) via BondingCurveLaunchpadV3 — graduates into a Uni
- `swap-integration` — Integrate Uniswap swaps into applications. Use when user says "integrate swaps", "uniswap", "trading api", "add swap fun
- `swap-planner` — This skill should be used when the user asks to "swap tokens", "trade ETH for USDC", "exchange tokens on Uniswap", "buy 
- `v4-hook-generator` — Generate Uniswap v4 hook contracts via OpenZeppelin MCP. Use when building custom swap logic, async swaps, hook-owned li
- `v4-sdk-integration` — App-layer SDK guide for building swap and liquidity experiences directly with the Uniswap v4 SDK. Use when user asks abo
- `v4-security-foundations` — Security-first Uniswap v4 hook development. Use when user mentions "v4 hooks", "hook security", "PoolManager", "beforeSw
- `viem-integration` — Integrate EVM blockchains using viem. Use when user says "read blockchain data", "send transaction", "interact with smar

## Point clawdbot at this pack

From the go-bot checkout:

```bash
export CLAWDBOT_SKILLS_DIR="$(pwd)/skills"
clawdbot catalog skills
# or
go run ./cmd/clawdbot catalog skills --skills-dir ./skills
```

When `CLAWDBOT_SKILLS_DIR` is unset, go-bot prefers this bundled `./skills` directory if present (walked from the current working directory), then falls back to `~/skills/skills`.

Solana-first catalogs remain usable: set `CLAWDBOT_SKILLS_DIR` to your Solana skill library; the bundled RH/EVM pack is still merged into `catalog` reports when discovered.

## Robinhood use cases

- Permissionless bonded token launch (`rh-bonded-launch`) and V3 graduation (`rh-launchpad-v3`)
- Swaps / LP / Uniswap v4 hooks via the Uniswap-oriented skills
- DCA, index baskets, and copy-trade strategy skills
- EVM reads/writes with `viem-integration`

## License

Same as the parent repository (MIT) unless individual skill files note otherwise.
