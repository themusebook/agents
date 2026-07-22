# @cheshire/clawd-agent-tui

**ZK Shark** — the Shark of All Streets — agent TUI for Clawd ZK primitives.

Built with [`@openrouter/agent`](https://www.npmjs.com/package/@openrouter/agent) using the [create-agent-tui](https://openrouter.ai/docs) harness pattern: streaming REPL, session persistence, pluggable tool display, and domain tools for nullifiers / Groth16 / Light Protocol workflows.

## Quick start

```bash
cd packages/clawd-agent-tui
npm install
cp .env.example .env   # set OPENROUTER_API_KEY for interactive / --agent modes

# Interactive TUI (Cheshire dark block style)
npm start

# One-shot — deterministic, no API key
npm start -- --oneshot "nullifier for model-attest:v1:demo"
npm start -- --oneshot "inspect config"
npm start -- --oneshot "help"

# One-shot with LLM + full tool loop
OPENROUTER_API_KEY=sk-or-… npm start -- --oneshot --agent "derive a nullifier for model-attest:v1:demo and explain it"
```

## Visual defaults (Cheshire dark block)

| Surface        | Style      |
|----------------|------------|
| Input          | `block`    |
| Tool display   | `grouped`  |
| Loader         | `gradient` · text `Hunting` |
| Banner         | CLAWD ASCII |

Override at launch:

```bash
npm start -- --input bordered --tool-display emoji --loader-style spinner
```

## Domain tools

| Tool | Purpose |
|------|---------|
| `zk_compute_nullifier` | SHA-256 domain-separated nullifier |
| `zk_load_proof` | Load + size-check Groth16 proof JSON |
| `zk_verify_proof_shape` | Off-chain proof shape + public-input packing |
| `zk_route_intent` | Deterministic NL → intent map |
| `zk_inspect_config` | Print `ZK_SHARK_*` / `CLAWD_ZK_*` env |
| `zk_read_manifest` | Read `MANIFEST.json` from `CLAWD_ZK_PRIMITIVES_DIR` |
| `zk_oneshot` | Route + dispatch a single ZK intent |

Plus coding tools: `file_read`, `file_write`, `file_edit`, `glob`, `grep`, `list_dir`, `shell`, and OpenRouter `web_search` + `datetime`.

## Slash commands

| Command | Description |
|---------|-------------|
| `/zk <intent>` | Deterministic one-shot inside the REPL (no model) |
| `/inspect` | Show ZK env config |
| `/model` | Switch OpenRouter model |
| `/new` | Fresh session |
| `/help` | List commands |

## Env

See [`.env.example`](./.env.example).

- **Required for LLM:** `OPENROUTER_API_KEY`
- **Optional ZK:** `ZK_SHARK_RPC_URL`, `ZK_SHARK_PROGRAM_ID`, `ZK_SHARK_KEYPAIR`, …
- **Docs root:** `CLAWD_ZK_PRIMITIVES_DIR` → e.g. `/Users/8bit/ClawdBrowser/go-bot/zk-primitives`

## Layout

```
packages/clawd-agent-tui/
  package.json
  agent.config.json
  .env.example
  src/
    cli.ts           # interactive + --oneshot entry
    agent.ts         # OpenRouter callModel loop + retry
    config.ts        # layered defaults / file / env
    banner.ts        # CLAWD ASCII logo
    renderer.ts      # grouped / emoji / minimal tool UI
    loader.ts        # gradient / spinner / minimal
    session.ts       # JSONL sessions
    commands.ts      # /zk /inspect /model /new /help
    tools/
      index.ts
      zk-tools.ts    # domain tools
      zk-crypto.ts   # nullifier + proof helpers
      zk-intent.ts   # deterministic router
      file-*.ts shell.ts …
```

## Relation to zk-primitives

The lower-level packages live at `ClawdBrowser/go-bot/zk-primitives`:

- `agent/` — `@clawd/zk-shark-agent` CLI (`zk-shark-agent`)
- `client/` — `@clawd/zk-client` SDK
- `programs/clawd-zk` — on-chain program

This TUI is the **product-facing harness**: one-shot + interactive UI with coding tools, so operators can drive ZK Shark without memorizing CLI flags. When `zk-shark-agent` is on `PATH`, `zk_oneshot` can optionally shell out (`useCli: true`).
