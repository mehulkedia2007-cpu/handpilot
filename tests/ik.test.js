import { test } from 'node:test';
import assert from 'node:assert/strict';
import { solveIK, forwardKinematics } from '../src/core/ik.js';
import { ARM, ARM_LIMITS } from '../src/core/armSpec.js';

const gap = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
const inLimits = (s) => ['yaw', 'shoulder', 'elbow', 'wrist'].every((j) => s[j] >= ARM_LIMITS[j][0] && s[j] <= ARM_LIMITS[j][1]);

const REACHABLE = [
  { x: 0, y: 1.5, z: 2 }, { x: 1, y: 1, z: 1.5 }, { x: -1, y: 2, z: 1.8 }, { x: 0.5, y: 0.4, z: 1.6 },
  { x: -1.4, y: 0.6, z: 1.2 }, { x: 1.5, y: 2.3, z: 2.2 }, { x: 0, y: 2.4, z: 1.3 }, { x: -0.3, y: 1.1, z: 2.3 },
  { x: 2, y: 1, z: -0.5 }, { x: 0.2, y: 0.3, z: 2.4 }, { x: -2, y: 1.8, z: 1 }, { x: 1.2, y: 1.6, z: 0.9 },
];

test('FK(IK(t)) lands on t for reachable targets', () => {
  for (const t of REACHABLE) {
    const s = solveIK(t);
    assert.equal(s.reachable, true, JSON.stringify(t));
    assert.ok(inLimits(s), JSON.stringify(t));
    assert.ok(gap(forwardKinematics(s), t) < 1e-6, `${JSON.stringify(t)} off by ${gap(forwardKinematics(s), t)}`);
  }
});

test('the gripper stays level for reachable targets', () => {
  for (const t of REACHABLE) {
    const s = solveIK(t);
    assert.ok(Math.abs(s.shoulder - s.elbow + s.wrist) < 1e-9);
  }
});

test('a target too far away is unreachable and the arm points at it', () => {
  const t = { x: 3, y: 4, z: 5 };
  const s = solveIK(t);
  assert.equal(s.reachable, false);
  assert.ok(Math.abs(s.yaw - Math.atan2(t.x, t.z)) < 1e-9);
  // Stretched out: the elbow is (almost) straight and the shoulder aims at the target's wrist point.
  assert.ok(s.elbow < 0.01);
  const r = Math.hypot(t.x, t.z) - ARM.tool, h = t.y - ARM.shoulderHeight;
  assert.ok(Math.abs(s.shoulder - Math.atan2(h, r)) < 0.01);
});

test('targets the joints cannot reach are flagged, not faked', () => {
  // Straight behind the base: the yaw limit stops it turning that far.
  assert.equal(solveIK({ x: 0, y: 1, z: -2 }).reachable, false);
  // Right next to the shoulder: the elbow cannot fold that tight.
  assert.equal(solveIK({ x: 0, y: 1.1, z: 0.55 }).reachable, false);
});

test('no NaN for any input', () => {
  const inputs = [
    null, undefined, {}, { x: NaN, y: NaN, z: NaN }, { x: Infinity, y: -Infinity, z: 1 },
    { x: 0, y: 0, z: 0 }, { x: 0, y: ARM.shoulderHeight, z: ARM.tool }, { x: 1e9, y: -1e9, z: 1e9 }, { x: '1', y: 2, z: 3 },
  ];
  for (const t of inputs) {
    const s = solveIK(t);
    for (const j of ['yaw', 'shoulder', 'elbow', 'wrist']) assert.ok(Number.isFinite(s[j]), `${j} for ${JSON.stringify(t)}`);
    assert.ok(inLimits(s));
  }
  assert.equal(solveIK({ x: NaN, y: 1, z: 1 }).reachable, false);
});

test('random targets never give NaN or break the limits', () => {
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 10 - 5;
  for (let i = 0; i < 2000; i++) {
    const t = { x: rnd(), y: rnd(), z: rnd() };
    const s = solveIK(t);
    assert.ok(inLimits(s));
    if (s.reachable) assert.ok(gap(forwardKinematics(s), t) < 1e-6);
  }
});
