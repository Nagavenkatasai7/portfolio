// Small helpers shared by the API routes.

export function clientIp(request) {
  const fwd = request.headers.get('x-forwarded-for');
  if (fwd) return fwd.split(',')[0].trim();
  return request.headers.get('x-real-ip') || 'unknown';
}

// Rejects cross-site browser requests. Non-browser clients send no Origin and
// are handled by the rate limiter instead.
export function sameOrigin(request) {
  const origin = request.headers.get('origin');
  if (!origin) return true;
  try {
    return new URL(origin).host === request.headers.get('host');
  } catch {
    return false;
  }
}

export async function readJson(request, maxBytes = 20000) {
  const text = await request.text();
  if (text.length > maxBytes) return { error: 'Request is too large.' };
  try {
    return { body: JSON.parse(text) };
  } catch {
    return { error: 'Invalid request.' };
  }
}

export function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...headers },
  });
}

// Runs the checks every AI route needs. Returns a Response to send back
// early, or null to continue.
export function guard(request, limiter) {
  if (!sameOrigin(request)) return json({ error: 'Cross-site requests are not allowed.' }, 403);
  const rl = limiter(clientIp(request));
  if (!rl.ok) {
    return json(
      { error: `Too many requests. Try again in ${rl.retryAfter} seconds.` },
      429,
      { 'Retry-After': String(rl.retryAfter) },
    );
  }
  return null;
}
