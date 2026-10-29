# Robinhood Crypto Agent Open Stack

**Anyone can use this.** Zero Clawd (`go-bot` / `clawdbot`) ships an open-source
Robinhood Chain / EVM crypto-agent skill pack under [`../skills`](../skills).

No private monorepo paths, no paid gate to *read* the skills. You bring your own
wallet, RPC, and risk limits for live execution.

## What it is

A redistributable skill pack for agent hosts (Claude Code, Codex, clawdbot, etc.)
covering:

| Area | Skills |
|------|--------|
| Robinhood launch | `rh-bonded-launch`, `rh-launchpad-v3` |
| Swaps / Uniswap | `swap-planner`, `swap-integration`, `v4-sdk-integration`, `v4-hook-generator`, `v4-security-foundations` |
| Liquidity | `liquidity-planner`, `lp-integration` |
| Strategy bots | `copy-trade`, `dca-bot`, `index-bot` |
| Auctions / CCA | `deployer` |
| Payments | `pay-with-any-token`, `pay-with-app` |
| EVM primitives | `viem-integration` |

Pack metadata: `skills/pack-index.json` · flat catalog: `skills/catalog.json`.

## Install / resolve (clean clone)

```bash
cd go-bot   # this repository

# Option A — default discovery (bundled ./skills when pack-index.json is present)
unset CLAWDBOT_SKILLS_DIR
clawdbot catalog skills
# or during development:
go run ./cmd/clawdbot catalog skills --skills-dir ./skills

# Option B — explicit env (recommended for scripts / CI)
export CLAWDBOT_SKILLS_DIR="$(pwd)/skills"
clawdbot catalog skills
```

Environment variables:

| Variable | Role |
|----------|------|
| `CLAWDBOT_SKILLS_DIR` | Skill catalog root (defaults to bundled `./skills` when found, else `~/skills/skills`) |
| `CLAWDBOT_MERGE_BUNDLED_SKILLS` | Set to `0` to disable additive merge of the RH pack when using another skills dir |

Solana-first libraries remain supported: point `CLAWDBOT_SKILLS_DIR` at your
Solana skill tree. When the go-bot checkout is on disk, catalog reports **merge**
the RH/EVM pack by default so Solana + Robinhood skills coexist.

## CLI

```bash
clawdbot catalog                 # full report (skills + agents + zk)
clawdbot catalog skills          # skill list (includes RH pack when resolved)
clawdbot catalog skills rh       # filter query example
```

## Safety

- Skills are **documentation + agent procedures**, not auto-executing wallets.
- Live RH mainnet, Uniswap, and payment flows require keys you control; never
  commit private keys (see `SECURITY.md` and Clawd Guard patterns).
- Bonded launch factories may be source-verified but unaudited — use small amounts.

## Relationship to ClawdBrowser

The same skill content is developed under ClawdBrowser `.agents/skills/` and
vendored into `go-bot/skills/` so the open runtime can be cloned standalone.
