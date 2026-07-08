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

// --- Best-effort per-IP rate limit (edge, in-memory) -------------------------
// This is the legacy standalone Edge Function; the Postgres limiter in the Next
// app isn't cleanly reachable from here (it pulls in `server-only`/service-role
// client). A per-instance in-memory sliding window is a pragmatic throttle that
// caps a single IP's ability to burn the shared OpenRouter key. LIMITATION: edge
// instances are ephemeral and not shared, so this is per-instance, not global —
// a determined distributed attacker can still exceed it; a KV/Upstash-backed
// limit is the documented future upgrade (see PLATFORM.md). It costs nothing and
// meaningfully raises the bar for casual single-origin abuse.
const RL_WINDOW_MS = 60 * 1000;   // 1 minute window...
const RL_MAX = 20;                // ...max 20 chat calls per IP per instance.
const RL_MAX_KEYS = 5000;         // crude memory bound on the tracking map.
const rlHits = new Map();         // ip -> number[] recent request timestamps

function clientIpEdge(req) {
  const real = req.headers.get('x-real-ip');
  if (real && real.trim()) return real.trim();
  const xff = req.headers.get('x-forwarded-for');
  if (xff) return xff.split(',')[0].trim();
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
