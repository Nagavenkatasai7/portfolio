-- ============================================================
-- 0006_media_bucket.sql — the `media` Storage bucket (Phase C).
--
-- Composer image/video uploads land here. The upload path is
-- presigned-direct-to-storage (the browser PUTs bytes straight to Supabase
-- Storage using a service-role-minted signed upload URL — bytes NEVER stream
-- through a serverless function). Public READ is served from the bucket's
-- public object endpoint; only the public URL is persisted in content.media.
--
-- Hardening baked in at the bucket level (defense-in-depth on top of the
-- app-layer content-sniff in lib/media.js + app/api/media/*):
--   * public = true            — anon can read objects by public URL only.
--   * allowed_mime_types       — jpeg/png/webp/gif + mp4/webm. NO svg, ever.
--   * file_size_limit          — 200MB hard cap (the video cap; the sign route
--                                enforces the tighter 10MB image cap per-type).
--
-- Idempotent: ON CONFLICT upsert for the bucket row; policies are created
-- best-effort (a DO block that swallows insufficient_privilege) because on a
-- PUBLIC bucket, anon read needs no policy and all writes are service-role /
-- signed-token — the policies below are documentation + belt-and-suspenders,
-- not a functional requirement, so the migration must not hard-fail if the
-- migrating role lacks ownership of storage.objects.
-- ============================================================

-- The bucket row. This is the one hard requirement of this migration.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'media',
  'media',
  true,
  209715200, -- 200 * 1024 * 1024
  array['image/jpeg','image/png','image/webp','image/gif','video/mp4','video/webm']
)
on conflict (id) do update set
  public            = excluded.public,
  file_size_limit   = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Best-effort object policies. RLS is already ON for storage.objects in every
-- Supabase project; with the policies below (and no INSERT/UPDATE/DELETE policy
-- for the public roles) anon/authenticated may read media objects but never
-- write them. service_role bypasses RLS; signed upload URLs authorize by token.
do $$
begin
  -- Public read of media objects (a public bucket already serves these; this
  -- makes the intent explicit and survives a future public=false flip).
  begin
    drop policy if exists media_public_read on storage.objects;
    create policy media_public_read
      on storage.objects
      for select
      to anon, authenticated
      using (bucket_id = 'media');
  exception
    when insufficient_privilege then
      raise notice '0006: skipped media_public_read (no ownership of storage.objects) — public bucket still serves reads';
    when others then
      raise notice '0006: media_public_read not created (%) — non-fatal', sqlerrm;
  end;
end $$;

-- NOTE: no `comment on schema storage` here — the migrating role does not own
-- the storage schema (it is owned by supabase_storage_admin). The bucket row
-- above is the migration's real, portable effect; object read/write behavior is
-- covered by the public-bucket flag + service-role/signed-token writes.
