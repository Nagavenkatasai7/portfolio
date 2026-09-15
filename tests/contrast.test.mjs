// tests/contrast.test.mjs
// The palette in app/coldstart/coldstart.css is parsed out and rerun through the
// WCAG relative-luminance formula, against both grounds the ink sits on. The
// tokens are the whole art direction, so a "slightly lighter grey" edit that
// drops --ink-3 back under 4.5:1 should fail here rather than in an audit.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('../app/coldstart/coldstart.css', import.meta.url), 'utf8');

function token(name) {
  const m = css.match(new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})`));
  assert.ok(m, `--${name} missing from coldstart.css`);
  return m[1];
}

function channel(c) {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

function luminance(hex) {
  const n = parseInt(hex.slice(1), 16);
  return 0.2126 * channel((n >> 16) & 255)
    + 0.7152 * channel((n >> 8) & 255)
    + 0.0722 * channel(n & 255);
}

function ratio(a, b) {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

test('every ink token that carries body text clears 4.5:1 on paper and on card', () => {
  const grounds = { paper: token('paper'), card: token('card') };
  // --ink-3 is the one to watch: it carries real 9-11px text in eight places,
  // including the on-screen keyboard legend and every Contact-sheet row label.
  for (const name of ['ink', 'ink-2', 'ink-3', 'red', 'blue']) {
    const fg = token(name);
    for (const [where, bg] of Object.entries(grounds)) {
      const r = ratio(fg, bg);
      assert.ok(r >= 4.5, `--${name} ${fg} on ${where} ${bg} is ${r.toFixed(2)}:1`);
    }
  }
});

test('the two state signals clear the thresholds their roles need', () => {
  // WCAG 1.4.11: amber is the sole carrier of "running" — the left border, the
  // mark glyph, the active wire and the packet — so it needs 3:1 as non-text UI.
  for (const ground of ['paper', 'card']) {
    const r = ratio(token('amber'), token(ground));
    assert.ok(r >= 3, `--amber on ${ground} is ${r.toFixed(2)}:1`);
  }
  // Green is a wire/mark colour and the PASS badge inside a card, where it clears
  // 4.5:1; on bare paper it is a signal stroke, held to 3:1.
  assert.ok(ratio(token('green'), token('card')) >= 4.5, '--green on card');
  assert.ok(ratio(token('green'), token('paper')) >= 3, '--green on paper');
});

test('the sheet is declared light, so the OS does not paint dark chrome on it', () => {
  assert.match(css, /color-scheme:\s*light/);
});
