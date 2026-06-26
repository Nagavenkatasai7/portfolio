// ============================================================
// OpenRouter streaming client (shared by the Vercel edge function
// and the local dev server). Web-standard APIs only (fetch,
// ReadableStream, TextDecoder) so it runs on Edge and Node 18+.
// ============================================================

import { SYSTEM_PROMPT } from './_persona.mjs';

export const MODEL = 'nvidia/nemotron-3-ultra-550b-a55b:free';
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

// Async generator that yields { type: 'content', text } chunks.
// Throws an Error with .status set on a non-2xx upstream response.
export async function* streamChat(history, { apiKey, referer, title, signal } = {}) {
  const turns = sanitizeHistory(history);
  if (turns.length === 0) throw Object.assign(new Error('No messages'), { status: 400 });

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
    body: JSON.stringify({
      model: MODEL,
      stream: true,
      max_tokens: 800,
      temperature: 0.4,
      reasoning: { effort: 'low' }, // it's a reasoning model — keep it snappy
      messages: [{ role: 'system', content: SYSTEM_PROMPT }, ...turns],
    }),
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
      const delta = json?.choices?.[0]?.delta ?? {};
      // We only surface the final answer text; the model's `reasoning`
      // deltas are intentionally dropped.
      if (typeof delta.content === 'string' && delta.content.length) {
        yield { type: 'content', text: delta.content };
      }
    }
  }
}
