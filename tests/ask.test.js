import { test } from 'node:test';
import assert from 'node:assert/strict';
import { answerQuestion, resolveCitations, retrieve, validateQuestion } from '../lib/ask.js';

test('validateQuestion trims and bounds input', () => {
  assert.equal(validateQuestion('  hi there  ').question, 'hi there');
  assert.ok(validateQuestion('').error);
  assert.ok(validateQuestion(42).error);
  assert.ok(validateQuestion('x'.repeat(501)).error);
});

test('retrieve always includes the About passage', () => {
  assert.ok(retrieve('LoRA rank').some((s) => s.id === 'about'));
  assert.ok(retrieve('zzzz qqqq').length > 1);
});

test('resolveCitations drops invalid refs and renumbers by first use', () => {
  const sources = [{ id: 'a', href: '#a' }, { id: 'b', href: '#b' }, { id: 'c', href: '#c' }];
  const r = resolveCitations('Uses C [3]. Uses A [1][9]. Again C [3].', sources);
  assert.equal(r.answer, 'Uses C [1]. Uses A [2]. Again C [1].');
  assert.deepEqual(r.sources.map((s) => s.id), ['c', 'a']);
});

test('answerQuestion returns cited LLM answer', async () => {
  const complete = async (messages) => {
    assert.match(messages[1].content, /Sources:/);
    return { text: 'Naga fine-tuned Llama 3.2 1B [1].', model: 'fake' };
  };
  const r = await answerQuestion('fine-tuning', { complete });
  assert.equal(r.mode, 'llm');
  assert.equal(r.sources.length, 1);
});

test('answerQuestion falls back to passages when the LLM fails', async () => {
  const complete = async () => {
    throw new Error('down');
  };
  const r = await answerQuestion('payments idempotency', { complete });
  assert.equal(r.mode, 'fallback');
  assert.ok(r.sources.length >= 1);
  assert.match(r.answer, /\[1\]/);
});

test('resolveCitations merges passages from the same section', () => {
  const sources = [{ id: 'x1', href: '#x' }, { id: 'x2', href: '#x' }, { id: 'y', href: '#y' }];
  const r = resolveCitations('One [1]. Two [2]. Three [3][2].', sources);
  assert.equal(r.answer, 'One [1]. Two [1]. Three [2][1].');
  assert.deepEqual(r.sources.map((s) => s.id), ['x1', 'y']);
});
