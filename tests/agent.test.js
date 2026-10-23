import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Agent, poseFor, blendPose } from '../src/core/agent.js';

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

test('blendPose eases toward the target', () => {
  const cur = { a: 0 };
  blendPose(cur, { a: 10 }, 0.5);
  assert.equal(cur.a, 5);
  blendPose(cur, { a: 10 }, 0.5);
  assert.equal(cur.a, 7.5);
});

test('actText swaps the ACT wording without changing the decision', () => {
  const { agent, log, run } = makeAgent();
  agent.actText = { HOLD: 'freeze the arm' };
  run(show('NONE'), 100);
  run(show('FIST'), 1200);
  assert.equal(agent.mode, 'HOLD');
  assert.ok(log.includes('ACT: freeze the arm'), log.join('\n'));
});

/* ---------- REPLAY (Phase 4) ---------- */
const MOTION_REF = { id: 'm1', name: 'Wave' };

test('startReplay enters REPLAY and endReplay hands control back', () => {
  const { agent, run, log } = makeAgent();
  run(show('NONE'), 100);
  agent.startReplay(200, MOTION_REF, 'play "Wave"');
  assert.equal(agent.mode, 'REPLAY');
  assert.deepEqual(agent.replay, MOTION_REF);
  assert.ok(log.includes('ACT: replay "Wave"'));
  agent.endReplay(300);
  assert.equal(agent.mode, 'MANUAL');
  agent.endReplay(400);   // nothing to end any more: no change, no error
  assert.equal(agent.mode, 'MANUAL');
});

test('a held command gesture interrupts a replay', () => {
  for (const [g, mode] of [['FIST', 'HOLD'], ['OPEN', 'MANUAL'], ['PEACE', 'AUTO'], ['THUMBS_UP', 'GREET']]) {
    const { agent, run } = makeAgent();
    run(show('POINT'), 300);
    agent.startReplay(300, MOTION_REF, 'play');
    assert.equal(run(show(g), 1200).mode, mode, g);
  }
});

test('the gesture already held when a replay starts does not stop it', () => {
  const { agent, run, now } = makeAgent();
  run(show('OPEN'), 2000);   // an open hand in MANUAL, held a long time
  agent.startReplay(now, MOTION_REF, 'play');
  assert.equal(run(show('OPEN'), 3000).mode, 'REPLAY');
  run(show('NONE'), 400);    // put the hand down, then show it again
  assert.equal(run(show('OPEN'), 1200).mode, 'MANUAL');
});

test('no hand during a replay does not switch to IDLE', () => {
  const { agent, run } = makeAgent();
  agent.startReplay(0, MOTION_REF, 'play');
  assert.equal(run(NO_HAND, 5000).mode, 'REPLAY');
});

test('poseFor leaves the pose to the replay', () => {
  assert.equal(poseFor('REPLAY', 0, { thumb: 0, index: 0, middle: 0, ring: 0, pinky: 0 }, 0), null);
});

/* ---------- trained gestures (Phase 4) ---------- */
test('a trained gesture can switch mode or start a motion', () => {
  const { agent, run, log } = makeAgent();
  agent.custom = { rock: { type: 'mode', mode: 'HOLD' }, swirl: { type: 'motion', id: 'm1', name: 'Wave' } };
  run(show('NONE'), 100);
  const st = run(show('rock'), 500);
  assert.equal(st.sends, 'HOLD');
  assert.equal(run(show('rock'), 600).mode, 'HOLD');
  assert.ok(log.includes('DECIDE: "rock" held, latch HOLD'));
  assert.equal(run(show('swirl'), 500).sends, 'replay "Wave"');
  assert.equal(run(show('swirl'), 600).mode, 'REPLAY');
  assert.equal(agent.replay.id, 'm1');
});

test('an unmapped trained gesture is not a command', () => {
  const { agent, run } = makeAgent();
  agent.custom = {};
  assert.equal(run(show('rock'), 2000).progress, 0);
  assert.equal(agent.mode, 'MANUAL');
});

test('a trained gesture mapped to AUTO toggles it like the peace sign', () => {
  const { agent, run } = makeAgent();
  agent.custom = { loop: { type: 'mode', mode: 'AUTO' } };
  assert.equal(run(show('loop'), 1200).mode, 'AUTO');
  run(show('NONE'), 400);
  assert.equal(run(show('loop'), 500).sends, 'MANUAL');
  assert.equal(run(show('loop'), 700).mode, 'MANUAL');
});

test('LLM: the language agent takes over and hands back to MANUAL', () => {
  const { agent, run, log } = makeAgent();
  run(show('OPEN'), 600);
  agent.startLlm(600, 'command "stack red on blue"');
  assert.equal(agent.mode, 'LLM');
  // The open palm you were already holding doesn't interrupt it.
  assert.equal(run(show('OPEN'), 2000).mode, 'LLM');
  assert.equal(agent.commands, 0);
  agent.endLlm(3000);
  assert.equal(agent.mode, 'MANUAL');
  assert.ok(log.some((l) => /control returns to you/.test(l)));
});

test('LLM: no hand does not send it to IDLE, and the humanoid holds still', () => {
  const { agent, run } = makeAgent();
  agent.startLlm(0, 'go');
  assert.equal(run(NO_HAND, 5000).mode, 'LLM');
  assert.equal(poseFor('LLM', 1, { thumb: 0, index: 0, middle: 0, ring: 0, pinky: 0 }, 0), null);
});

test('LLM: a newly held command gesture counts, so the page can stop the agent', () => {
  const { agent, run } = makeAgent();
  run(show('OPEN'), 200);
  agent.startLlm(200, 'go');
  run(show('NONE'), 400);
  assert.equal(run(show('FIST'), 1200).mode, 'HOLD');
  assert.equal(agent.commands, 1);
});

test('LLM: ending while holding a block goes to HOLD; set_mode does not count as a gesture', () => {
  const { agent } = makeAgent();
  agent.startLlm(0, 'go');
  agent.endLlm(100, 'done', 'HOLD');
  assert.equal(agent.mode, 'HOLD');
  agent.llmSetMode(200, 'AUTO');
  assert.equal(agent.mode, 'AUTO');
  agent.endLlm(300);   // not in LLM any more: leaves the chosen mode alone
  assert.equal(agent.mode, 'AUTO');
  assert.equal(agent.commands, 0);
});
