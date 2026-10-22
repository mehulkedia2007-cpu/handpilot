import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createPinchLatch, PINCH } from '../src/core/pinch.js';

// Small repeatable noise, so the tests give the same result every run.
function noise(seed = 1) {
  return () => ((seed = (seed * 16807) % 2147483647) / 2147483647 - 0.5);
}

test('starts open, closes below the close threshold, opens above the open one', () => {
  const p = createPinchLatch();
  assert.equal(p.closed, false);
  assert.equal(p.update(1.0), false);
  assert.equal(p.update(0.4), false);    // between thresholds: still open
  assert.equal(p.update(0.3), true);     // below close
  assert.equal(p.update(0.45), true);    // between thresholds: still closed
  assert.equal(p.update(0.55), false);   // above open
});

test('no flicker for a noisy signal sitting at either threshold', () => {
  const amp = (PINCH.open - PINCH.close) * 0.9;   // noise just smaller than the gap
  for (const centre of [PINCH.close, PINCH.open, (PINCH.close + PINCH.open) / 2]) {
    const p = createPinchLatch(), rnd = noise(42);
    let flips = 0, last = p.closed;
    for (let i = 0; i < 2000; i++) {
      const now = p.update(centre + rnd() * amp);
      if (now !== last) { flips++; last = now; }
    }
    assert.ok(flips <= 1, `centre ${centre}: ${flips} flips`);
  }
});

test('a noisy pinch and release each switch exactly once', () => {
  const p = createPinchLatch(), rnd = noise(7);
  const seq = [];
  // Open hand -> slow pinch -> hold -> slow release, with noise on top.
  for (let i = 0; i <= 100; i++) seq.push(1 - i / 100 + rnd() * 0.08);
  for (let i = 0; i < 50; i++) seq.push(0.05 + rnd() * 0.08);
  for (let i = 0; i <= 100; i++) seq.push(i / 100 + rnd() * 0.08);
  let flips = 0, last = false;
  for (const v of seq) { const c = p.update(v); if (c !== last) { flips++; last = c; } }
  assert.equal(flips, 2);
  assert.equal(p.closed, false);
});

test('missing values keep the current state', () => {
  const p = createPinchLatch();
  p.update(0.1);
  for (const v of [null, undefined, NaN]) assert.equal(p.update(v), true);
  p.reset();
  assert.equal(p.closed, false);
});
