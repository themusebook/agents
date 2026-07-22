# Cheshire LayerZero Omnichain (Solana ↔ Robinhood)

> Canonical OFT, authenticated OApp, and lzRead implementations all live in
> `my-lz-oapp/`. This directory is retained only for protocol notes; its legacy
> Endpoint-direct contracts were removed because they were not ReadCodecV1 /
> official OApp implementations and were unsafe deployment targets.

Omnichain mesh for **Cheshire Terminal** `/zero`:

| Standard | Role |
|----------|------|
| **OApp** | Chain-scoped authenticated agent intents (msgType 3) |
| **OFT** | Unified `$CLAWD` supply (Solana adapter + RH mint) |
| **lzRead** | Pull remote EVM state onto ReadLib origin (Base/ETH/…) |

| Chain | EID | Endpoint V2 |
|-------|-----|-------------|
| Solana mainnet | **30168** | `76y77prsiCMvXMjuoZ5VRrhG5qYBrUMYTE5WgHqgjEn6` |
| Robinhood Chain | **30416** (4663) | `0x6f475642a6e85809b1c36fa62763669b1b48dd5b` |

## Canonical contracts

- `../../my-lz-oapp/contracts/CheshireOmnichainOApp.sol` — official OApp base,
  Robinhood chain identity-registry authorization, chain-scoped replay state
- `../../my-lz-oapp/programs/cheshire_oapp/` — Solana OApp using Endpoint clear,
  canonical Agent Identity PDAs, and consumed-intent PDAs
- `../../my-lz-oapp/contracts/CheshireOAppRead.sol` — official OAppRead +
  ReadCodecV1 origin for Base

### lzRead notes

- Channel ID: `4294967295`
- Origins with ReadLib1002: Ethereum `30101`, Base `30184`, Arbitrum `30110`, Optimism `30111`
- **Robinhood / Solana have no ReadLib** — they cannot originate queries
- Scaffold: `LZ_ENABLE_READ_EXAMPLE=1 npx create-lz-oapp@latest --example oapp-read`

### Build and deploy

```bash
pnpm lz:compile
pnpm lz:deploy:oapp:robinhood
pnpm lz:deploy:read:base
```

### Wire peers

```text
# On Robinhood OApp:
setPeer(30168, bytes32(<Solana OApp Store pubkey>))

# On Solana OApp (via LZ Solana SDK / CLI):
set peer → 30416 → bytes32(leftPad(Robinhood OApp address))
```

See `../../my-lz-oapp/layerzero.intents.config.ts` for the deployed intent graph.

### Env (Cheshire API)

```bash
LAYERZERO_OAPP_ROBINHOOD=0x…
LAYERZERO_OAPP_SOLANA_STORE=…
LAYERZERO_OAPP_SOLANA_PROGRAM=…
LAYERZERO_OAPP_PEER_SOLANA=1
LAYERZERO_OAPP_PEER_ROBINHOOD=1
```

## Product

- UI: `https://cheshireterminal.ai/zero`
- API: `GET /api/layerzero/status` · `POST /api/layerzero/oapp/plan`

## Docs

- https://docs.layerzero.network/llms.txt
- OApp: https://docs.layerzero.network/v2/developers/evm/oapp/overview
- Solana OApp: https://docs.layerzero.network/v2/developers/solana/oapp/overview
- Solana OFT: https://docs.layerzero.network/v2/developers/solana/oft/overview
