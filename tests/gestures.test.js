import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classify, COMMANDS, SAYS, LABEL } from '../src/core/gestures.js';

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
