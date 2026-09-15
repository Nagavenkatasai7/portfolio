// lib/coldstart/lossmask.js
// Demo model for the loss-mask.patch node: a fixed, synthetic two-turn exchange
// about diagnosing a training run, plus the masker that shows what TRL v0.20.0
// silently changed. Pure — no DOM, no React, no I/O.

const USER_TURN = [
  'My', 'SFT', "run's", 'eval', 'loss', 'keeps', 'dropping', 'but', 'the',
  'model', 'still', 'repeats', 'the', 'prompt', 'back', 'verbatim', '.',
  'Any', 'ideas?',
];

const ASSISTANT_TURN = [
  'Check', 'whether', 'assistant-only', 'loss', 'masking', 'is', 'still', 'on',
  '.', 'If', 'the', 'prompt', 'tokens', 'are', 'unmasked', ',', 'the', 'model',
  'is', 'rewarded', 'for', 'copying', 'them', ',', 'so', 'loss', 'falls',
  'while', 'answers', 'get', 'worse', '.', 'Print', 'per-token', 'loss', 'for',
  'one', 'batch', 'and', 'confirm', '.',
];

/**
 * Exactly 60 tokens: 19 user (the prompt) followed by 41 assistant (the completion).
 * @type {Array<{ t: string, role: 'user' | 'assistant' }>}
 */
export const DEMO_TOKENS = [
  ...USER_TURN.map((t) => ({ t, role: 'user' })),
  ...ASSISTANT_TURN.map((t) => ({ t, role: 'assistant' })),
];

/** Deterministic, illustrative per-token loss — shape only, not measured. */
export function lossAt(i) {
  return (((i * 2654435761) % 1000) / 1000) * 2.5;
}

/**
 * @param {Array<{ t: string, role: string }>} tokens
 * @param {{ assistantOnly?: boolean }} options
 *   assistantOnly:false is the bug state — TRL v0.20.0 dropped the mask, so every
 *   token (prompt included) contributed loss. assistantOnly:true is the restored
 *   behaviour: only completion tokens contribute.
 * @returns {{ contributing: number, perToken: Array<{ t: string, role: string, loss: number, contributes: boolean }> }}
 */
export function maskLoss(tokens, { assistantOnly } = {}) {
  const list = Array.isArray(tokens) ? tokens : [];
  const perToken = list.map((tok, i) => {
    const contributes = assistantOnly ? tok.role === 'assistant' : true;
    return {
      t: tok.t,
      role: tok.role,
      loss: contributes ? lossAt(i) : 0,
      contributes,
    };
  });
  return {
    contributing: perToken.filter((p) => p.contributes).length,
    perToken,
  };
}
