-- ============================================================
-- 0011_newsletter_issues.sql — "The Field Guide" ARMED-QUEUE sender + delivery
-- ledger (Phase N2). Three tables that turn a `content` row of type 'newsletter'
-- into a sendable, auditable email issue:
--
--   newsletter_issue_meta — one row per issue (keyed to the content row). Holds
--     the send-specific fields (subject/preheader/hero) and the ARMED-QUEUE
--     lifecycle: draft -> approved ("armed") -> sending -> sent. A scheduled job
--     sends ONLY issues the owner explicitly approved; draft is never sendable.
--   newsletter_sends — the per-recipient delivery ledger (one row per recipient
--     per issue). The send job snapshots the ACTIVE list into 'queued' rows, then
--     flips each to 'sent' (with the Resend message id) as it goes; the webhook
--     later flips them to 'delivered' / 'bounced' / 'complained'. UNIQUE(issue,
--     subscriber) makes the snapshot + every batch idempotent.
--   newsletter_links — a "link bin": URLs the owner drops in during the week for
--     Phase N3's drafter to consume. Pure CRUD here (queued/used/discarded).
--
-- Access model is the STRICTEST in the schema, identical to 0010
-- (newsletter_subscribers) and 0007 (sync_state): RLS ENABLED + FORCED, ZERO
-- policies, NO anon/authenticated grant. The public roles cannot SELECT or
-- INSERT any of these under any circumstances. Every read/write goes through the
-- service_role (BYPASSRLS), funneled through the single chokepoint
-- lib/newsletter_issues.js (mirrors lib/gate.js / lib/newsletter.js discipline).
--
-- Advisory lock: this migration SEEDS a second sync_state row named 'newsletter'
-- so the send cron can reuse the 0007 single-flight lock RPCs (sync_try_acquire /
-- sync_finish) with a DISTINCT lock name — the same dead-man's-switch surface the
-- LinkedIn sync uses, at zero new machinery.
--
-- Idempotent: safe to re-run (IF NOT EXISTS / ON CONFLICT / guarded constraints).
-- Additive: touches no existing table, view, RPC, policy or grant.
-- ============================================================

-- gen_random_uuid() lives in pgcrypto (also core on PG13+, but be explicit).
create extension if not exists pgcrypto;

-- ============================================================
-- 1) newsletter_issue_meta — one row per issue, keyed to its content row.
-- ============================================================
create table if not exists public.newsletter_issue_meta (
  -- PK == the content row this issue renders from (type='newsletter'). One issue
  -- per content row. FK so meta can never point at a non-existent content id.
  content_id       uuid primary key references public.content(id),

  -- The email's subject line (required to send) + optional preheader (the inbox
  -- preview snippet) + optional hero image URL rendered at the top of the body.
  subject          text not null,
  preheader        text,
  hero_image_url   text,

  -- ARMED-QUEUE lifecycle:
  --   draft     — being edited; NOT sendable. The send job ignores it.
  --   approved  — "armed": the owner explicitly OK'd it (approved_at stamped).
  --               The Tuesday job takes the OLDEST approved issue.
  --   sending   — a send is in progress (send_started_at stamped); batches drain
  --               the queued rows over one or more days (free-tier friendly).
  --   sent      — every recipient processed (sent_at stamped).
  status           text not null default 'draft',

  approved_at      timestamptz,   -- when the owner armed it (draft -> approved)
  send_started_at  timestamptz,   -- when sending began (approved -> sending)
  sent_at          timestamptz,   -- when the last batch drained (sending -> sent)
  audience_count   int,           -- ACTIVE subscribers snapshotted at send start

  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'newsletter_issue_meta_status_check') then
    alter table public.newsletter_issue_meta add constraint newsletter_issue_meta_status_check check (
      status in ('draft','approved','sending','sent')
    );
  end if;
end $$;

-- Fast "oldest approved" pick (armed-queue): partial index on approved_at where
-- armed, so pickOldestApproved() is an index-only order-by-limit-1.
create index if not exists newsletter_issue_meta_approved_idx
  on public.newsletter_issue_meta (approved_at)
  where status = 'approved';

-- Fast "is anything currently sending?" lookup for the daily continuation.
create index if not exists newsletter_issue_meta_status_idx
  on public.newsletter_issue_meta (status);

