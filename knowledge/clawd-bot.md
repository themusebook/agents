# CLAWD Bot (`clawd_bot/`)

Portable Cheshire Terminal pop-out companion package: `@cheshire/clawd-bot`.

> ClawdBrowser-local path: `clawd_bot/`. Related monorepo free-router constants live in `src/lib/openrouter/free-router-public.ts`.

---

## What it is

A two-tier chat companion:

| Tier | Who | Backend | Model |
| ---- | --- | ------- | ----- |
| **Public free** | Anyone | OpenRouter `POST /api/v1/chat/completions` | Free Models Router or pinned `:free` model |
| **Holder** | Verified $CLAWD holders | xAI Responses API | Grok 4.5 (`previous_response_id` chaining) |

Production Cheshire still mounts the monolith companion (`ClawdCompanion`); this package extracts the portable surface for reuse (e.g. `clawdbot.net`).

---

## Package layout

```text
clawd_bot/
  client/
    ClawdBot.tsx                 # portable pop-out UI
    components/ClawdCompanion*   # production snapshot
    lib/companionChat*.ts        # routing, threads, SSE parse, tests
  server/
    routes/chat.ts               # portable free + holder stream router
    routes/companion-chat.ts     # file-backed thread store
    lib/openrouter-attribution.ts
  reference/                     # production clawdrouter + xai snapshots
  .env.example
  README.md
  SOURCE_MAP.md
```

Exports:

- `@cheshire/clawd-bot/client` → `ClawdBot`
- `@cheshire/clawd-bot/server` → `createClawdBotChatRouter`, `resolveClawdBotFreeModel`, `companionThreadRouter`, free-model helpers

Verify: `npm --prefix clawd_bot run check`

---

## Free model resolution

Implemented in `clawd_bot/server/routes/chat.ts` → `resolveClawdBotFreeModel`.

| Priority | Source |
| -------- | ------ |
| 1 | Request body `model` (only if free — see gate below) |
| 2 | `createClawdBotChatRouter({ freeModel })` |
| 3 | `OPENROUTER_FREE_MODEL_CLAWD` |
| 4 | `OPENROUTER_FREE_MODEL` |
| 5 | `OPENROUTER_FREE` |
| 6 | Default `openrouter/free` |

### Free model forms (OpenRouter)

1. **Free Models Router** — auto-selects an available free model:

   ```json
   { "model": "openrouter/free" }
   ```

2. **Pinned free variant** — append `:free`:

   ```json
   { "model": "cohere/north-mini-code:free" }
   { "model": "meta-llama/llama-3.2-3b-instruct:free" }
   ```

Gate: `isOpenRouterFreeModelId()` — accepts `openrouter/free` or any id ending in `:free`. Paid models on the free-chat route return `400`.

Docs:

- Free variant: https://openrouter.ai/docs/guides/routing/model-variants/free
- Free Models Router: https://openrouter.ai/docs/guides/routing/routers/free-router
- App attribution: https://openrouter.ai/docs/app-attribution

---

## OpenRouter free-chat request shape

```http
POST https://openrouter.ai/api/v1/chat/completions
Authorization: Bearer $OPENROUTER_API_KEY
Content-Type: application/json
HTTP-Referer: <CLAWD_BOT_APP_URL>
X-Title: <CLAWD_BOT_APP_TITLE>
X-OpenRouter-Title: <CLAWD_BOT_APP_TITLE>
X-OpenRouter-Categories: cli-agent,cloud-agent
```

```json
{
  "model": "openrouter/free",
  "stream": true,
  "messages": [{ "role": "user", "content": "Hello" }],
  "temperature": 0.6,
  "max_tokens": 700
}
```

Optional body fields:

- `model` — free-only override
- `reasoning` — thinking-token map for supported models
- `reasoning_details` on prior assistant messages — preserved for multi-turn reasoning continuity

SSE is piped raw from OpenRouter; the client parses `choices[0].delta.content`.

---

## Holder path (Grok 4.5)

- Endpoint: xAI `POST https://api.x.ai/v1/responses`
- Auth: `XAI_API_KEY` + `isHolder(req)` callback
- Stateful chain via `previous_response_id` (no full-history resend)
- Client helpers: `buildGrok45TurnBody`, `shouldChainPreviousResponse` in `client/lib/companionChat.ts`

---

## Environment

| Variable | Role |
| -------- | ---- |
| `OPENROUTER_API_KEY` | Public free chat (or `CLAWDROUTER_API_KEY`) |
| `OPENROUTER_FREE_MODEL` | Project free model / router |
| `OPENROUTER_FREE` | Alias used if FREE_MODEL unset |
| `OPENROUTER_FREE_MODEL_CLAWD` | Bot-specific override (highest env priority) |
| `XAI_API_KEY` | Holder Grok chat |
| `CLAWD_BOT_APP_URL` | OpenRouter `HTTP-Referer` |
| `CLAWD_BOT_APP_TITLE` | OpenRouter title headers |

Never put provider keys in `NEXT_PUBLIC_*` or browser env.

`GET /status` returns `freeModel`, `freeRouter` (bool), `freeEndpoint`, `freeConfigured`, `holderConfigured`.

---

## Production vs portable mounts

| Surface | Path |
| ------- | ---- |
| Production free stream | `/api/clawdrouter/free-chat/stream` |
| Production holder stream | `/api/xai/grok45/chat/stream` |
| Production threads | `/api/companion/threads` |
| Production full desk | `/clawd-agent` |
| Portable package | `/api/clawd-bot/*` (when mounted) |

`reference/` snapshots preserve monolith routes; portable `server/routes/chat.ts` avoids trading/analytics imports.

---

## Character voice (public guide)

Canonical character bible: `knowledge/clawd-character.md`.

Runtime prompt (compressed for free models): `COMPANION_PUBLIC_SYSTEM_PROMPT` in `clawd_bot/client/lib/companionChat.ts`, used by:

- `client/lib/companionChatStream.ts` (public free path)
- `client/ClawdBot.tsx` (portable pop-out)

Rules encoded: voice adjectives, no invented balances/txids, Three Laws, economic loop, lobster imagery sparingly, free tier cannot run paid tools (holders unlock Grok 4.5).
---

## Agent Knowledge Summary

> Quick-lookup for agents loading companion / OpenRouter free-chat context.

- Package: `clawd_bot/` → `@cheshire/clawd-bot`
- Free default: `openrouter/free` (Free Models Router)
- Pin example: `cohere/north-mini-code:free`
- Free resolution: body.model → option → `*_CLAWD` → `OPENROUTER_FREE_MODEL` → `OPENROUTER_FREE` → default
- Free-only gate on public stream (reject paid model ids)
- Attribution: `HTTP-Referer` + `X-Title` + `X-OpenRouter-Title` + categories
- Holders: Grok 4.5 Responses + `previous_response_id`
- Check: `npm --prefix clawd_bot run check`
- Monorepo twin: `src/lib/openrouter/free-router-public.ts` (`OPENROUTER_FREE_ROUTER_MODEL`)
- JSONL cross-refs: `fact-clawdbot-001`, `cbfact-011`, `api-011`, `pattern-011`, `gotcha-010`, `decision-009`, `anti-011`
