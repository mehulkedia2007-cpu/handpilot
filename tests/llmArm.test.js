import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createLlmArm, describeScene, ARRIVE_DIST } from '../src/core/llmArm.js';
import { checkToolCall } from '../src/core/tools.js';
import { armGoalFor } from '../src/core/armMotion.js';
import { blendPose } from '../src/core/agent.js';
import { defaultArmPose } from '../src/core/armSpec.js';
import { forwardKinematics } from '../src/core/ik.js';
import { createStacker, isOneStack, startBlocks } from '../src/core/stacking.js';

const call = (name, input = {}) => checkToolCall({ name, input });
const near = (a, b, tol = 1e-9) => assert.ok(Math.abs(a - b) <= tol, `${a} vs ${b}`);

test('sync starts from where the gripper is, so taking over never jumps', () => {
  const arm = createLlmArm();
  arm.sync({ tip: { x: 0.5, y: 1, z: 1.5 }, grip: 0.9 });
  assert.deepEqual(arm.target, { x: 0.5, y: 1, z: 1.5 });
  assert.equal(arm.grip, 1);
  assert.equal(arm.busy, false);
});

test('a move glides the target smoothly and finishes once the gripper arrives', () => {
  const arm = createLlmArm(), from = { x: 0, y: 1.5, z: 1.6 }, to = { x: -1, y: 0.55, z: 1.6 };
  arm.sync({ tip: from, grip: 0 });
  arm.begin(0, call('move_gripper_to', to), { tip: from, grip: 0 });
  assert.equal(arm.step(16, { tip: from, grip: 0 }), null);
  const early = arm.target;
  assert.ok(Math.hypot(early.x - from.x, early.y - from.y) < 0.01, 'starts slowly (eased)');
  // Halfway through the glide is halfway there: smoothstep is symmetric.
  const dur = Math.hypot(1, 0.95) / 1.6 * 1000;
  arm.step(dur / 2, { tip: from, grip: 0 });
  near(arm.target.x, -0.5, 1e-6);
  // At the end of the glide the target sits exactly on the goal; done once the tip is there.
  let r = null, t = 0;
  for (t = 400; t < 4000 && !r; t += 16) r = arm.step(t, { tip: to, grip: 0 });
  assert.deepEqual(r, { done: true, arrived: true });
  assert.deepEqual(arm.target, to);
  assert.equal(arm.busy, false);
});

test('an unreachable point stops waiting after a while and says it did not arrive', () => {
  const arm = createLlmArm(), stuck = { x: 0, y: 1.5, z: 1.6 };
  arm.sync({ tip: stuck, grip: 0 });
  arm.begin(0, call('move_gripper_to', { x: 2, y: 2.4, z: 2.3 }), { tip: stuck, grip: 0 });
  let r = null, t = 0;
  for (t = 16; t < 10000 && !r; t += 16) r = arm.step(t, { tip: stuck, grip: 0 });
  assert.deepEqual(r, { done: true, arrived: false });
  assert.ok(t < 5000, `gave up after ${t} ms`);
});

test('close and open set the grip and wait for the fingers', () => {
  const arm = createLlmArm(), tip = { x: 0, y: 1, z: 1.5 };
  arm.sync({ tip, grip: 0 });
  arm.begin(0, call('close_gripper'), { tip, grip: 0 });
  assert.equal(arm.grip, 1);
  assert.equal(arm.step(100, { tip, grip: 0.5 }), null);
  assert.deepEqual(arm.step(200, { tip, grip: 0.97 }), { done: true, arrived: true });
  arm.begin(300, call('open_gripper'), { tip, grip: 1 });
  assert.equal(arm.grip, 0);
  assert.deepEqual(arm.step(5000, { tip, grip: 1 }), { done: true, arrived: false });   // times out
});

test('cancel drops the job', () => {
  const arm = createLlmArm(), tip = { x: 0, y: 1, z: 1.5 };
  arm.begin(0, call('move_gripper_to', { x: 1, y: 1, z: 1.5 }), { tip, grip: 0 });
  assert.equal(arm.busy, true);
  arm.cancel();
  assert.equal(arm.busy, false);
  assert.equal(arm.step(100, { tip, grip: 0 }), null);
});

