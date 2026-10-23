// Record and replay robot motions. A motion is a list of samples, each one the
// robot's joint angles at a moment in time. Recording keeps about 30 samples a
// second; replay draws a straight line between neighbouring samples
// (linear interpolation), so it looks smooth at any frame rate or speed.
// Pure logic: the clock (`now`, in ms) is always passed in.
import { lerp } from './hand.js';

// The joints saved for each robot. The humanoid's are the Pose fields from
// core/agent.js, the arm's the ArmPose fields from core/armSpec.js.
export const JOINT_KEYS = {
  humanoid: ['rS', 'rE', 'lS', 'lE', 'head', 'yaw', 'bob'],
  arm: ['yaw', 'shoulder', 'elbow', 'wrist', 'grip'],
};
export const RECORD_HZ = 30;
export const MAX_RECORD_MS = 60000;   // a minute is plenty, and keeps a motion small enough for localStorage
export const SPEEDS = [0.5, 1, 2];

// 4 decimals is far finer than anyone can see (0.0001 rad) and makes saved motions much shorter.
const round4 = (v) => Math.round(v * 10000) / 10000;

// Copy only the robot's joints, rounded, so a sample never holds stray fields.
export function pickJoints(robot, pose) {
  const j = {};
  for (const k of JOINT_KEYS[robot]) j[k] = round4(pose[k]);
  return j;
}

// Collects samples while recording. Call sample() every frame; it only keeps
// one when about 1/30 s has passed since the last, so a 60 or 144 fps screen
// records the same amount of data.
export function createRecorder(hz = RECORD_HZ, maxMs = MAX_RECORD_MS) {
  const gap = 1000 / hz;
  let robot = null, startedAt = 0, last = -Infinity, samples = [];
  return {
    get recording() { return robot !== null; },
    get count() { return samples.length; },
    elapsed(now) { return robot ? now - startedAt : 0; },
    start(now, which) { robot = which; startedAt = now; last = -Infinity; samples = []; },
    // Returns false once the time limit is reached, so the caller can stop.
    sample(now, pose) {
      if (!robot) return false;
      const t = now - startedAt;
      if (t > maxMs) return false;
      // A frame arrives a little early or late; 1 ms of slack stops a 60 fps
      // screen from skipping every other sample and recording only 20 a second.
      if (t - last >= gap - 1) { samples.push({ t: Math.round(t), joints: pickJoints(robot, pose) }); last = t; }
      return true;
    },
    // Returns { robot, samples }, or null if there wasn't enough to replay.
    stop() {
      const out = robot && samples.length >= 2 ? { robot, samples } : null;
      robot = null; samples = [];
      return out;
    },
  };
}

export function motionDuration(motion) {
  const s = motion.samples;
  return s.length ? s[s.length - 1].t : 0;
}

// The joint angles at time t (ms) into a motion. Before the first sample it holds
// the first pose, after the last it holds the last one. In between it finds the two
// samples either side of t and blends them by how far t is between them.
export function sampleAt(motion, t) {
  const s = motion.samples;
  if (t <= s[0].t) return { ...s[0].joints };
  if (t >= s[s.length - 1].t) return { ...s[s.length - 1].joints };
  // Binary search: a minute-long motion has 1800 samples, and this runs every frame.
  let lo = 0, hi = s.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (s[mid].t <= t) lo = mid; else hi = mid;
  }
  const a = s[lo], b = s[hi], u = (t - a.t) / (b.t - a.t);
  const out = {};
  for (const k in a.joints) out[k] = lerp(a.joints[k], b.joints[k], u);
  return out;
}

// Where a replay is after `elapsedMs` of real time at `speed` (0.5 = half speed).
// done turns true once the end of the motion has been reached.
export function replayFrame(motion, elapsedMs, speed = 1) {
  const t = elapsedMs * speed;
  return { joints: sampleAt(motion, t), done: t >= motionDuration(motion) };
}

// A short id that stays the same when a motion is renamed, so a trained gesture
// can point at it. rand and now are passed in so tests can make them repeatable.
export function newMotionId(rand = Math.random, now = Date.now()) {
  return 'm' + now.toString(36) + Math.floor(rand() * 36 ** 4).toString(36).padStart(4, '0');
}

// "Motion 1", "Motion 2", ...: the first number not already taken.
export function nextName(names, base = 'Motion') {
  const taken = new Set(names.map((n) => n.toLowerCase()));
  let i = 1;
  while (taken.has(`${base} ${i}`.toLowerCase())) i++;
  return `${base} ${i}`;
}
