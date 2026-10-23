import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRecorder, sampleAt, replayFrame, motionDuration, pickJoints, nextName, newMotionId, JOINT_KEYS } from '../src/core/motion.js';

const arm = (yaw, grip = 0) => ({ yaw, shoulder: 0.5, elbow: 1, wrist: -0.5, grip });
// Three samples: yaw 0 at t=0, 1 at t=100, 3 at t=200.
const MOTION = { robot: 'arm', samples: [{ t: 0, joints: arm(0) }, { t: 100, joints: arm(1, 1) }, { t: 200, joints: arm(3, 1) }] };
const close = (a, b, msg) => assert.ok(Math.abs(a - b) < 1e-9, `${msg}: ${a} vs ${b}`);

test('interpolation at a sample returns that sample exactly', () => {
  assert.deepEqual(sampleAt(MOTION, 0), arm(0));
  assert.deepEqual(sampleAt(MOTION, 100), arm(1, 1));
  assert.deepEqual(sampleAt(MOTION, 200), arm(3, 1));
});

test('interpolation between samples is a straight line', () => {
  close(sampleAt(MOTION, 50).yaw, 0.5, 'halfway 0..1');
  close(sampleAt(MOTION, 50).grip, 0.5, 'grip too');
  close(sampleAt(MOTION, 25).yaw, 0.25, 'a quarter of the way');
  close(sampleAt(MOTION, 150).yaw, 2, 'halfway 1..3');
  close(sampleAt(MOTION, 150).shoulder, 0.5, 'a joint that never moves stays put');
});

test('before the start and beyond the end it holds the first and last pose', () => {
  assert.deepEqual(sampleAt(MOTION, -50), arm(0));
  assert.deepEqual(sampleAt(MOTION, 999), arm(3, 1));
});

test('the result is a copy, so changing it never edits the motion', () => {
  sampleAt(MOTION, 0).yaw = 42;
  assert.equal(MOTION.samples[0].joints.yaw, 0);
});

test('binary search finds the right pair in a long motion', () => {
  const long = { samples: Array.from({ length: 1800 }, (_, i) => ({ t: i * 33, joints: { x: i } })) };
  close(sampleAt(long, 33 * 1000 + 16.5).x, 1000.5, 'between 1000 and 1001');
});

test('replay speed: 2x reaches the end in half the time, 0.5x in double', () => {
  assert.equal(motionDuration(MOTION), 200);
  close(replayFrame(MOTION, 50, 2).joints.yaw, 1, '2x at 50 ms is t=100');
  close(replayFrame(MOTION, 100, 0.5).joints.yaw, 0.5, '0.5x at 100 ms is t=50');
  assert.equal(replayFrame(MOTION, 99, 2).done, false);
  assert.equal(replayFrame(MOTION, 100, 2).done, true);
  assert.equal(replayFrame(MOTION, 399, 0.5).done, false);
  assert.equal(replayFrame(MOTION, 400, 0.5).done, true);
});

test('the recorder keeps about 30 samples a second at any frame rate', () => {
  for (const fps of [60, 144, 30]) {
    const r = createRecorder();
    r.start(1000, 'arm');
    for (let now = 1000; now <= 2000; now += 1000 / fps) r.sample(now, arm(now));
    const m = r.stop();
    assert.ok(m.samples.length >= 29 && m.samples.length <= 31, `${fps} fps -> ${m.samples.length} samples`);
    assert.equal(m.samples[0].t, 0);   // times start at zero
    assert.equal(m.robot, 'arm');
  }
});

test('the recorder keeps only the robot\'s joints, rounded', () => {
  const r = createRecorder();
  r.start(0, 'humanoid');
  const pose = { rS: 1.234567, rE: 0, lS: 0, lE: 0, head: 0, yaw: 0, bob: 0, extra: 5 };
  r.sample(0, pose); r.sample(40, pose);
  const m = r.stop();
  assert.deepEqual(Object.keys(m.samples[0].joints), JOINT_KEYS.humanoid);
  assert.equal(m.samples[0].joints.rS, 1.2346);
  assert.deepEqual(pickJoints('arm', arm(0.123456)), arm(0.1235));
});

test('the recorder stops at the time limit, and a too-short recording is dropped', () => {
  const r = createRecorder(30, 1000);
  r.start(0, 'arm');
  assert.equal(r.sample(0, arm(0)), true);
  assert.equal(r.sample(1001, arm(0)), false);
  const short = createRecorder();
  short.start(0, 'arm'); short.sample(0, arm(0));
  assert.equal(short.stop(), null);
  assert.equal(short.recording, false);
});

test('default names skip the ones already taken', () => {
  assert.equal(nextName([]), 'Motion 1');
  assert.equal(nextName(['Motion 1', 'motion 2', 'Wave']), 'Motion 3');
});

test('motion ids are short and repeatable with a fixed random source', () => {
  const id = newMotionId(() => 0.5, 1700000000000);
  assert.equal(id, newMotionId(() => 0.5, 1700000000000));
  assert.match(id, /^m[0-9a-z]{8,}$/);
});
