// Rule-based gesture classifier: five bend numbers in, one gesture name out.
import { FINGERS } from './hand.js';

// A finger counts as "up" below 0.3 and "down" above 0.65. The gap in between
// is deliberate: a half-bent finger matches neither, so gestures don't flicker.
export function classify(b) {
  const up = (k) => b[k] < 0.3;
  const down = (k) => b[k] > 0.65;
  const four = ['index', 'middle', 'ring', 'pinky'];
  if (FINGERS.every(down)) return 'FIST';
  if (FINGERS.every(up)) return 'OPEN';
  if (up('index') && up('middle') && down('ring') && down('pinky')) return 'PEACE';
  if (up('index') && down('middle') && down('ring') && down('pinky')) return 'POINT';
  if (up('thumb') && four.every(down)) return 'THUMBS_UP';
  return 'NONE';
}

// MediaPipe's built-in gesture labels mapped to our gesture names. Thumb_Down and
// ILoveYou are recognised and shown, but are not commands yet (Phase 4 lets you map them).
export const BUILTIN = {
  Closed_Fist: 'FIST', Open_Palm: 'OPEN', Victory: 'PEACE', Thumb_Up: 'THUMBS_UP',
  Pointing_Up: 'POINT', Thumb_Down: 'THUMBS_DOWN', ILoveYou: 'I_LOVE_YOU',
};

// Pick the gesture for one HandFrame. The camera's built-in model is trained on
// thousands of hands, so we trust it when it is confident. Otherwise (and always for
// the simulator, which has no built-in label) the rule-based classifier decides.
export function pickGesture(hf, minScore = 0.6) {
  if (!hf.present) return 'NONE';
  const g = BUILTIN[hf.builtInGesture];
  if (g && (hf.builtInScore ?? 0) >= minScore) return g;
  return classify(hf.bends);
}

// Which agent mode each command gesture asks for. POINT and NONE are not commands.
export const COMMANDS = { FIST: 'HOLD', OPEN: 'MANUAL', PEACE: 'AUTO', THUMBS_UP: 'GREET' };

// How the agent log talks about each gesture.
export const SAYS = { FIST: 'fist', OPEN: 'open palm', PEACE: 'peace sign', THUMBS_UP: 'thumbs up' };

// Display names for the HUD.
export const LABEL = { NONE: 'none', FIST: 'fist', OPEN: 'open palm', PEACE: 'peace sign', THUMBS_UP: 'thumbs up', POINT: 'point',
  THUMBS_DOWN: 'thumbs down', I_LOVE_YOU: 'I love you' };

// Trained gestures (Phase 4) reach the agent as "trained:<name>", so one you
// call "FIST" can never be mistaken for the built-in fist.
export const TRAINED = 'trained:';

// Name to show for any gesture, including trained ones (which use their own name).
export const gestureLabel = (g) => (g.startsWith(TRAINED) ? g.slice(TRAINED.length) : LABEL[g] || g);
