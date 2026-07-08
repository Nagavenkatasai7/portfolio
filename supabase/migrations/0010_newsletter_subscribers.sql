-- ============================================================
-- 0010_newsletter_subscribers.sql — "The Field Guide" newsletter list (Phase N1).
--
-- One row per email address on the newsletter. This table is PII (email
-- addresses), so its access model is the STRICTEST in the schema: RLS ON +
-- FORCED with NO anon/authenticated policy or grant at all — the public roles
-- cannot SELECT or INSERT it under any circumstances. Every read/write goes
-- through the server-side service_role (BYPASSRLS), funneled through the single
-- chokepoint lib/newsletter.js (mirrors lib/gate.js discipline). Public signup
-- reaches it only via POST /api/newsletter/subscribe, which validates + per-IP
-- rate-limits before any write.
--
-- Double-opt-in: a new signup lands 'pending' with a hashed, single-use, 7-day
-- confirm token; clicking the emailed link flips it to 'active'. Only the
-- SHA-256 hex of each token is stored, never the raw token (the raw lives only
-- in the emailed link). An unsubscribe token (also stored as a hash, with NO
-- expiry) rides along so every email can carry a working opt-out link.
--
-- Access model mirrors 0004 (analytics_event / auth_rate_limit) and 0007
-- (sync_state): no anon access whatsoever; service_role only.
--
-- Idempotent: safe to re-run (IF NOT EXISTS / ON CONFLICT). Additive: it
-- touches no existing table, view, RPC, policy or grant.
-- ============================================================

-- gen_random_uuid() lives in pgcrypto (also in core on PG13+, but be explicit).
create extension if not exists pgcrypto;

create table if not exists public.newsletter_subscribers (
  id                 uuid primary key default gen_random_uuid(),

  -- The subscriber's email. Case-insensitive uniqueness is enforced by the
  -- functional UNIQUE index below (lower(email)); we always store it lowercased.
  email              text not null,

  -- Lifecycle:
  --   pending       — signed up, confirm link emailed, not yet confirmed
  --   active         — confirmed (double opt-in complete); receives issues
  --   unsubscribed   — opted out; can re-subscribe (flips back to pending)
  --   bounced        — hard bounce; permanent suppression, never emailed again
  --   complained     — marked spam; permanent suppression, never emailed again
  status             text not null default 'pending',

  -- Double-opt-in confirm token: SHA-256 hex of a 32-byte random token (the raw
  -- token lives only in the emailed link). 7-day expiry via confirm_expires_at.
  confirm_token_hash text,
  confirm_expires_at timestamptz,          -- confirm token expiry (issued_at + 7 days)
  confirm_sent_at    timestamptz,          -- when the confirm email was last issued (throttles re-sends to <= 1/hour)

  -- Unsubscribe token: SHA-256 hex of a 32-byte random token. No expiry, so
  -- every email can carry a working one-click opt-out. (Because only the hash
  -- is stored, a re-sent confirmation mints a fresh token — see lib/newsletter.js.)
  unsub_token_hash   text,

  source             text,                 -- where the signup came from (e.g. 'home', 'blog')
  ip_hash            text,                 -- salted SHA-256 of the signup IP (NO raw IP; same salt as the analytics limiter)

  created_at         timestamptz not null default now(),
  confirmed_at       timestamptz,          -- when status became 'active'
  unsubscribed_at    timestamptz           -- when status became 'unsubscribed'
);

-- --- constraints -------------------------------------------------------------

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'newsletter_subscribers_status_check') then
    alter table public.newsletter_subscribers add constraint newsletter_subscribers_status_check check (
      status in ('pending','active','unsubscribed','bounced','complained')
    );
  end if;
end $$;

-- --- indexes -----------------------------------------------------------------

-- Case-insensitive UNIQUE on email: "Naga@X.com" and "naga@x.com" are ONE row.
create unique index if not exists newsletter_subscribers_email_lower_key
  on public.newsletter_subscribers (lower(email));

-- Point lookups by token hash (the confirm + unsubscribe link flows). Partial:
-- most rows have a NULL hash most of the time, so the indexes stay small.
create index if not exists newsletter_subscribers_confirm_token_hash_idx
  on public.newsletter_subscribers (confirm_token_hash) where confirm_token_hash is not null;
create index if not exists newsletter_subscribers_unsub_token_hash_idx
  on public.newsletter_subscribers (unsub_token_hash) where unsub_token_hash is not null;

-- --- RLS: PII — no public access at all --------------------------------------
alter table public.newsletter_subscribers enable row level security;
alter table public.newsletter_subscribers force row level security;
revoke all on public.newsletter_subscribers from anon, authenticated;
-- (No policy => with RLS forced, anon/authenticated get NOTHING: cannot SELECT
--  or INSERT. service_role bypasses RLS; make its privilege explicit regardless
--  of any default-privilege drift.)
grant all on public.newsletter_subscribers to service_role;

comment on table public.newsletter_subscribers is
  'The Field Guide newsletter list (PII: emails). Double-opt-in. No anon access; service_role only, via lib/newsletter.js.';

-- Ask PostgREST to reload its schema cache so the new table is reflected.
notify pgrst, 'reload schema';
