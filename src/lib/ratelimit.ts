/**
 * Sliding-window rate limiting backed by Upstash Redis (HTTP — works on Vercel
 * Functions). Limiters are created lazily and cached per (name, limit, window).
 * Fails OPEN: if Upstash is misconfigured/unreachable the request is allowed,
 * so rate-limiting outages never take down the public forms.
 */
import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';
import { requireEnv } from './env';

type Window = `${number} s` | `${number} m` | `${number} h`;

let redis: Redis | null = null;
function getRedis(): Redis {
  if (!redis) {
    redis = new Redis({
      url: requireEnv('UPSTASH_REDIS_REST_URL'),
      token: requireEnv('UPSTASH_REDIS_REST_TOKEN'),
    });
  }
  return redis;
}

const limiters = new Map<string, Ratelimit>();
function getLimiter(name: string, limit: number, window: Window): Ratelimit {
  const key = `${name}:${limit}:${window}`;
  let l = limiters.get(key);
  if (!l) {
    l = new Ratelimit({
      redis: getRedis(),
      limiter: Ratelimit.slidingWindow(limit, window),
      prefix: `rl:${name}`,
      analytics: false,
    });
    limiters.set(key, l);
  }
  return l;
}

export async function checkRateLimit(
  name: string,
  identifier: string,
  limit = 5,
  window: Window = '60 s'
): Promise<{ success: boolean; remaining: number }> {
  try {
    const { success, remaining } = await getLimiter(name, limit, window).limit(identifier);
    return { success, remaining };
  } catch {
    // Fail open — do not let a rate-limiter outage block legitimate submissions.
    return { success: true, remaining: limit };
  }
}
