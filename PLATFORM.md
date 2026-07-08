# Platform (Phase A)

This repo is now a Next.js app. Phase A's only goal was to introduce the
Next.js app layer **without changing how any existing page looks or
behaves**. Nothing about the legacy site's markup, styling, or behavior was
touched.

## Important: source branch used for this conversion

`platform` was branched from `feature/ai-chatbot-and-projects`, **not** from
`main` (the repo's default branch). This is a deliberate deviation from a
literal "branch from default" instruction, made because `main` turned out to
be stale relative to what's actually deployed at
`https://chennunagavenkatasai.com`:

- The live page's HTML is byte-identical (same MD5 / same ETag Vercel
  reports) to `index.html` on `feature/ai-chatbot-and-projects`, and
  differs substantially from `main`'s `index.html` (85,314 bytes vs.
  69,732 bytes — different project-card markup/CSS entirely).
- `feature/ai-chatbot-and-projects` also carries the "Ask Naga" chatbot
  (`chatbot.js`/`chatbot.css` + the `api/chat.js` Vercel Edge Function and
  its helpers), the 13 project cover-art images referenced by the current
  page, and `vercel.json`. `main` has none of these. The security headers
  in `vercel.json` (`X-Content-Type-Options`, `Referrer-Policy`,
  `Permissions-Policy`) match the live response headers exactly.
- `main` is a strict git ancestor of `feature/ai-chatbot-and-projects`
  (verified with `git merge-base --is-ancestor`), so this carries no
  divergent-history risk — it's a superset, not a fork.

Building from `main` would have meant serving a page that doesn't match
production, which conflicts with the prime directive of this phase. A
reviewer should confirm this was the right call — the likely explanation is
that Vercel's "Production Branch" setting for this project points at
`feature/ai-chatbot-and-projects` rather than `main`, and `main` simply
never got merged up. That's a repo/Vercel hygiene question for the owner to
resolve outside of this phase; this phase did not touch `main`, GitHub, or
any Vercel setting.

## Conversion approach

The legacy site is kept as **untouched static files under `public/`**,
served at their original relative paths. Nothing was hand-converted to JSX.

- `public/index.html` — the legacy single-page site, byte-for-byte the same
  file that was at the repo root before this conversion.
- `public/chatbot.css`, `public/chatbot.js` — the "Ask Naga" chat widget
  front end, referenced by `index.html` via plain relative `href`/`src`.
- `public/profile.png`, `public/img.JPG`,
  `public/Naga_Venkata_Sai_Chennu_Career_Fair_Resume.pdf`,
  `public/assets/projects/*.jpg` — every image/asset `index.html`
  references, at the same relative paths it already used.
- `next.config.mjs` adds a single rewrite, `/` → `/index.html`, so the site
  root keeps serving that exact file. No other legacy routes exist (this is
  a one-page site; the only in-page navigation is `#anchor` links).
- The legacy Vercel Edge Function that powers the chatbot
  (`api/chat.js`, `api/_llm.mjs`, `api/_persona.mjs`) is left **at the repo
  root**, untouched, outside of `app/`. This is intentional: Vercel deploys
  a top-level `api/` directory as Serverless/Edge Functions independently of
  whatever frontend framework is in use, so leaving it exactly where it was
  is the lowest-risk way to keep it working once this is actually deployed.
  Next.js itself is unaware of this directory (it only looks at `app/`),
  so it cannot break the Next build, but it also **cannot be exercised by
  `next dev`/`next start` locally** — see Verification note below.
- Non-site reference material (`docs/`, `tests/`, `Venkat Portfolio Design
  System/`, `CHATBOT_SETUP.md`, `.env.local.example`, `scripts/`) is left in
  place at the repo root, unchanged. None of it is referenced by
  `index.html`, so none of it belongs in `public/`.
- `vercel.json` is kept as-is at the repo root. Its `redirects` (project
  card → external demo links) and `headers` (security headers on every
  route) are a platform-level Vercel config independent of the framework —
  Vercel honors it whether the project is "static" or "Next.js", so it did
  not need to be ported into `next.config.mjs`.

