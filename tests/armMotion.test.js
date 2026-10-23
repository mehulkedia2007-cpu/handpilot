import { test } from 'node:test';
import assert from 'node:assert/strict';
import { armGoalFor, autoPath, AUTO_PATH, AUTO_PERIOD, ARM_MODE_DESC, ARM_ACT_TEXT } from '../src/core/armMotion.js';
import { defaultArmPose, ARM_JOINTS } from '../src/core/armSpec.js';
import { forwardKinematics } from '../src/core/ik.js';
import { MODES } from '../src/core/agent.js';

const gap = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
const finitePose = (p) => ARM_JOINTS.every((j) => Number.isFinite(p[j]));

test('HOLD keeps the arm where it is', () => {
  assert.equal(armGoalFor('HOLD', 1, { target: { x: 0, y: 1, z: 2 }, closed: false }), null);
});

test('IDLE parks the arm', () => {
  assert.deepEqual(armGoalFor('IDLE', 5, {}).pose, defaultArmPose());
});

test('MANUAL follows the hand target and the pinch', () => {
  const target = { x: 0.5, y: 1.2, z: 1.8 };
  const open = armGoalFor('MANUAL', 0, { target, closed: false });
  assert.ok(open.reachable);
  assert.ok(gap(forwardKinematics(open.pose), target) < 1e-6);
  assert.equal(open.pose.grip, 0);
  assert.equal(armGoalFor('MANUAL', 0, { target, closed: true }).pose.grip, 1);
});

test('MANUAL with no hand waits in place', () => {
  assert.equal(armGoalFor('MANUAL', 0, { target: null, closed: false }), null);
});

test('the AUTO path is reachable everywhere and grips while carrying', () => {
  for (let t = 0; t < AUTO_PERIOD; t += 0.05) {
    const g = armGoalFor('AUTO', t);
    assert.ok(g.reachable, `t=${t.toFixed(2)}`);
    assert.ok(gap(forwardKinematics(g.pose), g.target) < 1e-6);
  }
  // Closed while moving from A to B, open when starting and when done.
  assert.equal(autoPath(4.2).grip, 1);
  assert.equal(autoPath(0.5).grip, 0);
  assert.equal(autoPath(7.8).grip, 0);
});

test('the AUTO path passes through its keys and loops smoothly', () => {
  for (const k of AUTO_PATH.slice(0, -1)) assert.ok(gap(autoPath(k.t).target, k.p) < 1e-9);
  assert.ok(gap(autoPath(0).target, autoPath(AUTO_PERIOD).target) < 1e-9);
  // No big jumps between frames at 60 fps.
  let prev = autoPath(0).target;
  for (let t = 1 / 60; t < AUTO_PERIOD * 2; t += 1 / 60) {
    const p = autoPath(t).target;
    assert.ok(gap(p, prev) < 0.06, `t=${t.toFixed(2)}`);
    prev = p;
  }
});

test('every mode gives a finite pose (or null for HOLD and REPLAY), even with bad time', () => {
  for (const mode of MODES) {
    for (const t of [0, 1.7, 100, NaN, -3]) {
      const g = armGoalFor(mode, t, { target: { x: 0, y: 1.2, z: 1.6 }, closed: false });
      if (mode === 'HOLD' || mode === 'REPLAY') assert.equal(g, null);
      else assert.ok(finitePose(g.pose), `${mode} t=${t}`);
    }
  }
});

test('every mode has arm wording for the HUD and log', () => {
  for (const mode of MODES) {
    assert.ok(ARM_MODE_DESC[mode], mode);
    assert.ok(ARM_ACT_TEXT[mode], mode);
  }
});
