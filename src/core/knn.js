// K-nearest neighbours (KNN): the simplest machine-learning classifier there is.
// "Training" just stores labelled examples. To classify a new hand, find the k
// stored examples closest to it and let them vote. No maths to fit, so it learns
// instantly in the browser, which is exactly what a gesture trainer needs.
// Pure logic: vectors in (from normalise() in core/hand.js), labels out.

export const KNN_DEFAULTS = Object.freeze({ k: 5, minConfidence: 0.6, maxDistance: 0.6 });

// Straight-line (Euclidean) distance between two equal-length vectors.
export function distance(a, b) {
  let s = 0;
  for (let i = 0; i < a.length; i++) { const d = a[i] - b[i]; s += d * d; }
  return Math.sqrt(s);
}

export class KNN {
  // k: how many neighbours vote. minConfidence: the share of them that must agree.
  // maxDistance: if even the nearest example is farther than this, the hand is
  // nothing we were taught (normalised units: 1 = the palm's length).
  constructor({ k = KNN_DEFAULTS.k, minConfidence = KNN_DEFAULTS.minConfidence, maxDistance = KNN_DEFAULTS.maxDistance } = {}) {
    this.k = k; this.minConfidence = minConfidence; this.maxDistance = maxDistance;
    this.vectors = []; this.labels = [];
  }

  get size() { return this.vectors.length; }

  add(vector, label) { this.vectors.push(vector); this.labels.push(label); return this; }

  clear() { this.vectors = []; this.labels = []; }

  // Returns { label, confidence, distance, best }. label is "unknown" when the vote
  // is too split or the hand is too far from every example; best is the winning
  // label either way, which the trainer shows as a hint.
  predict(vector) {
    const n = this.vectors.length;
    if (!n || !vector) return { label: 'unknown', confidence: 0, distance: Infinity, best: null };
    // Brute force: measure every example. A few hundred 63-number vectors take
    // well under a millisecond, so a cleverer search isn't worth it here.
    const near = this.vectors.map((v, i) => ({ d: distance(v, vector), label: this.labels[i] }))
      .sort((a, b) => a.d - b.d)
      .slice(0, Math.min(this.k, n));
    const votes = new Map();
    for (const { d, label } of near) {
      const v = votes.get(label) || { count: 0, sum: 0 };
      v.count++; v.sum += d;
      votes.set(label, v);
    }
    // Most votes wins; a tie goes to the label whose voters are closer in total.
    let best = null, top = null;
    for (const [label, v] of votes) {
      if (!top || v.count > top.count || (v.count === top.count && v.sum < top.sum)) { best = label; top = v; }
    }
    const confidence = top.count / near.length;
    const nearest = near[0].d;
    const ok = confidence >= this.minConfidence && nearest <= this.maxDistance;
    return { label: ok ? best : 'unknown', confidence, distance: nearest, best };
  }
}

/* ---------- accuracy report (hold-out test) ---------- */
// Testing a classifier on the examples it learned from would flatter it: each
// one's nearest neighbour is itself. So we hide 20% of each gesture's examples
// (the hold-out set), train on the other 80%, and see how many hidden ones it gets right.

// A small seeded random generator (mulberry32): the same seed gives the same
// numbers, so a split can be repeated and tested.
export function seededRandom(seed) {
  let s = seed | 0;
  return () => {
    s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// examples: [{ vector, label }]. Splits each label separately ("stratified"), so
// every gesture is tested, even one with far fewer examples than the others.
// A label with at least 2 examples puts at least one in the test set.
export function holdoutSplit(examples, { testShare = 0.2, seed = 1 } = {}) {
  const rand = seededRandom(seed);
  const byLabel = new Map();
  for (const ex of examples) {
    if (!byLabel.has(ex.label)) byLabel.set(ex.label, []);
    byLabel.get(ex.label).push(ex);
  }
  const train = [], test = [];
  for (const group of byLabel.values()) {
    const g = group.slice();
    // Fisher–Yates shuffle: every order is equally likely.
    for (let i = g.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [g[i], g[j]] = [g[j], g[i]];
    }
    const nTest = g.length < 2 ? 0 : Math.max(1, Math.round(g.length * testShare));
    test.push(...g.slice(0, nTest));
    train.push(...g.slice(nTest));
  }
  return { train, test };
}

// The maths of the report, from pairs of { actual, predicted } labels.
// confusion[i][j] counts test examples of labels[i] that were predicted as
// columns[j]; the columns are the labels plus "unknown". The diagonal is the right answers.
export function accuracyReport(pairs, labels) {
  const columns = [...labels, 'unknown'];
  const confusion = labels.map(() => columns.map(() => 0));
  for (const { actual, predicted } of pairs) {
    const i = labels.indexOf(actual);
    if (i < 0) continue;
    const j = columns.indexOf(predicted);
    confusion[i][j >= 0 ? j : columns.length - 1]++;
  }
  const perLabel = labels.map((label, i) => {
    const total = confusion[i].reduce((a, b) => a + b, 0), correct = confusion[i][i];
    return { label, correct, total, accuracy: total ? correct / total : null };
  });
  const correct = perLabel.reduce((a, p) => a + p.correct, 0), total = perLabel.reduce((a, p) => a + p.total, 0);
  return { labels, columns, confusion, perLabel, overall: { correct, total, accuracy: total ? correct / total : null } };
}

// Split, train on 80%, predict the 20%, and report.
export function evaluate(examples, knnOptions = {}, splitOptions = {}) {
  const { train, test } = holdoutSplit(examples, splitOptions);
  const knn = new KNN(knnOptions);
  for (const ex of train) knn.add(ex.vector, ex.label);
  const labels = [...new Set(examples.map((ex) => ex.label))];
  const pairs = test.map((ex) => ({ actual: ex.label, predicted: knn.predict(ex.vector).label }));
  return { ...accuracyReport(pairs, labels), trainSize: train.length, testSize: test.length };
}
