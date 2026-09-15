// lib/coldstart/stats.js
// Pure statistics helpers. No DOM, no dependencies.
// Used for display only: every rendered number carries provenance 'computed'.

const LN2 = Math.LN2;

/**
 * McNemar's test, exact two-sided binomial form on the discordant pairs.
 *
 * b and c are the two discordant cell counts of the 2x2 paired table
 * (b = right-then-wrong, c = wrong-then-right). Under H0 each discordant
 * pair is a fair coin flip, so k = min(b, c) is Binomial(n = b + c, 0.5):
 *
 *   p = min(1, 2 * SUM_{i=0..k} C(n, i) / 2^n)
 *
 * Terms are accumulated in log space so large n stays finite.
 *
 * @param {number} b
 * @param {number} c
 * @returns {number} p in [0, 1]
 */
export function mcnemarExact(b, c) {
  const nb = normalizeCount(b);
  const nc = normalizeCount(c);
  const n = nb + nc;
  if (n === 0) return 1; // no discordant pairs: nothing to test
  const k = Math.min(nb, nc);

  // logC = ln C(n, i), stepped as C(n, i) = C(n, i-1) * (n - i + 1) / i
  let logC = 0;
  let tail = Math.exp(-n * LN2); // i = 0 term
  for (let i = 1; i <= k; i++) {
    logC += Math.log(n - i + 1) - Math.log(i);
    tail += Math.exp(logC - n * LN2);
  }
  const p = 2 * tail;
  return p > 1 ? 1 : p < 0 ? 0 : p;
}

/**
 * One-way ANOVA F statistic.
 *
 * @param {number[][]} groups
 * @returns {{ F: number, dfBetween: number, dfWithin: number }}
 */
export function anovaF(groups) {
  const gs = (Array.isArray(groups) ? groups : []).filter(
    (g) => Array.isArray(g) && g.length > 0,
  );
  const k = gs.length;
  let total = 0;
  let n = 0;
  for (const g of gs) {
    for (const v of g) total += v;
    n += g.length;
  }
  const dfBetween = k - 1;
  const dfWithin = n - k;
  if (k < 2 || dfWithin <= 0) return { F: 0, dfBetween: Math.max(dfBetween, 0), dfWithin: Math.max(dfWithin, 0) };

  const grandMean = total / n;
  let ssBetween = 0;
  let ssWithin = 0;
  for (const g of gs) {
    const mean = g.reduce((a, v) => a + v, 0) / g.length;
    ssBetween += g.length * (mean - grandMean) ** 2;
    for (const v of g) ssWithin += (v - mean) ** 2;
  }

  const msBetween = ssBetween / dfBetween;
  const msWithin = ssWithin / dfWithin;
  // Zero within-group variance: no spread to divide by. Identical groups are F = 0;
  // separated-but-constant groups are unbounded.
  const F = msWithin === 0 ? (msBetween === 0 ? 0 : Infinity) : msBetween / msWithin;
  return { F, dfBetween, dfWithin };
}

function normalizeCount(v) {
  const x = Number(v);
  if (!Number.isFinite(x) || x <= 0) return 0;
  return Math.round(x);
}
