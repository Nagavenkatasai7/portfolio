-- ============================================================
-- 0005_fix_view_column_grant.sql — fix anon reads through public_content.
--
-- Found by the live RLS probe: public_content is security_invoker=true and
-- its WHERE clause references content.deleted_at — so the INVOKER (anon)
-- needs column SELECT privilege on deleted_at, which 0002 deliberately
-- withheld. Result: every anon read of the view failed with
-- 42501 "permission denied for table content".
--
-- Fix: grant anon/authenticated SELECT on deleted_at as well. This leaks
-- nothing: the RLS policy (content_public_read) only ever exposes rows WHERE
-- deleted_at IS NULL, so the column is provably always NULL on any row the
-- public roles can see — and it still isn't in the view's select list, so
-- PostgREST consumers of public_content never receive it. ingested_at (the
-- genuinely internal column) remains withheld; the probe asserts that.
-- ============================================================

grant select (deleted_at) on public.content to anon, authenticated;
