import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  BLOCK_SIZE, TABLE, GRAB_RADIUS, HOLD_TOP, startBlocks, topOf, findGrabbable, holdAt, dropBlock, createStacker,
} from '../src/core/stacking.js';

const S = BLOCK_SIZE, REST = TABLE.top + S / 2;
const byId = (blocks, id) => blocks.find((b) => b.id === id);
const block = (id, x, y, z) => ({ id, x, y, z, yaw: 0 });

test('three blocks start resting on the table, apart from each other', () => {
  const bs = startBlocks();
  assert.deepEqual(bs.map((b) => b.id), ['red', 'green', 'blue']);
  for (const b of bs) assert.equal(b.y, REST);
  for (let i = 1; i < bs.length; i++) assert.ok(Math.abs(bs[i].x - bs[i - 1].x) > S);
});

test('only a block whose top is within the grab radius can be grabbed', () => {
  const bs = startBlocks(), red = byId(bs, 'red');
  assert.equal(findGrabbable(bs, topOf(red)), 'red');
  assert.equal(findGrabbable(bs, { ...topOf(red), y: topOf(red).y + GRAB_RADIUS * 0.9 }), 'red');
  assert.equal(findGrabbable(bs, { ...topOf(red), y: topOf(red).y + GRAB_RADIUS * 1.1 }), null);
  assert.equal(findGrabbable(bs, { x: -0.5, y: 0.6, z: 1.6 }), null);   // between red and green
});

test('the nearest block wins when two are in reach', () => {
  const bs = [block('a', 0, REST, 1.6), block('b', 0.32, REST, 1.6)];
  assert.equal(findGrabbable(bs, { x: 0.2, y: 0.6, z: 1.6 }), 'b');
  assert.equal(findGrabbable(bs, { x: 0.1, y: 0.6, z: 1.6 }), 'a');
});

test('a held block hangs from the fingers and turns with the base', () => {
  const g = { x: 0.4, y: 1.2, z: 1.9 };
  const b = byId(holdAt(startBlocks(), 'green', g, 0.5), 'green');
  assert.equal(b.x, g.x); assert.equal(b.z, g.z); assert.equal(b.yaw, 0.5);
  assert.ok(Math.abs(b.y + S / 2 - (g.y + HOLD_TOP)) < 1e-12);   // its top is level with the finger tops
});

test('dropping puts a block back on the table, square and level', () => {
  const bs = holdAt(startBlocks(), 'red', { x: 0.5, y: 1.5, z: 2 }, 0.7);
  const { blocks, on } = dropBlock(bs, 'red');
  assert.equal(on, 'table');
  assert.deepEqual(byId(blocks, 'red'), block('red', 0.5, REST, 2));
});

test('a block dropped off the table lands on the floor', () => {
  const { blocks, on } = dropBlock([block('red', 3, 1, 1)], 'red');
  assert.equal(on, 'floor');
  assert.equal(byId(blocks, 'red').y, S / 2);
});

test('the stacker grabs when the grip closes and drops when it opens', () => {
  const st = createStacker(), red = topOf(byId(st.blocks, 'red'));
  assert.equal(st.step(0, red), null);
  assert.deepEqual(st.step(1, red), { type: 'grab', id: 'red' });
  assert.equal(st.held, 'red');
  const up = { ...red, y: 1.5 };
  assert.equal(st.step(1, up), null);
  assert.ok(byId(st.blocks, 'red').y > REST);   // carried up
  assert.equal(st.step(0, up).type, 'drop');
  assert.equal(st.held, null);
  assert.equal(byId(st.blocks, 'red').y, REST);
});

test('only one block is held at a time, and closing on air grabs nothing', () => {
  const st = createStacker(), bs = st.blocks;
  assert.deepEqual(st.step(1, { x: -0.5, y: 1.5, z: 1.6 }), { type: 'miss' });
  // Sweeping a closed gripper over other blocks doesn't pick them up.
  for (const b of bs) st.step(1, topOf(b));
  assert.equal(st.held, null);
  st.step(0, topOf(bs[0]));
  st.step(1, topOf(bs[0]));
  assert.equal(st.held, 'red');
  st.step(1, topOf(bs[1]));   // carry red over green
  assert.equal(st.held, 'red');
  assert.equal(st.blocks.filter((b) => b.y !== REST).length, 1);
});

test('a grip hovering between the thresholds never grabs and drops on alternate frames', () => {
  const st = createStacker(), red = topOf(byId(st.blocks, 'red'));
  st.step(1, red);
  let events = 0;
  for (let i = 0; i < 200; i++) if (st.step(0.5 + 0.09 * Math.sin(i * 1.7), red)) events++;
  assert.equal(events, 0);
  assert.equal(st.held, 'red');
});

test('release and reset', () => {
  const st = createStacker();
  st.step(1, topOf(byId(st.blocks, 'blue')));
  assert.equal(st.release().type, 'drop');
  assert.equal(st.release(), null);
  st.reset();
  assert.deepEqual(st.blocks, startBlocks());
  // Still closed after the reset, so nothing is grabbed until the grip opens and closes again.
  assert.equal(st.step(1, topOf(byId(st.blocks, 'blue'))), null);
});
