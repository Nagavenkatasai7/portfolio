// ============================================================
// Vercel Edge Function: POST /api/chat
// Proxies the "Ask Naga" chatbot to OpenRouter. The API key lives
// ONLY here as an environment secret (OPENROUTER_API_KEY) and is
// never sent to the browser. Responds as Server-Sent Events.
// ============================================================

import { streamChat } from './_llm.mjs';

export const config = { runtime: 'edge' };

// Origins allowed to call this API cross-origin. The portfolio is also served
// from GitHub Pages, which has no serverless runtime, so its widget calls here.
const ALLOWED_ORIGINS = new Set([
  'https://chennunagavenkatasai.com',
  'https://www.chennunagavenkatasai.com',
  'https://nagavenkatasai7.github.io',
]);

// Build CORS headers for a given request origin (only echoes allowed origins).
function corsHeaders(req) {
  const origin = req.headers.get('origin') || '';
  const headers = { Vary: 'Origin' };
  if (ALLOWED_ORIGINS.has(origin) || /\.vercel\.app$/.test(safeHost(origin))) {
    headers['Access-Control-Allow-Origin'] = origin;
    headers['Access-Control-Allow-Methods'] = 'POST, OPTIONS';
    headers['Access-Control-Allow-Headers'] = 'Content-Type';
    headers['Access-Control-Max-Age'] = '86400';
  }
  return headers;
}
function safeHost(origin) {
  try { return new URL(origin).host; } catch { return ''; }
}

const sse = (obj) => `data: ${JSON.stringify(obj)}\n\n`;
const json = (obj, status, extra) =>
  new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json', ...(extra || {}) } });

export default async function handler(req) {
  const cors = corsHeaders(req);
  // CORS preflight.
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405, cors);

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
