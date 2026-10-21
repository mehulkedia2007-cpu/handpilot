import { test } from 'node:test';
import assert from 'node:assert/strict';
import { WORKSPACE, DEPTH_RANGE, targetFromPalm } from '../src/core/workspace.js';

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
