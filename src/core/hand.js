// Hand maths: turn 21 landmark points into five finger-bend numbers.
// Pure functions only (no DOM, no camera), so they can be tested in Node.

export const FINGERS = ['thumb', 'index', 'middle', 'ring', 'pinky'];

export function clamp(v, a, b) { return Math.min(b, Math.max(a, v)); }
export function lerp(a, b, t) { return a + (b - a) * t; }
export function dist(a, b) { return Math.hypot(a.x - b.x, a.y - b.y, (a.z || 0) - (b.z || 0)); }

// "open" and "closed" are the raw ratios for a straight and a fully curled finger.
// They are estimates; the Set open hand / Set fist buttons replace them with your own hand.
export const DEFAULT_CAL = Object.freeze({
  open:   Object.freeze({ thumb: 1.9, index: 1.75, middle: 1.75, ring: 1.75, pinky: 1.7 }),
  closed: Object.freeze({ thumb: 0.7, index: 0.9,  middle: 0.9,  ring: 0.9,  pinky: 0.85 }),
});

export function copyCal(cal) { return JSON.parse(JSON.stringify(cal)); }

// Ratios do not depend on hand size or distance from the camera.
// Fingers: fingertip-to-wrist distance divided by knuckle-to-wrist distance.
// Thumb: thumb tip to pinky knuckle, divided by palm width.
export function fingerRatios(lm) {
  const wrist = lm[0];
  const palm = dist(lm[5], lm[17]);
  const r = { thumb: dist(lm[4], lm[17]) / palm };
  for (const [name, tip, knuckle] of [['index', 8, 5], ['middle', 12, 9], ['ring', 16, 13], ['pinky', 20, 17]]) {
    r[name] = dist(lm[tip], wrist) / dist(lm[knuckle], wrist);
  }
  return r;
}

// Map a raw ratio onto 0 (straight) .. 1 (curled) using this hand's calibration.
export function bendFromRatio(name, ratio, cal) {
  const o = cal.open[name], c = cal.closed[name];
  return clamp((o - ratio) / (o - c), 0, 1);
}

export function bendsFromRatios(r, cal) {
  const b = {};
  for (const n of FINGERS) b[n] = bendFromRatio(n, r[n], cal);
  return b;
}

// A calibration is only usable if every finger's open and closed readings are far apart,
// otherwise tiny noise would swing the bend between 0 and 1.
export function isUsableCal(cal, minGap = 0.25) {
  return FINGERS.every((n) => cal.open[n] - cal.closed[n] > minGap);
}

// Hand sensitivity: stretch a 0–1 image coordinate around the centre of the image,
// then clamp. Your hand leaves the frame before the palm point reaches the image edge,
// so a gain above 1 lets a comfortable movement cover the whole range, like mouse sensitivity.
export function stretch(v, gain = 1) {
  return clamp(0.5 + (v - 0.5) * (Number.isFinite(gain) ? gain : 1), 0, 1);
}

// Horizontal palm position (0 = left of image, 1 = right) to body turn in radians.
// The centre of the image means facing forward.
export function yawFromPalmX(x) { return (0.5 - x) * 1.6; }
export function palmXFromYaw(yaw) { return 0.5 - yaw / 1.6; }

// Palm position for a HandFrame. x and y come from the middle-finger knuckle (point 9),
// which sits near the centre of the palm and moves less than the fingertips.
// z is the palm's width in the image: a hand closer to the camera looks wider,
// so it is a cheap stand-in for depth (bigger = closer, roughly 0.05 to 0.3).
export function palmFromLandmarks(lm) {
  return { x: lm[9].x, y: lm[9].y, z: Math.hypot(lm[5].x - lm[17].x, lm[5].y - lm[17].y) };
}

// Thumb tip to index tip, divided by palm width so it doesn't depend on hand size.
// About 0 when the tips touch, above 1 when the hand is open.
export function pinchFromLandmarks(lm) {
  return dist(lm[4], lm[8]) / dist(lm[5], lm[17]);
}

