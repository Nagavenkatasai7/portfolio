-- =============================================================================
-- Portfolio database schema (Neon Postgres)
-- Apply with the UNPOOLED connection string:
--   psql "$DATABASE_URL_UNPOOLED" -f db/schema.sql
-- All application queries MUST be parameterized (never string-interpolate input).
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS citext; -- case-insensitive email
-- gen_random_uuid() is built in on modern Postgres (pgcrypto is present on Neon)

-- ─────────────────────────────── SUBSCRIBERS ───────────────────────────────
DO $$ BEGIN
  CREATE TYPE subscriber_status AS ENUM
    ('pending', 'confirmed', 'unsubscribed', 'bounced', 'complained');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS subscribers (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email                citext NOT NULL,
  status               subscriber_status NOT NULL DEFAULT 'pending',
  -- double opt-in token (random 256-bit; store ONLY its SHA-256 hash)
  token_hash           bytea,
  token_expires_at     timestamptz,
  -- separate, unsubscribe-ONLY token (never reused for confirm)
  unsub_token_hash     bytea,
  -- abuse control: throttle repeat confirmation emails
  last_confirm_sent_at timestamptz,
  confirm_send_count   integer NOT NULL DEFAULT 0,
  -- GDPR consent proof (captured at BOTH signup and confirm)
  signup_ip            inet,
  signup_user_agent    text,
  signup_source        text,
  consent_text         text,
  confirm_ip           inet,
  confirm_user_agent   text,
  -- Resend linkage
  resend_contact_id    text,
  created_at           timestamptz NOT NULL DEFAULT now(),
  confirmed_at         timestamptz,
  unsubscribed_at      timestamptz,
  updated_at           timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS subscribers_email_uniq ON subscribers (email);
CREATE INDEX IF NOT EXISTS subscribers_token_idx  ON subscribers (token_hash);
CREATE INDEX IF NOT EXISTS subscribers_unsub_idx  ON subscribers (unsub_token_hash);
CREATE INDEX IF NOT EXISTS subscribers_status_idx ON subscribers (status);

-- ─────────────────────────────── BLOG POSTS ────────────────────────────────
DO $$ BEGIN
  CREATE TYPE post_status AS ENUM ('draft', 'published', 'archived');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS posts (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug          text NOT NULL,
  title         text NOT NULL,
  excerpt       text,
  body_md       text NOT NULL,
  body_html     text,                    -- SANITIZED rendered HTML cache
  cover_image   text,
  tags          text[] NOT NULL DEFAULT '{}',
  status        post_status NOT NULL DEFAULT 'draft',
  author_email  text NOT NULL,
  view_count    integer NOT NULL DEFAULT 0,
  published_at  timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS posts_slug_uniq ON posts (slug);
CREATE INDEX IF NOT EXISTS posts_status_pub_idx ON posts (status, published_at DESC);

-- ─────────────────────────── NEWSLETTER ISSUES ─────────────────────────────
DO $$ BEGIN
  CREATE TYPE issue_status AS ENUM
    ('pending_review', 'approved', 'scheduled', 'sent', 'failed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS newsletter_issues (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  iso_week            text NOT NULL,       -- e.g. '2026-W27' — idempotency key
  subject             text,
  preheader           text,
  body_html           text,
  body_text           text,
  owner_notes         text,
  ai_sources          jsonb,
  status              issue_status NOT NULL DEFAULT 'pending_review',
  resend_broadcast_id text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  approved_at         timestamptz,
  sent_at             timestamptz,
  updated_at          timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS issues_week_uniq ON newsletter_issues (iso_week);

-- "notes inbox": links/ideas jotted during the week for the next issue
CREATE TABLE IF NOT EXISTS newsletter_notes (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  content    text NOT NULL,
  url        text,
  used       boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ─────────────────────────── ANALYTICS EVENTS ──────────────────────────────
-- event_type: page_view | subscribe | confirm | unsubscribe | contact_submit |
--             newsletter_sent | email_open | email_click
CREATE TABLE IF NOT EXISTS analytics_events (
  id            bigserial PRIMARY KEY,
  event_type    text NOT NULL,
  path          text,
  referrer      text,
  subscriber_id uuid REFERENCES subscribers(id) ON DELETE SET NULL,
  issue_id      uuid REFERENCES newsletter_issues(id) ON DELETE SET NULL,
  meta          jsonb,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS analytics_type_time_idx ON analytics_events (event_type, created_at DESC);

-- ─────────────────────────── CONTACT MESSAGES ──────────────────────────────
CREATE TABLE IF NOT EXISTS contact_messages (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text NOT NULL,
  email      citext NOT NULL,
  subject    text,
  message    text NOT NULL,
  ip         inet,
  user_agent text,
  is_spam    boolean NOT NULL DEFAULT false,
  emailed_ok boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS contact_created_idx ON contact_messages (created_at DESC);
