import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  FINGERS, clamp, lerp, dist, DEFAULT_CAL, copyCal, fingerRatios, bendFromRatio,
  bendsFromRatios, isUsableCal, yawFromPalmX, palmXFromYaw, stretch, palmFromLandmarks, pinchFromLandmarks,
} from '../src/core/hand.js';

// A fake hand: 21 points where we choose the wrist, knuckles and fingertips.
// Only points 0, 4, 5, 8, 9, 12, 13, 16, 17, 20 matter for fingerRatios.
function makeHand({ scale = 1, dx = 0, dy = 0, curl = 0 } = {}) {
  const lm = Array.from({ length: 21 }, () => ({ x: 0, y: 0, z: 0 }));
  const put = (i, x, y) => { lm[i] = { x: dx + x * scale, y: dy + y * scale, z: 0 }; };
  put(0, 0, 0);                                  // wrist
  const knuckles = { 5: -0.3, 9: -0.1, 13: 0.1, 17: 0.3 };
  for (const [i, x] of Object.entries(knuckles)) put(Number(i), x, -1);
  // Straight fingertips sit 1.75x as far from the wrist as their knuckle; curled ones 0.9x.
  const reach = lerp(1.75, 0.9, curl);
  for (const [tip, k] of [[8, 5], [12, 9], [16, 13], [20, 17]]) put(tip, knuckles[k] * reach, -reach);
  // Thumb tip, level with the knuckles: palm width is 0.6, so it sits 1.9 x 0.6 from
  // the pinky knuckle when open and 0.7 x 0.6 when curled (the default calibration).
  put(4, lerp(0.3 - 1.14, 0.3 - 0.42, curl), -1);
  return lm;
}

test('clamp, lerp and dist do the basics', () => {
  assert.equal(clamp(5, 0, 1), 1);
  assert.equal(clamp(-5, 0, 1), 0);
  assert.equal(lerp(0, 10, 0.25), 2.5);
  assert.equal(dist({ x: 0, y: 0 }, { x: 3, y: 4 }), 5);
  assert.equal(dist({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 2 }), 2);
});

test('finger ratios do not change with hand size or position', () => {
  const a = fingerRatios(makeHand());
  const b = fingerRatios(makeHand({ scale: 0.3, dx: 0.6, dy: 0.8 }));
  for (const n of FINGERS) assert.ok(Math.abs(a[n] - b[n]) < 1e-9, n);
});

test('an open hand reads near 0 bend and a curled hand near 1', () => {
  const open = bendsFromRatios(fingerRatios(makeHand({ curl: 0 })), DEFAULT_CAL);
  const fist = bendsFromRatios(fingerRatios(makeHand({ curl: 1 })), DEFAULT_CAL);
  for (const n of FINGERS) {
    assert.ok(open[n] < 0.1, `${n} open = ${open[n]}`);
    assert.ok(fist[n] > 0.9, `${n} fist = ${fist[n]}`);
  }
});

test('bend is linear between calibration points and clamped outside them', () => {
  const o = DEFAULT_CAL.open.index, c = DEFAULT_CAL.closed.index;
  assert.equal(bendFromRatio('index', o, DEFAULT_CAL), 0);
  assert.equal(bendFromRatio('index', c, DEFAULT_CAL), 1);
  assert.ok(Math.abs(bendFromRatio('index', (o + c) / 2, DEFAULT_CAL) - 0.5) < 1e-9);
  assert.equal(bendFromRatio('index', o + 1, DEFAULT_CAL), 0);
  assert.equal(bendFromRatio('index', c - 1, DEFAULT_CAL), 1);
});

test('a calibration with open and closed too close together is rejected', () => {
  assert.ok(isUsableCal(DEFAULT_CAL));
  const bad = copyCal(DEFAULT_CAL);
  bad.closed.middle = bad.open.middle - 0.1;
  assert.equal(isUsableCal(bad), false);
});

test('copyCal returns an independent copy', () => {
  const c = copyCal(DEFAULT_CAL);
  c.open.thumb = 99;
  assert.notEqual(DEFAULT_CAL.open.thumb, 99);
});

test('palm x and yaw convert back and forth; centre faces forward', () => {
  assert.equal(yawFromPalmX(0.5), 0);
  assert.ok(yawFromPalmX(0.2) > 0);
  for (const yaw of [-0.8, -0.3, 0, 0.4, 0.8]) assert.ok(Math.abs(yawFromPalmX(palmXFromYaw(yaw)) - yaw) < 1e-12);
});

test('palm position comes from the middle knuckle, and z grows as the hand gets bigger', () => {
  const near = palmFromLandmarks(makeHand({ scale: 0.3, dx: 0.5, dy: 0.8 }));
  const far = palmFromLandmarks(makeHand({ scale: 0.1, dx: 0.5, dy: 0.8 }));
  assert.ok(Math.abs(near.x - (0.5 - 0.1 * 0.3)) < 1e-9);
  assert.ok(Math.abs(near.y - (0.8 - 0.3)) < 1e-9);
  assert.ok(near.z > far.z, `near ${near.z} should be wider than far ${far.z}`);
});

