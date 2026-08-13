# @cheshire/tigris-agent-storage

Private Clawd package for **Tigris** agent storage. The runnable source lives in [`robinhood-src/tigrisStorage.js`](../../robinhood-src/tigrisStorage.js) so `ct-agents storage` ships with `cheshire-terminal-agents`.

**Pattern:** writer PutObject → object notification webhook → watcher GetObject. Zero polling.

```bash
ct-agents storage status
ct-agents storage provision --agent elizero --url https://host/webhook --dry-run
ct-agents storage handoff --from elizero --to hedgedna --file ./report.json
ct-agents storage webhook --port 8788
```

Live SDK (`@tigrisdata/storage`) is optional. Without credentials the CLI uses a local file/memory adapter.

See [`skills/tigris-agent-storage/SKILL.md`](../../skills/tigris-agent-storage/SKILL.md) (Clawd playbook) and [`TIGRIS.md`](../../TIGRIS.md) (this repo’s bucket names and env).

Official Tigris skills (SDK, objects, buckets, agent-kit) install separately:

```bash
npx skills add tigrisdata/skills --skill '*' --agent cursor -y --copy
```
