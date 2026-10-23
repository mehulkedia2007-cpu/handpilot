import { test } from 'node:test';
import assert from 'node:assert/strict';
import { KNN, distance } from '../src/core/knn.js';

// A tiny repeatable random source (mulberry32), so the "random" clusters are the same every run.
function rng(seed) {
  return () => { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
// n points scattered up to `spread` around a centre.
const cluster = (rand, centre, n, spread) => Array.from({ length: n }, () => centre.map((c) => c + (rand() * 2 - 1) * spread));

test('distance is the straight-line distance', () => {
  assert.equal(distance([0, 0], [3, 4]), 5);
  assert.equal(distance([1, 2, 3], [1, 2, 3]), 0);
});

test('KNN separates well-spread synthetic clusters', () => {
  const rand = rng(7);
  const centres = { rock: [0, 0, 0, 0], paper: [3, 0, 0, 0], scissors: [0, 3, 3, 0] };
  const knn = new KNN({ maxDistance: 2 });
  for (const [label, c] of Object.entries(centres)) for (const v of cluster(rand, c, 30, 0.5)) knn.add(v, label);
  assert.equal(knn.size, 90);
  let right = 0, total = 0;
  for (const [label, c] of Object.entries(centres)) {
    for (const v of cluster(rand, c, 20, 0.5)) { total++; if (knn.predict(v).label === label) right++; }
  }
  assert.equal(right, total, `${right}/${total} correct`);
});

test('confidence is the share of the k neighbours that agree', () => {
  const knn = new KNN({ k: 5, minConfidence: 0.6, maxDistance: 10 });
  [[0], [0.1], [0.2]].forEach((v) => knn.add(v, 'a'));
  [[1], [1.1]].forEach((v) => knn.add(v, 'b'));
  const p = knn.predict([0.05]);
  assert.equal(p.label, 'a');
  assert.equal(p.confidence, 3 / 5);
  assert.ok(Math.abs(p.distance - 0.05) < 1e-12);
});

test('a split vote gives "unknown" but still names the best guess', () => {
  const knn = new KNN({ k: 5, minConfidence: 0.6, maxDistance: 10 });
  [[0], [0.1]].forEach((v) => knn.add(v, 'a'));
  [[0.2], [0.3]].forEach((v) => knn.add(v, 'b'));
  [[0.4]].forEach((v) => knn.add(v, 'c'));
  const p = knn.predict([0.15]);   // 2 a, 2 b, 1 c: only 40% agree
  assert.equal(p.label, 'unknown');
  assert.equal(p.confidence, 0.4);
  assert.ok(['a', 'b'].includes(p.best));
});

test('a tie goes to the closer label', () => {
  const knn = new KNN({ k: 4, minConfidence: 0.5, maxDistance: 10 });
  [[0], [0.05]].forEach((v) => knn.add(v, 'near'));
  [[0.5], [0.6]].forEach((v) => knn.add(v, 'far'));
  assert.equal(knn.predict([0.1]).label, 'near');
});

test('a hand far from every example is "unknown", even with one trained label', () => {
  const knn = new KNN({ maxDistance: 1 });
  for (const v of cluster(rng(3), [0, 0], 10, 0.2)) knn.add(v, 'only');
  assert.equal(knn.predict([0.1, 0]).label, 'only');
  const far = knn.predict([5, 5]);
  assert.equal(far.label, 'unknown');
  assert.equal(far.confidence, 1);   // everyone agreed, but it's too far away to trust
  assert.equal(far.best, 'only');
});

test('fewer examples than k: confidence is out of what there is', () => {
  const knn = new KNN({ k: 5, maxDistance: 10 });
  knn.add([0], 'a'); knn.add([0.1], 'a');
  const p = knn.predict([0]);
  assert.equal(p.label, 'a'); assert.equal(p.confidence, 1);
});

test('an empty classifier, or no vector, gives "unknown"', () => {
  const knn = new KNN();
  assert.equal(knn.predict([1, 2]).label, 'unknown');
  knn.add([0, 0], 'a');
  assert.equal(knn.predict(null).label, 'unknown');
  knn.clear();
  assert.equal(knn.size, 0);
});
