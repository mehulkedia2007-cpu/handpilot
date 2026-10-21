import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  FINGERS, clamp, lerp, dist, DEFAULT_CAL, copyCal, fingerRatios, bendFromRatio,
  bendsFromRatios, isUsableCal, yawFromPalmX, palmXFromYaw, palmFromLandmarks, pinchFromLandmarks,
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
