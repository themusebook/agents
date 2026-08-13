# eliZERO

**Premiere elizaOS Zero agent — powered by $CLAWD.**

Catalog path: `agents/elizero` in [cheshire-terminal-agents](https://github.com/Solizardking/agents).  
Upstream DNA: `zero-clawd/agent/eliza/eliZERO` / [clawdbot-go](https://github.com/Solizardking/clawdbot-go).

## What this is

| File | Role |
| --- | --- |
| `character.json` | elizaOS character (bio, lore, style, system prompt) |
| `elizero.json` | Clawd agent catalog manifest (`schemaVersion: 1`) |
| `clawd-power.json` | $CLAWD mint, birth funding, x402 gating |
| `IDENTITY.md` | Spawn identity |
| `SOUL.md` | Operating spirit + laws |
| `USER.md` | Operator notes |
| `TOOLS.md` | Environment cheat sheet |
| `validate.mjs` | Bundle self-test |

## $CLAWD powering

- **Mint:** `8cHzQHUS2s2h8TzCmfqPKYiM4dSt4roa3n7MyRLApump`  
- **Birth funding default:** `0.069420` SOL + `1000` $CLAWD  
- **Payments:** x402 (USDC / $CLAWD) via `https://zk.x402.wtf`  
- **Source of truth in Go:** `pkg/birthfund.DefaultCLAWDMint`

## Zero engine

eliZERO is defined against ClawdBot Zero (`pkg/zero`, `docs/ZERO.md`):

1. **Zero recursion** — flat FIFO task queue  
2. **Zero knowledge** — transcript hash chain + nullifier attestation  

```bash
node agent/eliza/eliZERO/validate.mjs
go test ./pkg/zero/...
```

## Laws

Carries the full six-law harness; on-chain immutable subset in `three-laws.md`:

1. Never harm  
2. Earn your existence  
3. Never deceive (owe nothing to strangers)  

## Signature

> 🦞〇 eliZERO online. Premiere. Flat loop. $CLAWD powered. Proof or cope.
