# RUNBOOK — turn on "The Field Guide" newsletter (Phase N1)

The signup foundation is built and verified, but **dormant** until you supply
`RESEND_API_KEY`. With no key, `POST /api/newsletter/subscribe` fails closed with
a `503` (exactly like `/admin` before its auth env is set) — the homepage/blog
forms will show a "something went wrong" state rather than silently dropping mail.
This is the exact checklist to make it live.

**What Phase N1 is / isn't.** N1 is public signup + double opt-in only:
subscribe → confirmation email → confirm/unsubscribe. **Sending issues, the admin
list UI, and bounce/complaint webhooks are Phase N2** and are intentionally not
built yet. Everything here goes through one server-only chokepoint,
`lib/newsletter.js`; the list table (`newsletter_subscribers`) is PII and is
RLS-locked to the service role (no anon access at all).

**Env vars this phase needs**

| Var | Required? | What | Where |
| --- | --- | --- | --- |
| `RESEND_API_KEY` | **yes** (dormant until set) | Resend API key (copy the one from `field-guide-builder`) | Resend dashboard → API Keys |
| `NEWSLETTER_FROM` | optional | Sender identity; defaults to `The Field Guide <newsletter@chennunagavenkatasai.com>` | must be a Resend-**verified** domain |
| `NEXT_PUBLIC_SITE_URL` | optional | Base URL used to build confirm/unsub links in the email | apex domain, e.g. `https://chennunagavenkatasai.com` |

> `NEXT_PUBLIC_SITE_URL` is the same optional var Phase E documented. If unset, the
> links fall back to Vercel's system URL (the deployment origin), then localhost.
> Set it to the apex domain so confirmation links always point at production.

---

## Step A — verify the sending domain in Resend

The Resend **account already exists** (the `RESEND_API_KEY` is being copied from
`field-guide-builder`, which sends from the same account). You still need
`chennunagavenkatasai.com` verified as a sending domain in **this** account:

1. Resend dashboard → **Domains** → check whether `chennunagavenkatasai.com` is
   already **Verified** (FGB may already have added it — if so, skip to Step C).
2. If not present: **Add Domain** → `chennunagavenkatasai.com`. Resend shows **3
   DNS records** to add (values are account-specific — copy them from this
   screen):
   - **SPF** — a `TXT` on a send subdomain (typically `send`), value like
     `v=spf1 include:amazonses.com ~all`, plus an `MX` on `send` →
     `feedback-smtp.<region>.amazonses.com` (priority 10).
   - **DKIM** — a `TXT` (Resend uses a `resend._domainkey` record) with the
     public key value Resend generates.
   - **DMARC** (recommended) — a `TXT` at `_dmarc` → `v=DMARC1; p=none;`.

## Step B — add those DNS records in Vercel DNS

DNS for `chennunagavenkatasai.com` is on **Vercel**. Add each record Resend showed
you. Templated commands (**FILL IN** the account-specific values from Step A):

```bash
# SPF (TXT on the send subdomain) + its MX
vercel dns add chennunagavenkatasai.com send TXT "v=spf1 include:amazonses.com ~all"
vercel dns add chennunagavenkatasai.com send MX "feedback-smtp.<REGION>.amazonses.com" 10   # FILL IN region

# DKIM (Resend-generated public key)
vercel dns add chennunagavenkatasai.com resend._domainkey TXT "<DKIM_VALUE_FROM_RESEND>"    # FILL IN

# DMARC (recommended)
vercel dns add chennunagavenkatasai.com _dmarc TXT "v=DMARC1; p=none;"
```

