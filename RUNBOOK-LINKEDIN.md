# RUNBOOK — enable the READ-ONLY LinkedIn sync (Phase F)

This is the exact morning checklist to turn on the LinkedIn → /blog mirror. It is
**staged and dormant** until you do this. Nothing in this platform has touched
`field-guide-builder` ("FGB") or its Neon database — you create the read-only
access below, on your own terms, and can revoke it in one step.

**The contract.** The sync depends ONLY on a stable, read-only VIEW whose columns
*we* chose. You create that view in FGB's Neon, mapping FGB's real table/columns
to these five stable names/types:

| our column     | type          | meaning                                        |
| -------------- | ------------- | ---------------------------------------------- |
| `external_id`  | `text`        | stable unique id per post (URN or permalink)   |
| `text_md`      | `text`        | the post body (markdown / plain text)          |
| `url`          | `text`        | public LinkedIn URL of the post                |
| `published_at` | `timestamptz` | original publish time (UTC)                    |
| `media`        | `jsonb`       | array `[{kind,url,alt,...}]`, or `'[]'`        |

The platform **validates the view exposes exactly these columns/types before
ingesting** — if the shape is wrong it aborts and ingests nothing. So you can map
FGB's real schema freely; only the view's output must match the contract.

**Published vs draft.** Auto-synced posts land as **`published`** (constant
`AUTO_SYNC_STATUS` in `lib/linkedin_sync.js`). Rationale: they are already public
on LinkedIn, so mirroring them to /blog as published matches their existing
visibility and needs no manual review. Flip that one constant to `'draft'` if you
ever want them to queue in /admin for review before appearing.

---

## Step A — in FGB's Neon: least-privilege read-only role + contract view

Run this **as an FGB admin/owner**, connected to **FGB's Neon database** (Neon
console SQL editor, or `psql`). Replace every `-- FILL IN` with FGB's real
schema/table/column names. Nothing here grants any write or DDL, and the role can
read ONLY the one view — no base tables, no other schema.

```sql
-- 1) A dedicated schema to hold ONLY the read-only contract surface, kept
--    separate from FGB's app schema. The role gets USAGE on just this schema.
create schema if not exists portfolio_ro;

-- 2) THE CONTRACT VIEW — map FGB's REAL columns to our stable names + types.
--    IMPORTANT: a plain (NON-security_invoker) view runs with the VIEW OWNER's
--    privileges, so the read-only role can read the view WITHOUT any grant on
--    the underlying FGB tables. Do NOT add `security_invoker=true` here — that
--    is what keeps the role away from your base tables.
create or replace view portfolio_ro.linkedin_posts_view as
  select
    (fgb_post_urn)::text             as external_id,   -- FILL IN: stable unique id (URN or permalink)
    (fgb_post_body)::text            as text_md,        -- FILL IN: the post text/markdown
    (fgb_permalink)::text            as url,            -- FILL IN: public LinkedIn URL
    (fgb_posted_at)::timestamptz     as published_at,   -- FILL IN: original publish time (UTC)
    coalesce((fgb_media)::jsonb, '[]'::jsonb) as media  -- FILL IN: jsonb array, or '[]' if none
  from fgb_app.fgb_posts                                 -- FILL IN: FGB's real posts table
  where fgb_status = 'posted';                            -- OPTIONAL: only posts actually live on LinkedIn

-- 3) The least-privilege, read-only role. Create it WITHOUT login, grant exactly
--    what it needs, then enable login with a STRONG password.
--    (Neon alternative: create the role + password in the Neon Console "Roles"
--     tab instead, then run only the GRANT/ALTER lines below.)
create role portfolio_readonly nologin;

grant usage  on schema portfolio_ro                     to portfolio_readonly;  -- only THIS schema is visible
grant select on portfolio_ro.linkedin_posts_view        to portfolio_readonly;  -- only THIS one view is readable

-- Defense-in-depth: ensure the role has nothing on FGB's app schema(s). New
-- roles get no table privileges by default; this makes it explicit.
revoke all on schema public from portfolio_readonly;
--   (if FGB's tables live in a named schema, also:)
-- revoke all on all tables in schema fgb_app from portfolio_readonly;

-- Enable login + harden. Generate a strong password: `openssl rand -base64 24`.
alter role portfolio_readonly login password 'PUT-A-STRONG-RANDOM-PASSWORD-HERE';
alter role portfolio_readonly set default_transaction_read_only = on;  -- role can never write
alter role portfolio_readonly set statement_timeout = '20s';           -- no runaway queries
alter role portfolio_readonly connection limit 3;                      -- cap concurrency
```

**Sanity-check the role is truly read-only** (optional, run as the new role):

```sql
-- Should SUCCEED:
select count(*) from portfolio_ro.linkedin_posts_view;
-- Should ALL FAIL (permission denied / read-only transaction):
select * from fgb_app.fgb_posts limit 1;               -- no base-table access
create table portfolio_ro.evil(x int);                 -- no DDL
insert into portfolio_ro.linkedin_posts_view values (); -- no write
```

