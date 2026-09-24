// POSTs JSON with a timeout and returns { data } or { error }.
export async function postJson(url, body, timeoutMs = 70000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { error: data.error || 'Something went wrong. Please try again.' };
    return { data };
  } catch (err) {
    return { error: err.name === 'AbortError' ? 'That took too long. Please try again.' : 'Network error. Check your connection and try again.' };
  } finally {
    clearTimeout(timer);
  }
}
