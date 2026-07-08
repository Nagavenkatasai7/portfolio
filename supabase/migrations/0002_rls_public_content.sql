-- ============================================================
-- 0002_rls_public_content.sql — Row Level Security + the public read surface.
--
-- Model:
--   * RLS is ON for `content`.
--   * The anon (and authenticated) roles get SELECT *only* on published,
--     non-deleted rows, and *only* on non-internal columns.
--   * The public read path is the `public_content` VIEW, which projects out
--     internal bookkeeping columns (ingested_at, deleted_at) entirely.
--   * No anon/authenticated INSERT/UPDATE/DELETE anywhere. All writes are
--     server-side via the service_role key (which bypasses RLS).
--
-- The view is security_invoker = true (Postgres 15+/Supabase): it runs with
-- the *querying* role's privileges, so the RLS policy below is the real
-- enforcement — no SECURITY DEFINER view bypassing RLS (which Supabase's
-- linter rightly flags).
-- ============================================================

alter table public.content enable row level security;
-- Force RLS even for the table owner, so nothing accidentally bypasses it
-- except roles with the BYPASSRLS attribute (service_role).
alter table public.content force row level security;

-- --- column privileges -------------------------------------------------------
-- Start from zero for the public roles, then hand back read access to exactly
-- the columns that are safe to expose. ingested_at and deleted_at are withheld.
revoke all on public.content from anon, authenticated;

grant select
  (id, source, external_id, type, status, title, body_md, payload, media, published_at, updated_at)
  on public.content to anon, authenticated;

-- --- policies ----------------------------------------------------------------
-- anon/authenticated may read ONLY published, non-deleted rows. No write policy
-- exists for these roles, so (with RLS on) all writes are denied for them.
drop policy if exists content_public_read on public.content;
create policy content_public_read
  on public.content
  for select
  to anon, authenticated
  using (status = 'published' and deleted_at is null);

-- --- public view -------------------------------------------------------------
-- The internal-column-free surface the site reads. published_at DESC is applied
-- by the query (the view stays order-agnostic so it composes cleanly).
create or replace view public.public_content
with (security_invoker = true) as
  select
    id,
    source,
    type,
    title,
    body_md,
    payload,
    media,
    published_at,
    updated_at
  from public.content
  where status = 'published'
    and deleted_at is null;

revoke all on public.public_content from anon, authenticated;
grant select on public.public_content to anon, authenticated;

comment on view public.public_content is
  'Public, internal-column-free read surface. security_invoker=true so the content_public_read RLS policy is the real gate.';