-- ============================================================
-- 2) newsletter_sends — per-recipient delivery ledger.
-- ============================================================
create table if not exists public.newsletter_sends (
  id                  uuid primary key default gen_random_uuid(),

  -- The issue (content id) and the subscriber this row is a send TO. Plain uuids
  -- (not FKs) to keep the ledger append-only and independent of row lifecycle.
  issue_content_id    uuid not null,
  subscriber_id       uuid not null,

  -- Resend's message id, recorded when the row flips to 'sent'. The webhook looks
  -- rows up by this to record delivered/bounced/complained events.
  provider_message_id text,

  -- Ledger state:
  --   queued     — snapshotted, not yet sent
  --   sent       — handed to Resend (provider_message_id recorded)
  --   delivered  — Resend delivery webhook confirmed
  --   bounced    — hard bounce (subscriber permanently suppressed)
  --   complained — spam complaint (subscriber permanently suppressed)
  --   failed     — the send attempt itself failed (error_note set); not retried
  status              text not null default 'queued',

  -- Failure detail when status='failed' (e.g. a Resend 4xx, or a recipient who
  -- was suppressed between snapshot and send). NOT in the original spec column
  -- list; added because runSendBatch records "status 'failed' with error note".
  error_note          text,

  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),

  -- One send row per (issue, subscriber): makes the snapshot + every re-run of a
  -- batch idempotent (a re-snapshot is a no-op; a re-processed row is skipped).
  unique (issue_content_id, subscriber_id)
);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'newsletter_sends_status_check') then
    alter table public.newsletter_sends add constraint newsletter_sends_status_check check (
      status in ('queued','sent','delivered','bounced','complained','failed')
    );
  end if;
end $$;

-- Webhook lookup by Resend message id (partial: most rows are queued w/ NULL id).
create index if not exists newsletter_sends_provider_message_id_idx
  on public.newsletter_sends (provider_message_id)
  where provider_message_id is not null;

-- Batch driver: "next queued rows for the sending issue" + per-issue stats.
create index if not exists newsletter_sends_issue_status_idx
  on public.newsletter_sends (issue_content_id, status);

-- ============================================================
-- 3) newsletter_links — the "link bin" for Phase N3's drafter (CRUD only now).
-- ============================================================
create table if not exists public.newsletter_links (
  id             uuid primary key default gen_random_uuid(),
  url            text not null,
  note           text,
  -- queued — waiting to be used; used — consumed by an issue (used_in_issue set);
  -- discarded — dismissed by the owner.
  status         text not null default 'queued',
  added_at       timestamptz not null default now(),
  used_in_issue  uuid
);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'newsletter_links_status_check') then
    alter table public.newsletter_links add constraint newsletter_links_status_check check (
      status in ('queued','used','discarded')
    );
  end if;
end $$;

create index if not exists newsletter_links_status_added_idx
  on public.newsletter_links (status, added_at desc);

-- ============================================================
-- updated_at triggers (reuse the generic set_updated_at() from 0001).
-- ============================================================
drop trigger if exists newsletter_issue_meta_set_updated_at on public.newsletter_issue_meta;
create trigger newsletter_issue_meta_set_updated_at
  before update on public.newsletter_issue_meta
  for each row execute function public.set_updated_at();

drop trigger if exists newsletter_sends_set_updated_at on public.newsletter_sends;
create trigger newsletter_sends_set_updated_at
  before update on public.newsletter_sends
  for each row execute function public.set_updated_at();

-- ============================================================
-- RLS: PII + owner-only control surface — no public access at all (mirrors 0010).
-- ============================================================
alter table public.newsletter_issue_meta enable row level security;
alter table public.newsletter_issue_meta force row level security;
revoke all on public.newsletter_issue_meta from anon, authenticated;
grant all on public.newsletter_issue_meta to service_role;

alter table public.newsletter_sends enable row level security;
alter table public.newsletter_sends force row level security;
revoke all on public.newsletter_sends from anon, authenticated;
grant all on public.newsletter_sends to service_role;

alter table public.newsletter_links enable row level security;
alter table public.newsletter_links force row level security;
revoke all on public.newsletter_links from anon, authenticated;
grant all on public.newsletter_links to service_role;
-- (No policy => with RLS forced, anon/authenticated get NOTHING. service_role
--  bypasses RLS; the explicit grants guard against default-privilege drift.)

comment on table public.newsletter_issue_meta is
  'Field Guide issue metadata + ARMED-QUEUE lifecycle (draft/approved/sending/sent). No anon access; service_role only, via lib/newsletter_issues.js.';
comment on table public.newsletter_sends is
  'Field Guide per-recipient delivery ledger. UNIQUE(issue,subscriber). No anon access; service_role only.';
comment on table public.newsletter_links is
  'Field Guide link bin (Phase N3 drafter input). No anon access; service_role only.';

-- ============================================================
-- Advisory lock: seed a second sync_state row so the send cron can reuse the
-- 0007 single-flight lock RPCs with a DISTINCT name (dead-man's-switch surface).
-- ============================================================
insert into public.sync_state (name) values ('newsletter')
  on conflict (name) do nothing;

-- Ask PostgREST to reload its schema cache so the new tables are reflected.
notify pgrst, 'reload schema';
