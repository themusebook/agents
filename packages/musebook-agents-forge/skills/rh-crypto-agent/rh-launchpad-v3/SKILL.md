---
name: rh-launchpad-v3
description: >
  Launch a permissionless bonding-curve token on Robinhood Chain (4663) via
  BondingCurveLaunchpadV3 — graduates into a Uniswap V3 pool (not V2). Use for
  bots, agents, Telegram, "launch with V3 pool", createToken on LaunchpadV3,
  curve-v3 rail, or FunPump https://funpump.ai/api/launchpad/v3. Distinct from legacy V2
  BondingCurveLaunchpad and from NOXA Fun instant V3.
---

# RH Launchpad V3 — curve → Uniswap V3 graduate

## Product truth

| | |
|--|--|
| **Anyone can launch** | EVM wallet + ETH on **Robinhood mainnet 4663** |
| **Asset** | New unbacked community ERC-20 (not Solana `$CLAWD`, not wCLAWD) |
| **Trade** | Bonding curve buy/sell until ~**2.864 ETH** raised |
| **Graduate** | **`V3PoolBootstrap`** → real **Uniswap V3** pool (NPM mint, LP to dead) |
| **Factory** | `0x27f27F998fdBa2a38C136Bb3E7a8BA43155798Cd` |

Legacy V2 pad `0x52603DC0…` is a different contract (V2 graduate). Prefer **V3** for new agent launches.

## Canonical endpoints (FunPump.ai)

| Method | Path | Auth |
|--------|------|------|
| `GET` | `/api/launchpad/v3` | Public — factory status + cfg |
| `POST` | `/api/launchpad/v3/prepare` | Public — unsigned `createToken` tx |
| `POST` | `/api/launchpad/v3/submit` | Public — broadcast signed `rawTx` |
| `GET` | `/api/launchpad/v3/token?address=0x…` | Public — curve + `v3Pool` |

Base: `https://funpump.ai`  
UI: `https://funpump.ai/launch` (curve rail) · trade `https://funpump.ai/launch/{token}`  
Explorer: `https://robinhoodchain.blockscout.com/address/0x27f27F998fdBa2a38C136Bb3E7a8BA43155798Cd`

## Telegram / bot flow (recommended)

```text
1. POST /api/launchpad/v3/prepare
   { "name": "My Coin", "symbol": "MYC", "devBuyEth": "0.01", "from": "0xBot…" }

2. Sign response.eth_sendTransaction with bot EVM key (chainId 0x1237 = 4663)

3. POST /api/launchpad/v3/submit
   { "rawTx": "0x…", "wait": true }

4. Reply user with response.telegram + response.tradeUrl
```

### curl examples

```bash
# Status
curl -sS 'https://funpump.ai/api/launchpad/v3' | jq '{launchpad,tokenCount,cfg}'

# Prepare (unsigned)
curl -sS -X POST 'https://funpump.ai/api/launchpad/v3/prepare' \
  -H 'content-type: application/json' \
  -d '{"name":"Agent Coin","symbol":"AGT","devBuyEth":"0"}' | jq .

# Submit signed raw tx
curl -sS -X POST 'https://funpump.ai/api/launchpad/v3/submit' \
  -H 'content-type: application/json' \
  -d '{"rawTx":"0x02f8…","wait":true}' | jq '{token,tradeUrl,txHash}'
```

### Prepare response (shape)

```json
{
  "ok": true,
  "chainId": 4663,
  "launchpad": "0x27f27F99…",
  "rail": "curve-v3",
  "graduatePoolKind": "uniswap_v3_pool",
  "transaction": { "to": "0x565d…", "data": "0x…", "value": "0", "chainId": 4663 },
  "eth_sendTransaction": { "to": "0x565d…", "data": "0x…", "value": "0x0", "chainId": "0x1237" },
  "telegram": "🚀 *LaunchpadV3* …"
}
```

## Agent workflow (viem — hold user-approved key)

```ts
import { createWalletClient, createPublicClient, http, parseEther } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { defineChain } from "viem";

const RH = defineChain({
  id: 4663,
  name: "Robinhood Chain",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: ["https://rpc.mainnet.chain.robinhood.com"] } },
});

// 1) Call FunPump prepare API (or encode createToken locally from skill)
const prep = await fetch("https://funpump.ai/api/launchpad/v3/prepare", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ name: "Bot Coin", symbol: "BOT", devBuyEth: "0.01" }),
}).then((r) => r.json());

// 2) Sign + send with user key
const account = privateKeyToAccount(process.env.EVM_PRIVATE_KEY as `0x${string}`);
const wallet = createWalletClient({ account, chain: RH, transport: http() });
const hash = await wallet.sendTransaction({
  to: prep.transaction.to,
  data: prep.transaction.data,
  value: BigInt(prep.transaction.value),
  chain: RH,
});

// 3) Optional: submit path already done if you used sendTransaction;
//    or recover token from receipt TokenCreated on launchpad address.
```

Prefer **user-signed** wallet txs. Agent-held keys only with explicit approval.

## Safety rules

1. Never claim the token is `$CLAWD` / 1:1 backed.
2. Chain id must be **4663** before broadcast.
3. Re-read factory via `GET /api/launchpad/v3` — require live code + `creatorFeeShareBps == 9950`.
4. Name 2–64 chars; symbol 1–16 `[A-Z0-9._-]`.
5. Graduation pool is **Uniswap V3** — do not document V2 pair for this factory.
6. Pegged CLAWD on RH → bridge skill / `/bridge`, not this skill.

## Economics (shipped factory)

| Param | Value |
|-------|--------|
| Total / curve supply | 1B / 800M |
| Graduation | ~2.864 ETH real raised |
| Trade fee | 1% |
| Grad fee | 2% |
| Creator fee share | 99.5% |
| V3 pool fee tier | 10000 (1%) |
| Pair | WETH `0x0Bd7D308…` |

## Related

- Legacy V2 bonded launch skill: `rh-bonded-launch`
- NOXA instant V3 (no curve): `/launch?rail=noxa` · `GET /api/launchpad/noxa`
- Docs: `docs/v3-pool-from-launch.md` · `contracts/v3-launch/README.md`
- Code: `src/lib/evm/launchpad-v3.ts`, `src/lib/evm/launchpad-v3-api.ts`

## Install elsewhere

```bash
cp -R /Users/8bit/ClawdBrowser/.agents/skills/rh-launchpad-v3 \
  ~/.agents/skills/rh-launchpad-v3
```
