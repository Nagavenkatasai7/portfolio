# Naga Venkata Sai Chennu — Portfolio Platform

A personal portfolio that grew into a self-hosted content platform: a legacy static site, a database-backed blog, an admin studio, and an automated content pipeline — all on one Next.js app.

[![CI](https://github.com/Nagavenkatasai7/portfolio/actions/workflows/ci.yml/badge.svg?branch=platform)](https://github.com/Nagavenkatasai7/portfolio/actions/workflows/ci.yml)
&nbsp;•&nbsp; **Live:** [chennunagavenkatasai.com](https://chennunagavenkatasai.com)

## What this is

This is the `platform` branch — the production codebase behind [chennunagavenkatasai.com](https://chennunagavenkatasai.com). It started as a single static portfolio page and now runs a full content stack around it: the original homepage is served untouched at `/`, while a Next.js 15 App Router application adds a public blog, a private admin studio for authoring and distribution, a newsletter with double opt-in, and a daily pipeline that mirrors auto-published LinkedIn posts into the blog. Every content write — human or automated — funnels through one validating ingestion gate.

## Features

**Public site**
- Original portfolio homepage served **byte-identical** at `/` from `public/index.html` (a rewrite, no JSX conversion).
- "Ask Naga" chatbot on the homepage, backed by OpenRouter through a serverless proxy (`api/chat.js`).
- Project shortlinks (e.g. `/intellidoc`, `/resume-tailor`) redirect to live demos and repos, configured in `vercel.json`.

**Content pipeline**
- Single ingestion gate (`lib/gate.js`): every write is normalized, deduped by `(source, external_id)`, and upserted — never a bare insert, so re-ingesting updates one row instead of duplicating.
- Daily Vercel cron (`/api/cron/linkedin-sync`, `0 6 * * *`) reads a **read-only Neon view** of the owner's auto-published LinkedIn posts and ingests them through the gate, preserving owner edits on re-sync.

**Admin studio** (`/admin`, GitHub OAuth, single admin)
- Content composer for authoring and editing blog posts.
- Media uploads via **presigned, direct-to-storage URLs** to Supabase Storage.
- X/Twitter draft studio: OpenRouter-drafted posts with graceful degradation when the LLM is unavailable.
- Newsletter studio with an **inline, sandboxed email preview** iframe, plus blog analytics.

**Newsletter**
- Public subscribe with **double opt-in**; confirm and unsubscribe via tokenized links.
- Armed-queue sending driven by a second daily cron (`/api/cron/newsletter-send`, `0 13 * * *`), with transactional email over Resend and a delivery webhook.

**Security**
- Nonce-based CSP for `/admin`, a documented static CSP for `/blog` (`middleware.js`); HSTS, `X-Frame-Options`, `Permissions-Policy`, and `nosniff` at the edge (`vercel.json`, `next.config.mjs`).
- Admin mutations require `requireAdmin` **and** a same-origin check; cron routes are guarded by `CRON_SECRET`.
- Supabase Row-Level Security: public reads only, all writes via the service-role gate.

**CI / CD**
- GitHub Actions on every push and PR: `next build` + offline verify scripts, **gitleaks secret scan (hard gate)**, and optional non-fatal Snyk Code.
- Deploys are owned by Vercel's Git integration — no deploy token in CI.

## Architecture at a glance

```
  Field Guide Builder (separate app)
        │  auto-posts to LinkedIn
        ▼
  Neon read-only view                 Admin studio
  (linkedin_posts_view)               /admin · GitHub OAuth
        │                                   │
        │  daily cron                       │  compose / edit / moderate
        │  /api/cron/linkedin-sync          │  (requireAdmin + same-origin)
        │  (CRON_SECRET)                    │
        ▼                                   ▼
      ┌─────────────────────────────────────────┐
      │        ingestion gate — lib/gate.js       │
      │     normalize · dedupe · upsert (RPC)     │
      └─────────────────────────────────────────┘
                        │
                        ▼
             Supabase Postgres  (RLS: public read only)
                        │
                        ▼
                 Next.js 15 App Router
             /  (legacy)   ·   /blog   ·   /admin
                        │
                        ▼
        Vercel — hosting + crons — chennunagavenkatasai.com
```

Both the automated LinkedIn sync and every human edit write through the **same** gate; nothing reaches Postgres by another path. The public blog reads only what RLS exposes.

## Tech stack

- **Next.js 15** App Router (ESM, React 19)
- **Supabase** Postgres + Row-Level Security + Storage
- **Vercel** hosting and cron scheduler
- **GitHub OAuth** for single-admin auth (`jose` sessions)
- **OpenRouter** for LLM drafting (X studio, "Ask Naga")
- **Neon** read-only Postgres view for LinkedIn ingestion (`pg` driver)
- **Resend** for transactional / newsletter email
- **GitHub Actions** + **gitleaks** (hard gate) + **Snyk** Code (optional)
- `marked` + `sanitize-html` for safe markdown rendering

## Repo layout

```
app/                    Next.js App Router
  blog/                 public blog (server-rendered, RLS-backed)
  admin/                admin studio (composer, X, newsletter, analytics)
  newsletter/           subscribe / confirm / unsubscribe pages
  api/                  route handlers (auth, content, cron, media, x, newsletter)
lib/
  gate.js               single ingestion gate — every content write goes here
  canonical.js          identity normalization / URL canonicalization
  linkedin_sync.js      read-only LinkedIn → gate sync
  newsletter*.js        subscriber + issue chokepoints
  auth/  email/  supabase/   sessions, email send, service-role client
public/                 legacy static site (index.html, chatbot, assets, resume)
api/                    legacy serverless "Ask Naga" chatbot proxy
scripts/                verify suite + migration/backfill/probe tooling
supabase/migrations/    0001–0011 SQL (schema, RLS, media bucket, newsletter)
middleware.js           per-route CSP (nonce for /admin, static for /blog)
next.config.mjs         rewrites, security headers, image hardening
vercel.json             crons, redirects, edge security headers
.github/workflows/ci.yml   build + verify + gitleaks + Snyk
```

## Local development

```bash
npm ci
npm run dev            # Next.js dev server
npm run dev:chatbot    # local "Ask Naga" chatbot proxy
```

Copy `.env.local.example` to `.env.local` and fill in what you need. The static homepage and blog rendering run without any secrets; the database, admin, and pipeline features require credentials, grouped as:

- **Supabase** — project URL and anon / service-role keys (blog data, admin writes, media, newsletter).
- **GitHub OAuth** — client id/secret plus the single admin's numeric GitHub id, for `/admin` sign-in.
- **Cron + integrations** — `CRON_SECRET` for cron auth, a read-only Neon URL for LinkedIn sync, OpenRouter and email keys for drafting and delivery.

No real secret values live in the repo; `.env.local` is gitignored and CI enforces this with gitleaks.

**Offline verification** (no credentials, no server, no database):

```bash
npm run gate:verify              # ingestion-gate canonicalization + dedupe logic
npm run verify:newsletter-preview # email renderer + static CSP/route guarantees
```

Both run in CI on every event. Additional `verify:phase-*` and `verify:newsletter*` scripts exercise the live database and run only when Supabase secrets are present (point them at staging, never production).

## Deployment model

- **`platform`** is the production branch: pushes deploy automatically to [chennunagavenkatasai.com](https://chennunagavenkatasai.com) via Vercel's Git integration.
- **`main`** hosts the legacy GitHub Pages snapshot of the original static site.
- CI gates every push and PR on both branches; it runs checks only and never deploys (Vercel owns deploys).

## Security

The platform is public and the write surface is deliberately narrow:

- **Headers & CSP** — nonce-based CSP on the dynamic `/admin` surface, a documented static CSP on `/blog`, and HSTS + `Permissions-Policy` + `X-Frame-Options: DENY` + `nosniff` applied at both the app and edge layers.
- **Gated writes** — all content mutations pass through `lib/gate.js`; admin routes require authentication and a same-origin check; cron routes require `CRON_SECRET`.
- **Row-Level Security** — Supabase RLS exposes public reads only; every write uses the server-only service-role client.
- **Secret scanning** — gitleaks runs as a hard gate in CI, with Snyk Code as an optional non-fatal check.

---

Built by **Naga Venkata Sai Chennu** — AI / software engineer.
[Portfolio](https://chennunagavenkatasai.com) · [LinkedIn](https://www.linkedin.com/in/naga-venkata-sai-chennu/) · [GitHub](https://github.com/Nagavenkatasai7)
