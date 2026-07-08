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

## Supabase connection — DONE

The existing marketplace resource `supabase-citron-school` is now **connected
to `portfolio`** (done in the dashboard — the Vercel CLI cannot connect an
*existing* resource: `integration add` only provisions new ones, and
`integration-resource` only has `disconnect`). **Free plan confirmed.** The
Neon integration was disconnected from `portfolio` at the same time, so the
`POSTGRES_*` env vars now unambiguously belong to Supabase across
Development/Preview/Production.

The app still deliberately uses `SUPABASE_URL` + `SUPABASE_ANON_KEY` +
`SUPABASE_SERVICE_ROLE_KEY` over HTTPS, never a bare `POSTGRES_URL`. Only
migrations use a raw connection string, and `scripts/apply-migrations.mjs`
**refuses to run against a non-Supabase host** as defense-in-depth.

Local workflow: `vercel env pull .env.local --environment=development`, then:

```bash
npm run db:migrate      # applies supabase/migrations/*.sql via psql (needs libpq)
npm run db:rls-probe    # anon-key PostgREST probe: draft hidden, published visible
npm run gate:verify     # Part A always; Part B live dedupe when creds present
```

## Env vars the owner must supply

| Var | Used by | Where |
| --- | --- | --- |
| `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` | DB access (gate, /blog, /admin, limiter) | **already injected** (Supabase connected) |
| `GITHUB_OAUTH_CLIENT_ID`, `GITHUB_OAUTH_CLIENT_SECRET` | GitHub OAuth | GitHub OAuth App |
| `ADMIN_GITHUB_ID` | admin identity (numeric id, string-compared) | `https://api.github.com/users/<login>` → `id` |
| `SESSION_SECRET` | encrypted-JWT session key | `openssl rand -hex 32` |

Only the four auth vars remain. Example (repeat `env add` per environment):

```bash
vercel env add GITHUB_OAUTH_CLIENT_ID production   # and: preview
vercel env add GITHUB_OAUTH_CLIENT_SECRET production
vercel env add ADMIN_GITHUB_ID production          # numeric id, e.g. 180471726
vercel env add SESSION_SECRET production           # openssl rand -hex 32
```

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
byte-identical to `public/index.html` (SHA-256 match); `/blog` renders with
correct CSP; `/api/health` ok; `/api/ingest` without a session → 401; `/admin`
→ 307 to `/admin/login`; `/api/auth/callback` with garbage → controlled
fail-closed; gate canonicalization/dedupe unit tests pass; markdown sanitizer
strips script/iframe/svg/style/`on*`/`javascript:`.

**Live-DB verification (real Supabase, after connection): all green.**

- Migrations 0001–0005 applied via psql (Supavisor session port). Verified via
  `information_schema`/`pg_catalog`: 3 tables + `public_content` view; RLS
  enabled **and forced** on all three; exactly one policy
  (`content_public_read`, SELECT, anon+authenticated);
  `UNIQUE (source, external_id)`; both CHECK constraints; feed index;
  `updated_at` trigger; `ingest_content` executable by service_role only;
  anon's column grants exclude `ingested_at`.
- 0005 exists because the live RLS probe caught a real bug: the
  `security_invoker` view's WHERE references `deleted_at`, which 0002 withheld
  from anon — every anon view read failed 42501. Fixed by granting that one
  column (provably always NULL on anon-visible rows; still not in the view's
  select list). `ingested_at` stays withheld.
- RLS probe (`npm run db:rls-probe`, anon key over PostgREST): 6/6 — anon can
  read `public_content`; anon INSERT denied; internal column denied; published
  visible; draft invisible (view **and** base table).
- Live gate (`npm run gate:verify`): 19/19 — same URL with different tracking
  params → ONE row (upsert, `created:false` second time, same id);
  `published_at` NOT reset on conflict; content fields updated; draft never
  surfaces through `public_content`.
- Seeded one published + one draft through the real `ingestContent`
  (`node --conditions=react-server`): `/blog` rendered exactly the published
  one (sanitized markdown, hardened links), draft absent; temp rows deleted;
  `/blog` back to "No posts yet"; `/` still byte-identical throughout.

## Later-phase upgrades noted, not done here