## Step B — build the read-only connection string

From Neon's dashboard, take FGB's connection host + database name and substitute
the new role + password. Keep `sslmode=require` (the sync verifies Neon's TLS cert):

```
postgresql://portfolio_readonly:STRONG-PASSWORD@ep-xxxx-xxxx.us-east-1.aws.neon.tech/neondb?sslmode=require
```

URL-encode any special characters in the password. Use the **direct** (session)
host, not a transaction pooler.

## Step C — add the env vars to PRODUCTION (portfolio project)

From the `portfolio` project (Vercel scope `venkats-projects-d28f24e0`):

```bash
# The read-only FGB connection string (enables the sync):
printf '%s' 'postgresql://portfolio_readonly:...@...neon.tech/neondb?sslmode=require' \
  | vercel env add FGB_READONLY_DATABASE_URL production

# The contract view name (only needed because we used a dedicated schema; the
# code default is public.linkedin_posts_view):
printf '%s' 'portfolio_ro.linkedin_posts_view' \
  | vercel env add FGB_READONLY_VIEW production

# The cron secret guarding /api/cron/linkedin-sync (Vercel sends it automatically):
openssl rand -hex 32 | tr -d '\n' | vercel env add CRON_SECRET production

# (Optional) window override; default is 7 days of overlap:
# printf '%s' '7' | vercel env add FGB_SYNC_WINDOW_DAYS production

# Redeploy production so the new env is live and the cron is registered:
vercel --prod
```

The cron (`vercel.json` → daily, `0 6 * * *` — the Vercel **Hobby** plan caps
crons at once/day; the 7-day overlap window makes daily more than safe) runs
**only on production**, so it stays inert on previews. Until
`FGB_READONLY_DATABASE_URL` is set the endpoint no-ops; until `CRON_SECRET` is set
it returns 503. Both are now set, so it runs. (On a Pro plan you can raise the
frequency, e.g. `0 */6 * * *`.)

## Step D — one-time historical backfill

Pull ALL of your LinkedIn history once (the cron only covers a rolling window).
Run it locally with the read-only vars in your shell (or `vercel env pull .env.local`
first, then run):

```bash
export FGB_READONLY_DATABASE_URL='postgresql://portfolio_readonly:...?sslmode=require'
export FGB_READONLY_VIEW='portfolio_ro.linkedin_posts_view'
npm run linkedin:backfill
```

It prints `{ ok: true, synced, created, updated }`. It is idempotent (the gate
upserts on `(source, external_id)`), so re-running it — or running it after the
cron has already synced — creates no duplicates.

## Step E — verify

- **/blog** — your LinkedIn posts appear as a reverse-chronological feed with a
  "LinkedIn" chip and a "View on LinkedIn ↗" link.
- **/admin** — the "LinkedIn sync (read-only)" card shows **Healthy**, a recent
  `last_success` timestamp, and the synced/new/updated counts. A red **ERROR** or
  **STALE** state (with `last_error`) means something is wrong — that card is the
  dead-man's-switch. (To wire real paging, alert when `sync_state.last_success_at`
  for name `'linkedin'` is older than ~a day, or when `last_error` is non-null.)

## Step F — rollback (revoke all platform access to FGB)

One step in FGB's Neon fully severs access — after this the platform can never
read FGB again:

```sql
drop view   if exists portfolio_ro.linkedin_posts_view;
drop schema if exists portfolio_ro cascade;
drop role   if exists portfolio_readonly;
```

And remove the platform env var:

```bash
vercel env rm FGB_READONLY_DATABASE_URL production
# (optionally also FGB_READONLY_VIEW / CRON_SECRET)
vercel --prod   # redeploy; the sync goes dormant again
```

Already-synced posts remain on /blog; unpublish/remove any individually from
/admin if you wish.

---

### Why this can never write to FGB

Three independent guarantees, any one of which suffices:

1. **Least-privilege role** — `portfolio_readonly` has only `USAGE` on
   `portfolio_ro` and `SELECT` on the one view. No base-table, write, or DDL
   grant anywhere.
2. **Role is read-only** — `default_transaction_read_only = on` makes every
   connection from that role reject writes at the database.
3. **Read-only code path** — `lib/linkedin_sync.js` wraps every read in
   `START TRANSACTION READ ONLY`, and only ever issues `SELECT`. It never opens a
   write path to FGB; the *only* place the platform writes is its own Supabase,
   through the existing ingestion gate.

### Notes

- The platform's own migration `supabase/migrations/0007_sync_state.sql`
  (sync lock + health table) was already applied to Supabase during Phase F
  verification. If you ever rebuild the Supabase DB, re-apply migrations with
  `npm run db:migrate` (requires `psql`; the guard refuses any non-Supabase host).
- The sync writes to Supabase as source `linkedin_auto`, type `text`, keyed on the
  canonicalized `external_id` — the same dedupe guarantee as every other writer.
