import { compareModels, QUESTION_MAX, spaceUrl } from '@/lib/space';
import { combine, createLimiter } from '@/lib/ratelimit';
import { guard, json, readJson } from '@/lib/http';

export const runtime = 'nodejs';
export const maxDuration = 120;

const limiter = combine(
  [createLimiter({ windowMs: 60_000, max: 2 }), 'ip'],
  [createLimiter({ windowMs: 86_400_000, max: 20 }), 'ip'],
  [createLimiter({ windowMs: 60_000, max: 10 }), 'global'],
);

const MESSAGES = {
  NOT_CONFIGURED: 'The live demo is not switched on yet.',
  TIMEOUT: 'The demo server took too long. It may be waking up from sleep; try again in a minute.',
  SPACE_DOWN: 'The demo server is waking up or busy. Try again in a minute.',
};

// Lets the page show the right state without exposing the Space URL.
export function GET() {
  return json({ configured: Boolean(spaceUrl()) });
}

export async function POST(request) {
  const blocked = guard(request, limiter);
  if (blocked) return blocked;
  const { body, error } = await readJson(request, 2000);
  if (error) return json({ error }, 400);
  const q = typeof body?.question === 'string' ? body.question.replace(/\s+/g, ' ').trim() : '';
  if (q.length < 3 || q.length > QUESTION_MAX) {
    return json({ error: `Ask a finance question between 3 and ${QUESTION_MAX} characters.` }, 400);
  }
  try {
    return json(await compareModels(q));
  } catch (err) {
    const code = err.code in MESSAGES ? err.code : 'SPACE_DOWN';
    return json({ error: MESSAGES[code], code }, code === 'NOT_CONFIGURED' ? 503 : 502);
  }
}
