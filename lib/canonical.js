// ============================================================
// lib/canonical.js — PURE ingestion helpers (no server-only, no DB).
//
// URL canonicalization + item validation live here so they can be unit-tested
// in plain Node (scripts/gate-verify.mjs) and reused by the server-only gate
// (lib/gate.js) without dragging the service-role client into a test process.
// ============================================================

// Must match the CHECK constraint in supabase/migrations/0001_content.sql.
export const SOURCES = new Set([
  'linkedin_auto', 'linkedin_manual', 'x_auto', 'x_manual',
  'blog', 'newsletter', 'video', 'image',
]);

export class GateError extends Error {
  constructor(code) {
    super(code);
    this.name = 'GateError';
    this.code = code;
  }
}

// Tracking / analytics query params to strip when canonicalizing a URL.
const TRACKING_PARAMS = new Set([
  'si', 'ref', 'ref_src', 'ref_url',
  'fbclid', 'gclid', 'dclid', 'gbraid', 'wbraid', 'msclkid', 'yclid', 'twclid',
  'mc_cid', 'mc_eid', 'igshid', 'igsh',
  'trk', 'trkcampaign', 'spm', 'vero_id', '_hsenc', '_hsmi', 'rcm',
  'originalsubdomain',
]);
// Hosts where single-letter share params are tracking (x/twitter share links).
const XLIKE_HOSTS = new Set(['x.com', 'twitter.com', 'mobile.twitter.com']);

function isTrackingParam(key, host) {
  const k = key.toLowerCase();
  if (k.startsWith('utm_')) return true;
  if (TRACKING_PARAMS.has(k)) return true;
  if (XLIKE_HOSTS.has(host) && (k === 's' || k === 't')) return true;
  return false;
}

// Canonicalize a URL into a stable external_id:
//   * lowercase protocol + host, drop default ports and a leading "www."
//   * strip tracking params, sort the survivors, drop empty query/fragment
//   * strip a trailing slash (except root "/")
// Non-URL inputs (platform ids, blog slugs) are returned trimmed, unchanged.
export function canonicalizeUrl(raw) {
  if (typeof raw !== 'string') return '';
  const input = raw.trim();
  if (!input) return '';

  let u;
  try {
    u = new URL(input);
  } catch {
    return input; // not a URL — treat as an opaque id/slug
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return input;

  u.protocol = u.protocol.toLowerCase();
  let host = u.hostname.toLowerCase();
  if (host.startsWith('www.')) host = host.slice(4);
  u.hostname = host;
  u.host = host; // clears any explicit default port
  u.hash = '';

  const kept = [];
  for (const [key, value] of u.searchParams.entries()) {
    if (!isTrackingParam(key, host)) kept.push([key, value]);
  }
  kept.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : (a[1] < b[1] ? -1 : 1)));
  const sp = new URLSearchParams();
  for (const [k, v] of kept) sp.append(k, v);
  const query = sp.toString();

  let path = u.pathname;
  if (path.length > 1 && path.endsWith('/')) path = path.replace(/\/+$/, '');

  return `${u.protocol}//${host}${path}${query ? `?${query}` : ''}`;
}

function toUtcIso(value) {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) throw new GateError('invalid_published_at');
  return d.toISOString();
}

function deriveExternalId(item) {
  const candidate = item.external_id ?? item.url ?? item.slug;
  if (typeof candidate !== 'string' || !candidate.trim()) {
    throw new GateError('missing_external_id');
  }
  const canon = canonicalizeUrl(candidate);
  if (!canon) throw new GateError('missing_external_id');
  return canon;
}

// Validate + normalize an inbound item into ingest_content RPC params.
export function normalizeItem(item) {
  if (!item || typeof item !== 'object') throw new GateError('invalid_item');
  if (!SOURCES.has(item.source)) throw new GateError('invalid_source');
  if (typeof item.type !== 'string' || !item.type.trim()) throw new GateError('invalid_type');
  if (item.published_at == null) throw new GateError('missing_published_at');

  const status = item.status ?? 'published';
  if (!['published', 'draft', 'removed'].includes(status)) throw new GateError('invalid_status');

  const payload = item.payload ?? {};
  const media = item.media ?? [];
  if (typeof payload !== 'object' || Array.isArray(payload)) throw new GateError('invalid_payload');
  if (!Array.isArray(media)) throw new GateError('invalid_media');

  return {
    p_source: item.source,
    p_external_id: deriveExternalId(item),
    p_type: item.type.trim(),
    p_status: status,
    p_title: typeof item.title === 'string' ? item.title : null,
    p_body_md: typeof item.body_md === 'string' ? item.body_md : null,
    p_payload: payload,
    p_media: media,
    p_published_at: toUtcIso(item.published_at),
  };
}
