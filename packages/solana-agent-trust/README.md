# Cheshire Solana Agent Trust

Anchor program implementing Solana-native reputation and validation records for
MPL Core-backed Cheshire agent identities.

The program is not deployed. `declare_id!` is a development placeholder and
must be replaced with a reviewed deployment key before any cluster deployment.

Security properties:

- an `AgentRoot` can only be initialized by the current MPL Core asset owner;
- owner changes must be refreshed from the decoded MPL Core asset account;
- owners cannot review their own agents;
- feedback is reviewer-owned, ordered, and revocable;
- validation requests are owner-authorized and only the named validator can
  respond;
- evidence and tags are fixed-size hashes, keeping account rent bounded; and
- repeated validation responses are sequence-numbered for progressive finality.

Build and test:

```bash
cd packages/solana-agent-trust
cargo test
anchor build
```
