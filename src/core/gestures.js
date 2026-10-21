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

// Which agent mode each command gesture asks for. POINT and NONE are not commands.
export const COMMANDS = { FIST: 'HOLD', OPEN: 'MANUAL', PEACE: 'AUTO', THUMBS_UP: 'GREET' };

// How the agent log talks about each gesture.
export const SAYS = { FIST: 'fist', OPEN: 'open palm', PEACE: 'peace sign', THUMBS_UP: 'thumbs up' };

// Display names for the HUD.
export const LABEL = { NONE: 'none', FIST: 'fist', OPEN: 'open palm', PEACE: 'peace sign', THUMBS_UP: 'thumbs up', POINT: 'point' };
