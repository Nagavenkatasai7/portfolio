// ============================================================
// Vercel Edge Function: POST /api/chat
// Proxies the "Ask Naga" chatbot to OpenRouter. The API key lives
// ONLY here as an environment secret (OPENROUTER_API_KEY) and is
// never sent to the browser. Responds as Server-Sent Events.
// ============================================================

import { streamChat } from './_llm.mjs';

export const config = { runtime: 'edge' };

// Origins allowed to call this API cross-origin. The portfolio is also served
// from GitHub Pages (no serverless runtime), so its widget calls here. The
// previous `*.vercel.app` wildcard was too broad (any Vercel-hosted page could
// call the key-bearing proxy cross-origin); it is replaced by the EXPLICIT set
// of origins actually used — production, the git-platform preview, github.io.
// Same-origin fetches (the widget on the production/preview page itself) don't
// need a CORS grant, so dropping the wildcard doesn't affect them.
const ALLOWED_ORIGINS = new Set([
  'https://chennunagavenkatasai.com',
  'https://www.chennunagavenkatasai.com',
  'https://nagavenkatasai7.github.io',
  'https://portfolio-git-platform-venkats-projects-d28f24e0.vercel.app',
]);

// Build CORS headers for a given request origin (only echoes allowed origins).
function corsHeaders(req) {
  const origin = req.headers.get('origin') || '';
  const headers = { Vary: 'Origin' };
  if (ALLOWED_ORIGINS.has(origin)) {
    headers['Access-Control-Allow-Origin'] = origin;
    headers['Access-Control-Allow-Methods'] = 'POST, OPTIONS';
    headers['Access-Control-Allow-Headers'] = 'Content-Type';
    headers['Access-Control-Max-Age'] = '86400';
  }
  return headers;
}

// --- Best-effort in-memory rate limits (edge) --------------------------------
// This is the legacy standalone Edge Function. It is kept 100% edge-safe ON
// PURPOSE: it must NOT import `server-only`/the Supabase service-role client (a
// `server-only` import THROWS under the edge bundler's default resolution and
// would crash the public chatbot), and it must never reference the service-role
// key inside this internet-facing function. So the throttle stays in-memory.
//
// Two layers, both per-instance/in-memory:
//   1. per-IP sliding window (RL_MAX / minute) — caps one IP's key burn.
//   2. a coarse per-INSTANCE global backstop (GLOBAL_RL_MAX / minute, all IPs) —
//      blunts a single instance being drained via IP rotation, which defeats
//      layer 1.
//
// LIMITATION: edge instances are ephemeral and NOT shared, so neither layer is
// cross-instance/global — a distributed attacker across many instances can still
// exceed them.
// DURABLE FOLLOW-UP (NEEDS USER ACTION — not wired here): the real cross-instance
// fix is to back these with the team's already-provisioned but UNCONNECTED
// Upstash Redis (`upstash-kv-green-branch`) via its REST URL/token env vars
// (edge-safe, no service-role exposure), OR move this function to a Node runtime
// so it can use the existing Postgres limiter (lib/auth/ratelimit.js). Both
// require the owner to add env / approve a runtime change. See PLATFORM.md.
const RL_WINDOW_MS = 60 * 1000;   // 1 minute window...
const RL_MAX = 20;                // ...max 20 chat calls per IP per instance.
const RL_MAX_KEYS = 5000;         // crude memory bound on the tracking map.
const rlHits = new Map();         // ip -> number[] recent request timestamps

const GLOBAL_RL_WINDOW_MS = 60 * 1000; // 1 minute window...
const GLOBAL_RL_MAX = 120;             // ...max chat calls per INSTANCE per minute (all IPs).
let globalHits = [];                   // recent request timestamps for THIS instance

function clientIpEdge(req) {
  const real = req.headers.get('x-real-ip');
  if (real && real.trim()) return real.trim();
  const xff = req.headers.get('x-forwarded-for');
  if (xff) {
    // Rightmost hop (closest trusted proxy), NOT the client-controllable
    // leftmost — otherwise an attacker rotates the leftmost XFF to mint a fresh
    // per-IP bucket per request. Mirrors lib/http.js#clientIp.
    const parts = xff.split(',').map((p) => p.trim()).filter(Boolean);
    if (parts.length) return parts[parts.length - 1];
  }
  return 'unknown';
}

function rateLimited(ip) {
  const now = Date.now();
  const recent = (rlHits.get(ip) || []).filter((t) => now - t < RL_WINDOW_MS);
  recent.push(now);
  rlHits.set(ip, recent);
  if (rlHits.size > RL_MAX_KEYS) {
    // Shed roughly half the tracked keys to bound memory (best-effort).
    let i = 0;
    for (const k of rlHits.keys()) { rlHits.delete(k); if (++i >= RL_MAX_KEYS / 2) break; }
  }
  return recent.length > RL_MAX;
}

// Coarse per-INSTANCE global backstop (all IPs). Blunts a single edge instance
// being drained via IP rotation, which defeats the per-IP limiter. Per-instance
// only — see the durable-follow-up note above.
function globalRateLimited() {
  const now = Date.now();
  globalHits = globalHits.filter((t) => now - t < GLOBAL_RL_WINDOW_MS);
  globalHits.push(now);
  return globalHits.length > GLOBAL_RL_MAX;
}

const sse = (obj) => `data: ${JSON.stringify(obj)}\n\n`;
const json = (obj, status, extra) =>
  new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json', ...(extra || {}) } });

export default async function handler(req) {
  const cors = corsHeaders(req);
  // CORS preflight.
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405, cors);

  // Per-IP throttle (best-effort, in-memory) before any upstream work. The
  // chatbot widget already surfaces a 429 as a friendly "rate_limited" message.
  if (rateLimited(clientIpEdge(req))) return json({ error: 'rate_limited' }, 429, cors);
  // Per-instance global backstop (all IPs) — see globalRateLimited().
  if (globalRateLimited()) return json({ error: 'rate_limited' }, 429, cors);

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) return json({ error: 'server_not_configured' }, 500, cors);

  // Reject oversized payloads before parsing (defense-in-depth vs. the platform limit).
  const contentLength = Number(req.headers.get('content-length') || 0);
  if (contentLength > 32 * 1024) return json({ error: 'payload_too_large' }, 413, cors);

  let body;
  try {
    body = await req.json();
  } catch {
    return json({ error: 'invalid_json' }, 400, cors);
  }
  if (!Array.isArray(body?.messages) || body.messages.length === 0) {
    return json({ error: 'no_messages' }, 400, cors);
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj) => controller.enqueue(encoder.encode(sse(obj)));
      try {
        for await (const chunk of streamChat(body.messages, {
          apiKey,
          referer: req.headers.get('referer') || '',
          title: 'Naga Portfolio Chat',
        })) {
          send(chunk);
        }
        send({ type: 'done' });
      } catch (err) {
        const status = err?.status;
        // Never leak upstream error bodies / keys to the client.
        send({ type: 'error', code: status === 429 ? 'rate_limited' : 'failed' });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      ...cors,
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      'X-Accel-Buffering': 'no',
    },
  });
}
