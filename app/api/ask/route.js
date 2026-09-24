import { answerQuestion, validateQuestion } from '@/lib/ask';
import { combine, createLimiter } from '@/lib/ratelimit';
import { guard, json, readJson } from '@/lib/http';

export const runtime = 'nodejs';
export const maxDuration = 60;

const limiter = combine(
  [createLimiter({ windowMs: 60_000, max: 8 }), 'ip'],
  [createLimiter({ windowMs: 86_400_000, max: 80 }), 'ip'],
  [createLimiter({ windowMs: 60_000, max: 60 }), 'global'],
);

export async function POST(request) {
  const blocked = guard(request, limiter);
  if (blocked) return blocked;
  const { body, error } = await readJson(request, 4000);
  if (error) return json({ error }, 400);
  const v = validateQuestion(body?.question);
  if (v.error) return json({ error: v.error }, 400);
  return json(await answerQuestion(v.question));
}