test('the scene says where each block rests and what the gripper holds', () => {
  const blocks = startBlocks();
  blocks[0] = { ...blocks[0], x: 1, y: blocks[2].y + 0.3, z: 1.6 };   // red on blue
  const s = describeScene({ robot: 'arm', mode: 'LLM', tip: { x: 0.123456, y: 1, z: 1.6 }, grip: 1, held: 'green', blocks, motions: ['Wave'] });
  assert.deepEqual(s.gripper, { x: 0.12, y: 1, z: 1.6, closed: true, holding: 'green' });
  const byId = Object.fromEntries(s.blocks.map((b) => [b.id, b]));
  assert.equal(byId.red.on, 'blue');
  assert.equal(byId.blue.on, 'table');
  assert.equal(byId.blue.covered, true);
  assert.equal(byId.green.on, 'gripper');
  near(byId.blue.top, 0.6);
  assert.deepEqual(s.motions, ['Wave']);
  assert.ok(s.workspace && s.block_size === 0.3);
});

// The whole pipeline the browser runs each frame, without the DOM: the executor's
// target -> IK (armGoalFor) -> eased joints -> forward kinematics -> the stacker.
function simulateArm() {
  const arm = createLlmArm(), stacker = createStacker(), pose = defaultArmPose();
  let now = 0;
  const state = () => ({ tip: forwardKinematics(pose), grip: pose.grip });
  arm.sync(state());
  function frame() {
    now += 16;
    const goal = armGoalFor('LLM', 0, {}, { target: arm.target, grip: arm.grip });
    blendPose(pose, goal.pose, 0.35);
    stacker.step(pose.grip, forwardKinematics(pose), pose.yaw);
  }
  // Run one tool call to completion, like main.js does. Returns its result.
  function run(name, input) {
    arm.begin(now, call(name, input), state());
    for (let i = 0; i < 1000; i++) {
      frame();
      const r = arm.step(now, state());
      if (r) return r;
    }
    throw new Error('never finished');
  }
  return { run, stacker, state };
}

// The recipe the system prompt teaches (server/prompt.js), with real block positions.
function pickUp(sim, b) {
  const top = b.y + 0.15;
  sim.run('move_gripper_to', { x: b.x, y: top + 0.5, z: b.z });
  sim.run('move_gripper_to', { x: b.x, y: top - 0.05, z: b.z });
  sim.run('close_gripper');
  return sim.run('move_gripper_to', { x: b.x, y: 1.3, z: b.z });
}
function placeOn(sim, b) {
  const top = b.y + 0.15;
  sim.run('move_gripper_to', { x: b.x, y: 1.3, z: b.z });
  sim.run('move_gripper_to', { x: b.x, y: top + 0.3, z: b.z });
  sim.run('open_gripper');
  sim.run('move_gripper_to', { x: b.x, y: 1.3, z: b.z });
}
const find = (sim, id) => sim.stacker.blocks.find((b) => b.id === id);

test('"pick up the red block": the recipe really lifts it', () => {
  const sim = simulateArm();
  const r = pickUp(sim, find(sim, 'red'));
  assert.equal(r.arrived, true);
  assert.equal(sim.stacker.held, 'red');
  assert.ok(find(sim, 'red').y > 0.9, 'red is up in the air');
  assert.ok(Math.hypot(sim.state().tip.x + 1, sim.state().tip.y - 1.3) <= ARRIVE_DIST);
});

test('"stack red on blue": the recipe builds the stack, and then all three', () => {
  const sim = simulateArm();
  pickUp(sim, find(sim, 'red'));
  placeOn(sim, find(sim, 'blue'));
  assert.equal(sim.stacker.held, null);
  const red = find(sim, 'red'), blue = find(sim, 'blue');
  near(red.x, blue.x); near(red.z, blue.z); near(red.y, blue.y + 0.3);
  // And green on top of red makes the challenge's single tower.
  pickUp(sim, find(sim, 'green'));
  placeOn(sim, find(sim, 'red'));
  assert.ok(isOneStack(sim.stacker.blocks));
});
