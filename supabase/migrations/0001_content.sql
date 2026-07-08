-- ============================================================
-- 0001_content.sql — the heterogeneous `content` table.
--
-- One row per piece of content, whatever its origin: LinkedIn/X posts
-- (auto-ingested or hand-entered), native blog posts, newsletter issues,
-- videos, images. Type-specific fields live in `payload` (jsonb) and
-- attached media in `media` (jsonb array) so we never need per-type tables.
--
-- Idempotent: safe to re-run (IF NOT EXISTS / CREATE OR REPLACE).
-- ============================================================

-- gen_random_uuid() lives in pgcrypto (also in core on PG13+, but be explicit).
create extension if not exists pgcrypto;

create table if not exists public.content (
  id           uuid primary key default gen_random_uuid(),

  -- Where this content came from. Enum-ish; enforced by the CHECK below.
  source       text not null,

  -- Canonicalized URL or platform id (native posts use the post slug).
  -- Together with `source` this is the dedupe key — see the UNIQUE below.
  external_id  text not null,

  -- Coarse content kind used for feed rendering (chips): text/blog/newsletter/video/image/link.
  type         text not null,

  -- Lifecycle. Public feed shows only 'published'.
  status       text not null default 'published',

  title        text,
  body_md      text,                                   -- markdown / plain body

  payload      jsonb not null default '{}'::jsonb,     -- type-specific fields
  media        jsonb not null default '[]'::jsonb,     -- [{kind,url,alt,...}]

  published_at timestamptz not null,                   -- ORIGINAL post time (UTC)
  ingested_at  timestamptz not null default now(),     -- when we first stored it
  updated_at   timestamptz not null default now(),     -- auto-maintained (trigger below)
  deleted_at   timestamptz                             -- tombstone (soft delete)
);

-- --- constraints -------------------------------------------------------------

-- THE INGESTION-GATE CONSTRAINT: the core dedupe guarantee. The gate upserts
-- ON CONFLICT (source, external_id); this makes "same source + same canonical
-- id" exactly one row, forever.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'content_source_external_id_key'
  ) then
    alter table public.content
      add constraint content_source_external_id_key unique (source, external_id);
  end if;
end $$;

-- source is enum-ish: reject anything outside the known set.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'content_source_check') then
    alter table public.content add constraint content_source_check check (
      source in (
        'linkedin_auto','linkedin_manual','x_auto','x_manual',
        'blog','newsletter','video','image'
      )
    );
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'content_status_check') then
    alter table public.content add constraint content_status_check check (
      status in ('published','draft','removed')
    );
  end if;
end $$;

-- --- indexes -----------------------------------------------------------------

-- Feed query: WHERE status='published' ORDER BY published_at DESC.
create index if not exists content_status_published_at_idx
  on public.content (status, published_at desc);

-- --- updated_at trigger ------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists content_set_updated_at on public.content;
create trigger content_set_updated_at
  before update on public.content
  for each row execute function public.set_updated_at();

comment on table public.content is
  'Heterogeneous content feed. Dedupe key: (source, external_id). Public read is via the public_content view (see 0002).';
