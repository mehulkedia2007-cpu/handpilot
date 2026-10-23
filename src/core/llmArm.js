// How the browser carries out the language agent's arm tools (Phase 5), over time.
// A tool call becomes a small "job": glide the target to a point, or open/close
// the grip, and wait until the arm has really got there. main.js feeds it the
// gripper's real position each frame; IK (core/ik.js) turns the target into angles.
// Also builds the scene description the model reads. Pure: no DOM, no Three.js.
import { clamp, lerp } from './hand.js';
import { BLOCK_SIZE, supportFor, isCovered } from './stacking.js';
import { WORKSPACE } from './workspace.js';

// Glide speed in scene units per second, and the shortest / longest glide.
export const GLIDE_SPEED = 1.6;
const GLIDE_MS = [300, 3000];
// After the glide the joints are still easing in. A move counts as done once the
// gripper is this close to the target, or after SETTLE_MS more (out of reach).
export const ARRIVE_DIST = 0.06;
const SETTLE_MS = 1200;
// A grip change is done when the eased grip is this close to its goal, or after GRIP_MS.
const GRIP_DONE = 0.05, GRIP_MS = 1500;

const ease = (u) => u * u * (3 - 2 * u);   // smoothstep, as in the AUTO demo
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
const r2 = (v) => Math.round(v * 100) / 100;
const pt = (p) => ({ x: r2(p.x), y: r2(p.y), z: r2(p.z) });

// Times are ms (performance.now()), passed in so tests can use a fake clock.
// state = { tip, grip }: where the gripper really is (forward kinematics) and its eased grip.
export function createLlmArm() {
  let target = null, grip = 0, job = null;
  return {
    get target() { return target; },
    get grip() { return grip; },
    get busy() { return job !== null; },
    // Start from wherever the arm is now, so taking over never makes it jump.
    sync(state) { target = { ...state.tip }; grip = state.grip > 0.5 ? 1 : 0; job = null; },
    // call: a checked call from core/tools.js (move_gripper_to, open_gripper or close_gripper).
    begin(now, call, state) {
      if (!target) this.sync(state);
      if (call.name === 'move_gripper_to') {
        const to = { ...call.args }, from = { ...target };
        const dur = clamp(dist(from, to) / GLIDE_SPEED * 1000, GLIDE_MS[0], GLIDE_MS[1]);
        job = { kind: 'move', from, to, start: now, dur };
      } else {
        grip = call.name === 'close_gripper' ? 1 : 0;
        job = { kind: 'grip', start: now };
      }
    },
    // Advance the job. Returns null while it runs, then { done: true, arrived } once.
    step(now, state) {
      if (!job) return null;
      const t = now - job.start;
      if (job.kind === 'move') {
        const u = ease(clamp(t / job.dur, 0, 1));
        target = { x: lerp(job.from.x, job.to.x, u), y: lerp(job.from.y, job.to.y, u), z: lerp(job.from.z, job.to.z, u) };
        if (t < job.dur) return null;
        const arrived = dist(state.tip, job.to) <= ARRIVE_DIST;
        if (!arrived && t < job.dur + SETTLE_MS) return null;
        job = null;
        return { done: true, arrived };
      }
      const arrived = Math.abs(state.grip - grip) <= GRIP_DONE;
      if (!arrived && t < GRIP_MS) return null;
      job = null;
      return { done: true, arrived };
    },
    cancel() { job = null; },
  };
}

// What the model is told about the world, as plain JSON with short numbers.
// s = { robot, mode, tip, grip, held, blocks, motions: [names], size }
export function describeScene(s) {
  const size = s.size || BLOCK_SIZE;
  const blocks = (s.blocks || []).map((b) => {
    let on;
    if (b.id === s.held) on = 'gripper';
    else {
      const sup = supportFor(s.blocks, b, size);
      on = sup.under ? sup.under.id : sup.top > 0 ? 'table' : 'floor';
    }
    return { id: b.id, x: r2(b.x), y: r2(b.y), z: r2(b.z), top: r2(b.y + size / 2), on, covered: isCovered(s.blocks, b, size) };
  });
  return {
    robot: s.robot,
    mode: s.mode,
    gripper: { ...pt(s.tip), closed: s.grip > 0.5, holding: s.held || null },
    blocks,
    block_size: size,
    workspace: WORKSPACE,
    motions: s.motions || [],
  };
}
