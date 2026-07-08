// ============================================================
// lib/gate.js — the single ingestion gate every writer goes through.
//
// `ingestContent(item)` normalizes the item's identity (see lib/canonical.js),
// then UPSERTs it via the ingest_content RPC (INSERT ... ON CONFLICT
// (source, external_id) DO UPDATE). There is never a bare INSERT, so
// re-ingesting the same content updates one row instead of duplicating, and
// published_at (the original post time) is never reset.
//
// server-only: this pulls in the service-role Supabase client. It must never
// reach a client bundle. Import boundary is asserted by lib/supabase/server.js.
// The pure, testable helpers live in lib/canonical.js so a plain-Node test can
// exercise them without importing this module.
// ============================================================
import 'server-only';
import { getServiceClient } from './supabase/server.js';
import { normalizeItem, GateError, canonicalizeUrl, SOURCES } from './canonical.js';

export { GateError, canonicalizeUrl, normalizeItem, SOURCES };

// The one function every writer uses. Returns { id, created } where created is
// true on INSERT, false on UPDATE (dedupe hit).
//
// options.autosync (default false): when true, routes to ingest_content_autosync,
// which preserves the content columns of an owner-edited (locally_edited) row on
// conflict — so the daily LinkedIn re-sync never reverts an owner edit while
// still upserting brand-new / un-edited rows. Only lib/linkedin_sync.js sets it.
export async function ingestContent(item, options = {}) {
  const params = normalizeItem(item);

  const supabase = getServiceClient();
  if (!supabase) throw new GateError('server_not_configured');

  const fn = options.autosync === true ? 'ingest_content_autosync' : 'ingest_content';
  const { data, error } = await supabase.rpc(fn, params);
  if (error) {
    const e = new GateError('ingest_failed');
    e.detail = error.message;
    throw e;
  }
  const row = Array.isArray(data) ? data[0] : data;
  if (!row || !row.id) throw new GateError('ingest_failed');
  return { id: row.id, created: Boolean(row.created), external_id: params.p_external_id };
}

// ------------------------------------------------------------------------
// Lifecycle moderation — the OTHER write the gate owns.
//
// ingest_content() (INSERT ... ON CONFLICT DO UPDATE) deliberately NEVER
// touches deleted_at (the tombstone) or resets published_at — so a
// "Remove from blog" (soft delete) and a publish/unpublish toggle cannot be
// expressed through it. They are targeted UPDATEs on ONE existing row keyed by
// its primary key, so there is no dedupe/duplication concern (the thing the
// "never bare-insert" rule protects). Routing them through this module keeps
// lib/gate.js the single content-write chokepoint. service_role only.
// ------------------------------------------------------------------------
const STATUSES = new Set(['published', 'draft', 'removed']);

// moderateContent(id, { status?, remove? })
//   remove:true          -> status='removed', deleted_at=now()  (tombstone)
//   status:'published'|'draft' -> set status, CLEAR deleted_at   (restore/toggle)
export async function moderateContent(id, { status, remove } = {}) {
  if (typeof id !== 'string' || !id.trim()) throw new GateError('invalid_id');

  const supabase = getServiceClient();
  if (!supabase) throw new GateError('server_not_configured');

  let patch;
  if (remove === true) {
    patch = { status: 'removed', deleted_at: new Date().toISOString() };
  } else if (STATUSES.has(status)) {
    // Un-remove / toggle: restore visibility by clearing any tombstone.
    patch = { status, deleted_at: null };
  } else {
    throw new GateError('invalid_status');
  }

  const { data, error } = await supabase
    .from('content')
    .update(patch)
    .eq('id', id)
    .select('id, status, deleted_at')
    .maybeSingle();

  if (error) {
    const e = new GateError('moderate_failed');
    e.detail = error.message;
    throw e;
  }
  if (!data) throw new GateError('not_found');
  return data;
}

// ------------------------------------------------------------------------
// updateContentFields(id, { title?, body_md?, media?, payload? })
//
// The composer EDIT write. A targeted UPDATE on ONE row keyed by primary key —
// NOT a read-modify-reingest (which the reviewer flagged for a TOCTOU, and which
// routed content edits through the dedupe upsert). It also stamps
// `locally_edited = true` so the autosync ingest (ingest_content_autosync) knows
// never to revert this row's content on a daily LinkedIn re-sync. Identity
// (source/external_id/type), status and published_at are untouched. Keeping it
// in lib/gate.js keeps this module the single content-write chokepoint.
// service_role only. Returns { id, created:false, external_id, status }.
// ------------------------------------------------------------------------
export async function updateContentFields(id, { title, body_md, media, payload } = {}) {
  if (typeof id !== 'string' || !id.trim()) throw new GateError('invalid_id');

  const supabase = getServiceClient();
  if (!supabase) throw new GateError('server_not_configured');

  const patch = { locally_edited: true };
  if (title !== undefined) patch.title = title;
  if (body_md !== undefined) patch.body_md = body_md;
  if (media !== undefined) {
    if (!Array.isArray(media)) throw new GateError('invalid_media');
    patch.media = media;
  }
  if (payload !== undefined) {
    if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) throw new GateError('invalid_payload');
    patch.payload = payload;
  }

  const { data, error } = await supabase
    .from('content')
    .update(patch)
    .eq('id', id)
    .select('id, external_id, status')
    .maybeSingle();

  if (error) {
    const e = new GateError('update_failed');
    e.detail = error.message;
    throw e;
  }
  if (!data) throw new GateError('not_found');
  return { id: data.id, created: false, external_id: data.external_id, status: data.status };
}

// Service-role read of ONE row by id — used by the edit + moderate flows to
// recover a row's dedupe identity (source/external_id/type/published_at) so an
// edit can be re-ingested through ingestContent without duplicating it.
export async function getContentById(id) {
  if (typeof id !== 'string' || !id.trim()) throw new GateError('invalid_id');
  const supabase = getServiceClient();
  if (!supabase) throw new GateError('server_not_configured');
  const { data, error } = await supabase
    .from('content')
    .select('id, source, external_id, type, status, title, body_md, payload, media, published_at, deleted_at')
    .eq('id', id)
    .maybeSingle();
  if (error) throw new GateError('read_failed');
  return data || null;
}
