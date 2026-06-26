// ============================================================
// OpenRouter streaming client (shared by the Vercel edge function
// and the local dev server). Web-standard APIs only (fetch,
// ReadableStream, TextDecoder) so it runs on Edge and Node 18+.
// ============================================================

import { SYSTEM_PROMPT } from './_persona.mjs';

// Ordered fallback chain of *free* OpenRouter models. The first one that
// streams real content wins. Free pools are frequently capacity-exhausted
// (HTTP 502 "ResourceExhausted") — relying on a single model means the chat
// silently goes dark, so we degrade gracefully down this list instead.
// Each entry may carry per-model request tweaks (e.g. `reasoning`).
export const MODELS = [
  // Fast, reliable, and free — the everyday primary.
  { id: 'openai/gpt-oss-120b:free', reasoning: { effort: 'low' } },
  // The originally-chosen model; used whenever it has capacity.
  { id: 'nvidia/nemotron-3-ultra-550b-a55b:free', reasoning: { effort: 'low' } },
  // Last-resort instruct model (no reasoning phase).
  { id: 'google/gemma-4-31b-it:free' },
];
export const MODEL = MODELS[0].id; // back-compat for callers importing MODEL

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';

const MAX_TURNS = 12;        // cap conversation history sent upstream
const MAX_MSG_CHARS = 2000;  // cap a single message length

// Keep only well-formed user/assistant turns, trim length + history.
export function sanitizeHistory(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((m) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string' && m.content.trim())
    .slice(-MAX_TURNS)
    .map((m) => ({ role: m.role, content: m.content.slice(0, MAX_MSG_CHARS) }));
}

// Stream a single model. Async generator yielding { type: 'content', text }.
// Throws an Error with .status set on a non-2xx upstream response.
async function* streamOne(model, turns, { apiKey, referer, title, signal }) {
  const payload = {
    model: model.id,
    stream: true,
    max_tokens: 800,
    temperature: 0.4,
    messages: [{ role: 'system', content: SYSTEM_PROMPT }, ...turns],
  };
  if (model.reasoning) payload.reasoning = model.reasoning; // keep reasoning models snappy

  const res = await fetch(OPENROUTER_URL, {
    method: 'POST',
    signal,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      // Optional OpenRouter attribution headers.
      'HTTP-Referer': referer || 'https://nagavenkatasai7.github.io/portfolio',
      'X-Title': title || 'Naga Portfolio Chat',
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok || !res.body) {
    const detail = await res.text().catch(() => '');
    throw Object.assign(new Error(`OpenRouter responded ${res.status}`), { status: res.status, detail });
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    // SSE frames are separated by newlines; process complete lines only.
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('data:')) continue;
      const data = trimmed.slice(5).trim();
      if (data === '[DONE]') return;
      let json;
      try {
        json = JSON.parse(data);
      } catch {
        continue; // ignore keep-alive comments / partial frames
      }
      // OpenRouter surfaces mid-stream upstream failures as an `error` frame
      // with a 200 outer status — treat it as a model failure so we fall back.
      if (json?.error) {
        throw Object.assign(new Error(json.error.message || 'upstream stream error'), {
          status: json.error.code || 502,
        });
      }
      const delta = json?.choices?.[0]?.delta ?? {};
      // We only surface the final answer text; the model's `reasoning`
      // deltas are intentionally dropped.
      if (typeof delta.content === 'string' && delta.content.length) {
        yield { type: 'content', text: delta.content };
      }
    }
  }
}

// Async generator that yields { type: 'content', text } chunks, walking the
// MODELS fallback chain until one produces content. Only falls back while no
// content has been streamed yet — once a model is producing tokens we commit
// to it. Throws the last error (with .status) if every model fails/empties.
export async function* streamChat(history, opts = {}) {
  const turns = sanitizeHistory(history);
  if (turns.length === 0) throw Object.assign(new Error('No messages'), { status: 400 });

  let lastErr = null;
  for (const model of MODELS) {
    let produced = 0;
    try {
      for await (const chunk of streamOne(model, turns, opts)) {
        produced += chunk.text.length;
        yield chunk;
      }
    } catch (err) {
      if (err?.name === 'AbortError') throw err;      // client hung up — don't retry
      if (produced > 0) return;                       // already answered; can't switch mid-stream
      lastErr = err;
      continue;                                       // try the next model
    }
    if (produced > 0) return;                         // success
    // Stream ended cleanly but yielded nothing (e.g. all-reasoning, no answer):
    // record and try the next model.
    lastErr = Object.assign(new Error(`Model ${model.id} returned no content`), { status: 502 });
  }

  throw lastErr || Object.assign(new Error('All models returned no content'), { status: 502 });
}
