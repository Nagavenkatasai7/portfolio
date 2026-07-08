// POST /api/newsletter/subscribe — public double-opt-in signup.
//
// Accepts JSON { email, website, source } (the homepage fetch) OR a normal
// form-encoded POST (progressive enhancement / no-JS). `website` is a HONEYPOT:
// if it's filled a bot submitted it, so we return the generic ok and do nothing.
//
// Order of checks: parse (small cap) -> honeypot -> per-IP rate limit -> the
// dormant RESEND_API_KEY gate -> validate + subscribe. The rate limit runs
// BEFORE the RESEND gate so the endpoint is protected even when email is
// unconfigured. It NEVER reveals whether an email already exists: every valid
// submission gets the identical { ok:true } (JSON) / 303 -> /newsletter/pending
// (form) response, regardless of the address's status.
import { json, clientIp, originFromRequest } from '@/lib/http';
import { checkAndRecord } from '@/lib/auth/ratelimit';
import { hashIp } from '@/lib/analytics';
import { subscribeEmail } from '@/lib/newsletter';
import { sendConfirmationEmail, isEmailConfigured } from '@/lib/email/send';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_BODY = 4 * 1024;
const RL_ROUTE = 'newsletter:subscribe';
const RL_LIMIT = 5;
const RL_WINDOW_MS = 10 * 60 * 1000; // 5 signups / 10 min / IP
const PENDING = '/newsletter/pending';

function seeOther(request, path) {
  return new Response(null, { status: 303, headers: { Location: `${originFromRequest(request)}${path}` } });
}

function cleanSource(v) {
  if (typeof v !== 'string') return null;
  const s = v.slice(0, 32).replace(/[^a-z0-9_-]/gi, '');
  return s || null;
}

export async function POST(request) {
  // Detect the submission format up front so every response matches it.
  const ctype = request.headers.get('content-type') || '';
  const isForm = ctype.includes('form');

  // Small body cap BEFORE parsing.
  const len = Number(request.headers.get('content-length') || 0);
  if (len > MAX_BODY) {
    return isForm ? seeOther(request, PENDING) : json({ error: 'payload_too_large' }, 413);
  }

  // Parse the two shapes.
  let email = '';
  let website = '';
  let source = null;
  try {
    if (isForm) {
      const form = await request.formData();
      email = String(form.get('email') || '');
      website = String(form.get('website') || '');
      source = cleanSource(form.get('source'));
    } else {
      const body = await request.json();
      email = typeof body?.email === 'string' ? body.email : '';
      website = typeof body?.website === 'string' ? body.website : '';
      source = cleanSource(body?.source);
    }
  } catch {
    return isForm ? seeOther(request, PENDING) : json({ error: 'bad_request' }, 400);
  }

  // Honeypot: a real user never fills `website`. Act like success, do nothing.
  if (website.trim() !== '') {
    return isForm ? seeOther(request, PENDING) : json({ ok: true }, 200);
  }

  // Per-IP burst limit. Salted-hash the IP (reuse the analytics hasher) and
  // reuse the existing Postgres limiter — no raw IP is ever stored. Over-limit
  // fails closed; an unconfigured/errored limiter is not treated as over-limit.
  const ipHash = hashIp(clientIp(request));
  const rl = await checkAndRecord(ipHash, RL_ROUTE, { limit: RL_LIMIT, windowMs: RL_WINDOW_MS });
  if (!rl.allowed && !rl.unconfigured) {
    return isForm ? seeOther(request, PENDING) : json({ error: 'rate_limited' }, 429);
  }

  // Dormant gate: with no Resend key there is no way to send the confirm link,
  // so fail closed (503) rather than create pending rows nobody can confirm.
  if (!isEmailConfigured()) {
    return json({ error: 'server_not_configured' }, 503);
  }

  // Subscribe (double opt-in). Same generic ok for every valid email; a
  // malformed address is the only distinguishable (validation) case.
  try {
    const result = await subscribeEmail({ email, source, ipHash, sendFn: sendConfirmationEmail });
    if (result.ok === false) {
      return isForm ? seeOther(request, PENDING) : json({ error: result.error || 'invalid_email' }, 400);
    }
    return isForm ? seeOther(request, PENDING) : json({ ok: true }, 200);
  } catch (e) {
    if (e && (e.code === 'email_not_configured' || e.name === 'NotConfiguredError')) {
      return json({ error: 'server_not_configured' }, 503);
    }
    // Any other error is email-independent (Resend/DB outage for everyone) — so
    // returning it leaks nothing about a specific address.
    return isForm ? seeOther(request, PENDING) : json({ error: 'server_error' }, 500);
  }
}

// Only POST is meaningful.
export function GET() { return json({ error: 'method_not_allowed' }, 405); }
