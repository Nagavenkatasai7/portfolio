import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compareModels, parseGradioEvents, spaceUrl } from '../lib/space.js';

test('spaceUrl only accepts https *.hf.space origins', () => {
  process.env.HF_SPACE_URL = 'https://venkat9990-finance-llama.hf.space/';
  assert.equal(spaceUrl(), 'https://venkat9990-finance-llama.hf.space');
  process.env.HF_SPACE_URL = 'http://evil.example.com';
  assert.equal(spaceUrl(), '');
  delete process.env.HF_SPACE_URL;
  assert.equal(spaceUrl(), '');
});

test('parseGradioEvents returns the final complete event', () => {
  const body = 'event: heartbeat\ndata: null\n\nevent: complete\ndata: ["a", "b", 12.5]\n\n';
  assert.deepEqual(parseGradioEvents(body), { event: 'complete', data: ['a', 'b', 12.5] });
});

test('compareModels drives the two-step Gradio API', async () => {
  const calls = [];
  const fetchImpl = async (url, opts) => {
    calls.push([url, opts?.method || 'GET']);
    if (url.endsWith('/gradio_api/call/compare')) return new Response(JSON.stringify({ event_id: 'abc' }));
    return new Response('event: complete\ndata: ["base answer", "tuned answer", 9.1]\n\n');
  };
  const r = await compareModels('What is a yield curve?', { base: 'https://x.hf.space', fetchImpl });
  assert.deepEqual(r, { base: 'base answer', tuned: 'tuned answer', seconds: 9.1 });
  assert.deepEqual(calls.map((c) => c[1]), ['POST', 'GET']);
});

test('compareModels reports a down Space', async () => {
  const fetchImpl = async () => new Response('sleeping', { status: 503 });
  await assert.rejects(compareModels('q?', { base: 'https://x.hf.space', fetchImpl }), { code: 'SPACE_DOWN' });
  await assert.rejects(compareModels('q?', { base: '' }), { code: 'NOT_CONFIGURED' });
});
