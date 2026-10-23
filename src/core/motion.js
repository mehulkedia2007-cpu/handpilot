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

/* ---------- the motion library: saving, checking, export and import ---------- */
// Motions are saved under their own key, apart from settings, so Reset to defaults
// never deletes them. Like settings, every storage call is wrapped in try/catch.
export const MOTIONS_KEY = 'handpilot.motions.v1';
export const MOTION_FILE = 'handpilot-motions';   // the "format" written into exported files
export const NAME_MAX = 40;
const MAX_SAMPLES = 5000;
const MAX_ANGLE = 10;   // radians; real joints stay well inside this, so bigger means a broken file

// Tidy a typed name: trim it and squash runs of spaces. Returns '' if nothing is left.
export function cleanName(name) {
  return typeof name === 'string' ? name.trim().replace(/\s+/g, ' ').slice(0, NAME_MAX) : '';
}

// Check one motion from storage or a file. Returns { motion } with a clean copy
// (only the known fields), or { error } saying what's wrong in plain words.
export function checkMotion(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { error: 'it is not a motion object' };
  const name = cleanName(raw.name);
  if (!name) return { error: 'it has no name' };
  if (typeof raw.id !== 'string' || !/^[a-z0-9]{1,24}$/i.test(raw.id)) return { error: 'its id is missing or invalid' };
  const keys = JOINT_KEYS[raw.robot];
  if (!keys) return { error: `its robot must be ${Object.keys(JOINT_KEYS).map((k) => '"' + k + '"').join(' or ')}` };
  const hz = raw.hz === undefined ? RECORD_HZ : raw.hz;
  if (typeof hz !== 'number' || !(hz >= 1 && hz <= 240)) return { error: 'its sample rate (hz) is invalid' };
  if (!Array.isArray(raw.samples) || raw.samples.length < 2) return { error: 'it needs at least 2 samples' };
  if (raw.samples.length > MAX_SAMPLES) return { error: `it has more than ${MAX_SAMPLES} samples` };
  const samples = [];
  let prev = -Infinity;
  for (const [i, s] of raw.samples.entries()) {
    const where = `sample ${i + 1}`;
    if (!s || typeof s.t !== 'number' || !Number.isFinite(s.t) || s.t < 0) return { error: `${where} has no valid time (t)` };
    // Times must go forward, or the binary search in sampleAt() would give nonsense.
    if (s.t <= prev) return { error: `${where} is not later than the one before` };
    if (!s.joints || typeof s.joints !== 'object') return { error: `${where} has no joints` };
    const joints = {};
    for (const k of keys) {
      const v = s.joints[k];
      if (typeof v !== 'number' || !Number.isFinite(v) || Math.abs(v) > MAX_ANGLE) return { error: `${where} has a missing or invalid "${k}"` };
      joints[k] = v;
    }
    samples.push({ t: s.t, joints });
    prev = s.t;
  }
  return { motion: { id: raw.id, name, robot: raw.robot, hz, samples } };
}

// Saved motions. A bad entry is skipped rather than throwing the whole library away.
export function loadMotions(storage) {
  try {
    const raw = JSON.parse(storage.getItem(MOTIONS_KEY));
    if (!raw || !Array.isArray(raw.motions)) return [];
    return raw.motions.map((m) => checkMotion(m).motion).filter(Boolean);
  } catch (_) {
    return [];
  }
}

// Returns false if it couldn't save (blocked, private mode, or storage full).
export function saveMotions(storage, motions) {
  try {
    storage.setItem(MOTIONS_KEY, JSON.stringify({ motions }));
    return true;
  } catch (_) {
    return false;
  }
}

// The text of an exported .json file. "format" and "version" let an import
// recognise the file, and let a future version read old files.
export function exportMotions(motions) {
  return JSON.stringify({ format: MOTION_FILE, version: 1, motions });
}

// Read an exported file. Returns the motions, or throws an Error whose message
// is ready to show the user. Nothing is imported unless every motion is valid.
export function parseMotionFile(text) {
  let raw;
  try { raw = JSON.parse(text); } catch (_) { throw new Error('That file is not valid JSON.'); }
  if (!raw || raw.format !== MOTION_FILE || !Array.isArray(raw.motions)) throw new Error('That is not a HandPilot motions file.');
  if (raw.version !== 1) throw new Error(`That motions file is version ${raw.version}; this app reads version 1.`);
  if (!raw.motions.length) throw new Error('That motions file has no motions in it.');
  return raw.motions.map((m, i) => {
    const r = checkMotion(m);
    if (r.error) throw new Error(`Motion ${i + 1}${m && typeof m.name === 'string' ? ` ("${cleanName(m.name)}")` : ''} can't be imported: ${r.error}.`);
    return r.motion;
  });
}

// Add imported motions to a library. A motion already there (same id, same
// content) is skipped; a clash of ids gets a new id, a clash of names "Name (2)".
export function mergeMotions(existing, incoming, makeId = newMotionId) {
  const list = existing.slice();
  let added = 0, skipped = 0;
  for (const m of incoming) {
    const same = list.find((x) => x.id === m.id);
    if (same && sameMotion(same, m)) { skipped++; continue; }
    const copy = { ...m };
    if (same) { do copy.id = makeId(); while (list.some((x) => x.id === copy.id)); }
    copy.name = uniqueName(copy.name, list.map((x) => x.name));
    list.push(copy); added++;
  }
  return { list, added, skipped };
}

// Compare the checked copies, so the order fields were written in doesn't matter.
const canonical = (m) => JSON.stringify(checkMotion(m).motion);
export const sameMotion = (a, b) => canonical(a) === canonical(b);

export function uniqueName(name, names) {
  const taken = new Set(names.map((n) => n.toLowerCase()));
  if (!taken.has(name.toLowerCase())) return name;
  let i = 2;
  while (taken.has(`${name} (${i})`.toLowerCase())) i++;
  return `${name} (${i})`;
}
