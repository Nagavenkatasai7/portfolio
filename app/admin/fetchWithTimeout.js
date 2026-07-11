'use client';
// fetch() wrapped in an AbortController timeout, shared by the admin editors so a
// hung request (dead network, stalled function) surfaces as a retryable state
// instead of an indefinite spinner. On timeout the underlying fetch rejects with
// a DOMException whose name is 'AbortError'; isTimeout() lets callers show a
// "timed out — retry" message and tell it apart from an ordinary network error.
export async function fetchWithTimeout(url, opts = {}, ms = 30000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { ...opts, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

export function isTimeout(err) {
  return err && (err.name === 'AbortError' || err.code === 20);
}
