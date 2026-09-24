import { test } from 'node:test';
import assert from 'node:assert/strict';
import { experience, projects, person } from '../content/profile.js';

const sentences = [...experience, ...projects].flatMap((x) => x.bullets.map((b) => b.text));

test('every bullet is a complete sentence', () => {
  for (const s of sentences) assert.match(s, /[.)]$/, s);
});

test('copy uses no gendered pronouns for Naga', () => {
  // The GMU bullet keeps the resume's "his" because it refers to Dr. Mishra.
  const aboutNaga = [...sentences, person.summary].filter((s) => !s.includes('Dr. Saurabh Mishra'));
  for (const s of aboutNaga) assert.doesNotMatch(s, /\b(he|him|his|she|her|hers)\b/i, s);
});

test('experience bullets have unique ids', () => {
  const ids = [...experience, ...projects].flatMap((x) => x.bullets.map((b) => b.id));
  assert.equal(new Set(ids).size, ids.length);
});
