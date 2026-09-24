// OpenRouter client with an ordered chain of free models.
//
// Free models are rate-limited and occasionally down, so each call tries the
// next model on failure, with a per-model timeout and an overall deadline.
// Callers must always have a non-LLM fallback for when every model fails.

const ENDPOINT = 'https://openrouter.ai/api/v1/chat/completions';

// Same chain the previous site ran in production. Override with a
// comma-separated OPENROUTER_MODELS env var when free models change.
const DEFAULT_MODELS = ['openai/gpt-oss-120b:free', 'nvidia/nemotron-3-ultra-550b-a55b:free', 'google/gemma-4-31b-it:free'];

export function llmConfigured() {
  return Boolean(process.env.OPENROUTER_API_KEY);
}

export function modelChain() {
  const fromEnv = (process.env.OPENROUTER_MODELS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  return fromEnv.length ? fromEnv : DEFAULT_MODELS;
}

async function callModel(model, messages, { maxTokens, temperature, json, signal }) {
  const body = {
    model,
    messages,
    max_tokens: maxTokens,
    temperature,
  };
  if (json) body.response_format = { type: 'json_object' };
  if (model.includes('gpt-oss') || model.includes('nemotron')) body.reasoning = { effort: 'low' };

  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://chennunagavenkatasai.com',
      'X-Title': 'Naga Chennu Portfolio',
    },
    body: JSON.stringify(body),
    signal,
  });
  if (!res.ok) {
    const err = new Error(`OpenRouter ${res.status} for ${model}`);
    err.status = res.status;
    throw err;
  }
  const data = await res.json();
  const text = data?.choices?.[0]?.message?.content;
  if (typeof text !== 'string' || !text.trim()) throw new Error(`Empty response from ${model}`);
  return text.trim();
}

// Returns { text, model } from the first model that answers, or throws.
export async function complete(messages, { maxTokens = 700, temperature = 0.2, json = false, perModelMs = 20000, deadlineMs = 45000 } = {}) {
  if (!llmConfigured()) throw Object.assign(new Error('OPENROUTER_API_KEY is not set'), { code: 'NO_KEY' });
  const started = Date.now();
  let lastErr;
  for (const model of modelChain()) {
    const remaining = deadlineMs - (Date.now() - started);
    if (remaining < 3000) break;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), Math.min(perModelMs, remaining));
    try {
      const text = await callModel(model, messages, { maxTokens, temperature, json, signal: ctrl.signal });
      return { text, model };
    } catch (err) {
      lastErr = err;
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastErr || new Error('No model answered in time');
}

// Pulls the first JSON object out of a model reply, tolerating code fences
// and chatter around it. Returns null when nothing parses.
export function extractJson(text) {
  if (typeof text !== 'string') return null;
  const cleaned = text.replace(/```(?:json)?/gi, '');
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start === -1 || end <= start) return null;
  try {
    return JSON.parse(cleaned.slice(start, end + 1));
  } catch {
    return null;
  }
}
