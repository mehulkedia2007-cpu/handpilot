// One Euro filter (Casiez, Roussel and Vogel, 2012): a low-pass filter whose
// cutoff frequency rises with speed. A still hand gets a low cutoff, which removes
// jitter. A fast hand gets a high cutoff, which removes lag. Pure maths, no DOM.
import { FINGERS } from './hand.js';

// How much of the new sample to take, for a given cutoff (Hz) and time step (s).
// This is the standard first-order low-pass: a lower cutoff gives a smaller alpha,
// so the output moves less per sample and noise is averaged away.
export function smoothingAlpha(cutoff, dt) {
  const tau = 1 / (2 * Math.PI * cutoff);
  return 1 / (1 + tau / dt);
}

const lowPass = (prev, next, alpha) => prev + alpha * (next - prev);

export class OneEuroFilter {
  // minCutoff: cutoff (Hz) when the signal is still. Lower = steadier but laggier.
  // beta: how fast the cutoff rises with speed. Higher = less lag on fast moves.
  // dCutoff: cutoff for smoothing the speed estimate itself.
  constructor({ minCutoff = 1.0, beta = 0.01, dCutoff = 1.0 } = {}) {
    this.minCutoff = minCutoff; this.beta = beta; this.dCutoff = dCutoff;
    this.reset();
  }

  reset() { this.x = null; this.dx = 0; this.t = null; }

  filter(value, timestampMs) {
    if (!Number.isFinite(value)) return this.x ?? value;   // never let a NaN poison the state
    if (this.x === null) { this.x = value; this.t = timestampMs; return value; }
    const dt = (timestampMs - this.t) / 1000;
    // A repeated (or out-of-order) timestamp carries no new information.
    if (!(dt > 0)) return this.x;
    this.dx = lowPass(this.dx, (value - this.x) / dt, smoothingAlpha(this.dCutoff, dt));
    const cutoff = this.minCutoff + this.beta * Math.abs(this.dx);
    this.x = lowPass(this.x, value, smoothingAlpha(cutoff, dt));
    this.t = timestampMs;
    return this.x;
  }
}

// One filter per number we care about in a HandFrame: each finger bend,
// palm x/y/z and pinch. They are separate because each moves on its own.
const CHANNELS = [...FINGERS, 'palmX', 'palmY', 'palmZ', 'pinch'];

export function createHandFilter(params = {}) {
  const filters = Object.fromEntries(CHANNELS.map((c) => [c, new OneEuroFilter(params)]));
  const resetAll = () => { for (const c of CHANNELS) filters[c].reset(); };

  return {
    // Returns a smoothed copy of the HandFrame. When the hand disappears the
    // filters are reset, so a hand that reappears elsewhere doesn't glide over.
    filter(hf) {
      if (!hf.present) { resetAll(); return hf; }
      const f = (c, v) => filters[c].filter(v, hf.t);
      const bends = {};
      for (const n of FINGERS) bends[n] = f(n, hf.bends[n]);
      const palm = { x: f('palmX', hf.palm.x), y: f('palmY', hf.palm.y), z: f('palmZ', hf.palm.z) };
      const pinch = hf.pinch == null ? hf.pinch : f('pinch', hf.pinch);
      return { ...hf, bends, palm, pinch };
    },
    setParams({ minCutoff, beta }) {
      for (const c of CHANNELS) {
        if (minCutoff != null) filters[c].minCutoff = minCutoff;
        if (beta != null) filters[c].beta = beta;
      }
    },
    reset: resetAll,
  };
}