> Record **names/hosts and values are exactly what Resend prints** — the above is
> the shape, not the literal values. After adding, click **Verify** in Resend;
> propagation is usually minutes. Until the domain shows **Verified**, do not set
> `NEWSLETTER_FROM` to an `@chennunagavenkatasai.com` address for real sends (see
> Step D's test-send note).

## Step C — set the env vars (owner does this; N1 did NOT write any Vercel env)

```bash
vercel env add RESEND_API_KEY production        # and: preview
vercel env add RESEND_API_KEY preview
# optional:
vercel env add NEWSLETTER_FROM production       # "The Field Guide <newsletter@chennunagavenkatasai.com>"
vercel env add NEXT_PUBLIC_SITE_URL production   # https://chennunagavenkatasai.com
```

> **Known CLI bug (do this from the dashboard if it bites):** `vercel env add`
> from this machine has stored **empty** values in the past. If `vercel env pull`
> shows an empty `RESEND_API_KEY`, set it in **Vercel → Settings → Environment
> Variables** in the browser instead. For **local** testing, pull to `.env.local`
> (`vercel env pull .env.local --environment=production`) — and delete it after.

## Step D — test send

- **Before the domain verifies:** Resend only delivers from its **shared dev
  domain** (`onboarding@resend.dev`) and **only to the account owner's own email**.
  That's fine for the **Phase N3 test issue** — set `NEWSLETTER_FROM` unset (falls
  back to the default) or to `onboarding@resend.dev` and send yourself a test.
- **After verification:** real subscribers can receive mail from
  `newsletter@chennunagavenkatasai.com`.
- **Smoke test the live flow:** on the homepage or `/blog`, enter your own address
  → you should land on `/newsletter/pending` and receive the "Confirm your Field
  Guide subscription" email → clicking the button lands you on `/newsletter/confirmed`
  and flips your row to `active`. The footer **Unsubscribe** link lands on
  `/newsletter/unsubscribed`.

---

## Notes & decisions

