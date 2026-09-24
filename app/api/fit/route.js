import { matchJob, validateJobDescription } from '@/lib/fit';
import { combine, createLimiter } from '@/lib/ratelimit';
import { guard, json, readJson } from '@/lib/http';

export const runtime = 'nodejs';
export const maxDuration = 60;

const limiter = combine(
  [createLimiter({ windowMs: 60_000, max: 3 }), 'ip'],
  [createLimiter({ windowMs: 86_400_000, max: 25 }), 'ip'],
  [createLimiter({ windowMs: 60_000, max: 20 }), 'global'],
);

export async function POST(request) {
  const blocked = guard(request, limiter);
  if (blocked) return blocked;
  const { body, error } = await readJson(request, 20000);
  if (error) return json({ error }, 400);
  const v = validateJobDescription(body?.jobDescription);
  if (v.error) return json({ error: v.error }, 400);
  return json(await matchJob(v.jd));
}
