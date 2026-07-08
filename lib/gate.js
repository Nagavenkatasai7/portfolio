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
export async function ingestContent(item) {
  const params = normalizeItem(item);

  const supabase = getServiceClient();
  if (!supabase) throw new GateError('server_not_configured');

  const { data, error } = await supabase.rpc('ingest_content', params);
  if (error) {
    const e = new GateError('ingest_failed');
    e.detail = error.message;
    throw e;
  }
  const row = Array.isArray(data) ? data[0] : data;
  if (!row || !row.id) throw new GateError('ingest_failed');
  return { id: row.id, created: Boolean(row.created), external_id: params.p_external_id };
}