- The team's unconnected Upstash Redis (`upstash-kv-green-branch`) is a better
  home for the auth rate limiter than the Postgres table used now.
- Decide Next 15 → 16 (clears the two pre-existing `next` CVEs).

# Platform (Phase C) — /admin dashboard, composer, media uploads, polished /blog

Phase C makes the platform usable end-to-end: a full `/admin` content dashboard,
a composer that creates every content type, presigned direct-to-storage media
uploads, and a `/blog` that renders each type well. Everything still fails
closed when its env is unset, and **every admin write goes through
`lib/gate.js`** — never a bare insert.

## New migration

- `supabase/migrations/0006_media_bucket.sql` — creates the **`media` Storage
  bucket**: `public = true`, `allowed_mime_types` = jpeg/png/webp/gif + mp4/webm
  (**no svg**), `file_size_limit` = 200 MB. Idempotent (`on conflict (id) do
  update`). The object-read policy on `storage.objects` is best-effort (a DO
  block that swallows `insufficient_privilege`) — on a *public* bucket anon read
  is served regardless, and all writes are service-role / signed-token, so the
  policy is documentation, not a functional requirement. No `comment on schema
  storage` (the migrating role doesn't own that schema). Applied with the same
  `npm run db:migrate` runner (needs `psql`/libpq); migrations 0001–0006 are all
  idempotent, so re-running is safe. **RLS probe re-run after this migration:
  6/6 still green.**

## The write surface — all through `lib/gate.js`

- `ingestContent(item)` (unchanged) — the dedupe upsert for **create + edit**.
- `moderateContent(id, { status?, remove? })` (**new**) — the publish/unpublish
  toggle and "Remove from blog" tombstone. The `ingest_content` RPC deliberately
  never touches `deleted_at`/`published_at`, so a soft-delete can't go through
  it; this is a targeted UPDATE on ONE row keyed by primary key (no dedupe/
  duplication concern — the thing "never bare-insert" protects). Keeping it in
  `lib/gate.js` keeps that module the single content-write chokepoint.
- `getContentById(id)` (**new**) — service-role single-row read so an edit can
  recover a row's identity (`source`/`external_id`/`type`/original
  `published_at`) and re-ingest without duplicating it.

## Admin API routes (each independently `requireAdmin` + same-origin)

- `POST /api/content/create` — composer submit (blog/newsletter/video/image/
  paste), builds the item via `lib/compose.js`, writes via `ingestContent`,
  `revalidatePath('/blog')`. New items default **draft** unless `publishNow`.
- `POST /api/content/update` — edit title/body/(video URL) of an existing row;
  preserves identity + original `published_at`; re-ingests.
