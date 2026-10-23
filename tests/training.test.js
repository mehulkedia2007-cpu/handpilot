import { test } from 'node:test';
import assert from 'node:assert/strict';
import { simHandLandmarks } from '../src/core/hand.js';
import { TRAINING_KEY, VECTOR_LEN, MAX_SAMPLES, TRAINED, emptyTraining, vectorFor, checkTraining, loadTraining, saveTraining,
  exportTraining, parseTrainingFile, mergeTraining, addSamples, buildKnn, customCommands, createSampler } from '../src/core/training.js';

const F = ['thumb', 'index', 'middle', 'ring', 'pinky'];
const bends = (a) => Object.fromEntries(F.map((f, i) => [f, a[i]]));
// A HandFrame with the simulator's made-up landmarks.
const frame = (a, { x = 0.5, y = 0.5, size = 0.15, handedness = null } = {}) =>
  ({ present: true, landmarks: simHandLandmarks(bends(a), { x, y, z: size }), handedness });
const SHAPES = { rock: [0, 0, 1, 1, 0], peace: [1, 0, 0, 1, 1], open: [0, 0, 0, 0, 0], fist: [1, 1, 1, 1, 1] };
// Examples of a shape with each finger wobbling by up to `wobble`, at different places and sizes.
function examples(shape, n, wobble = 0.08, seed = 1) {
  let s = seed;
  const r = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  return Array.from({ length: n }, () => vectorFor(frame(shape.map((v) => Math.min(1, Math.max(0, v + (r() * 2 - 1) * wobble))),
    { x: 0.3 + r() * 0.4, y: 0.3 + r() * 0.4, size: 0.08 + r() * 0.2 })));
}
function fakeStorage() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => { m.set(k, String(v)); }, map: m };
}
const brokenStorage = { getItem() { throw new Error('SecurityError'); }, setItem() { throw new Error('QuotaExceededError'); } };

test('vectorFor: 63 numbers for a hand, null without one', () => {
  assert.equal(vectorFor(frame(SHAPES.rock)).length, VECTOR_LEN);
  assert.equal(vectorFor({ present: false, landmarks: null }), null);
  assert.equal(vectorFor({ present: true, landmarks: null }), null);
});

test('vectorFor mirrors a left hand onto a right one', () => {
  const right = frame(SHAPES.peace);
  const left = { ...right, handedness: 'Left', landmarks: right.landmarks.map((p) => ({ ...p, x: 1 - p.x })) };
  assert.deepEqual(vectorFor(left), vectorFor(right));
});

test('two custom gestures trained on wobbly examples are recognised, and others are not', () => {
  let data = emptyTraining();
  data = addSamples(data, 'rock', examples(SHAPES.rock, 30, 0.08, 1));
  data = addSamples(data, 'peace', examples(SHAPES.peace, 30, 0.08, 2));
  const knn = buildKnn(data);
  for (const v of examples(SHAPES.rock, 20, 0.08, 3)) assert.equal(knn.predict(v).label, 'rock');
  for (const v of examples(SHAPES.peace, 20, 0.08, 4)) assert.equal(knn.predict(v).label, 'peace');
  // Shapes that were never taught stay "unknown", so the built-in gestures still work.
  for (const v of examples(SHAPES.open, 10, 0.05, 5)) assert.equal(knn.predict(v).label, 'unknown');
  for (const v of examples(SHAPES.fist, 10, 0.05, 6)) assert.equal(knn.predict(v).label, 'unknown');
});

test('addSamples creates a gesture, adds to it, and caps it, without changing the old data', () => {
  const v = examples(SHAPES.rock, 3);
  const a = addSamples(emptyTraining(), 'Rock', v);
  const b = addSamples(a, 'rock', v);   // names match case-insensitively
  assert.equal(a.gestures[0].samples.length, 3);
  assert.equal(b.gestures.length, 1);
  assert.equal(b.gestures[0].samples.length, 6);
  const big = addSamples(emptyTraining(), 'x', Array.from({ length: MAX_SAMPLES + 20 }, () => v[0]));
  assert.equal(big.gestures[0].samples.length, MAX_SAMPLES);
});

test('trained commands: modes, motions, and a deleted motion is dropped', () => {
  const data = { maxDistance: 0.6, gestures: [
    { name: 'rock', action: { type: 'mode', mode: 'HOLD' }, samples: [] },
    { name: 'swirl', action: { type: 'motion', id: 'm1' }, samples: [] },
    { name: 'gone', action: { type: 'motion', id: 'm9' }, samples: [] },
    { name: 'idle', action: null, samples: [] },
  ] };
  assert.deepEqual(customCommands(data, [{ id: 'm1', name: 'Wave' }]), {
    [TRAINED + 'rock']: { type: 'mode', mode: 'HOLD', label: 'rock' },
    [TRAINED + 'swirl']: { type: 'motion', id: 'm1', name: 'Wave', label: 'swirl' },
  });
});

