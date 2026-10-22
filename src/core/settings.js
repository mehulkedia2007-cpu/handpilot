// Saved settings: calibration, filter tuning, the chosen robot and gesture mappings.
// Everything lives under one key with the version in its name, so a future format
// can use a new key without misreading the old one.
// The storage object is passed in (localStorage in the browser, a fake in tests),
// and every access is wrapped in try/catch: storage can be blocked, full, or
// missing entirely in private windows and embedded views.
import { DEFAULT_CAL, copyCal, isUsableCal, FINGERS } from './hand.js';
import { COMMANDS, LABEL } from './gestures.js';
import { GAIN_RANGE, DEFAULT_GAIN } from './workspace.js';

export const SETTINGS_KEY = 'handpilot.settings.v1';
const LEGACY_CAL_KEY = 'gesture-robot-cal';   // used by the prototype and Phase 0

export const FILTER_LIMITS = { minCutoff: [0.1, 5], beta: [0, 5] };
export const ROBOTS = ['humanoid', 'arm'];   // the arm arrives in Phase 2
const COMMAND_MODES = ['MANUAL', 'HOLD', 'AUTO', 'GREET'];

export function defaultSettings() {
  return {
    calibration: copyCal(DEFAULT_CAL),
    filter: { minCutoff: 1.0, beta: 1.0 },
    robot: 'humanoid',
    armGain: DEFAULT_GAIN,   // hand sensitivity for the arm with the camera (core/workspace.js)
    gestureMap: { ...COMMANDS },
  };
}

const inRange = (v, [lo, hi]) => typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi;

function validCal(cal) {
  const finite = (side) => cal && cal[side] && FINGERS.every((n) => Number.isFinite(cal[side][n]));
  return finite('open') && finite('closed') && isUsableCal(cal);
}

// Stored data might be old, partial, hand-edited or corrupt. Start from the
// defaults and copy over only the fields that pass their check, so one bad
// field never throws away the rest.
export function sanitizeSettings(raw) {
  const s = defaultSettings();
  if (!raw || typeof raw !== 'object') return s;
  if (validCal(raw.calibration)) s.calibration = copyCal(raw.calibration);
  if (raw.filter) {
    for (const k of Object.keys(FILTER_LIMITS)) if (inRange(raw.filter[k], FILTER_LIMITS[k])) s.filter[k] = raw.filter[k];
  }
  if (ROBOTS.includes(raw.robot)) s.robot = raw.robot;
  if (inRange(raw.armGain, GAIN_RANGE)) s.armGain = raw.armGain;
  if (raw.gestureMap && typeof raw.gestureMap === 'object') {
    for (const [g, mode] of Object.entries(raw.gestureMap)) {
      if (g in LABEL && g !== 'NONE' && COMMAND_MODES.includes(mode)) s.gestureMap[g] = mode;
    }
  }
  return s;
}

export function loadSettings(storage) {
  try {
    const json = storage.getItem(SETTINGS_KEY);
    if (json) return sanitizeSettings(JSON.parse(json));
    // First run on this version: keep a calibration saved by the old app.
    const s = defaultSettings();
    const legacy = JSON.parse(storage.getItem(LEGACY_CAL_KEY));
    if (validCal(legacy)) s.calibration = copyCal(legacy);
    return s;
  } catch (_) {
    return defaultSettings();   // no storage, blocked storage or bad JSON
  }
}

// Returns false if it couldn't save (private mode, quota, no storage). The app
// keeps working with the settings in memory either way.
export function saveSettings(storage, settings) {
  try {
    storage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    return true;
  } catch (_) {
    return false;
  }
}
