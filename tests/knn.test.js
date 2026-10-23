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

/* ---------- P4.5: hold-out split and accuracy ---------- */
import { holdoutSplit, accuracyReport, evaluate, seededRandom } from '../src/core/knn.js';

const labelled = (label, n) => Array.from({ length: n }, (_, i) => ({ vector: [i], label, id: label + i }));

test('the split is 80/20 per gesture, with nothing in both halves', () => {
  const all = [...labelled('a', 30), ...labelled('b', 10), ...labelled('c', 3)];
  const { train, test: held } = holdoutSplit(all, { seed: 4 });
  const count = (list, l) => list.filter((e) => e.label === l).length;
  assert.deepEqual(['a', 'b', 'c'].map((l) => count(held, l)), [6, 2, 1]);
  assert.deepEqual(['a', 'b', 'c'].map((l) => count(train, l)), [24, 8, 2]);
  const ids = new Set(train.map((e) => e.id));
  assert.ok(held.every((e) => !ids.has(e.id)), 'no example is in both');
  assert.equal(train.length + held.length, all.length);
});

test('the split is repeatable with a seed and shuffled', () => {
  const all = labelled('a', 50);
  const a = holdoutSplit(all, { seed: 9 }).test.map((e) => e.id);
  assert.deepEqual(holdoutSplit(all, { seed: 9 }).test.map((e) => e.id), a);
  assert.notDeepEqual(holdoutSplit(all, { seed: 10 }).test.map((e) => e.id), a);
  assert.notDeepEqual(a, all.slice(0, 10).map((e) => e.id), 'not just the first 10');
});

test('a gesture with one example is only trained on', () => {
  const { train, test: held } = holdoutSplit(labelled('solo', 1));
  assert.equal(train.length, 1); assert.equal(held.length, 0);
});

test('accuracy maths: per gesture, overall and the confusion table', () => {
  const pairs = [
    { actual: 'a', predicted: 'a' }, { actual: 'a', predicted: 'a' }, { actual: 'a', predicted: 'b' }, { actual: 'a', predicted: 'unknown' },
    { actual: 'b', predicted: 'b' }, { actual: 'b', predicted: 'b' },
  ];
  const r = accuracyReport(pairs, ['a', 'b', 'c']);
  assert.deepEqual(r.columns, ['a', 'b', 'c', 'unknown']);
  assert.deepEqual(r.confusion, [[2, 1, 0, 1], [0, 2, 0, 0], [0, 0, 0, 0]]);
  assert.deepEqual(r.perLabel.map((p) => [p.label, p.correct, p.total, p.accuracy]), [['a', 2, 4, 0.5], ['b', 2, 2, 1], ['c', 0, 0, null]]);
  assert.deepEqual(r.overall, { correct: 4, total: 6, accuracy: 4 / 6 });
  assert.equal(accuracyReport([], ['a']).overall.accuracy, null);
});

test('evaluate: well-separated clusters score 100%, overlapping ones less', () => {
  const rand = seededRandom(5);
  const blob = (label, c, n, spread) => Array.from({ length: n }, () => ({ vector: c.map((x) => x + (rand() * 2 - 1) * spread), label }));
  const apart = evaluate([...blob('a', [0, 0], 30, 0.3), ...blob('b', [3, 3], 30, 0.3)], { maxDistance: 5 });
  assert.equal(apart.testSize, 12); assert.equal(apart.trainSize, 48);
  assert.equal(apart.overall.accuracy, 1);
  const mixed = evaluate([...blob('a', [0, 0], 40, 1), ...blob('b', [0.3, 0], 40, 1)], { maxDistance: 5 });
  assert.ok(mixed.overall.accuracy < 0.9, `overlap gives ${mixed.overall.accuracy}`);
});