// Turn 21 landmarks into a list of numbers that describes the hand's *shape*,
// not where it is or how big it looks, for the KNN gesture trainer (core/knn.js):
//  1. subtract the wrist (point 0), so position in the picture doesn't matter;
//  2. divide by the palm's length (wrist to middle knuckle, 0 -> 9), so size and
//     distance from the camera don't matter;
//  3. optionally rotate so 0 -> 9 points straight up, so tilting the hand doesn't
//     matter. Off by default: it would also make thumbs up and thumbs down look the same;
//  4. optionally mirror x, so a left hand matches a right hand trained earlier;
//  5. flatten to 63 numbers (x, y, z per point), or 42 without z.
// Returns null if the points are missing or squashed into one spot.
export function normalise(lm, { rotate = false, mirror = false, dropZ = false } = {}) {
  if (!lm || lm.length !== 21) return null;
  const w = lm[0], size = dist(w, lm[9]);
  if (!(size > 1e-6)) return null;
  const pts = lm.map((p) => ({ x: (mirror ? -1 : 1) * (p.x - w.x) / size, y: (p.y - w.y) / size, z: ((p.z || 0) - (w.z || 0)) / size }));
  if (rotate) {
    // Image y grows downward, so "up" is the angle of (0, -1): -90 degrees.
    const a = -Math.PI / 2 - Math.atan2(pts[9].y, pts[9].x);
    const c = Math.cos(a), s = Math.sin(a);
    for (const p of pts) [p.x, p.y] = [p.x * c - p.y * s, p.x * s + p.y * c];
  }
  const out = [];
  for (const p of pts) dropZ ? out.push(p.x, p.y) : out.push(p.x, p.y, p.z);
  return out;
}

// A simple made-up hand for the simulator, so features that need landmarks
// (the gesture trainer) also work without a camera. Units are palm lengths:
// the wrist is at 0,0 and image y grows downward. Fingers curl toward the camera
// (negative z) by an angle set by their bend; the thumb swings across the palm.
const SIM_FINGERS = [
  // [knuckle point index, knuckle x, knuckle y, three bone lengths]
  [5, 0.32, -0.92, [0.38, 0.22, 0.18]],    // index
  [9, 0.06, -1.0, [0.42, 0.26, 0.2]],      // middle
  [13, -0.18, -0.95, [0.4, 0.24, 0.19]],   // ring
  [17, -0.4, -0.84, [0.3, 0.18, 0.16]],    // pinky
];
const FLEX = [80, 100, 70].map((d) => d * Math.PI / 180);   // how far each joint bends when fully curled
const SIM_PALM_WIDTH = Math.hypot(0.32 + 0.4, -0.92 + 0.84);   // distance 5 -> 17 in this model

// bends: the five 0–1 bends; palm: {x, y, z} as in a HandFrame (z = palm width in the image).
export function simHandLandmarks(bends, palm) {
  const p = new Array(21);
  p[0] = { x: 0, y: 0, z: 0 };
  p[1] = { x: 0.22, y: -0.12, z: 0 };
  p[2] = { x: 0.42, y: -0.32, z: 0 };
  // Thumb: two bones that swing from pointing up-right to across the palm.
  let a = Math.atan2(-0.78, 0.62), q = p[2];
  for (const [i, len, turn] of [[3, 0.28, 0.95], [4, 0.24, 1.9]]) {
    const ang = a - turn * bends.thumb;
    q = { x: q.x + len * Math.cos(ang), y: q.y + len * Math.sin(ang), z: 0 };
    p[i] = q;
  }
  FINGERS.slice(1).forEach((name, f) => {
    const [k, kx, ky, bones] = SIM_FINGERS[f];
    let pt = { x: kx, y: ky, z: 0 }, phi = 0;
    p[k] = pt;
    bones.forEach((len, j) => {
      phi += FLEX[j] * bends[name];
      pt = { x: pt.x, y: pt.y - len * Math.cos(phi), z: pt.z - len * Math.sin(phi) };
      p[k + j + 1] = pt;
    });
  });
  // Scale to the palm's size in the image and put the middle knuckle (point 9) at palm x, y.
  const s = (palm.z > 0 ? palm.z : 0.15) / SIM_PALM_WIDTH;
  const ox = palm.x - p[9].x * s, oy = palm.y - p[9].y * s;
  return p.map((pt) => ({ x: ox + pt.x * s, y: oy + pt.y * s, z: pt.z * s }));
}