test('training data saves, loads, exports and imports back identically', () => {
  let data = addSamples(emptyTraining(), 'rock', examples(SHAPES.rock, 4));
  data.gestures[0].action = { type: 'mode', mode: 'GREET' };
  data.maxDistance = 0.8;
  const store = fakeStorage();
  assert.equal(saveTraining(store, data), true);
  assert.deepEqual(loadTraining(store), data);
  assert.deepEqual(parseTrainingFile(exportTraining(data)), data);
});

test('bad stored training data falls back to empty, and broken storage never throws', () => {
  const store = fakeStorage();
  assert.deepEqual(loadTraining(store), emptyTraining());
  for (const bad of ['nope', 'null', '{}', '{"gestures":[{"name":"x","samples":[[1,2]]}]}']) {
    store.map.set(TRAINING_KEY, bad);
    assert.deepEqual(loadTraining(store), emptyTraining(), bad);
  }
  assert.deepEqual(loadTraining(brokenStorage), emptyTraining());
  assert.equal(saveTraining(brokenStorage, emptyTraining()), false);
});

test('an invalid gestures file gives a clear error', () => {
  const v = examples(SHAPES.rock, 1)[0];
  const file = (gestures, extra = {}) => JSON.stringify({ format: 'handpilot-gestures', version: 1, maxDistance: 0.6, gestures, ...extra });
  const cases = [
    ['nope', /not valid JSON/],
    ['{"format":"handpilot-motions"}', /not a HandPilot gestures file/],
    [file([], { version: 3 }), /version 3/],
    [file([]), /no gestures/],
    [file([{ name: '', action: null, samples: [v] }]), /Gesture 1 has no name/],
    [file([{ name: 'a', action: null, samples: [v] }, { name: 'A', action: null, samples: [v] }]), /Gesture 2 \("A"\) has the same name/],
    [file([{ name: 'a', action: { type: 'launch' }, samples: [v] }]), /action/],
    [file([{ name: 'a', action: null, samples: [] }]), /no samples/],
    [file([{ name: 'a', action: null, samples: [v.slice(0, 42)] }]), /sample 1 is not a list of 63 numbers/],
  ];
  for (const [text, re] of cases) assert.throws(() => parseTrainingFile(text), re, text.slice(0, 50));
});

test('importing replaces gestures with the same name and adds the rest', () => {
  const v = examples(SHAPES.rock, 2);
  const mine = addSamples(addSamples(emptyTraining(), 'rock', v), 'peace', v);
  const file = addSamples(addSamples({ ...emptyTraining(), maxDistance: 0.9 }, 'Rock', v.slice(0, 1)), 'ok', v);
  const r = mergeTraining(mine, file);
  assert.equal(r.added, 1); assert.equal(r.replaced, 1);
  assert.deepEqual(r.data.gestures.map((g) => [g.name, g.samples.length]), [['Rock', 1], ['peace', 2], ['ok', 2]]);
  assert.equal(r.data.maxDistance, 0.9);
});

test('checkTraining keeps a sensible match distance only', () => {
  assert.equal(checkTraining({ maxDistance: 99, gestures: [] }).data.maxDistance, 0.6);
  assert.equal(checkTraining({ maxDistance: 1.2, gestures: [] }).data.maxDistance, 1.2);
});

test('the sampler counts down, then takes 30 samples over about 3 s', () => {
  const s = createSampler();
  const v = [1];
  s.start(0);
  assert.deepEqual(s.step(100, v), { phase: 'countdown', secondsLeft: 3, count: 0 });
  assert.equal(s.step(2500, v).secondsLeft, 1);
  let r, now = 3000;
  for (; now < 7000; now += 1000 / 60) { r = s.step(now, v); if (r.phase === 'done') break; }
  assert.equal(r.phase, 'done');
  assert.equal(r.count, 30);
  assert.ok(now - 3000 >= 2800 && now - 3000 <= 3000, `took ${now - 3000} ms`);
  assert.equal(s.active, false);
});

test('the sampler skips frames with no hand and stops when time is up', () => {
  const s = createSampler({ countdownMs: 0, durationMs: 1000, count: 30 });
  s.start(0);
  let r;
  for (let now = 0; now <= 1100; now += 10) { r = s.step(now, now < 500 ? null : [1]); if (r.phase === 'done') break; }
  assert.equal(r.phase, 'done');
  assert.ok(r.count > 10 && r.count < 20, `${r.count} samples from half the time`);
  const c = createSampler(); c.start(0); c.cancel();
  assert.equal(c.active, false);
  assert.equal(c.step(5000, [1]).phase, 'idle');
});
