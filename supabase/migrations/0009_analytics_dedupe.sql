-- ============================================================
-- 0009_analytics_dedupe.sql — server-side dedupe for the public view beacon.
--
-- [Security review — analytics beacon abuse] The cookie-only dedupe in Phase E
-- is bypassable by an attacker who simply drops the cookie. This adds a
-- DB-enforced dedupe so repeat views from the same hashed-IP / post / UTC-day
-- collapse to ONE row: recordView() inserts ON CONFLICT DO NOTHING against the
-- UNIQUE index below.
--
-- No-PII stance preserved: we store ONLY a one-way SALTED SHA-256 of the IP
-- (see lib/analytics.js#hashIp) plus a UTC day bucket — never the raw IP or UA.
--
-- Access model unchanged: RLS is still ON + FORCED with no anon/authenticated
-- policy or grant (0004); only service_role (BYPASSRLS) reads/writes this table.
--
-- Idempotent: ADD COLUMN IF NOT EXISTS / CREATE INDEX IF NOT EXISTS.
-- ============================================================

alter table public.analytics_event
  add column if not exists ip_hash    text,
  add column if not exists day_bucket date;

-- Dedupe target: one row per (post, hashed visitor, UTC day). A FULL (not
-- partial) unique index, so PostgREST's on_conflict inference by column list
-- (content_id, ip_hash, day_bucket) matches it. Pre-existing rows have a null
-- ip_hash and are NULLS DISTINCT, so they never collide; every new row sets all
-- three columns.
create unique index if not exists analytics_event_daily_unique_idx
  on public.analytics_event (content_id, ip_hash, day_bucket);

comment on column public.analytics_event.ip_hash is
  'One-way salted SHA-256 of the client IP (NEVER the raw IP). Dedupe key only.';
comment on column public.analytics_event.day_bucket is
  'UTC day (date) of the view — the per-day dedupe bucket.';

-- Retention is bounded in the write path: lib/analytics.js prunes rows older
-- than ANALYTICS_RETENTION_DAYS probabilistically on write (same opportunistic
-- pattern as the auth limiter). A pg_cron job would be a tidier home but is
-- deferred — enabling pg_cron is not guaranteed on every shared instance and is
-- not worth a launch-night migration risk. See PLATFORM.md.

notify pgrst, 'reload schema';
