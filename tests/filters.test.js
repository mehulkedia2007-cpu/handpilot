import { test } from 'node:test';
import assert from 'node:assert/strict';
import { OneEuroFilter, smoothingAlpha, createHandFilter } from '../src/core/filters.js';

// A seeded random generator, so the "noise" is the same on every run.
function makeNoise(seed = 1) {
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  return () => Math.sqrt(-2 * Math.log(rnd())) * Math.cos(2 * Math.PI * rnd());   // normal, sd 1
}
const FRAME_MS = 1000 / 30;   // camera rate
const variance = (xs) => {
  const m = xs.reduce((a, b) => a + b, 0) / xs.length;
  return xs.reduce((a, b) => a + (b - m) ** 2, 0) / xs.length;
};

test('alpha is between 0 and 1 and grows with the cutoff', () => {
  const lo = smoothingAlpha(0.5, 1 / 30), hi = smoothingAlpha(5, 1 / 30);
  assert.ok(lo > 0 && lo < hi && hi < 1);
});

test('the first sample passes straight through', () => {
  assert.equal(new OneEuroFilter().filter(0.42, 0), 0.42);
});

test('it reduces the variance of a noisy constant signal', () => {
  const noise = makeNoise();
  const f = new OneEuroFilter({ minCutoff: 1, beta: 1 });
  const raw = [], out = [];
  for (let i = 0; i < 300; i++) {
    const v = 0.5 + 0.03 * noise();
    raw.push(v); out.push(f.filter(v, i * FRAME_MS));
  }
  // Skip the first frames while the filter settles.
  const ratio = variance(out.slice(30)) / variance(raw.slice(30));
  assert.ok(ratio < 0.25, `variance only fell to ${(ratio * 100).toFixed(0)}%`);
});

test('it follows a step change within a few frames', () => {
  const f = new OneEuroFilter({ minCutoff: 1, beta: 1 });
  f.filter(0, 0);
  let frames = 0;
  while (f.filter(1, ++frames * FRAME_MS) < 0.9) assert.ok(frames < 6, 'too slow to follow the step');
});

test('a higher beta follows a step faster', () => {
  const framesTo90 = (beta) => {
    const f = new OneEuroFilter({ minCutoff: 1, beta });
    f.filter(0, 0);
    let n = 0;
    while (f.filter(1, ++n * FRAME_MS) < 0.9);
    return n;
  };
  assert.ok(framesTo90(2) < framesTo90(0.01));
});

test('a repeated timestamp returns the last output instead of dividing by zero', () => {
  const f = new OneEuroFilter();
  f.filter(0, 0);
  const a = f.filter(1, 100);
  assert.equal(f.filter(5, 100), a);
  assert.equal(f.filter(5, 50), a);   // older than the last sample
});

test('NaN input never reaches the output', () => {
  const f = new OneEuroFilter();
  f.filter(0.3, 0);
  assert.equal(f.filter(NaN, 33), 0.3);
  assert.ok(Number.isFinite(f.filter(0.4, 66)));
});

test('reset forgets the history', () => {
  const f = new OneEuroFilter();
  f.filter(0, 0); f.filter(0, 33);
  f.reset();
  assert.equal(f.filter(1, 66), 1);
});

// A minimal HandFrame for the hand filter.
const frame = (v, t, present = true, pinch = v) => ({
  present, t, pinch,
  bends: { thumb: v, index: v, middle: v, ring: v, pinky: v },
  palm: { x: v, y: v, z: v },
});

test('the hand filter smooths every channel and keeps other fields', () => {
  const hf = createHandFilter({ minCutoff: 1, beta: 0 });
  hf.filter(frame(0, 0));
  const out = hf.filter({ ...frame(1, 33), handedness: 'Left' });
  for (const v of [...Object.values(out.bends), out.palm.x, out.palm.y, out.palm.z, out.pinch]) {
    assert.ok(v > 0 && v < 1, `expected a value between the samples, got ${v}`);
  }
  assert.equal(out.handedness, 'Left');
});

test('the hand filter resets when the hand disappears', () => {
  const hf = createHandFilter({ minCutoff: 1, beta: 0 });
  hf.filter(frame(0, 0));
  hf.filter(frame(0, 33, false));
  assert.equal(hf.filter(frame(1, 66)).bends.index, 1);   // no glide from the old value
});

test('a null pinch (simulator) stays null', () => {
  const hf = createHandFilter();
  assert.equal(hf.filter(frame(0.5, 0, true, null)).pinch, null);
});

test('setParams changes how strongly it smooths', () => {
  const step = (minCutoff) => {
    const hf = createHandFilter({ minCutoff: 1, beta: 0 });
    hf.setParams({ minCutoff });
    hf.filter(frame(0, 0));
    return hf.filter(frame(1, 33)).bends.index;
  };
  assert.ok(step(5) > step(0.2));
});
