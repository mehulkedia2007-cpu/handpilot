// Training data for custom gestures: the examples recorded in the trainer, what
// each gesture should do, and saving, exporting and importing it all.
// Also the recording timer (countdown, then ~30 samples over 3 s).
// Pure logic: storage and the clock are passed in.
import { normalise } from './hand.js';
import { KNN, KNN_DEFAULTS } from './knn.js';
import { cleanName } from './motion.js';
import { TRAINED } from './gestures.js';

export const TRAINING_KEY = 'handpilot.gestures.v1';
export const TRAINING_FILE = 'handpilot-gestures';
export const VECTOR_LEN = 63;
export const MAX_SAMPLES = 300;            // per gesture, so storage stays small
export const DISTANCE_RANGE = [0.2, 1.5];  // the trainer's "match distance" slider
export const ACTION_MODES = ['MANUAL', 'HOLD', 'AUTO', 'GREET'];
export { TRAINED };

export function emptyTraining() {
  return { maxDistance: KNN_DEFAULTS.maxDistance, gestures: [] };
}

// `|| 0` turns -0 (from mirroring x = 0) into 0, so saved files don't show "-0".
const round4 = (v) => Math.round(v * 10000) / 10000 || 0;

// The vector the trainer stores and the classifier compares, for one HandFrame.
// A left hand is mirrored so it matches gestures taught with a right hand.
export function vectorFor(hf) {
  if (!hf || !hf.present || !hf.landmarks) return null;
  const v = normalise(hf.landmarks, { mirror: hf.handedness === 'Left' });
  return v && v.map(round4);
}

const validVector = (v) => Array.isArray(v) && v.length === VECTOR_LEN && v.every((n) => typeof n === 'number' && Number.isFinite(n));

// An action is null (do nothing), { type: 'mode', mode } or { type: 'motion', id }.
function checkAction(a) {
  if (a === null || a === undefined) return { action: null };
  if (a && a.type === 'mode' && ACTION_MODES.includes(a.mode)) return { action: { type: 'mode', mode: a.mode } };
  if (a && a.type === 'motion' && typeof a.id === 'string' && /^[a-z0-9]{1,24}$/i.test(a.id)) return { action: { type: 'motion', id: a.id } };
  return { error: 'its action is not one this app knows' };
}

// Check training data from storage or a file. Returns { data } with a clean copy,
// or { error } in plain words.
export function checkTraining(raw) {
  if (!raw || typeof raw !== 'object' || !Array.isArray(raw.gestures)) return { error: 'it has no list of gestures' };
  const data = emptyTraining();
  const md = raw.maxDistance;
  if (typeof md === 'number' && md >= DISTANCE_RANGE[0] && md <= DISTANCE_RANGE[1]) data.maxDistance = md;
  const seen = new Set();
  for (const [i, g] of raw.gestures.entries()) {
    const name = cleanName(g && g.name);
    const where = `Gesture ${i + 1}` + (name ? ` ("${name}")` : '');
    if (!name) return { error: `${where} has no name` };
    if (seen.has(name.toLowerCase())) return { error: `${where} has the same name as another gesture` };
    seen.add(name.toLowerCase());
    const { action, error } = checkAction(g.action);
    if (error) return { error: `${where}: ${error}` };
    if (!Array.isArray(g.samples) || !g.samples.length) return { error: `${where} has no samples` };
    if (g.samples.length > MAX_SAMPLES) return { error: `${where} has more than ${MAX_SAMPLES} samples` };
    const bad = g.samples.findIndex((v) => !validVector(v));
    if (bad >= 0) return { error: `${where}: sample ${bad + 1} is not a list of ${VECTOR_LEN} numbers` };
    data.gestures.push({ name, action, samples: g.samples.map((v) => v.slice()) });
  }
  return { data };
}

export function loadTraining(storage) {
  try {
    const json = storage.getItem(TRAINING_KEY);
    return (json && checkTraining(JSON.parse(json)).data) || emptyTraining();
  } catch (_) {
    return emptyTraining();
  }
}

export function saveTraining(storage, data) {
  try {
    storage.setItem(TRAINING_KEY, JSON.stringify(data));
    return true;
  } catch (_) {
    return false;
  }
}

