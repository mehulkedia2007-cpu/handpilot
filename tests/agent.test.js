import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Agent, poseFor, blendPose, smoothingAlpha } from '../src/core/agent.js';

// The agent never reads a real clock; we pass the time in. This helper feeds it
// the same observation every `dt` ms for `ms` milliseconds, like frames at ~60 fps.
function makeAgent() {
  const log = [];
  const agent = new Agent((tag, text) => log.push(`${tag}: ${text}`), 0);
  let now = 0;
  const run = (obs, ms, dt = 16) => {
    let st;
    const end = now + ms;
    while (now < end) { now += dt; st = agent.step(now, obs); }
    return st;
  };
  return { agent, log, run, get now() { return now; } };
}
const show = (gesture) => ({ hand: true, gesture });
const NO_HAND = { hand: false, gesture: 'NONE' };

test('starts in MANUAL', () => {
  const { agent } = makeAgent();
  assert.equal(agent.mode, 'MANUAL');
});

test('a fist held for about a second switches to HOLD', () => {
  const { run } = makeAgent();
  run(show('NONE'), 100);
  assert.equal(run(show('FIST'), 600).mode, 'MANUAL');   // not held long enough yet
  assert.equal(run(show('FIST'), 600).mode, 'HOLD');
});

test('progress rises while a command gesture is held', () => {
  const { run } = makeAgent();
  run(show('NONE'), 100);
  const st = run(show('FIST'), 500);
  assert.equal(st.candidate, 'FIST');
  assert.ok(st.progress > 0.2 && st.progress < 0.9, `progress ${st.progress}`);
});

test('a quick flash of a gesture does not fire a command', () => {
  const { run } = makeAgent();
  run(show('NONE'), 100);
  run(show('FIST'), 200);
  assert.equal(run(show('NONE'), 2000).mode, 'MANUAL');
});

test('a short flicker inside the grace window does not reset the hold', () => {
  const { run } = makeAgent();
  run(show('NONE'), 100);
  run(show('FIST'), 500);
  run(show('NONE'), 100);   // shorter than graceMs (250)
  assert.equal(run(show('FIST'), 450).mode, 'HOLD');
});

test('open palm returns from HOLD to MANUAL', () => {
  const { run } = makeAgent();
  run(show('FIST'), 1200);
  assert.equal(run(show('OPEN'), 1500).mode, 'MANUAL');
});

test('peace toggles AUTO on and off, but only once per hold', () => {
  const { run } = makeAgent();
  run(show('NONE'), 100);
  assert.equal(run(show('PEACE'), 1200).mode, 'AUTO');
  // Still holding: must not toggle straight back.
  assert.equal(run(show('PEACE'), 3000).mode, 'AUTO');
  run(show('NONE'), 500);
  assert.equal(run(show('PEACE'), 1200).mode, 'MANUAL');
});

test('thumbs up greets for 3 s then returns to MANUAL by itself', () => {
  const { run } = makeAgent();
  run(show('NONE'), 100);
  assert.equal(run(show('THUMBS_UP'), 1200).mode, 'GREET');
  assert.equal(run(show('NONE'), 2000).mode, 'GREET');
  assert.equal(run(show('NONE'), 1500).mode, 'MANUAL');
});

test('point is not a command', () => {
  const { run } = makeAgent();
  const st = run(show('POINT'), 3000);
  assert.equal(st.mode, 'MANUAL');
  assert.equal(st.progress, 0);
});

test('no hand for 3 s goes IDLE, and the hand coming back resumes MANUAL', () => {
  const { run, log } = makeAgent();
  run(show('NONE'), 100);
  assert.equal(run(NO_HAND, 2500).mode, 'MANUAL');
  assert.equal(run(NO_HAND, 1000).mode, 'IDLE');
  assert.equal(run(show('NONE'), 50).mode, 'MANUAL');
  assert.ok(log.includes('SEE: hand lost'));
  assert.ok(log.includes('DECIDE: hand is back, resume following'));
});

test('HOLD does not go IDLE when the hand leaves', () => {
  const { run } = makeAgent();
  run(show('FIST'), 1200);
  assert.equal(run(NO_HAND, 5000).mode, 'HOLD');
});

test('every mode change is logged as DECIDE then ACT', () => {
  const { run, log } = makeAgent();
  run(show('NONE'), 100);
  run(show('FIST'), 1200);
  const i = log.indexOf('DECIDE: fist held, latch HOLD');
  assert.ok(i >= 0);
  assert.equal(log[i + 1], 'ACT: freeze every joint at its current angle');
});

/* ---------- pose mapping ---------- */

const KEYS = ['rS', 'rE', 'lS', 'lE', 'head', 'yaw', 'bob'];
const bends = (v) => ({ thumb: v, index: v, middle: v, ring: v, pinky: v });

test('MANUAL maps each finger to one joint', () => {
  const open = poseFor('MANUAL', 0, bends(0), 0.3);
  assert.equal(open.rS, 2.7);   // straight index raises the right shoulder fully
  assert.equal(open.rE, 0);
  assert.equal(open.lS, 2.7);
  assert.equal(open.lE, 0);
  assert.equal(open.yaw, 0.3);
  const fist = poseFor('MANUAL', 0, bends(1), 0);
  assert.equal(fist.rS, 0);
  assert.equal(fist.rE, 2);
  assert.ok(Math.abs(fist.head - 0.4) < 1e-12);
});

test('HOLD returns null so the robot keeps its pose', () => {
  assert.equal(poseFor('HOLD', 5, bends(0.5), 0), null);
});

test('every moving mode returns all joints as finite numbers', () => {
  for (const mode of ['MANUAL', 'AUTO', 'IDLE', 'GREET']) {
    for (const t of [0, 0.7, 3.3, 100]) {
      const p = poseFor(mode, t, bends(0.4), 0.2);
      for (const k of KEYS) assert.ok(Number.isFinite(p[k]), `${mode} ${k} at t=${t}`);
    }
  }
});

test('AUTO and GREET animate over time; IDLE faces forward', () => {
  assert.notDeepEqual(poseFor('AUTO', 0, bends(0), 0), poseFor('AUTO', 0.5, bends(0), 0));
  assert.notEqual(poseFor('GREET', 0, bends(0), 0).rE, poseFor('GREET', 0.1, bends(0), 0).rE);
  assert.equal(poseFor('IDLE', 2, bends(0), 0.7).yaw, 0);
});

test('blendPose eases toward the target and smoothing slows it down', () => {
  const cur = { a: 0 };
  blendPose(cur, { a: 10 }, 0.5);
  assert.equal(cur.a, 5);
  assert.equal(smoothingAlpha(0), 0.5);
  assert.ok(smoothingAlpha(0.9) < smoothingAlpha(0.1));
});
