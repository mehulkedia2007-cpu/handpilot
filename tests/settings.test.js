import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SETTINGS_KEY, defaultSettings, sanitizeSettings, loadSettings, saveSettings } from '../src/core/settings.js';
import { DEFAULT_CAL } from '../src/core/hand.js';

// A stand-in for localStorage that keeps values in a Map.
function fakeStorage(initial = {}) {
  const m = new Map(Object.entries(initial));
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { m.set(k, String(v)); },
    map: m,
  };
}
// Storage that throws on every call, like a blocked or private-mode browser.
const brokenStorage = {
  getItem() { throw new Error('SecurityError'); },
  setItem() { throw new Error('QuotaExceededError'); },
};
const myCal = {
  open: { thumb: 2, index: 1.8, middle: 1.8, ring: 1.8, pinky: 1.7 },
  closed: { thumb: 0.6, index: 0.8, middle: 0.8, ring: 0.8, pinky: 0.8 },
};

test('settings survive a save and load round trip', () => {
  const store = fakeStorage();
  const s = defaultSettings();
  s.calibration = myCal; s.filter = { minCutoff: 0.4, beta: 2.5 }; s.gestureMap.FIST = 'GREET';
  assert.equal(saveSettings(store, s), true);
  assert.deepEqual(loadSettings(store), s);
});

test('empty storage gives the defaults', () => {
  assert.deepEqual(loadSettings(fakeStorage()), defaultSettings());
});

test('blocked storage or no storage never throws', () => {
  assert.deepEqual(loadSettings(brokenStorage), defaultSettings());
  assert.deepEqual(loadSettings(null), defaultSettings());
  assert.equal(saveSettings(brokenStorage, defaultSettings()), false);
  assert.equal(saveSettings(null, defaultSettings()), false);
});

test('corrupt JSON gives the defaults', () => {
  assert.deepEqual(loadSettings(fakeStorage({ [SETTINGS_KEY]: '{not json' })), defaultSettings());
});

test('bad fields fall back one by one, good fields are kept', () => {
  const s = sanitizeSettings({
    calibration: { open: { thumb: 'x' } },
    filter: { minCutoff: 0.5, beta: 999 },
    robot: 'toaster',
    gestureMap: { FIST: 'GREET', OPEN: 'SELF_DESTRUCT', MADE_UP: 'HOLD' },
  });
  assert.deepEqual(s.calibration, defaultSettings().calibration);
  assert.equal(s.filter.minCutoff, 0.5);
  assert.equal(s.filter.beta, defaultSettings().filter.beta);
  assert.equal(s.robot, 'humanoid');
  assert.equal(s.gestureMap.FIST, 'GREET');
  assert.equal(s.gestureMap.OPEN, 'MANUAL');
  assert.ok(!('MADE_UP' in s.gestureMap));
});

test('a calibration whose open and closed readings are too close is rejected', () => {
  const tooClose = { open: { ...DEFAULT_CAL.open }, closed: { ...DEFAULT_CAL.open } };
  assert.deepEqual(sanitizeSettings({ calibration: tooClose }).calibration, defaultSettings().calibration);
});

test('a calibration saved by the Phase 0 app is picked up on first run', () => {
  const store = fakeStorage({ 'gesture-robot-cal': JSON.stringify(myCal) });
  assert.deepEqual(loadSettings(store).calibration, myCal);
});

test('defaults are a fresh copy each time', () => {
  const a = defaultSettings();
  a.calibration.open.thumb = 99; a.gestureMap.FIST = 'GREET';
  assert.equal(defaultSettings().calibration.open.thumb, DEFAULT_CAL.open.thumb);
  assert.equal(defaultSettings().gestureMap.FIST, 'HOLD');
});

test('the chosen robot is saved and loaded', () => {
  const store = fakeStorage();
  const s = defaultSettings(); s.robot = 'arm';
  saveSettings(store, s);
  assert.equal(loadSettings(store).robot, 'arm');
});

test('hand sensitivity is saved, and out-of-range values fall back to the default', () => {
  assert.equal(sanitizeSettings({ handGain: 2.2 }).handGain, 2.2);
  for (const bad of [0.2, 9, '2', NaN, null]) assert.equal(sanitizeSettings({ handGain: bad }).handGain, defaultSettings().handGain);
});

test('a sensitivity saved under its old name (armGain) is kept', () => {
  assert.equal(sanitizeSettings({ armGain: 2.0 }).handGain, 2.0);
  assert.equal(sanitizeSettings({ armGain: 2.0, handGain: 1.2 }).handGain, 1.2);
  assert.equal('armGain' in sanitizeSettings({ armGain: 2.0 }), false);
});
