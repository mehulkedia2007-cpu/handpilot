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

// Horizontal palm position (0 = left of image, 1 = right) to body turn in radians.
// The centre of the image means facing forward.
export function yawFromPalmX(x) { return (0.5 - x) * 1.6; }
export function palmXFromYaw(yaw) { return 0.5 - yaw / 1.6; }
