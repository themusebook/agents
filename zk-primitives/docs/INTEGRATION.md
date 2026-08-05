# Clawd ZK Integration

This directory is the ZK subsystem for `clawdbot-go`. It is designed to be
read by three surfaces:

- The Go runtime catalog command: `clawdbot catalog zk`
- The local skill library through `zk-primitives/agent/SKILL.md`
- The local agent catalog through Clawd agents that call `@clawd/zk-agent`
- The Cloudflare installer metadata endpoint:
  `/.well-known/clawdbot-zk.json`

## Local Catalog Roots

The runtime defaults to these local roots:

| Surface | Default | Override |
|---|---|---|
| Skills | `/Users/8bit/skills/skills` | `CLAWDBOT_SKILLS_DIR` |
| Agents | `/Users/8bit/agents/agents/src` | `CLAWDBOT_AGENTS_DIR` |
| ZK primitives | `./zk-primitives` | `CLAWDBOT_ZK_PRIMITIVES_DIR` |

Use:

```bash
clawdbot catalog
clawdbot catalog skills zk
clawdbot catalog agents zk
clawdbot catalog zk
clawdbot catalog --json
```

The catalog command is read-only. It does not install packages, execute skills,
sign transactions, or send Solana instructions.

## Edge Discovery

The Cloudflare Worker in `cloudflare/install-worker.js` publishes a read-only
view of this directory for install pages, CLIs, and dashboards:

```bash
curl -fsSL https://install.onchainai.fund/.well-known/clawdbot-zk.json
curl -fsSL https://zk.x402.wtf/clawdbot/.well-known/clawdbot-zk.json
```

The endpoint mirrors the local manifest shape: package names, operation names,
docs, accepted environment variables, and trust gates. Treat it as discovery
data only. A caller that wants to build or submit an instruction must still load
the local package and pass the runtime trust gate.

## Runtime Shape

```text
user / agent intent
  -> @clawd/zk-agent routeIntent()
  -> ClawdZkAgent method
  -> @clawd/zk-client instruction builder
  -> clawd-zk Anchor program
  -> Light Protocol compressed state
```

The agent package owns intent routing and operator-friendly commands. The client
package owns byte packing, public inputs, nullifiers, and instruction building.
The on-chain program owns Groth16 verification and compressed-state updates.

## Trust Gates

| Action | Trust level | Notes |
|---|---|---|
| Inspect config | Observer | Local only |
| Verify proof shape | Observer | Structural sanity check, no pairing |
| Compute nullifier | Observer | Local hash derivation |
| Build instruction | Dry-Run | Produces a transaction instruction |
| Sign and send | Delegated | Requires explicit signer/operator policy |

Live transaction submission should remain outside automatic catalog discovery.
The catalog can show that ZK capability exists; it should not silently arm it.

## Package Boundaries

| Path | Owner | Contract |
|---|---|---|
| `agent/` | Agent wrapper | Deterministic routing, CLI, config inspection |
| `client/` | SDK | Types, proof packing, nullifier derivation, instruction builders |
| `configs/` | Network metadata | Light tree addresses and runtime examples |
| `docs/` | Architecture | Design, trust model, integration guidance |
| `programs/` | On-chain program | Anchor instruction handlers and Light CPI boundary |
| `tests/` | Cross-package tests | Off-chain SDK tests and on-chain test notes |

## Production Checklist

1. Pin trusted verifying keys per circuit instead of accepting arbitrary VKs.
2. Run `npm test` for the TypeScript packages.
3. Run `cargo test-sbf -p clawd-zk` with a Light-compatible validator.
4. Publish the final `MANIFEST.json` alongside package versions and deployment IDs.
5. Run `node --test cloudflare/install-worker.test.mjs`.
6. Verify the deployed Worker metadata endpoint before announcing install URLs.
