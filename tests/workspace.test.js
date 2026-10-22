import { test } from 'node:test';
import assert from 'node:assert/strict';
import { WORKSPACE, DEPTH_RANGE, DEFAULT_GAIN, targetFromPalm } from '../src/core/workspace.js';

const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} vs ${b}`);
const inside = (p) => ['x', 'y', 'z'].every((k) => p[k] >= WORKSPACE[k][0] - 1e-9 && p[k] <= WORKSPACE[k][1] + 1e-9);

test('the centre of the image maps to the middle of the box', () => {
  const mid = (DEPTH_RANGE[0] + DEPTH_RANGE[1]) / 2;
  const p = targetFromPalm({ x: 0.5, y: 0.5, z: mid });
  for (const k of ['x', 'y', 'z']) assert.ok(Math.abs(p[k] - (WORKSPACE[k][0] + WORKSPACE[k][1]) / 2) < 1e-9, k);
});

test('directions: mirrored x, image y flipped, closer hand reaches in', () => {
  // Hand on the left of the raw image = the user's right = right of the mirrored preview.
  near(targetFromPalm({ x: 0, y: 0.5, z: 0.1 }).x, WORKSPACE.x[1]);
  near(targetFromPalm({ x: 0.5, y: 0, z: 0.1 }).y, WORKSPACE.y[1]);   // top of image = high
  near(targetFromPalm({ x: 0.5, y: 0.5, z: DEPTH_RANGE[1] }).z, WORKSPACE.z[0]);   // close to camera
  near(targetFromPalm({ x: 0.5, y: 0.5, z: DEPTH_RANGE[0] }).z, WORKSPACE.z[1]);   // far from camera
});

test('the target never leaves the box, even for wild or missing input', () => {
  const cases = [{ x: -3, y: 9, z: 5 }, { x: 2, y: -1, z: -1 }, { x: NaN, y: Infinity, z: undefined }, {}, null];
  for (const palm of cases) {
    const p = targetFromPalm(palm);
    assert.ok(inside(p), JSON.stringify(palm));
  }
});

test('small hand movements give small target movements (no jumps)', () => {
  let prev = targetFromPalm({ x: 0, y: 0, z: 0.07 });
  for (let i = 1; i <= 100; i++) {
    const p = targetFromPalm({ x: i / 100, y: i / 100, z: 0.07 + 0.0013 * i });
    assert.ok(Math.hypot(p.x - prev.x, p.y - prev.y, p.z - prev.z) < 0.1);
    prev = p;
  }
});

test('sensitivity stretches hand movement around the centre of the image', () => {
  const mid = (DEPTH_RANGE[0] + DEPTH_RANGE[1]) / 2;
  // With the default gain (1.6), a palm about 19% in from the edge of the image already reaches the box edge...
  near(targetFromPalm({ x: 0.18, y: 0.5, z: mid }, undefined, undefined, DEFAULT_GAIN).x, WORKSPACE.x[1]);
  near(targetFromPalm({ x: 0.82, y: 0.5, z: mid }, undefined, undefined, DEFAULT_GAIN).x, WORKSPACE.x[0]);
  near(targetFromPalm({ x: 0.5, y: 0.18, z: mid }, undefined, undefined, DEFAULT_GAIN).y, WORKSPACE.y[1]);
  // ...while gain 1 only gets 60% of the way there.
  near(targetFromPalm({ x: 0.2, y: 0.5, z: mid }).x, WORKSPACE.x[1] * 0.6);
  // The centre stays the centre, and big gains still never leave the box.
  near(targetFromPalm({ x: 0.5, y: 0.5, z: mid }, undefined, undefined, 2.5).x, 0);
  for (const g of [1, 1.6, 2.5, 99, NaN]) {
    for (const palm of [{ x: 0, y: 0, z: 0 }, { x: 1, y: 1, z: 1 }]) assert.ok(inside(targetFromPalm(palm, undefined, undefined, g)));
  }
});
