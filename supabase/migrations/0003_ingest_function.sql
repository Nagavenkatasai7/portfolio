-- ============================================================
-- 0003_ingest_function.sql — the atomic ingestion upsert.
--
-- The gate (lib/gate.js) calls this RPC with the service_role key. It is a
-- single INSERT ... ON CONFLICT DO UPDATE so concurrent ingests of the same
-- (source, external_id) can never race into two rows.
--
-- Crucially, ON CONFLICT updates ONLY content-ish fields. It never resets
-- published_at (the original post time), ingested_at (first-seen), or
-- deleted_at (tombstone). updated_at is maintained by the trigger in 0001.
--
-- Returns the row id and whether this call INSERTed (created=true) or
-- UPDATEd an existing row (created=false), via the xmax=0 idiom.
-- ============================================================

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
    status  = excluded.status,
    title   = excluded.title,
    body_md = excluded.body_md,
    payload = excluded.payload,
    media   = excluded.media
    -- published_at / ingested_at / deleted_at are intentionally NOT updated.
    -- updated_at is set by the content_set_updated_at trigger.
  returning c.id, (c.xmax = 0) as created;
end;
$$;

-- Only the server-side service_role may run the gate. Never anon/authenticated.
revoke all on function public.ingest_content(
  text, text, text, text, text, text, jsonb, jsonb, timestamptz
) from public, anon, authenticated;

grant execute on function public.ingest_content(
  text, text, text, text, text, text, jsonb, jsonb, timestamptz
) to service_role;

comment on function public.ingest_content(
  text, text, text, text, text, text, jsonb, jsonb, timestamptz
) is 'Idempotent ingest upsert keyed on (source, external_id). Never resets published_at. service_role only.';