## New Next.js surface (everything added this phase)

- `app/layout.js` — minimal root layout (required by the App Router). It
  only wraps `app/`-rendered routes (`/blog`); it never wraps the legacy
  static page, which bypasses React entirely.
- `app/api/health/route.js` — `GET /api/health` → `{ "ok": true }`.
- `app/blog/page.js` — placeholder `/blog` page. Its colors and font stack
  (`--ink #171411`, `--paper #fbf7ec`, `--lime #caff60`, the
  `Inter, ui-sans-serif, system-ui...` stack) are copied verbatim from
  `public/index.html`'s `:root` custom properties, not reinvented.

No database, no auth, nothing else. That's intentional for this phase.

## Running locally

```bash
npm install
npm run dev      # next dev — serves the legacy site at "/", /api/health, /blog
npm run build && npm run start   # production build
```

The chatbot's own local dev loop is unchanged and separate from Next:

```bash
cp .env.local.example .env.local   # add OPENROUTER_API_KEY
npm run dev:chatbot                # scripts/dev-server.mjs, per CHATBOT_SETUP.md
```

`next dev`/`next start` do **not** serve `/api/chat` — that endpoint only
exists as a Vercel Edge Function once actually deployed to Vercel, or via
the standalone dev server above.

## Preview deployment verification (owner-authorized follow-up)

The `platform` branch was pushed (branch push only; `main`, PR #1, and
production were not touched) and the project's git integration auto-built a
**preview** deployment:
`https://portfolio-git-platform-venkats-projects-d28f24e0.vercel.app`
(behind Vercel Authentication — viewable when logged into the Vercel team).
Verified on that preview:

- `"framework": "nextjs"` in `vercel.json` correctly overrode the project's
  dashboard preset ("Other"): build logs show "Detected Next.js version:
  15.5.20" and a normal `next build`, with static files collected from
  `public/`.
- `/` serves the legacy page byte-identical — the SHA-256 of the response
  body matches both `public/index.html` and the live production site.
- `/api/health` → `{"ok":true}`; `/blog` renders correctly; static assets
  (`profile.png`, `chatbot.js`) serve byte-exact; `vercel.json` redirects
  work (e.g. `/intellidoc`); and the legacy root `api/chat` function **is**
  built and deployed alongside the Next.js app.
- `/api/chat` on the preview returns its own controlled
  `500 {"error":"server_not_configured"}` because `OPENROUTER_API_KEY` is
  evidently scoped to the Production environment only. Not a code problem —
  the widget degrades gracefully. If working chat on previews is wanted,
  the owner can extend that env var to the Preview environment in the
  project's settings (not done here; project settings were deliberately
  left untouched).

## Phase roadmap

Phase A (this phase): Next.js app layer + legacy site preserved verbatim.
Later phases: `/admin`, Supabase, an ingestion gate, X automation.

## Security scan notes (Snyk)

- `postcss` (a transitive dependency `next@15.5.20` pins to an exact
  vulnerable version, `8.4.31` — GHSA-qx2v-qp2m-jg93, moderate, XSS via
  unescaped `</style>` in CSS stringify output) is pinned up to `8.5.16` via
  an `overrides` entry in `package.json`. This isn't a new top-level
  dependency, just a version constraint on an existing nested one.
  `npm audit` reports 0 vulnerabilities after this change, and the build/all
  verification steps below still pass with it in place.
