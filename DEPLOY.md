# Deployment & Setup

This is a dynamic Astro app (SSR on Vercel) with a Google-locked admin dashboard,
a blog, a contact form, and a double-opt-in newsletter drafted by Claude and sent
via Resend. Node **22.12+** is required.

## 0. Accounts you'll need
Vercel · Neon (via Vercel Storage) · Resend · Google Cloud (OAuth) · Anthropic ·
Cloudflare Turnstile · Upstash Redis.

## 1. Vercel
- Import this repo. Set **Project Settings → Node.js Version → 22.x**.
- Add the custom domain `chennunagavenkatasai.com`.
- Turn on **Deployment Protection** for Preview deployments (Settings → Deployment
  Protection) so preview URLs can't hit the production DB / send mail.

## 2. Database (Neon)
- Vercel → **Storage → Neon** → create. It injects `DATABASE_URL` (pooled) and
  `DATABASE_URL_UNPOOLED`.
- Apply the schema with the **unpooled** URL:
  `psql "$DATABASE_URL_UNPOOLED" -f db/schema.sql`

## 3. Resend (email)
- Create an API key → `RESEND_API_KEY`.
- **Add the apex domain** `chennunagavenkatasai.com` and add the DNS records Resend
  shows **in the Vercel DNS dashboard**. Critical for deliverability:
  - **DKIM** at the apex host Resend gives (`resend._domainkey`) so it aligns with
    the apex `From`.
  - **SPF** `TXT send` → `v=spf1 include:amazonses.com ~all`
  - **MX** `send` → `feedback-smtp.<region>.amazonses.com` (region from your dash)
  - **DMARC** `TXT _dmarc` → start `v=DMARC1; p=none; rua=mailto:dmarc@chennunagavenkatasai.com; aspf=r; adkim=r`
    (use a mailbox on YOUR domain for `rua`, not gmail). Advance to `quarantine`
    then `reject` only after DKIM shows pass+aligned on real sends.
- Create an **Audience** → `RESEND_AUDIENCE_ID`.
- Add a **Webhook** → `https://chennunagavenkatasai.com/api/newsletter/webhook`,
  copy its signing secret → `RESEND_WEBHOOK_SECRET`.
- **Sending limit:** free tier is 100 emails/day. A weekly blast to >100 confirmed
  subscribers needs **Resend Pro (~$20/mo)**.

## 4. Google OAuth (admin sign-in)
- Google Cloud → OAuth consent screen (External); scopes `openid`,
  `userinfo.email`, `userinfo.profile` (no verification needed). Add yourself as a
  Test user, or Publish to Production to drop the "unverified app" screen.
- Create an **OAuth Client (Web application)**:
  - Authorized origins: `https://chennunagavenkatasai.com`, `http://localhost:4321`
  - Redirect URIs: `https://chennunagavenkatasai.com/api/auth/callback/google`,
    `http://localhost:4321/api/auth/callback/google`
- Set `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, and `ADMIN_EMAIL=chennunagavenkatasai@gmail.com`.
- `AUTH_SECRET` = `openssl rand -hex 32`.

## 5. AI, spam, rate limit
- Anthropic API key → `ANTHROPIC_API_KEY` (enable Web Search in the Console).
- Cloudflare Turnstile widget → `PUBLIC_TURNSTILE_SITE_KEY` + `TURNSTILE_SECRET`.
- Upstash Redis → `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN`.
- `CRON_SECRET` = a random string ≥16 chars (Vercel sends it to the cron jobs).
- `NEWSLETTER_POSTAL_ADDRESS` = a real postal address (CAN-SPAM requires it in the
  footer — a PO box works).

## 6. Env vars
Set everything in `.env.example` under **Vercel → Environment Variables** (and
`vercel env pull .env.local` for local dev). Deploy.

## How it runs
- **Weekly draft:** `vercel.json` cron hits `/api/newsletter/cron-draft` every
  Monday 13:00 UTC → Claude researches + drafts → a `pending_review` issue.
- **You approve:** sign in at **`/api/auth/login`**, open `/admin-dashboard/newsletter`,
  review/edit, send a test to yourself, then **Approve & send** (Resend Broadcast).
- **Retention:** a monthly cron prunes old analytics and anonymizes stale IPs.

## Pre-launch checklist
- [ ] Node 22.x on Vercel; build green.
- [ ] Deployment Protection on previews.
- [ ] `db/schema.sql` applied.
- [ ] Only your Gmail reaches `/admin-dashboard`; everyone else gets 404.
- [ ] Resend domain verified; a test send shows DKIM **pass + aligned**, SPF pass;
      DMARC reports arriving; then tighten DMARC.
- [ ] Confirmation + broadcast emails include the postal address and unsubscribe.
- [ ] Resend webhook rejects forged payloads (bad signature → 400).
- [ ] `/privacy` linked at every collection point.
- [ ] Upgrade Resend to Pro before the list exceeds ~100 confirmed subscribers.
