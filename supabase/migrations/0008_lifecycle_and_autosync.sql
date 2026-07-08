-- ============================================================
-- 0008_lifecycle_and_autosync.sql
--
-- Two review findings, one additive+idempotent migration (does NOT edit an
-- already-applied migration in place):
--
--   (1) [Code review #3 / part of High #2] Ingest must not rewrite lifecycle
--       status. 0003's ON CONFLICT DO UPDATE set `status = excluded.status`,
--       so a re-ingest / edit of a published row could silently flip it back to
--       the item's status (e.g. a draft-shaped re-save). Lifecycle belongs
--       SOLELY to moderateContent(). This CREATE OR REPLACEs ingest_content with
--       the SAME 9-arg signature, minus the status overwrite. New INSERTs still
--       set status from the item; existing rows keep their status.
--
--   (2) [High #2] The daily LinkedIn re-sync must not revert owner edits. A
--       `locally_edited` flag marks rows the owner edited in the composer (set
--       by the gate's PK-based updateContentFields()). A separate, autosync-
--       aware ingest (ingest_content_autosync, SAME 9-arg signature, distinct
--       NAME — so the hot ingest_content path keeps its exact signature and
--       there is no function-overload ambiguity) leaves the content columns of a
--       locally_edited row untouched on conflict, while still upserting brand-new
--       and un-edited rows normally. lib/gate.js#ingestContent(item,{autosync})
--       routes LinkedIn sync to it.
--
-- Idempotent: CREATE OR REPLACE / ADD COLUMN IF NOT EXISTS. Safe to re-run.
-- ============================================================

-- (2a) Owner-edit marker. Never rewritten by ingest; set only by the composer
-- edit path via lib/gate.js#updateContentFields (a PK UPDATE, not a re-ingest).
alter table public.content
  add column if not exists locally_edited boolean not null default false;

-- (1) ingest_content — SAME signature as 0003; ON CONFLICT no longer touches
-- `status`. published_at / ingested_at / deleted_at are likewise never reset.
create or replace function public.ingest_content(
  p_source       text,
  p_external_id  text,
  p_type         text,
  p_status       text,
  p_title        text,
  p_body_md      text,
  p_payload      jsonb,
  p_media        jsonb,
  p_published_at timestamptz
)
returns table (id uuid, created boolean)
language plpgsql
as $$
begin
  return query
  insert into public.content as c
    (source, external_id, type, status, title, body_md, payload, media, published_at)
  values (
    p_source,
    p_external_id,
    p_type,
    coalesce(p_status, 'published'),
    p_title,
    p_body_md,
    coalesce(p_payload, '{}'::jsonb),
    coalesce(p_media,  '[]'::jsonb),
    p_published_at
  )
  on conflict (source, external_id) do update set
    type    = excluded.type,
    title   = excluded.title,
    body_md = excluded.body_md,
    payload = excluded.payload,
    media   = excluded.media
    -- status is intentionally NOT updated (lifecycle owned by moderateContent).
    -- published_at / ingested_at / deleted_at are intentionally NOT updated.
    -- updated_at is set by the content_set_updated_at trigger.
  returning c.id, (c.xmax = 0) as created;
end;
$$;

-- (2b) ingest_content_autosync — identical INSERT; on conflict it preserves the
-- content columns of an owner-edited (locally_edited = true) row, so a daily
-- re-sync refreshes only brand-new / un-edited rows and never reverts an edit.
-- (In ON CONFLICT DO UPDATE, `c` is the EXISTING row and `excluded` the proposed
-- insert, so `c.locally_edited` reads the stored flag.)
create or replace function public.ingest_content_autosync(
  p_source       text,
  p_external_id  text,
  p_type         text,
  p_status       text,
  p_title        text,
  p_body_md      text,
  p_payload      jsonb,
  p_media        jsonb,
  p_published_at timestamptz
)
returns table (id uuid, created boolean)
language plpgsql
as $$
begin
  return query
  insert into public.content as c
    (source, external_id, type, status, title, body_md, payload, media, published_at)
  values (
    p_source,
    p_external_id,
    p_type,
    coalesce(p_status, 'published'),
    p_title,
    p_body_md,
    coalesce(p_payload, '{}'::jsonb),
    coalesce(p_media,  '[]'::jsonb),
    p_published_at
  )
  on conflict (source, external_id) do update set
    type    = case when c.locally_edited then c.type    else excluded.type    end,
    title   = case when c.locally_edited then c.title   else excluded.title   end,
    body_md = case when c.locally_edited then c.body_md else excluded.body_md end,
    payload = case when c.locally_edited then c.payload else excluded.payload end,
    media   = case when c.locally_edited then c.media   else excluded.media   end
    -- status / published_at / ingested_at / deleted_at never touched here either.
  returning c.id, (c.xmax = 0) as created;
end;
$$;

-- Grants: service_role only, for BOTH functions (mirrors 0003). Never anon.
revoke all on function public.ingest_content(
  text, text, text, text, text, text, jsonb, jsonb, timestamptz
) from public, anon, authenticated;
grant execute on function public.ingest_content(
  text, text, text, text, text, text, jsonb, jsonb, timestamptz
) to service_role;

revoke all on function public.ingest_content_autosync(
  text, text, text, text, text, text, jsonb, jsonb, timestamptz
) from public, anon, authenticated;
grant execute on function public.ingest_content_autosync(
  text, text, text, text, text, text, jsonb, jsonb, timestamptz
) to service_role;

comment on function public.ingest_content(
  text, text, text, text, text, text, jsonb, jsonb, timestamptz
) is 'Idempotent ingest upsert keyed on (source, external_id). Never resets status/published_at. service_role only.';
comment on function public.ingest_content_autosync(
  text, text, text, text, text, text, jsonb, jsonb, timestamptz
) is 'Autosync ingest: like ingest_content but preserves content columns of owner-edited (locally_edited) rows. service_role only.';

-- Refresh PostgREST so the new function is callable immediately.
notify pgrst, 'reload schema';
