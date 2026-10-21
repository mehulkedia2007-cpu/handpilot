import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classify, pickGesture, BUILTIN, COMMANDS, SAYS, LABEL } from '../src/core/gestures.js';

// Order: thumb, index, middle, ring, pinky. 0 = straight, 1 = curled.
const hand = ([thumb, index, middle, ring, pinky]) => ({ thumb, index, middle, ring, pinky });

test('the simulator presets classify as expected', () => {
  assert.equal(classify(hand([0, 0, 0, 0, 0])), 'OPEN');
  assert.equal(classify(hand([1, 1, 1, 1, 1])), 'FIST');
  assert.equal(classify(hand([1, 0, 1, 1, 1])), 'POINT');
  assert.equal(classify(hand([1, 0, 0, 1, 1])), 'PEACE');
  assert.equal(classify(hand([0, 1, 1, 1, 1])), 'THUMBS_UP');
  assert.equal(classify(hand([0.5, 0.8, 0.8, 0.8, 0.8])), 'NONE');   // "Relax"
});

test('thumb position does not matter for peace and point', () => {
  assert.equal(classify(hand([0, 0, 0, 1, 1])), 'PEACE');
  assert.equal(classify(hand([0, 0, 1, 1, 1])), 'POINT');
});

test('half-bent fingers fall in the dead zone and give NONE', () => {
  assert.equal(classify(hand([0.5, 0.5, 0.5, 0.5, 0.5])), 'NONE');
  // 0.29 counts as up, 0.31 does not.
  assert.equal(classify(hand([0.29, 0.29, 0.29, 0.29, 0.29])), 'OPEN');
  assert.equal(classify(hand([0.31, 0.29, 0.29, 0.29, 0.29])), 'NONE');
  // 0.66 counts as down, 0.64 does not.
  assert.equal(classify(hand([0.66, 0.66, 0.66, 0.66, 0.66])), 'FIST');
  assert.equal(classify(hand([0.64, 0.66, 0.66, 0.66, 0.66])), 'NONE');
});

test('every command gesture has a mode, a log phrase and a label', () => {
  assert.deepEqual(COMMANDS, { FIST: 'HOLD', OPEN: 'MANUAL', PEACE: 'AUTO', THUMBS_UP: 'GREET' });
  for (const g of Object.keys(COMMANDS)) {
    assert.ok(SAYS[g], g);
    assert.ok(LABEL[g], g);
  }
  assert.equal(COMMANDS.POINT, undefined);
});

// A HandFrame with only the fields pickGesture reads.
const frame = (bends, builtInGesture = null, builtInScore = 0, present = true) =>
  ({ present, bends: hand(bends), builtInGesture, builtInScore });

test('every MediaPipe built-in label maps to a gesture with a display name', () => {
  for (const name of ['Closed_Fist', 'Open_Palm', 'Victory', 'Thumb_Up', 'Thumb_Down', 'Pointing_Up', 'ILoveYou']) {
    assert.ok(BUILTIN[name], name);
    assert.ok(LABEL[BUILTIN[name]], BUILTIN[name]);
  }
  assert.equal(COMMANDS[BUILTIN.Closed_Fist], 'HOLD');
  assert.equal(COMMANDS[BUILTIN.Victory], 'AUTO');
});

test('a confident built-in gesture wins over the rules', () => {
  // The bends say open palm, but MediaPipe is sure it is a fist.
  assert.equal(pickGesture(frame([0, 0, 0, 0, 0], 'Closed_Fist', 0.9)), 'FIST');
});

test('the rules decide when the built-in label is unsure, unknown or missing', () => {
  assert.equal(pickGesture(frame([0, 0, 0, 0, 0], 'Closed_Fist', 0.3)), 'OPEN');
  assert.equal(pickGesture(frame([1, 1, 1, 1, 1], 'None', 0.9)), 'FIST');
  assert.equal(pickGesture(frame([1, 0, 0, 1, 1])), 'PEACE');   // simulator: no label at all
});

test('no hand means no gesture', () => {
  assert.equal(pickGesture(frame([1, 1, 1, 1, 1], 'Closed_Fist', 0.9, false)), 'NONE');
});