- Snyk Open Source (`snyk_sca_scan`) flags two CVEs against `next@15.5.20`
  itself, with no fixed release inside the Next 15 line (both fixes only
  landed in Next 16.x):
  - **CVE-2025-59472** (high, CWE-770) — unbounded memory allocation via the
    Partial Prerendering resume endpoint. **Not applicable here**: it only
    triggers when `experimental.ppr`/`cacheComponents` and
    `NEXT_PRIVATE_MINIMAL_MODE=1` are set, none of which this project
    configures (`next.config.mjs` only sets `rewrites` and `images`).
  - **CVE-2026-27980** (medium, CWE-400) — the default `/_next/image`
    optimizer endpoint caches unbounded variants to disk with no eviction,
    letting an attacker exhaust disk space by requesting many `w`/`q`
    combinations. This endpoint exists by default on any Next.js app
    regardless of whether `next/image` is used in code — and nothing in
    this app uses it (legacy images are plain `<img>` tags served
    statically). Mitigated by setting `images.unoptimized: true` in
    `next.config.mjs`; verified empirically that `/_next/image` now 404s
    instead of processing requests, with the rest of the app (root page,
    static assets, `/api/health`, `/blog`) still serving correctly
    afterward.
  - Neither CVE was addressed by upgrading `next` itself, because the task
    for this phase explicitly pins to "latest stable Next 15" and no fixed
    15.x release exists (fixes are 15.6.0-canary.61 — not stable — or
    16.1.5/16.1.7). **A reviewer should decide** whether staying on 15.5.20
    (with the mitigation above) is acceptable long-term, or whether a
    later phase should move to Next 16.
