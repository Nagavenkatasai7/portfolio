-- ============================================================
-- 0007_sync_state.sql — sync bookkeeping + single-flight lock for the
-- READ-ONLY LinkedIn ingestion (Phase F).
--
-- One row per named sync (currently just 'linkedin'). Holds:
--   * a single-flight LOCK (locked_by + locked_at) with stale-lock takeover,
--     so two overlapping cron runs can never double-process.
--   * a DEAD-MAN's-SWITCH surface — last_success_at / last_error / last_run_at
--     + counts — read by /admin to show sync health (staleness = trouble).
--
-- Access model mirrors 0004 (analytics_event / auth_rate_limit): RLS ON +
-- FORCED, NO anon/authenticated policy or grant, so the public roles cannot
-- touch it at all. Only the server-side service_role (BYPASSRLS) reads/writes
-- it — directly, and via the two RPCs below (granted to service_role only).
--
-- Idempotent: safe to re-run (IF NOT EXISTS / CREATE OR REPLACE / ON CONFLICT).
-- ============================================================

create table if not exists public.sync_state (
  name             text primary key,            -- e.g. 'linkedin'
  locked_by        text,                        -- current holder token, or NULL when free
  locked_at        timestamptz,                 -- when the lock was taken
  last_run_at      timestamptz,                 -- last time a run finished (ok or not)
  last_success_at  timestamptz,                 -- last SUCCESSFUL run (the dead-man's clock)
  last_error       text,                        -- last error message (NULL when healthy)
  last_error_at    timestamptz,
  last_window_days integer,                     -- window used by the last run (NULL = full backfill)
  synced_count     integer not null default 0,  -- rows processed by the last successful run
  created_count    integer not null default 0,  -- of which INSERTed
  updated_count    integer not null default 0,  -- of which UPDATEd (dedupe hits)
  updated_at       timestamptz not null default now()
);

-- Seed the one row we use, so the lock RPC always has a target.
insert into public.sync_state (name) values ('linkedin')
  on conflict (name) do nothing;

alter table public.sync_state enable row level security;
alter table public.sync_state force row level security;
revoke all on public.sync_state from anon, authenticated;
-- service_role bypasses RLS; make its table privilege explicit regardless of
-- any default-privilege drift.
grant all on public.sync_state to service_role;

comment on table public.sync_state is
  'Per-sync single-flight lock + health (Phase F LinkedIn ingestion). No anon access; service_role only.';

-- --- single-flight lock: acquire --------------------------------------------
-- Atomic conditional UPDATE: take the lock iff it is free OR stale (older than
-- p_stale_minutes). Returns true iff THIS caller now holds it. Two concurrent
-- runs race on the same row; Postgres row-locks serialize them and re-check the
-- WHERE against the just-committed row, so exactly one wins.
create or replace function public.sync_try_acquire(
  p_name text, p_holder text, p_stale_minutes integer
) returns boolean
language plpgsql
as $$
declare
  v_got boolean;
begin
  update public.sync_state
     set locked_by = p_holder,
         locked_at = now(),
         updated_at = now()
   where name = p_name
     and (locked_by is null
          or locked_at is null
          or locked_at < now() - make_interval(mins => greatest(coalesce(p_stale_minutes, 0), 0)))
  returning true into v_got;
  return coalesce(v_got, false);
end;
$$;

-- --- finish a run: release the lock + record outcome ------------------------
-- Only the CURRENT holder may finish (guards against a stale-takeover clobber).
-- On success: stamp last_success_at + counts, clear last_error. On failure:
-- stamp last_error / last_error_at, keep the prior success + counts. Either way
-- the lock is released. Returns true iff this holder actually held the lock.
create or replace function public.sync_finish(
  p_name text, p_holder text, p_success boolean, p_error text,
  p_synced integer, p_created integer, p_updated integer, p_window_days integer
) returns boolean
language plpgsql
as $$
declare
  v_done boolean;
begin
  update public.sync_state
     set locked_by       = null,
         locked_at       = null,
         last_run_at      = now(),
         last_success_at  = case when p_success then now() else last_success_at end,
         last_error       = case when p_success then null else left(p_error, 1000) end,
         last_error_at    = case when p_success then last_error_at else now() end,
         last_window_days = p_window_days,
         synced_count     = case when p_success then coalesce(p_synced, 0)  else synced_count end,
         created_count    = case when p_success then coalesce(p_created, 0) else created_count end,
         updated_count    = case when p_success then coalesce(p_updated, 0) else updated_count end,
         updated_at       = now()
   where name = p_name
     and locked_by = p_holder
  returning true into v_done;
  return coalesce(v_done, false);
end;
$$;

-- service_role only for both RPCs. Never anon / authenticated / public.
revoke all on function public.sync_try_acquire(text, text, integer)
  from public, anon, authenticated;
grant execute on function public.sync_try_acquire(text, text, integer)
  to service_role;

revoke all on function public.sync_finish(text, text, boolean, text, integer, integer, integer, integer)
  from public, anon, authenticated;
grant execute on function public.sync_finish(text, text, boolean, text, integer, integer, integer, integer)
  to service_role;

comment on function public.sync_try_acquire(text, text, integer) is
  'Single-flight lock acquire for a named sync. Stale-lock takeover after p_stale_minutes. service_role only.';
comment on function public.sync_finish(text, text, boolean, text, integer, integer, integer, integer) is
  'Release a sync lock + record success/error + counts. Only the holder may finish. service_role only.';

-- Ask PostgREST to reload its schema cache so the new RPCs are callable now.
notify pgrst, 'reload schema';
