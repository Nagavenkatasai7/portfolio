# Ask Naga — AI Chatbot

An "Ask me anything about Naga" chatbot embedded in the portfolio. It answers
in the first person, grounded in Naga's real resume/background, and streams
responses from a free OpenRouter model (`nvidia/nemotron-3-ultra-550b-a55b:free`).

## How it's wired

```
Browser (chatbot.js)  ──POST /api/chat──▶  Vercel Edge Function (api/chat.js)
                                              ├─ api/_persona.mjs  (system prompt + facts)
                                              ├─ api/_llm.mjs      (OpenRouter streaming client)
                                              └─ OPENROUTER_API_KEY (env secret — never in the browser)
```

- **`api/chat.js`** — edge function; reads the key from `process.env`, streams SSE.
- **`api/_llm.mjs`** — OpenRouter client (caps history, drops the model's `reasoning`, yields answer text).
- **`api/_persona.mjs`** — the persona + knowledge base. **Edit `FACTS` here to keep the bot current.**
- **`chatbot.css` / `chatbot.js`** — the widget (matches the Luminous design tokens), loaded by `index.html`.

## Run locally

```bash
cp .env.local.example .env.local      # then paste your key into .env.local
node scripts/dev-server.mjs           # → http://localhost:5050
```

`.env.local` is gitignored — your key stays on your machine.

## Deploy to Vercel

1. Push this repo to GitHub.
2. On vercel.com → **Add New → Project** → import the repo (framework preset: **Other** / static).
3. **Settings → Environment Variables** → add `OPENROUTER_API_KEY` = your key. Redeploy.
4. The static site serves at `/`, the chatbot at `/api/chat` — same origin, no CORS.

> Free-tier models have rate limits (~requests/min + a daily cap). The widget shows a
> friendly "rate limited" message and points visitors to email when that happens.

## Security notes

- The API key lives only as a Vercel env secret; it is never shipped to the browser.
- Messages are rendered with `textContent` (no `innerHTML`) — XSS-safe.
- History sent upstream is length- and turn-capped; the edge function rejects bodies > 32 KB; upstream error bodies are never forwarded to the client.
- The system prompt instructs the bot to refuse to reveal its instructions or change role.
- The local dev server (`scripts/dev-server.mjs`) binds to `127.0.0.1`, enforces a Host-header allowlist, and denies dotfiles / `.env*` / `.git` / source — so `.env.local` is never served. It is for local use only; do not expose it to a network.

## Recommended hardening before heavy public traffic

The free model bounds **dollar** cost to $0 but not **quota** — an unthrottled public `/api/chat` can be scripted to exhaust the free-tier rate limit (an availability DoS) or used as a free LLM proxy. Before promoting this widely, add per-IP rate limiting in `api/chat.js`:

- Create a Vercel KV (or Upstash Redis) store and use `@upstash/ratelimit` (e.g. ~10 req/min/IP) at the top of the handler.
- Optionally validate the `Origin` header against your portfolio origin(s).
- Add Cloudflare Turnstile if abuse persists.
