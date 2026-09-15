// Pure camera math for the COLDSTART stage.
// cam = { x, y, s } — world translate in CSS px and uniform scale.
// Screen = world * s + translate.  No DOM access; safe to import on the server.

export const LIMITS = { min: 0.35, max: 2.5 };
export const LOD = { lod1: 0.6, lod2: 1.1 };

const DEFAULTS = { s: 0.8, x: 40, y: 40 };

function clamp(n, min, max) {
  return n < min ? min : n > max ? max : n;
}

/** Detail level for a scale: 0 (title only), 1 (bullets), 2 (body + demo). */
export function lodFor(s) {
  if (s >= LOD.lod2) return 2;
  if (s >= LOD.lod1) return 1;
  return 0;
}

/** Translate the camera by a screen-space delta. */
export function panBy(cam, dx, dy) {
  return { x: cam.x + dx, y: cam.y + dy, s: cam.s };
}

/** World coordinates of a screen point. */
export function worldFromScreen(cam, pt) {
  return { x: (pt.x - cam.x) / cam.s, y: (pt.y - cam.y) / cam.s };
}

/** Screen coordinates of a world point. */
export function screenFromWorld(cam, pt) {
  return { x: pt.x * cam.s + cam.x, y: pt.y * cam.s + cam.y };
}

/**
 * Zoom about a screen point, keeping the world point under the cursor fixed.
 * Scale is clamped to `limits`; when clamping bites, the anchor still holds.
 */
export function zoomAt(cam, point, factor, limits = LIMITS) {
  const s = clamp(cam.s * factor, limits.min, limits.max);
  const w = worldFromScreen(cam, point);
  return { x: point.x - w.x * s, y: point.y - w.y * s, s };
}

/** Camera that centers a node's box in a viewport at scale `s`. */
export function frameNode(cam, node, viewport, s = 1.0) {
  const cx = node.pos.x + node.size.w / 2;
  const cy = node.pos.y + node.size.h / 2;
  return { x: viewport.w / 2 - cx * s, y: viewport.h / 2 - cy * s, s };
}

/**
 * Serialize camera (+ extra keys such as n / run) to a location hash.
 * Scale keeps 2 decimals; translate is rounded to whole pixels.
 */
export function toHash(cam, extra = {}) {
  const parts = [
    `s=${cam.s.toFixed(2)}`,
    `x=${Math.round(cam.x)}`,
    `y=${Math.round(cam.y)}`,
  ];
  for (const [k, v] of Object.entries(extra)) {
    if (v === null || v === undefined || v === '') continue;
    parts.push(`${k}=${encodeURIComponent(String(v))}`);
  }
  return `#${parts.join('&')}`;
}

/** Parse a location hash back into camera + node/run selection. */
export function fromHash(hash) {
  const out = { s: DEFAULTS.s, x: DEFAULTS.x, y: DEFAULTS.y, n: null, run: null };
  const raw = typeof hash === 'string' ? hash.replace(/^#/, '') : '';
  if (!raw) return out;
  for (const pair of raw.split('&')) {
    if (!pair) continue;
    const i = pair.indexOf('=');
    if (i < 0) continue;
    const key = decodeURIComponent(pair.slice(0, i));
    const value = decodeURIComponent(pair.slice(i + 1));
    if (key === 's' || key === 'x' || key === 'y') {
      const num = Number(value);
      if (Number.isFinite(num)) out[key] = key === 's' ? clamp(num, LIMITS.min, LIMITS.max) : num;
    } else if (key === 'n' || key === 'run') {
      out[key] = value || null;
    }
  }
  return out;
}
