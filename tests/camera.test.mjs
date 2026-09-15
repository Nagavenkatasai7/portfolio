import test from 'node:test';
import assert from 'node:assert/strict';
import { lodFor, zoomAt, panBy, frameNode, toHash, fromHash, worldFromScreen } from '../lib/coldstart/camera.js';
test('lod thresholds', () => { assert.equal(lodFor(0.5), 0); assert.equal(lodFor(0.6), 1); assert.equal(lodFor(1.1), 2); });
test('zoomAt keeps the world point under the cursor fixed and clamps', () => {
  const cam = { x: 100, y: 50, s: 1 };
  const pt = { x: 300, y: 200 };
  const before = worldFromScreen(cam, pt);
  const z = zoomAt(cam, pt, 1.5);
  const after = worldFromScreen(z, pt);
  assert.ok(Math.abs(before.x - after.x) < 1e-6 && Math.abs(before.y - after.y) < 1e-6);
  assert.equal(zoomAt(cam, pt, 100).s, 2.5);
  assert.equal(zoomAt(cam, pt, 0.001).s, 0.35);
});
test('panBy and frameNode', () => {
  assert.deepEqual(panBy({ x: 0, y: 0, s: 1 }, 5, -5), { x: 5, y: -5, s: 1 });
  const cam = frameNode({ x: 0, y: 0, s: 0.8 }, { pos: { x: 380, y: 230 }, size: { w: 320, h: 190 } }, { w: 1000, h: 800 }, 1);
  assert.equal(cam.s, 1);
  assert.equal(cam.x, 1000 / 2 - (380 + 160)); assert.equal(cam.y, 800 / 2 - (230 + 95));
});
test('hash round-trips', () => {
  const h = toHash({ x: 12.4, y: -40, s: 1 }, { n: 'chartx.eval', run: 'halted' });
  const back = fromHash(h);
  assert.equal(back.s, 1); assert.equal(back.x, 12); assert.equal(back.n, 'chartx.eval'); assert.equal(back.run, 'halted');
  assert.deepEqual(fromHash(''), { s: 0.8, x: 40, y: 40, n: null, run: null });
});
