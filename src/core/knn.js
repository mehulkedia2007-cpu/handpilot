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
