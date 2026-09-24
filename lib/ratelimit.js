// In-memory sliding-window rate limiter.
//
// State lives in one server instance, so limits are best-effort across a
// fleet. That is acceptable here: every AI feature runs on free models, so
// abuse can exhaust the free quota (and trigger the fallbacks) but cannot
// create a bill.

export function createLimiter({ windowMs, max, maxKeys = 5000 }) {
  const hits = new Map();

  function prune(now) {
    for (const [key, times] of hits) {
      const fresh = times.filter((t) => now - t < windowMs);
      if (fresh.length) hits.set(key, fresh);
      else hits.delete(key);
    }
  }

  return function check(key, now = Date.now()) {
    if (hits.size > maxKeys) prune(now);
    const times = (hits.get(key) || []).filter((t) => now - t < windowMs);
    if (times.length >= max) {
      hits.set(key, times);
      return { ok: false, retryAfter: Math.max(1, Math.ceil((windowMs - (now - times[0])) / 1000)) };
    }
    times.push(now);
    hits.set(key, times);
    return { ok: true, remaining: max - times.length };
  };
}

// Combines several limiters (e.g. per-minute and per-day, per-IP and global);
// a request passes only if all of them allow it.
export function combine(...checks) {
  return (key, now = Date.now()) => {
    for (const [check, scope] of checks) {
      const res = check(scope === 'global' ? 'global' : key, now);
      if (!res.ok) return res;
    }
    return { ok: true };
  };
}
