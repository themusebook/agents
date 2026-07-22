---
name: rh-bonded-launch
description: >
  Launch a permissionless bonding-curve token on Robinhood Chain (4663) via the live
  BondingCurveLaunchpad, or guide a user/agent to do so on FunPump /launch or Cheshire
  /rh-launch. Use when the user says "launch a token", "create token on Robinhood",
  "bonded launch", "createToken", "fair launch on RH", "pump style on robinhood",
  "open a curve", or brings an agent to funpump.ai to launch. Does NOT mint wCLAWD
  or bridge Solana $CLAWD — that is a separate bridge skill path.
---

# RH Bonded Launch — permissionless `createToken`

## Product truth (do not dilute)

**Anyone can launch a token.** No `$CLAWD` holder login. No factory allowlist.  
Requirements: **EVM wallet** + **ETH on Robinhood Chain mainnet (chain id 4663)**.

This creates a **new unbacked community ERC-20** on a bonding curve.  
It is **not** Solana `$CLAWD` and **not** wCLAWD. Pegged convert = bridge only.

## Canonical addresses

| Item | Value |
|------|--------|
| **Active factory (Cheshire / FunPump V2 graduate)** | `0x6344a4c108b8fe03e9d79523ab0ac588a45cd092` (99.5% creator share); re-read `cfg()` before signing |
| **LaunchpadV3 (curve → Uniswap V3)** | Prefer **`rh-launchpad-v3`** skill · factory `0x27f27F998fdBa2a38C136Bb3E7a8BA43155798Cd` · API `https://funpump.ai/api/launchpad/v3` |
| **Legacy factory (read/claim only)** | `0x3f60A0F1E9adDc81A45a2726a3D3c7EEEdB2C322` — 50% creator share; do not create |
| **Chain ID** | `4663` (mainnet only for this factory) |
| **Public RPC** | `https://rpc.mainnet.chain.robinhood.com` |
| **Explorer** | `https://robinhoodchain.blockscout.com/address/{activeFactory}` |
| **Human UI (FunPump)** | `https://funpump.ai/launch` (public) |
| **Trade UI** | `https://funpump.ai/launch/{tokenAddress}` |
| **List API** | `GET https://funpump.ai/api/launchpad/tokens?limit=30` |
| **Token API** | `GET https://funpump.ai/api/launchpad/token?address=0x…` |
| **Interface (repo)** | `funpump/contracts/src/interfaces/ILaunchpad.sol` |
| **TS ABI (repo)** | `src/lib/evm/launchpad-abi.ts` |

Cheshire Terminal (if integrated): `/rh-launch`, `GET /api/rh-launchpad/tokens`,  
`.well-known/rh-launchpad.json` — same factory address.

## When to use which path

| Goal | Action |
|------|--------|
| User wants to click-launch in browser | Send them to **https://funpump.ai/launch** (or Cheshire `/rh-launch`) |
| Agent has a funded EVM key + RPC | Build and send `createToken` tx (below) |
| User wants pegged CLAWD on RH | **Stop** — use bridge / wCLAWD, not this skill |
| User asks “can anyone launch?” | **Yes** — state that clearly |

## Agent workflow (browser / human-in-the-loop)

1. Confirm they understand: **new token, not $CLAWD peg**.
2. Open or deep-link: `https://funpump.ai/launch`.
3. Instruct: connect EVM wallet → switch to Robinhood Chain (4663) → name + symbol → optional ETH dev-buy → confirm tx.
4. After success, open `/launch/{token}` to buy/sell on the curve.
5. Optionally verify on Blockscout via factory `TokenCreated` logs.

## Agent workflow (programmatic — viem)

