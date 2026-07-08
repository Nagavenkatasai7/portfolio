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