test('pinch is small when thumb and index tips touch, and does not depend on hand size', () => {
  const lm = makeHand({ curl: 0 });
  const open = pinchFromLandmarks(lm);
  lm[4] = { ...lm[8] };                     // thumb tip on the index tip
  assert.ok(pinchFromLandmarks(lm) < 1e-9);
  assert.ok(open > 0.5);
  const small = pinchFromLandmarks(makeHand({ curl: 0, scale: 0.2 }));
  assert.ok(Math.abs(small - open) < 1e-9);
});

test('stretch spreads movement around the centre and clamps at the edges', () => {
  assert.equal(stretch(0.5, 2), 0.5);
  assert.ok(Math.abs(stretch(0.3, 1.5) - 0.2) < 1e-12);
  assert.equal(stretch(0.1, 2), 0);
  assert.equal(stretch(0.95, 2), 1);
  assert.equal(stretch(0.3), 0.3);          // gain 1 changes nothing
  assert.equal(stretch(0.3, NaN), 0.3);
  // With the default 1.6, the humanoid reaches its full turn about 19% in from the image edge.
  assert.ok(Math.abs(yawFromPalmX(stretch(0.1875, 1.6)) - 0.8) < 1e-12);
});

/* ---------- P4.3: normalise ---------- */
import { normalise, simHandLandmarks } from '../src/core/hand.js';

const OPEN5 = { thumb: 0, index: 0, middle: 0, ring: 0, pinky: 0 };
const PEACE5 = { thumb: 1, index: 0, middle: 0, ring: 1, pinky: 1 };
const handAt = (b, x = 0.5, y = 0.5, size = 0.15) => simHandLandmarks(b, { x, y, z: size });
// Turn every point around (cx, cy) by `deg` degrees in the image plane.
const turn = (lm, deg, cx = 0.5, cy = 0.5) => {
  const a = deg * Math.PI / 180, c = Math.cos(a), s = Math.sin(a);
  return lm.map((p) => ({ x: cx + (p.x - cx) * c - (p.y - cy) * s, y: cy + (p.x - cx) * s + (p.y - cy) * c, z: p.z }));
};
const gap = (a, b) => Math.hypot(...a.map((v, i) => v - b[i]));

test('normalise: 63 numbers, or 42 without z, starting at the wrist (0, 0, 0)', () => {
  const v = normalise(handAt(OPEN5));
  assert.equal(v.length, 63);
  assert.deepEqual(v.slice(0, 3).map((n) => Math.abs(n)), [0, 0, 0]);
  assert.equal(normalise(handAt(OPEN5), { dropZ: true }).length, 42);
});

test('normalise: the same shape at a different size and place gives the same vector', () => {
  const a = normalise(handAt(PEACE5, 0.3, 0.4, 0.08));
  const b = normalise(handAt(PEACE5, 0.7, 0.6, 0.28));
  assert.ok(gap(a, b) < 1e-9, `gap ${gap(a, b)}`);
});

test('normalise: the wrist-to-middle-knuckle length is 1', () => {
  const v = normalise(handAt(OPEN5, 0.2, 0.8, 0.25));
  assert.ok(Math.abs(Math.hypot(v[27], v[28], v[29]) - 1) < 1e-9);   // point 9 is numbers 27..29
});

test('normalise with rotate: a tilted hand matches the upright one', () => {
  const up = handAt(PEACE5);
  const tilted = turn(up, 35);
  assert.ok(gap(normalise(up), normalise(tilted)) > 0.5, 'without rotate, tilt matters');
  assert.ok(gap(normalise(up, { rotate: true }), normalise(tilted, { rotate: true })) < 1e-9);
  // After rotating, point 9 points straight up: (0, -1).
  const r = normalise(tilted, { rotate: true });
  assert.ok(Math.abs(r[27]) < 1e-9 && Math.abs(r[28] + 1) < 1e-9);
});

test('normalise with mirror: a left hand matches the mirrored right hand', () => {
  const right = handAt(PEACE5);
  const left = right.map((p) => ({ ...p, x: 1 - p.x }));
  assert.ok(gap(normalise(right), normalise(left, { mirror: true })) < 1e-9);
});

test('normalise: different shapes stay far apart', () => {
  const d = gap(normalise(handAt(OPEN5)), normalise(handAt(PEACE5)));
  assert.ok(d > 0.5, `open vs peace ${d}`);
});

test('normalise: bad input gives null instead of NaNs', () => {
  assert.equal(normalise(null), null);
  assert.equal(normalise([{ x: 0, y: 0, z: 0 }]), null);
  assert.equal(normalise(Array.from({ length: 21 }, () => ({ x: 0.5, y: 0.5, z: 0 }))), null);
});

test('the simulator hand has 21 finite points with point 9 on the palm', () => {
  const lm = handAt({ thumb: 0.5, index: 0.8, middle: 0.8, ring: 0.8, pinky: 0.8 }, 0.4, 0.6, 0.2);
  assert.equal(lm.length, 21);
  assert.ok(lm.every((p) => [p.x, p.y, p.z].every(Number.isFinite)));
  assert.ok(Math.abs(lm[9].x - 0.4) < 1e-9 && Math.abs(lm[9].y - 0.6) < 1e-9);
  assert.ok(Math.abs(Math.hypot(lm[5].x - lm[17].x, lm[5].y - lm[17].y) - 0.2) < 1e-9, 'palm width matches palm.z');
});