- Snyk Code (SAST) on the whole repo reports one pre-existing medium finding
  (`javascript/HttpToHttps`, CWE-319) in `scripts/dev-server.mjs:126`,
  where `node:http.createServer` is used. This file was carried over
  unmodified from `feature/ai-chatbot-and-projects` (not written or touched
  in this phase) and is a local-only dev helper explicitly bound to
  `127.0.0.1` with a host-header allowlist (see the file's own comments) —
  plain HTTP on loopback is standard practice for local dev servers
  (`next dev` itself does the same). Left as-is rather than "fixed", since
  changing it would mean rewriting pre-existing, working, documented dev
  tooling outside this phase's scope for a finding that doesn't apply to
  its actual deployment (production runs on Vercel over HTTPS; this script
  never runs there).
  Scanning just the code added in this phase (`app/`) separately reports
  zero issues.

# Platform (Phase B) — content backend, ingestion gate, /admin, real /blog

Phase B adds the content platform: a Supabase-backed `content` model, an
idempotent ingestion gate, a hand-rolled GitHub-OAuth `/admin`, and a real
`/blog`. Everything fails closed when its env is unset, so the preview build
is healthy even before the owner supplies secrets.

## Supabase connection — ONE dashboard click still required

The marketplace resource `supabase-citron-school` already exists in the team
but is **not connected to any project**. The Vercel CLI cannot connect an
*existing* resource: `vercel integration add` only *provisions a new* resource
(which the task forbids), and `integration-resource` only has `disconnect`,
no `connect`. So connection must be done once in the dashboard:

> Vercel → Storage (or Integrations) → `supabase-citron-school` → **Connect
> Project** → `portfolio` → all environments.

**Watch the env-var collision:** this project already has a Neon integration
(`neon-teal-queen`) that injects `POSTGRES_URL`, `POSTGRES_PRISMA_URL`,
`POSTGRES_URL_NON_POOLING`, `PGHOST`, etc. Supabase injects the *same*
`POSTGRES_*` names. Connect Supabase with a **custom env prefix** (or disconnect
Neon from `portfolio` if it is unused here) so they don't clash. The app itself
sidesteps this entirely — it uses `SUPABASE_URL` + `SUPABASE_ANON_KEY` +
`SUPABASE_SERVICE_ROLE_KEY` over HTTPS, never a bare `POSTGRES_URL`. Only
migrations use a raw connection string, and `scripts/apply-migrations.mjs`
**refuses to run against a non-Supabase host**, so it can't touch the Neon DB.

After connecting: `vercel env pull .env.local --environment=development`, then:

```bash
npm run db:migrate      # applies supabase/migrations/*.sql via psql (needs libpq)
npm run db:rls-probe    # anon-key PostgREST probe: draft hidden, published visible
npm run gate:verify     # Part A always; Part B live dedupe when creds present
```

## Env vars the owner must supply

| Var | Used by | Where |
| --- | --- | --- |
| `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` | DB access (gate, /blog, /admin, limiter) | injected by connecting Supabase |
| `GITHUB_OAUTH_CLIENT_ID`, `GITHUB_OAUTH_CLIENT_SECRET` | GitHub OAuth | GitHub OAuth App |
| `ADMIN_GITHUB_ID` | admin identity (numeric id, string-compared) | `https://api.github.com/users/<login>` → `id` |
| `SESSION_SECRET` | encrypted-JWT session key | `openssl rand -hex 32` |

Set the auth vars on **Preview + Production** (and pull to `.env.local` for
local). The **GitHub OAuth App callback URL** must point at
`<deployment-origin>/api/auth/callback`:

- Production: `https://chennunagavenkatasai.com/api/auth/callback`
- Preview: `https://portfolio-git-platform-venkats-projects-d28f24e0.vercel.app/api/auth/callback`

A single GitHub **OAuth App** allows only one callback URL; register a second
OAuth App (or a GitHub *App*, which allows several) if you need both preview and
production sign-in. The code derives `redirect_uri` from the request origin, so
it adapts to whichever host is registered.

## Schema + RLS (supabase/migrations/)

- `content` — heterogeneous rows; dedupe key `UNIQUE (source, external_id)`;
  index `(status, published_at desc)`; `updated_at` trigger.
- RLS **on + forced**. anon/authenticated get SELECT only on published,
  non-deleted rows, and only on non-internal columns (ingested_at/deleted_at
  withheld by column grant). Public read is the `public_content` view
  (`security_invoker = true`) — internal columns projected out. No anon write
  anywhere; all writes go through the service-role `ingest_content` RPC.
- `analytics_event`, `auth_rate_limit` — RLS on, **no** anon access (service
  role only). The analytics write endpoint is a later phase.

## Ingestion gate (lib/)

`lib/canonical.js` (pure, unit-tested) canonicalizes URLs — lowercases
protocol/host, drops `www.`, strips `utm_*`/`si`/`ref`/x's `s`&`t`/etc., sorts
params, trims trailing slash — to build `external_id`. `lib/gate.js`
(`import 'server-only'`) upserts via `ingest_content` (INSERT … ON CONFLICT
(source, external_id) DO UPDATE), never resetting `published_at`. `POST
/api/ingest` is admin-session gated, Origin-checked, and calls
`revalidatePath('/blog')` on success.

## Security headers / CSP (middleware.js + next.config.mjs)

Two CSP profiles, because nonce CSP is incompatible with static prerender:
`/admin/*` (dynamic) gets a strict `script-src 'self' 'nonce-…'
'strict-dynamic'` (Next stamps every script — verified); `/blog` (static+ISR)
uses `script-src 'self' 'unsafe-inline'` (documented compromise; its markdown
bodies are sanitized server-side, so inline-script injection isn't a vector).
Both add `object-src 'none'`, `frame-ancestors 'none'`, nosniff,
strict-origin-when-cross-origin, X-Frame-Options DENY. `/api/*` headers come
from `next.config.mjs`. The legacy `/` and its `vercel.json` headers are
untouched.

## Verification status

Verified locally against `next build && next start`: build clean; `/`
byte-identical to `public/index.html` (SHA-256 match); `/blog` renders the
empty state with correct CSP; `/api/health` ok; `/api/ingest` without a session
→ 401; `/admin` → 307 to `/admin/login`; `/api/auth/callback` with garbage →
controlled fail-closed; gate canonicalization/dedupe unit tests pass; markdown
sanitizer strips script/iframe/svg/style/`on*`/`javascript:`. **Pending the one
Supabase dashboard click:** applying migrations, the live RLS probe, and the
seeded-row `/blog` check (scripts are ready and one-command).

## Later-phase upgrades noted, not done here

- The team's unconnected Upstash Redis (`upstash-kv-green-branch`) is a better
  home for the auth rate limiter than the Postgres table used now.
- Decide Next 15 → 16 (clears the two pre-existing `next` CVEs).