export function exportTraining(data) {
  return JSON.stringify({ format: TRAINING_FILE, version: 1, ...data });
}

// Read an exported file. Returns the training data or throws an Error with a
// message ready to show the user.
export function parseTrainingFile(text) {
  let raw;
  try { raw = JSON.parse(text); } catch (_) { throw new Error('That file is not valid JSON.'); }
  if (!raw || raw.format !== TRAINING_FILE) throw new Error('That is not a HandPilot gestures file.');
  if (raw.version !== 1) throw new Error(`That gestures file is version ${raw.version}; this app reads version 1.`);
  const { data, error } = checkTraining(raw);
  if (error) throw new Error(`That gestures file can't be imported: ${error}.`);
  if (!data.gestures.length) throw new Error('That gestures file has no gestures in it.');
  return data;
}

// Imported gestures replace ones with the same name and add the rest.
// The match distance comes from the file too.
export function mergeTraining(current, incoming) {
  const byName = (n) => (g) => g.name.toLowerCase() === n.toLowerCase();
  const gestures = current.gestures.slice();
  let added = 0, replaced = 0;
  for (const g of incoming.gestures) {
    const i = gestures.findIndex(byName(g.name));
    if (i >= 0) { gestures[i] = g; replaced++; } else { gestures.push(g); added++; }
  }
  return { data: { maxDistance: incoming.maxDistance, gestures }, added, replaced };
}

// Add recorded samples to a gesture, creating it if it's new. Keeps the newest
// MAX_SAMPLES. Returns a new data object; the old one is left alone.
export function addSamples(data, name, samples) {
  const gestures = data.gestures.slice();
  const i = gestures.findIndex((g) => g.name.toLowerCase() === name.toLowerCase());
  if (i >= 0) gestures[i] = { ...gestures[i], samples: gestures[i].samples.concat(samples).slice(-MAX_SAMPLES) };
  else gestures.push({ name, action: null, samples: samples.slice(-MAX_SAMPLES) });
  return { ...data, gestures };
}

// A classifier holding every example. Rebuilt whenever the training data changes.
export function buildKnn(data) {
  const knn = new KNN({ maxDistance: data.maxDistance });
  for (const g of data.gestures) for (const v of g.samples) knn.add(v, g.name);
  return knn;
}

// The agent's trained commands ({ "trained:name": action }). A motion action
// carries the motion's current name for the log; one whose motion was deleted is left out.
export function customCommands(data, motions) {
  const out = {};
  for (const g of data.gestures) {
    const a = g.action;
    if (!a) continue;
    if (a.type === 'mode') out[TRAINED + g.name] = { type: 'mode', mode: a.mode, label: g.name };
    else {
      const m = motions.find((x) => x.id === a.id);
      if (m) out[TRAINED + g.name] = { type: 'motion', id: m.id, name: m.name, label: g.name };
    }
  }
  return out;
}

// Records one gesture: a countdown so you can get your hand ready, then `count`
// samples spread over `durationMs`. Frames without a hand are skipped, and the
// recording ends when the time is up, even if it's short of `count`.
export function createSampler({ countdownMs = 3000, durationMs = 3000, count = 30 } = {}) {
  const gap = durationMs / count;
  let startAt = 0, active = false, samples = [], next = 0;
  return {
    get active() { return active; },
    start(now) { startAt = now + countdownMs; active = true; samples = []; next = startAt; },
    cancel() { active = false; samples = []; },
    // vector: this frame's vectorFor(), or null with no hand. Returns
    // { phase: 'countdown' | 'recording' | 'done', secondsLeft, count, samples? }.
    step(now, vector) {
      if (!active) return { phase: 'idle', secondsLeft: 0, count: 0 };
      if (now < startAt) return { phase: 'countdown', secondsLeft: Math.ceil((startAt - now) / 1000), count: 0 };
      if (vector && now >= next && samples.length < count) { samples.push(vector); next = now + gap - 1; }
      if (samples.length >= count || now - startAt >= durationMs) {
        active = false;
        return { phase: 'done', secondsLeft: 0, count: samples.length, samples };
      }
      return { phase: 'recording', secondsLeft: Math.ceil((startAt + durationMs - now) / 1000), count: samples.length };
    },
  };
}
