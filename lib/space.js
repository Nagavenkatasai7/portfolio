// Client for the finance-Llama Hugging Face Space (see space/app.py).
//
// Uses Gradio's HTTP API: POST /gradio_api/call/<fn> returns an event id,
// then GET /gradio_api/call/<fn>/<id> streams server-sent events ending in
// "event: complete" with the outputs as a JSON array.

export const QUESTION_MAX = 300;

export function spaceUrl() {
  const raw = (process.env.HF_SPACE_URL || '').trim().replace(/\/+$/, '');
  if (!raw) return '';
  try {
    const u = new URL(raw);
    return u.protocol === 'https:' && u.hostname.endsWith('.hf.space') ? u.origin : '';
  } catch {
    return '';
  }
}

// Parses a Gradio SSE body into { event, data } of the final event.
export function parseGradioEvents(body) {
  let last = null;
  let event = null;
  for (const line of body.split('\n')) {
    if (line.startsWith('event:')) event = line.slice(6).trim();
    else if (line.startsWith('data:') && event) {
      const raw = line.slice(5).trim();
      let data = null;
      try {
        data = JSON.parse(raw);
      } catch {
        data = raw;
      }
      if (event === 'complete' || event === 'error') last = { event, data };
    }
  }
  return last;
}

export async function compareModels(question, { base = spaceUrl(), timeoutMs = 110000, fetchImpl = fetch } = {}) {
  if (!base) throw Object.assign(new Error('Demo not configured'), { code: 'NOT_CONFIGURED' });
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const start = await fetchImpl(`${base}/gradio_api/call/compare`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data: [question] }),
      signal: ctrl.signal,
    });
    if (!start.ok) throw Object.assign(new Error(`Space returned ${start.status}`), { code: 'SPACE_DOWN' });
    const { event_id: eventId } = await start.json();
    if (!eventId) throw Object.assign(new Error('No event id'), { code: 'SPACE_DOWN' });

    const stream = await fetchImpl(`${base}/gradio_api/call/compare/${encodeURIComponent(eventId)}`, { signal: ctrl.signal });
    if (!stream.ok) throw Object.assign(new Error(`Space returned ${stream.status}`), { code: 'SPACE_DOWN' });
    const result = parseGradioEvents(await stream.text());
    if (!result || result.event !== 'complete' || !Array.isArray(result.data) || result.data.length < 2) {
      throw Object.assign(new Error('Space did not finish'), { code: 'SPACE_DOWN' });
    }
    const [baseAnswer, tunedAnswer, seconds] = result.data;
    return { base: String(baseAnswer), tuned: String(tunedAnswer), seconds: Number(seconds) || null };
  } catch (err) {
    if (err.name === 'AbortError') throw Object.assign(new Error('Timed out'), { code: 'TIMEOUT' });
    throw err.code ? err : Object.assign(err, { code: 'SPACE_DOWN' });
  } finally {
    clearTimeout(timer);
  }
}
