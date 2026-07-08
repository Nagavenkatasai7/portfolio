// ============================================================
// lib/slug.js — PURE slug generation for native content external_ids.
// Shared by the composer route and the verification script so both derive the
// same dedupe identity from a title.
// ============================================================

export function slugify(title) {
  return String(title || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '') // strip combining diacritics
    .toLowerCase()
    .replace(/['"]/g, '')
    .replace(/[^a-z0-9]+/g, '-')       // non-alnum -> hyphen
    .replace(/^-+|-+$/g, '')           // trim hyphens
    .slice(0, 80)
    .replace(/-+$/g, '');
}

// A blog slug that is title-derived but collision-resistant: the slug, plus a
// short base36 suffix so two posts sharing a title don't silently upsert into
// one row. `seed` lets tests make it deterministic.
export function blogExternalId(title, seed = Date.now()) {
  const base = slugify(title) || 'post';
  const suffix = Number(seed).toString(36).slice(-6);
  return `${base}-${suffix}`;
}
