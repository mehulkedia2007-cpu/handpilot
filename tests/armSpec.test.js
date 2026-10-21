import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ARM, ARM_JOINTS, ARM_LIMITS, defaultArmPose, clampArmPose } from '../src/core/armSpec.js';

test('every joint has a sensible limit range', () => {
  for (const j of ARM_JOINTS) {
    const [lo, hi] = ARM_LIMITS[j];
    assert.ok(Number.isFinite(lo) && Number.isFinite(hi) && lo < hi, j);
  }
  assert.ok(ARM.L1 > 0 && ARM.L2 > 0 && ARM.shoulderHeight > 0);
});

test('the parked pose is inside the limits and keeps the gripper level', () => {
  const p = defaultArmPose();
  assert.deepEqual(clampArmPose(p), p);
  // Gripper angle above horizontal = shoulder - elbow + wrist.
  assert.ok(Math.abs(p.shoulder - p.elbow + p.wrist) < 1e-9);
});

test('clampArmPose pulls out-of-range joints back to their limits', () => {
  const p = clampArmPose({ yaw: 10, shoulder: -5, elbow: 1, wrist: 3, grip: 2 });
  assert.equal(p.yaw, ARM_LIMITS.yaw[1]);
  assert.equal(p.shoulder, ARM_LIMITS.shoulder[0]);
  assert.equal(p.elbow, 1);
  assert.equal(p.wrist, ARM_LIMITS.wrist[1]);
  assert.equal(p.grip, 1);
});

test('clampArmPose never returns NaN for bad input', () => {
  const park = defaultArmPose();
  for (const bad of [null, undefined, {}, { yaw: NaN, elbow: 'x', grip: Infinity }]) {
    const p = clampArmPose(bad);
    for (const j of ARM_JOINTS) assert.ok(Number.isFinite(p[j]), `${j} for ${JSON.stringify(bad)}`);
  }
  assert.deepEqual(clampArmPose({}), park);
});

test('clampArmPose does not change its input', () => {
  const p = { yaw: 9, shoulder: 0, elbow: 0, wrist: 0, grip: 0 };
  clampArmPose(p);
  assert.equal(p.yaw, 9);
});
