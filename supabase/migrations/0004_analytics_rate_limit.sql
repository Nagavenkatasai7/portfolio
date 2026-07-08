-- ============================================================
-- 0004_analytics_rate_limit.sql — supporting tables (no public access).
--
--   analytics_event  — minimal event log for a later phase. The analytics
--                      write endpoint is NOT built in this phase.
--   auth_rate_limit  — per-IP sliding-window limiter for the auth routes.
--
-- Both have RLS ON with NO anon/authenticated policies and NO grants, so the
-- public roles cannot touch them at all. Only the server-side service_role
-- (BYPASSRLS) reads/writes them.
-- ============================================================

-- --- analytics_event ---------------------------------------------------------
create table if not exists public.analytics_event (
  id         uuid primary key default gen_random_uuid(),
  content_id uuid references public.content (id) on delete set null,
  kind       text,
  path       text,
  created_at timestamptz not null default now()
);

create index if not exists analytics_event_created_at_idx
  on public.analytics_event (created_at desc);

alter table public.analytics_event enable row level security;
alter table public.analytics_event force row level security;
revoke all on public.analytics_event from anon, authenticated;
-- (No policy => with RLS forced, anon/authenticated get nothing. service_role bypasses RLS.)

comment on table public.analytics_event is
  'Minimal analytics log. No anon access. Write endpoint is a later phase.';

-- --- auth_rate_limit ---------------------------------------------------------
create table if not exists public.auth_rate_limit (
  id         uuid primary key default gen_random_uuid(),
  ip         text not null,
  route      text not null,
  created_at timestamptz not null default now()
);

-- The limiter counts attempts per ip within a recent window.
create index if not exists auth_rate_limit_ip_created_at_idx
  on public.auth_rate_limit (ip, created_at desc);

alter table public.auth_rate_limit enable row level security;
alter table public.auth_rate_limit force row level security;
revoke all on public.auth_rate_limit from anon, authenticated;

comment on table public.auth_rate_limit is
  'Per-IP sliding-window auth attempt log. No anon access; written server-side by service_role.';
