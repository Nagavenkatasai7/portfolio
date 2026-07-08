// ============================================================
// lib/x_draft.js — the X/Twitter drafting function (server-only).
//
// generateXDrafts({topic, tone, format}, { llmFn }) asks an LLM for 1..3 styled
// X-post variants and parses them (via the PURE helpers in lib/x_draft_pure.js)
// into UI-ready, character-limited, thread-split drafts. It PERSISTS NOTHING —
// the owner explicitly Saves/Approves from the studio.
//
// TESTABILITY: the LLM call is dependency-injected. Pass `llmFn` (async
// messages -> string | {text, model}) to stub it deterministically with no
// network — see scripts/phase-d-verify.mjs. When omitted, the default walks the
// EXACT SAME OpenRouter free-model fallback chain the chatbot uses (MODELS from
// api/_llm.mjs), one non-streaming call per model, first non-empty answer wins.
//
// GRACEFUL DEGRADATION: OpenRouter's free pool is frequently throttled / out of
// credits (502 / empty). generateXDrafts NEVER throws — if every model fails, or
// the injected stub throws / returns empty, it returns { ok:false, error } so the
// UI can show a "couldn't generate — write it yourself" state and the owner can
// still author + Save a draft by hand. Drafting failure must not block anything.
//
// Relative imports only (like lib/gate.js) so the verify script can load the
// REAL module in plain Node via `node --conditions=react-server`.
// ============================================================
import 'server-only';
import { MODELS } from '../api/_llm.mjs';
import {
  parseVariants, TWEET_LIMIT, XDraftError,
  buildXDraftItem, buildXDraftItemFromBody, xDraftExternalId, countChars, splitIntoTweets, shapeVariant,
  X_TONES, X_FORMATS,
} from './x_draft_pure.js';

// Re-export the pure helpers so callers have one import surface for X drafting.
export {
  parseVariants, TWEET_LIMIT, XDraftError,
  buildXDraftItem, buildXDraftItemFromBody, xDraftExternalId, countChars, splitIntoTweets, shapeVariant,
  X_TONES, X_FORMATS,
};

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';

// A distinct drafting persona (NOT the chatbot's Q&A persona) — a ghostwriter
// for Naga's own X account. Terse, concrete, first person; no hashtag spam, no
// emoji soup, no engagement-bait. The strict output contract makes parsing
// deterministic: variants separated by a line of only ---.
const X_SYSTEM_PROMPT = `You are the ghostwriter for the X (Twitter) account of Naga Venkata Sai Chennu — a software engineer (scalable systems, test automation, AI-assisted development; MS CS at George Mason, targeting new-grad SWE / forward-deployed engineer roles).

Write in Naga's voice: first person, concrete, technically credible, a little punchy. Favor specifics (numbers, tools, tradeoffs) over hype. No hashtag spam (0–1 hashtag max, only if natural), no emoji soup (0–2 max), no "🚀 game-changer" clichés, no engagement-bait questions unless genuinely apt.

OUTPUT CONTRACT (follow exactly):
- Produce the requested number of DISTINCT options.
- Separate options with a line containing ONLY three dashes: ---
- Output ONLY the posts. No preamble, no numbering, no commentary, no quotation marks around them.
- For a SINGLE tweet: each option must be one post of 280 characters or fewer.
- For a THREAD: each option is a thread; separate the tweets within a thread by a blank line; keep every tweet to 270 characters or fewer; do not prefix tweets with "1/". `;

function buildUserPrompt({ topic, tone, format }) {
  const count = 3;
  const kind = format === 'thread' ? 'thread (multiple connected tweets)' : 'single tweet';
  const toneLine = tone ? `Tone: ${tone}.` : 'Tone: punchy and authentic.';
  return `Write ${count} distinct ${kind} options about:

${topic}

${toneLine}
Separate the ${count} options with a line containing only ---.
Remember: output only the posts, nothing else.`;
}

export function buildMessages({ topic, tone, format }) {
  return [
    { role: 'system', content: X_SYSTEM_PROMPT },
    { role: 'user', content: buildUserPrompt({ topic, tone, format }) },
  ];
}

// The DEFAULT llmFn: one non-streaming OpenRouter call per model down the shared
// MODELS chain; the first OK response with non-empty content wins. Mirrors the
// resilience of api/_llm.mjs#streamChat (same list, same reasoning tweaks, same
// "try the next model on 502/empty") but returns a whole completion string.
// Throws (with .status) only if EVERY model fails — generateXDrafts catches it.
async function openRouterComplete(messages, opts = {}) {
  const apiKey = opts.apiKey || process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw Object.assign(new Error('OPENROUTER_API_KEY unset'), { status: 500 });

  let lastErr = null;
  for (const model of MODELS) {
    try {
      const payload = {
        model: model.id,
        stream: false,
        max_tokens: 1000,
        temperature: 0.75,
        messages,
      };
      if (model.reasoning) payload.reasoning = model.reasoning;

      const res = await fetch(OPENROUTER_URL, {
        method: 'POST',
        signal: opts.signal,
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': opts.referer || 'https://nagavenkatasai7.github.io/portfolio',
          'X-Title': 'Naga X Draft Studio',
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const detail = await res.text().catch(() => '');
        lastErr = Object.assign(new Error(`OpenRouter ${res.status}`), { status: res.status, detail });
        continue;
      }
      const data = await res.json().catch(() => null);
      // OpenRouter can return a 200 with an `error` frame when the upstream pool
      // is exhausted — treat as a model failure and fall back.
      if (data?.error) {
        lastErr = Object.assign(new Error(data.error.message || 'upstream error'), { status: data.error.code || 502 });
        continue;
      }
      const content = data?.choices?.[0]?.message?.content;
      if (typeof content === 'string' && content.trim()) {
        return { text: content, model: model.id };
      }
      lastErr = Object.assign(new Error(`Model ${model.id} returned no content`), { status: 502 });
    } catch (err) {
      if (err?.name === 'AbortError') throw err;
      lastErr = err;
    }
  }
  throw lastErr || Object.assign(new Error('All models failed'), { status: 502 });
}

// The one drafting entrypoint. Returns a plain result object; NEVER throws.
//   success:  { ok:true, topic, tone, format, model_used, variants }
//   failure:  { ok:false, error, detail? }   (error in: invalid_input,
//             generation_unavailable, empty_generation)
export async function generateXDrafts({ topic, tone, format } = {}, options = {}) {
  const cleanTopic = typeof topic === 'string' ? topic.trim() : '';
  if (!cleanTopic) return { ok: false, error: 'invalid_input' };
  const fmt = format === 'thread' ? 'thread' : 'single';
  const cleanTone = typeof tone === 'string' ? tone.trim().slice(0, 60) : '';

  const messages = buildMessages({ topic: cleanTopic.slice(0, 600), tone: cleanTone, format: fmt });
  const llmFn = options.llmFn || ((m) => openRouterComplete(m, options));

  let out;
  try {
    out = await llmFn(messages);
  } catch (err) {
    return { ok: false, error: 'generation_unavailable', detail: err?.message || String(err) };
  }

  const rawText = typeof out === 'string' ? out : (out && typeof out.text === 'string' ? out.text : '');
  const model_used = (out && typeof out === 'object' && typeof out.model === 'string') ? out.model : 'unknown';
  if (!rawText.trim()) return { ok: false, error: 'empty_generation' };

  const variants = parseVariants(rawText, { format: fmt, limit: TWEET_LIMIT });
  if (variants.length === 0) return { ok: false, error: 'empty_generation' };

  return { ok: true, topic: cleanTopic, tone: cleanTone, format: fmt, model_used, variants };
}