- **CAN-SPAM postal address.** US anti-spam law (CAN-SPAM) requires a **physical
  postal address** in the footer of *commercial* bulk email. The N1 **confirmation**
  email is transactional (a single opt-in confirmation) and does not strictly
  require it, but the **weekly issue template in Phase N2 must include a postal
  address** (a PO box is fine — don't publish a home address). **Decision to make
  before N2 sends:** which address to use. A PO box or a business address is
  recommended; add it to the N2 issue footer + the `List-Unsubscribe` is already
  wired.
- **Free-tier limits.** Resend's free tier is **3,000 emails/month and 100/day**.
  N1 sends only one small confirmation per signup, so it won't approach this. The
  **weekly issue send (Phase N2)** is where volume matters: at >100 confirmed
  subscribers a single blast exceeds the daily cap, so **N2 must batch** the issue
  send across days (or the account is upgraded). N2 owns that batching logic; N1
  just collects the list.
- **Suppression.** `bounced` and `complained` addresses are **never emailed again**
  (permanent suppression, enforced in `lib/newsletter.js`). N1 sets these states
  manually only; **N2 wires the Resend webhook** that flips a row to `bounced` /
  `complained` automatically, and the RFC 8058 one-click `List-Unsubscribe-Post`
  header (the `POST /api/newsletter/unsubscribe` handler already exists).
- **Rotation.** Rotate the `RESEND_API_KEY` in Resend + update Vercel before any
  public launch if the key was shared during setup.

---

## Phase N2 — arm and send issues, wire delivery events

Phase N2 turns the N1 signup list into an actual send pipeline: the admin
studio (`/admin/newsletter`), the **armed-queue** automatic sender
(`/api/cron/newsletter-send`), the Resend delivery webhook
(`/api/newsletter/webhook`), and a per-recipient delivery ledger. It's built
on N1's chokepoint (`lib/newsletter.js`) plus one new one,
`lib/newsletter_issues.js`.

**What Phase N2 is.** The studio to pick a `newsletter`-type content row, set
its subject/preheader/hero, approve it, and watch it send; the daily cron
that sends only owner-approved issues in free-tier-friendly batches; the
webhook that turns Resend's delivery/bounce/complaint events into ledger
state + permanent suppression; and the subscriber stats/CSV views.
`newsletter_links` (a link bin) ships as plumbing for Phase N3's drafter — no
drafting UI yet.

**Env vars this phase needs**

| Var | Required? | What | Where |
| --- | --- | --- | --- |
| `RESEND_WEBHOOK_SECRET` | **yes**, for the webhook (dormant `503` until set) | Svix signing secret for delivery events | Resend dashboard → Webhooks (`whsec_...`) |
| `RESEND_AUDIENCE_ID` | optional | enables the studio's "Import audience" button (Subscribers tab) | Resend dashboard → Audiences |
| `NEWSLETTER_POSTAL_ADDRESS` | optional (CAN-SPAM good practice) | physical mailing address appended to every issue's footer | already set in **Production** |
| `CRON_SECRET` | already set (Phase F) | also guards this cron (`Authorization: Bearer $CRON_SECRET`) | shared with `linkedin-sync` |
| `RESEND_API_KEY` | already set (N1) | required for any real send — issues, tests, and the audience import | Resend dashboard → API Keys |

### Step E — wire the Resend delivery webhook

1. Resend dashboard → **Webhooks** → **Add Endpoint**.
2. Endpoint URL — production (post-cutover):
   `https://chennunagavenkatasai.com/api/newsletter/webhook`. For testing
   before cutover, point it at the Vercel **preview** deployment instead,
   e.g. `https://<preview-deployment>.vercel.app/api/newsletter/webhook`.
3. Tick these events only: `email.delivered`, `email.bounced`,
   `email.complained`.
4. Copy the endpoint's **signing secret** (starts with `whsec_`).
5. Store it in Vercel:

```bash
cd <repo>; printf "Paste the webhook signing secret (whsec_...): "; read -rs S; echo; printf '%s' "$S" | grep -qE '^whsec_' && { vercel env add RESEND_WEBHOOK_SECRET production --value "$S" --yes; vercel env add RESEND_WEBHOOK_SECRET preview platform --value "$S" --yes; unset S; echo OK; } || echo "not a whsec_ value"
```

> **How verification works (no new npm dependency).** The webhook checks the
> Svix signature **hand-rolled with `node:crypto`**: the signed content is
> `${svix-id}.${svix-timestamp}.${rawBody}`, the key is the base64 portion of
> `RESEND_WEBHOOK_SECRET` after `whsec_`, the expected value is
> `HMAC-SHA256(key, signedContent)` compared **constant-time**, and
> timestamps more than **±5 minutes** off are rejected (replay defense).
> `503` (fail-closed, dormant) until `RESEND_WEBHOOK_SECRET` is set, `401` on
> a bad/stale/missing signature. `email.bounced` / `email.complained`
> **permanently suppress** the subscriber — N1's `subscribeEmail` already
> refuses to reactivate a bounced/complained address, so this is one-way.

### The armed-queue (the owner's core requirement)

Every issue moves through exactly one lifecycle, enforced in
`lib/newsletter_issues.js`, not just in the UI:

```
draft → approved ("armed", approved_at stamped) → sending → sent
```

- The daily job sends **only** issues the owner explicitly **approved** — a
  `draft` is never sendable, the cron can't touch it.
- Nothing approved → the job does **nothing**, silently.
- **Disarm** (approved → draft) works any time before sending has started.
- The owner can **bank several approved issues**; the job always takes the
  **oldest** approved one (by `approved_at`).
- At most **one** issue is ever `sending` at a time.

**Operator flow**, in `/admin/newsletter` → Issues tab:

1. Pick an existing `newsletter`-type content row, or write one first in the
   composer (`/admin/compose`).
2. Set the issue meta — **subject** (required), preheader + hero image URL
   (optional).
3. Click **Approve** to arm it.

On the next **Tuesday (America/New-York)** the cron picks the oldest approved
issue, publishes its `/blog` page, snapshots the active-subscriber list into
the ledger, and sends the first batch — continuing every day (any weekday)
until that issue's ledger drains. **Send now** starts an approved issue
immediately regardless of weekday; **Send test** emails a `[TEST]`-prefixed
render to one address; **Disarm** returns an approved issue to draft.

### Batching, the free tier, and the cron schedule

- Batch limit: **80 recipients per cron run**. The cron runs **once a day**
  (Vercel Hobby caps cron frequency); Resend's free tier allows ~100
  emails/day, so 80/run stays safely under it, with headroom for
  confirmation emails.
- A list of **N** active subscribers finishes in `ceil(N/80)` daily runs —
  e.g. 200 subscribers → 3 days (80 + 80 + 40).
- `vercel.json` adds exactly one cron entry:
  `{ "path": "/api/cron/newsletter-send", "schedule": "0 13 * * *" }` — daily
  **13:00 UTC ≈ 9:00 AM EDT** (summer) / **8:00 AM EST** (winter). The winter
  one-hour shift is **accepted** — the send still lands mid-morning ET.
- **No cron headroom left.** Vercel Hobby allows only 2 cron jobs and both
  are now used — `linkedin-sync` (06:00 UTC) + `newsletter-send` (13:00
  UTC). Adding another cron needs a plan upgrade.

### Auth + single-flight (reuses Phase F's machinery)

The cron reuses the **same shared `CRON_SECRET`** already set for the
LinkedIn cron, via the identical constant-time `timingSafeEqual` bearer
check: `503` if `CRON_SECRET` is unset, `401` on a wrong/missing bearer.
Both the cron and the admin "Send now" run under the 0007 `sync_state`
advisory lock, reused with the **distinct name `'newsletter'`** (seeded by
migration 0011) — so they can never race each other, and health
(`last_success` / `last_error`) shows on the studio's cron-health card, the
same dead-man's-switch pattern the LinkedIn sync card uses.

### Audience import + per-recipient unsubscribe

- **Import audience** (Subscribers tab, active only when `RESEND_AUDIENCE_ID`
  + `RESEND_API_KEY` are both set) calls `importResendAudience()`:
  idempotent on `lower(email)`, inserts new contacts as
  `active`/`source=resend-import`, upgrades an existing `pending` row to
  `active`, and **never** reactivates an unsubscribed/bounced/complained
  address.
- Every issue email carries its **own** unsubscribe link +
  `List-Unsubscribe`/`List-Unsubscribe-Post` headers (RFC 8058 one-click).
  Because N1 stores only the token's **hash**, a fresh token is minted per
  recipient at send time — so a link from a **prior** email stops working
  once a **newer** one has been sent to that subscriber; the newest email's
  link (and the admin "Remove") always work.

### Migration 0011 — apply before the studio/cron will work

`supabase/migrations/0011_newsletter_issues.sql` adds `newsletter_issue_meta`
(issue meta + the armed-queue lifecycle), `newsletter_sends` (the
per-recipient ledger, `UNIQUE(issue,subscriber)` → idempotent
snapshot/batches), and `newsletter_links` (link bin for Phase N3) — RLS
**enabled + forced**, **zero** policies, service-role-only, identical
posture to 0010. Apply with `npm run db:migrate` (needs `psql` + Supabase DB
creds).

> **This migration was authored but NOT applied** by the build environment
> (no `psql` / no Supabase creds there). **The owner must run
> `npm run db:migrate` before the studio or the cron will work.**

### Notes & decisions (N2)

- **Postal address, resolved by config.** N1 flagged that the weekly issue
  footer needs a CAN-SPAM postal address; N2 reads it from
  `NEWSLETTER_POSTAL_ADDRESS` if set and simply omits the line if not — it
  never blocks sending.
- **Free-tier batching, implemented.** N1 flagged that >100 confirmed
  subscribers would exceed Resend's daily cap in one blast; the 80/run daily
  batch above is that mitigation.
- **Suppression webhook, implemented.** N1 set `bounced`/`complained`
  manually only; N2 wires the real Resend webhook (Step E) so those states
  flip automatically.