```ts
import {
  createWalletClient,
  createPublicClient,
  http,
  parseEther,
  parseEventLogs,
  defineChain,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";

const RH = defineChain({
  id: 4663,
  name: "Robinhood Chain",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: {
    default: { http: ["https://rpc.mainnet.chain.robinhood.com"] },
  },
  blockExplorers: {
    default: {
      name: "Blockscout",
      url: "https://robinhoodchain.blockscout.com",
    },
  },
});

const LAUNCHPAD_ABI = [
  {
    type: "function",
    name: "createToken",
    stateMutability: "payable",
    inputs: [
      { name: "name", type: "string" },
      { name: "symbol", type: "string" },
      { name: "minTokensOut", type: "uint256" },
    ],
    outputs: [{ name: "token", type: "address" }],
  },
  {
    type: "function",
    name: "cfg",
    stateMutability: "view",
    inputs: [],
    outputs: [
      { name: "totalSupply", type: "uint256" },
      { name: "curveSupply", type: "uint256" },
      { name: "virtualEth", type: "uint256" },
      { name: "virtualToken", type: "uint256" },
      { name: "gradEthTarget", type: "uint256" },
      { name: "tradeFeeBps", type: "uint16" },
      { name: "gradFeeBps", type: "uint16" },
      { name: "creatorFeeShareBps", type: "uint16" },
    ],
  },
  {
    type: "event",
    name: "TokenCreated",
    inputs: [
      { name: "token", type: "address", indexed: true },
      { name: "creator", type: "address", indexed: true },
      { name: "name", type: "string", indexed: false },
      { name: "symbol", type: "string", indexed: false },
      { name: "timestamp", type: "uint256", indexed: false },
    ],
  },
] as const;

/**
 * Launch a token. Never log or commit private keys.
 * Prefer user wallet signature over agent-held keys.
 */
export async function launchBondedToken(opts: {
  launchpad: `0x${string}`; // resolve from the FunPump API (https://funpump.ai) and verify cfg()
  privateKey?: `0x${string}`; // only if user explicitly authorized agent custody
  name: string;
  symbol: string;
  devBuyEth?: string; // e.g. "0.01"
  slippageBps?: bigint; // default 200
}) {
  const account = privateKeyToAccount(opts.privateKey!);
  const publicClient = createPublicClient({ chain: RH, transport: http() });
  const walletClient = createWalletClient({
    account,
    chain: RH,
    transport: http(),
  });

  const devBuyWei = opts.devBuyEth ? parseEther(opts.devBuyEth) : 0n;
  let minTokensOut = 0n;

  // Mandatory for zero-value and dev-buy launches alike. Never send to the
  // legacy 5000-bps factory or to an unverified replacement.
  const cfg = await publicClient.readContract({
    address: opts.launchpad,
    abi: LAUNCHPAD_ABI,
    functionName: "cfg",
  });
  if (cfg[7] !== 9_950) {
    throw new Error(`Launch blocked: creator fee share is ${cfg[7]} bps, expected 9950`);
  }

  if (devBuyWei > 0n) {
    const virtualEth = cfg[2];
    const virtualToken = cfg[3];
    const tradeFeeBps = BigInt(cfg[5]);
    const slip = opts.slippageBps ?? 200n;
    const ethForCurve = devBuyWei - (devBuyWei * tradeFeeBps) / 10_000n;
    const expected = (virtualToken * ethForCurve) / (virtualEth + ethForCurve);
    minTokensOut = expected - (expected * slip) / 10_000n;
  }

  const hash = await walletClient.writeContract({
    address: opts.launchpad,
    abi: LAUNCHPAD_ABI,
    functionName: "createToken",
    args: [opts.name.trim(), opts.symbol.trim(), minTokensOut],
    value: devBuyWei,
  });

  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  const [created] = parseEventLogs({
    abi: LAUNCHPAD_ABI,
    eventName: "TokenCreated",
    logs: receipt.logs,
  });

  return {
    txHash: hash,
    token: created?.args.token ?? null,
    tradeUrl: created?.args.token
      ? `https://funpump.ai/launch/${created.args.token}`
      : null,
    explorerTx: `https://robinhoodchain.blockscout.com/tx/${hash}`,
  };
}
```

### CLI alternative (Foundry)

```bash
cd funpump/contracts   # ClawdBrowser repo
export RH_RPC_URL=https://rpc.mainnet.chain.robinhood.com
export PRIVATE_KEY=0x…   # funded on 4663; never commit
export LAUNCHPAD_ADDRESS=0x6344a4c108b8fe03e9d79523ab0ac588a45cd092
export EXPECTED_LAUNCHPAD_CODEHASH=0x287ef3d4643d5d48927923b5ca0e83129563556a934db48197179ad101754592
TOKEN_NAME="MyToken" TOKEN_SYMBOL="MTK" \
DEV_BUY_WEI=$(cast to-wei 0.01 ether) SLIPPAGE_BPS=200 \
forge script script/LaunchViaLaunchpad.s.sol --rpc-url $RH_RPC_URL --broadcast
```

## Buy / sell after launch

- `buy(token, minTokensOut)` payable  
- `sell(token, tokenAmount, minEthOut)` (approve launchpad first)  
- Quotes: `getBuyQuote` / `getSellQuote`  
- Progress: `realEthRaised(token)` vs `cfg().gradEthTarget` (~2.864 ETH)  
- UI: `https://funpump.ai/launch/{token}`

## Discovery (no auth)

```bash
curl -s 'https://funpump.ai/api/launchpad/tokens?limit=10' | jq '.total, .tokens[0]'
curl -s 'https://funpump.ai/api/launchpad/token?address=0xTOKEN' | jq .
cast call "$LAUNCHPAD_ADDRESS" "tokenCount()(uint256)" \
  --rpc-url https://rpc.mainnet.chain.robinhood.com
```

## Safety rules for agents

1. **Never** claim the launched token is `$CLAWD` or 1:1 backed.
2. **Never** use bridge custody keys or `BRIDGE_ROLE` for launches.
3. Prefer **user-signed** wallet txs; agent keys only with explicit user approval and a funded throwaway EVM key.
4. Validate name ≤ 64 chars, symbol ≤ 16 chars.
5. Ensure chain id is **4663** before sending.
6. Read `cfg()` from the exact transaction target immediately before simulation/signing and require `creatorFeeShareBps == 9950`.
7. Warn about graduation / fees / irreversible deploys.
8. If the user only wants CLAWD on RH: route to **bridge**, not this skill.

## Curve snapshot (for copy / UI)

| Param | Value |
|-------|--------|
| Total supply | 1,000,000,000 |
| Curve supply | 800,000,000 (80%) |
| Graduation | ~2.864 ETH |
| Trade fee | 1% |
| Graduation fee | 2% |
| Creator share of collected fees | 99.5% |
| Protocol share of collected fees | 0.5% |

## Install this skill elsewhere

```bash
# Into another agent skills dir
cp -R /Users/8bit/ClawdBrowser/.agents/skills/rh-bonded-launch \
  ~/.agents/skills/rh-bonded-launch

# Or Cheshire skills tree
cp -R /Users/8bit/ClawdBrowser/.agents/skills/rh-bonded-launch \
  /Users/8bit/cheshire-terminal/skills/rh-bonded-launch
```

Portable duplicate: `skills/rh-bonded-launch/SKILL.md` in ClawdBrowser.

## Related docs

- Parallel Cheshire handoff: `launchagent.md` (ClawdBrowser root)
- Saga: `hood.md`
- Bridge + Option B: `funpump/README.md`
- Root product README: § “Launch a token (anyone can)”
