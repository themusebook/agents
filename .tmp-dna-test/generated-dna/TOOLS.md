# TOOLS.md - Local Notes

Skills define *how* tools work. This file is for *your* specifics — unique to this agent's setup.

## Domain focus (Clawd)

- Solana program design
- Anchor framework
- Oracle architecture
- Cross-program invocation (CPI)
- Compute budget tuning
- Anthropic Claude API
- Prompt engineering
- Memecoin mechanics
- DeFi risk
- On-chain memory and state
- Wallet UX
- Verifiable computation
- Sponge Wallet API
- x402 payments
- x402 vault custody
- Proof of execution

## What Goes Here

Things like:
- Camera names and locations
- SSH hosts and aliases
- Preferred voices for TTS
- RPC endpoints and cluster preference
- Wallet nicknames (never private keys)
- Device nicknames
- Anything environment-specific

## Why Separate?

Skills are shared. Your setup is yours. Keeping them apart means you can update skills without losing your notes, and share skills without leaking infrastructure.

## Membrain memory (default source)

Catalog agents persist typed recall in Membrain (packages/membrain). DNA files are continuity; Membrain is retrieval.

    ct-agents memory status
    ct-agents memory ingest --agent elizero --summary "session note"
    ct-agents memory retrieve --query "what did we decide"
    ct-agents memory context --agent elizero

Env: MEMBRAIN_ADAPTER=file|memory|live · MEMBRAIN_HTTP_URL · MEMBRAIN_GRPC

---

Add whatever helps you do your job. This is your cheat sheet.
