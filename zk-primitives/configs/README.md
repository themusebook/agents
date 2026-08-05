# ZK Configs

Configuration files for Clawd ZK network and tree metadata.

## Files

| File | Purpose |
|---|---|
| `light-trees.yaml` | Canonical Light Protocol tree, queue, CPI context, and lookup-table addresses |
| `clawdbot-zk.example.json` | Runtime-facing example config for catalog and agent wiring |
| `cloudflare-worker.example.json` | Worker-facing metadata vars and trust-gate defaults for edge distribution |

## Operational Rules

- Treat tree addresses as network-specific deployment data.
- Re-verify addresses before production releases.
- Keep wallet keypairs and API keys out of this directory.
- Use environment variables for operator-specific values.

Relevant environment variables:

```bash
CLAWD_ZK_RPC_URL=
CLAWD_ZK_PROGRAM_ID=
CLAWD_ZK_PHOTON_URL=
CLAWD_ZK_API_KEY=
CLAWD_ZK_COMMITMENT=confirmed
CLAWD_ZK_KEYPAIR=
CLAWD_ZK_NETWORK=mainnet
```

Cloudflare metadata vars are non-secret deployment descriptors. Keep them in
`wrangler.toml` or a generated environment, not in shell files that also hold
operator keys.
