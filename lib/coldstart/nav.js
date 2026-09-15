// lib/coldstart/nav.js
// Enum-guarded parser for ask-naga navigation replies.
//
// The model is asked to answer a "/nav" message with exactly one line of JSON:
//   {"node":"<one of NODE_IDS>","caption":"<plain text, max 140 characters>"}
// Anything else — prose, an invented id, an over-long caption — is rejected so
// the caller can fall back to the local deterministic matcher.

const MAX_CAPTION = 140;

// Control characters (C0 + DEL + C1), stripped from captions before use.
const CONTROL_CHARS = /[\u0000-\u001F\u007F-\u009F]/g;

/**
 * Find the first balanced `{...}` object in `text`, honouring JSON strings and
 * escapes so a brace inside a caption does not end the object early.
 * @param {string} text
 * @returns {string|null} the raw JSON substring, or null
 */
function firstJsonObject(text) {
  const start = text.indexOf('{');
  if (start === -1) return null;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return null;
}

/**
 * Parse a navigation reply.
 * @param {string} text raw model reply (may contain surrounding prose)
 * @param {string[]|Set<string>} ids the allowed node id enum
 * @returns {{ node: string, caption: string }|null}
 */
export function parseNav(text, ids) {
  if (typeof text !== 'string') return null;
  const allowed = ids instanceof Set ? ids : new Set(Array.isArray(ids) ? ids : []);
  if (allowed.size === 0) return null;

  const raw = firstJsonObject(text);
  if (raw === null) return null;

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return null;

  const { node, caption } = parsed;
  if (typeof node !== 'string' || !allowed.has(node)) return null;
  if (typeof caption !== 'string') return null;
  if (caption.length > MAX_CAPTION) return null;

  const clean = caption.replace(CONTROL_CHARS, '').trim();
  if (clean.length > MAX_CAPTION) return null;

  return { node, caption: clean };
}

export default parseNav;