- `POST /api/content/moderate` — publish / unpublish / remove (accepts the
  dashboard's same-origin **form POST** → 303 back to `/admin`, or JSON).
- `POST /api/media/sign` — validates the DECLARED file (mime allowlist + per-type
  cap; svg rejected) and returns a **signed upload URL** (service role).
- `POST /api/media/finalize` — after the browser PUTs bytes straight to Storage,
  does a small **ranged GET + server-side content-sniff** (magic bytes) to catch
  a lying Content-Type (e.g. svg bytes under `image/png`); on mismatch the object
  is deleted and the upload rejected. Returns `{url,type,width,height}`.

Auth ordering in every route: `requireAdmin` → 401 **before** the origin check,
so an unauthenticated POST is always 401 (verified).

## Composer — how to use it

`/admin/compose` (linked from the dashboard's **+ New post**). Pick a type:

- **Blog post** / **Newsletter** — title + markdown body. `external_id` is a
  slug generated from the title (+ a short base36 suffix so identical titles
  don't collide).
- **Video** — title + a YouTube / Vimeo / direct `.mp4|.webm` URL. Parsed by
  `lib/video.js`; `/blog` renders YouTube/Vimeo as a **privacy-friendly,
  sandboxed** `youtube-nocookie` / `player.vimeo` iframe, direct files as
  `<video>`. `external_id` = canonical video URL (auto-dedupes).
- **Image** — title + drag-drop/browse image(s). Each file: `sign → direct PUT
  to Storage → finalize (server sniff)`; only the **public URL + type +
  dimensions** are stored in `content.media`. Images ≤ 10 MB; **no svg**.
- **Paste URL** — a LinkedIn or X/Twitter post URL. Source is **auto-detected**
  from the host (`linkedin_manual` / `x_manual`); `type='text'`; `external_id` =
  the canonical URL (dedupe is automatic via the gate); optional title + note
  (markdown) + optional images.

Tick **Publish now** to go straight to published; otherwise it's a draft the
owner publishes explicitly from the dashboard. Optional publish date (stored UTC).

The dashboard (`/admin`) lists **all** statuses (published/draft/removed) with
source, type, title, published_at (**UTC + the viewer's local time**), plus
per-row **Edit / Publish↔Unpublish / Remove(→ Restore)**, status counts, session
identity, and logout.

## Media upload security (presigned, direct-to-storage)

Bytes **never stream through a serverless function**. Enforcement layers:
1. `sign` route: declared mime ∈ allowlist, per-type size cap (image ≤ 10 MB,
   video ≤ 200 MB), **svg rejected**.
2. Bucket: `allowed_mime_types` + `file_size_limit` reject a mismatched declared
   type / oversize at the Storage layer.
3. `finalize` route: **content-sniff of the real magic bytes** server-side —
   svg/unknown/oversize ⇒ object deleted + 400. `nosniff` is set on all app
   routes. Only the public URL + type + dimensions land in the DB.

## CSP changes (middleware.js)

- `/admin`: `connect-src` widened to the **Supabase origin** (the direct upload
  target) and `img/media-src` allow `blob:` (local pre-upload previews). Script
  policy stays strict nonce + `strict-dynamic`.
- `/blog`: `frame-src` opened to exactly `https://www.youtube-nocookie.com` and
  `https://player.vimeo.com` (the only embed hosts the controlled `VideoEmbed`
  renders); `media-src` allows `https:` for direct `<video>`. Markdown is still
  sanitized server-side (formatting only — no raw HTML/script/iframe/svg; the
  sole iframe is the controlled embed component).

## /blog rendering

Reverse-chronological feed off `public_content` (published, non-deleted; ISR
`revalidate=300` + on-demand `revalidatePath('/blog')` on every gate write).
Each type renders natively — blog article, newsletter, LinkedIn/X post (note +
"View on LinkedIn/X ↗"), video embed, image grid — with a **source chip + date**
in the legacy "Luminous" palette (Georgia serif display, coral mono eyebrow, the
offset-lime button shadow). Clean "No posts yet" empty state.

## Verification (scripts/phase-c-verify.mjs — `npm run verify:phase-c`)

Runs under `node --conditions=react-server` so it imports the **real**
server-only `lib/gate.js`. **All 39 assertions PASS** against live Supabase:

- **Build #1 (empty DB)** — `npm run build` clean; `/` **byte-identical** to
  `public/index.html` (SHA-256, 85 314 bytes); `/admin` → 307 `/admin/login`;
  `/api/ingest`, `/api/content/{create,update,moderate}`, `/api/media/{sign,
  finalize}` all **401** without a session; `/blog` shows **"No posts yet"**.
- **Seed one of each type** through `ingestContent`: blog, newsletter, video,
  image (via the **real presigned → direct-PUT → sniff** flow: PUT 200, sniff
  `image/png`, dims 1×1), `linkedin_manual`, `x_manual`, + a **draft**. Dedupe:
  re-ingesting the X post with a different tracking param **updates the same
  row** (created:false, count=1). Anon sees the 6 published rows via
  `public_content` but **not** the draft.
- **Build #2 (seeded DB)** — every published type renders (blog title + body,
  newsletter, **youtube-nocookie embed**, **image public URL**, LinkedIn/X chips
  + original links, all source chips); markdown **sanitized** (`<script>` and
  `javascript:` stripped, `**bold**` kept); the **draft is absent**.
- **Cleanup** — all test rows deleted (0 remain) and the test storage object is
  gone (authoritative storage-API check, not the CDN URL which caches deletes).
  DB + `media` bucket confirmed empty afterward.

The harness does **cold builds** (clears `.next` first) because Next's on-disk
Data Cache honours `/blog`'s `revalidate=300` and would otherwise reuse a prior
build's read across builds — in production the gate's `revalidatePath('/blog')`
busts that after every write, so this is a harness concern, not a product bug.

`npm install` + `npm run build` clean; `npm audit` 0 vulnerabilities. **No new
npm dependencies** were added (all new logic is pure JS on existing deps) — so
Snyk SCA has nothing new to scan.

## Security scan notes (Snyk Code, Phase C)

Scanned after each change. Findings and disposition:

- **SSRF (High), `app/api/media/finalize/route.js`** — `body.path` flowing into
  `fetch`. **Fixed**: the path is rebuilt from **regex capture groups**
  (`^(image|video)/\d{4}/\d{2}/[a-z0-9]{1,64}\.[a-z0-9]{1,5}$` — no scheme/host/
  `..`/`@`/`:` survivable) and the final URL's origin is pinned to the trusted
  Supabase origin over https before any request leaves the server. **Snyk now
  reports this cleared.**
- **DOM XSS (Medium), `app/admin/Composer.js`** — Snyk taints
  `URL.createObjectURL(file)` flowing into an `<img>/<video src>`. **Reviewed
  false positive**: the value is a browser-generated `blob:` URL (guarded with
  `.startsWith('blob:')`), an `<img>/<video src>` is **not** a script-execution
  sink, and the whole surface is admin-only (`requireAdmin`). A local upload
  preview is legitimate UX; removing it to satisfy the taint tracker would add
  no real security. Left in place with the guard.
- **HTTP-not-HTTPS (Medium), `scripts/dev-server.mjs`** — **pre-existing**, not
  Phase C code (a loopback-only local dev helper, documented under Phase A).

---

# Platform (Phase D) — X/Twitter draft studio (LLM-drafted posts)

An X-flavored companion to the composer: the owner seeds a topic, an LLM drafts
styled X posts, and the owner reviews / edits / approves them in `/admin`.
Approved posts appear on the public `/blog`. **There is deliberately NO real X
API integration** — the owner has not bought X API access, so nothing here calls
the X/Twitter API, OAuth, or any signup/paid flow. Posting to X itself is
**manual**: the studio gives a **Copy text** button and an **Open X compose**
link (a plain `https://twitter.com/intent/tweet?text=…` intent URL — not an API
call) so the owner pastes the post into X by hand. Publishing only controls what
shows on `/blog`.

## The X draft studio — `/admin/x`

A deliberately DISTINCT visual identity from the warm-paper composer: a dark
**terminal "command deck"** (`app/admin/xui.js` → `.xst` scoped CSS) — near-black
surface, monospace-forward, faint CRT scanlines + grid, the site's lime
(`#caff60`) as a phosphor accent and coral (`#e86f4a`) for over-limit warnings.
Still coherent with the site tokens (same lime/coral, same pill-button DNA, grid
motif), just flipped dark and tightened. No external fonts (CSP `font-src 'self'`)
— the system monospace stack is the intentional choice for a dev's X deck.

- **Server shell** `app/admin/x/page.js` — independently enforces the admin
  session (`isAuthConfigured()` + `requireAdmin()`, redirect to `/admin/login`
  on fail), exactly like `/admin/compose`. Renders the client studio; generates
  and writes nothing itself.
- **Client** `app/admin/XStudio.js` (`'use client'`) — a topic/seed textarea,
  a tone select (Punchy / Insightful / Casual / Bold / Technical), a
  **Single / Thread** format toggle, and a **Generate** button. Returned
  variants render as editable cards with a **LIVE character count** (280/tweet;
  a thread splitter previews each tweet with its own count; over-limit turns
  coral). Per card: inline **Edit** (textarea), **Copy text**, **Open X compose**
  (intent link), **Save as draft**, **Approve & publish**, **Discard**. A single
  post over 280 offers "split into a thread"; a thread can collapse to single.
  The UI states plainly that publishing shows the post on `/blog` and that X
  posting is manual for now.

## Drafting — `lib/x_draft.js` (+ pure `lib/x_draft_pure.js`)

Mirrors the `lib/canonical.js` (pure) / `lib/gate.js` (server-only) split so the
SAME logic is shared without drift by the client (live counting), the server
(parsing), and the save path (item building):

- **`lib/x_draft_pure.js`** — PURE, client-safe (no `server-only`, no `node:`
  built-ins). `TWEET_LIMIT=280`; `countChars` (Unicode **code points**, so an
  emoji counts as 1); `splitIntoTweets` (greedy word-pack, never breaks a word
  unless a single token exceeds the limit, then hard-splits by code point);
  `parseVariants` (splits a completion on `---` delimiter lines, strips
  `Variant N:` / quote labels, dedups, caps at 3); `xDraftExternalId` (a pure-JS
  cyrb53 hash → `xdraft:<topic-slug>-<hash>`); `buildXDraftItem` (turns a chosen
  draft into an `ingestContent` item). Reuses `slugify` from `lib/slug.js`.
- **`lib/x_draft.js`** — `server-only`. `generateXDrafts({topic, tone, format},
  { llmFn })` returns `{ ok:true, model_used, variants }` or `{ ok:false, error }`
  and **NEVER throws**. The LLM call is **dependency-injected** (`llmFn`) so tests
  stub it deterministically with no network (see the verify script). When omitted,
  the default walks the **exact same OpenRouter free-model fallback chain the
  chatbot uses** (`MODELS` imported from `api/_llm.mjs`), one non-streaming call
  per model, first non-empty answer wins, honoring each model's `reasoning` tweak.

### Graceful degradation (OpenRouter out of credits)

The free pool is frequently throttled / out of credits (502 / empty). Every
failure mode is absorbed: if a model 502s or returns empty, the chain falls to
the next; if **every** model fails (or the injected stub throws / returns
empty), `generateXDrafts` returns `{ ok:false, error:'generation_unavailable' }`
— it does not throw. `POST /api/x/generate` then returns **HTTP 200 with
`{ ok:false, error }`** (the same convention `api/chat.js` uses — a 200 carrying
an error frame), and the studio shows a "couldn't generate — write it yourself"
state **with an editable blank draft still ready**, so drafting failure never
crashes a page or blocks manual authoring, saving, or publishing.

## API routes (both admin-gated + same-origin, like every content route)

- **`POST /api/x/generate`** — `requireAdmin` → 401, `isSameOrigin` → 403, size
  guard. Validates `topic`, calls `generateXDrafts` (default = real OpenRouter).
  Persists nothing. 200 `{ ok:true, variants }` on success; 200 `{ ok:false }`
  on generation failure; 400 `topic_required`.
- **`POST /api/x/save`** — `requireAdmin` → 401, `isSameOrigin` → 403.
  `buildXDraftItem` → **`ingestContent`** (always `status='draft'`); if
  `action:'publish'`, then **`moderateContent(id, {status:'published'})`**
  (the gate's lifecycle write). Returns `{ id, status, external_id, type }`.
  **Discarding a saved draft** reuses `POST /api/content/moderate`
  `{action:'remove'}` (tombstone); discarding an unsaved variant is client-only.

## Persistence via the gate

Everything writes through `lib/gate.js` (no bare inserts):

- `source='x_auto'` (LLM-drafted X posts; distinct from Phase C's `x_manual`
  hand-pasted posts), `type='text'` (single) or `'thread'`, `status='draft'`.
- `external_id = xdraft:<slug>-<id>` — **stable per draft**. From the studio each
  card carries a stable `draftId`, so editing a saved draft's text and re-saving
  UPSERTS the **same** row — the inline edit persists on Approve/Update, with no
  orphaned row (all persistence, including publish, goes through `/api/x/save` →
  `ingestContent`, never a text-blind status flip). Callers that omit `draftId`
  (e.g. the verify script) fall back to a content-derived hash so identical
  content still dedupes to one row. The `xdraft:` scheme passes `canonicalizeUrl`
  through unchanged, so the dedupe key is exactly that string.
- `payload = { topic, tone, format, model_used, variants, char_counts, thread? }`
  (`thread` = the tweet array, only for threads); `body_md` = the chosen text
  (threads store the tweets joined by blank lines); `title=null` (an X post is a
  body, not a titled article — the dashboard identifies rows by the topic-slug in
  the external_id). Drafts (`status='draft'`) never reach `/blog` — the public
  `public_content` view already filters `status='published' AND deleted_at IS
  NULL` (re-verified).

## `/blog` rendering + `/admin` dashboard

- **`/blog`** — a published `x_auto`/`x_manual` **thread** (`type='thread'`)
  renders as **sequential tweets** (`ThreadView`: an `<ol class="thread">` of
  numbered `1/N` tweet cards, plain-text nodes — nothing to sanitize), preferring
  the stored `payload.thread` array and falling back to splitting `body_md`. A
  single post (`type='text'`) renders as before (sanitized markdown). Both carry
  the existing dark **X** source chip.
- **`/admin`** — `x_auto` rows already appear (the dashboard lists all sources /
  statuses) and are fully actionable (Edit / Publish / Unpublish / Remove /
  Restore via `/api/content/moderate`). Added: a `Thread` type label, an **"✕ X
  studio"** link in the topbar, and a lightweight **"✕ X drafts (N)"** filter
  (`?src=x_auto`, display-only — global counts unchanged).

## Verification — `scripts/phase-d-verify.mjs` (`npm run verify:phase-d`)

`node --conditions=react-server` so it imports the REAL `lib/x_draft.js` +
`lib/gate.js`. **All assertions PASS.** It:

- **(A) Stubbed-LLM logic (no network, no DB):** `generateXDrafts` with an
  injected `llmFn` returning canned variants → asserts variants parsed,
  character-limited, thread-split; asserts it **degrades gracefully** (returns
  `{ ok:false }`, never throws) when the stub throws / returns empty /
  unparseable / lacks a topic; plus splitter, code-point counter, and
  `external_id` (determinism + `canonicalizeUrl` passthrough) invariants.
- **(B) Real gate:** seeds `x_auto` drafts via `buildXDraftItem` →
  `ingestContent` (driven by the stubbed generator) — a single draft (dedupe
  re-save asserted = one row), a thread + a single that get published via
  `moderateContent`; asserts each is ABSENT from the anon `public_content`
  surface while a draft, and the thread reports `type='thread'` once published.
  Also an **edit-persistence** case: re-saving with the same `draftId` but edited
  text UPSERTS the same row and the stored `body_md` is the EDITED text (this is
  the fix for a review finding — a text-blind publish would have kept the old text).
- **(C) One cold build + `next start`:** `/` byte-identical to
  `public/index.html`; `/admin/x` → `/admin/login` redirect; `/api/x/generate`
  and `/api/x/save` → **401** without a session; the published thread renders on
  `/blog` as sequential tweets with the X chip, the published single renders, and
  the **draft stays hidden**.
- **(D)** Full teardown (all test rows deleted, 0 remain).
- **Live probe (INFO only):** at the last run, live OpenRouter generation
  **worked** — the primary `openai/gpt-oss-120b:free` was unavailable and the
  chain fell back to `nvidia/nemotron-3-ultra-550b-a55b:free`, returning 3 real
  variants. Credits can run out at any time; the graceful-degradation path above
  is what guarantees the studio stays usable when they do.

**Could not** exercise the *authenticated* `/admin/x` page in a browser — the
admin session secret is unset by design and the run cannot log in. The page
compiles + type-checks + bundles, mirrors the proven `/admin/compose` auth shell,
and all of its data logic (counting, splitting, save payloads, publish/discard)
is verified at the lib + gate + route-auth level.

## Security scan notes (Snyk Code, Phase D)

Snyk Code (SAST) run on the full project after the changes. **Zero findings in
new Phase D code** (`lib/x_draft.js`, `lib/x_draft_pure.js`, `app/api/x/*`,
`app/admin/x/page.js`, `app/admin/XStudio.js`, `app/admin/xui.js`, and the
`/blog` + `/admin` edits). The only 2 findings are **pre-existing and unchanged
by Phase D** — the `app/admin/Composer.js` `blob:`-URL preview (reviewed false
positive in Phase C: guarded `blob:` value into a non-script `<img>/<video src>`,
admin-only) and the `scripts/dev-server.mjs` local-dev HTTP helper (Phase A).

`npm install` + `npm run build` clean; `npm audit` **0 vulnerabilities**. **No
new npm dependencies** (all new logic is pure JS reusing existing deps; the
OpenRouter key reuses the existing `OPENROUTER_API_KEY`).
