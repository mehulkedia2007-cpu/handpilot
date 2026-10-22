import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  BLOCK_SIZE, TABLE, GRAB_RADIUS, HOLD_TOP, SNAP_OVERLAP, startBlocks, topOf, findGrabbable, holdAt, dropBlock,
  footprintOverlap, supportFor, isOneStack, createStacker,
} from '../src/core/stacking.js';

const S = BLOCK_SIZE, REST = TABLE.top + S / 2;
const byId = (blocks, id) => blocks.find((b) => b.id === id);
const block = (id, x, y, z) => ({ id, x, y, z, yaw: 0 });
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} vs ${b}`);

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

/* ---------- P3.2: drop and stack ---------- */

test('footprint overlap is 1 when aligned, 0 when apart, and shrinks with the offset', () => {
  const a = block('a', 0, 0, 0);
  assert.equal(footprintOverlap(a, block('b', 0, 5, 0)), 1);   // height doesn't matter
  assert.equal(footprintOverlap(a, block('b', S, 0, 0)), 0);
  assert.ok(Math.abs(footprintOverlap(a, block('b', S / 2, 0, 0)) - 0.5) < 1e-12);
  assert.ok(Math.abs(footprintOverlap(a, block('b', S / 2, 0, S / 2)) - 0.25) < 1e-12);
});

test('dropping on a block lands on top of it and snaps into line', () => {
  const blue = block('blue', 1, REST, 1.6);
  const red = block('red', 1.04, 1.4, 1.63);   // a little off: about 77% overlap
  assert.ok(footprintOverlap(red, blue) > SNAP_OVERLAP);
  const { blocks, on, snapped } = dropBlock([blue, red], 'red');
  assert.equal(on, 'blue'); assert.equal(snapped, true);
  assert.deepEqual(byId(blocks, 'red'), block('red', 1, REST + S, 1.6));
  assert.ok(isOneStack(blocks));
});

test('a partial overlap still lands on the block, but is not snapped', () => {
  const blue = block('blue', 1, REST, 1.6);
  const red = block('red', 1 + S * 0.6, 1.4, 1.6);   // 40% overlap
  const { blocks, on, snapped } = dropBlock([blue, red], 'red');
  assert.equal(on, 'blue'); assert.equal(snapped, false);
  assert.deepEqual(byId(blocks, 'red'), block('red', 1 + S * 0.6, REST + S, 1.6));
});

test('a block that only misses lands on the table beside it', () => {
  const blue = block('blue', 1, REST, 1.6);
  const { blocks, on } = dropBlock([blue, block('red', 1 + S + 0.01, 1.4, 1.6)], 'red');
  assert.equal(on, 'table');
  assert.equal(byId(blocks, 'red').y, REST);
});

test('it rests on the highest block beneath its footprint', () => {
  // A two-block tower and a lone block, both partly under the falling one.
  const bs = [block('a', 0, REST, 1.6), block('b', 0, REST + S, 1.6), block('c', S * 0.9, REST, 1.6), block('d', S * 0.45, 2, 1.6)];
  const { blocks, on } = dropBlock(bs, 'd');
  assert.equal(on, 'b');
  near(byId(blocks, 'd').y, REST + 2 * S);
  assert.equal(supportFor(bs, block('x', S * 0.9, 2, 1.6)).under.id, 'b');
});

test('a covered block cannot be grabbed out from under another', () => {
  const bs = [block('a', 0, REST, 1.6), block('b', 0, REST + S, 1.6)];
  assert.equal(findGrabbable(bs, topOf(bs[0])), null);   // 'a' is covered, and b's top is out of reach
  assert.equal(findGrabbable(bs, topOf(bs[1])), 'b');
  assert.equal(findGrabbable([bs[0]], topOf(bs[0])), 'a');   // with nothing on top it is free again
});

test('a held block cannot be pushed into the table or another block', () => {
  const bs = [block('a', 0, REST, 1.6), block('b', 1, REST, 1.6)];
  assert.equal(byId(holdAt(bs, 'b', { x: 1, y: TABLE.top, z: 1.6 }), 'b').y, REST);
  assert.equal(byId(holdAt(bs, 'b', { x: 0, y: REST + S * 0.6, z: 1.6 }), 'b').y, REST + S);
});

test('one stack means every block sits on the one below', () => {
  const tower = [block('a', 0, REST, 1.6), block('b', 0, REST + S, 1.6), block('c', 0.1, REST + 2 * S, 1.6)];
  assert.ok(isOneStack(tower));
  assert.ok(isOneStack([...tower].reverse()));          // order doesn't matter
  assert.equal(isOneStack(startBlocks()), false);
  assert.equal(isOneStack([tower[0], tower[1], block('c', 1, REST, 1.6)]), false);   // two plus one
  assert.equal(isOneStack([tower[0], tower[1], block('c', 0, REST + 2 * S + 0.2, 1.6)]), false);   // still in the air
});

test('the stacker can build a full tower', () => {
  const st = createStacker();
  const [red, green, blue] = st.blocks;
  const carry = (from, onto) => {
    st.step(0, topOf(from));
    assert.equal(st.step(1, topOf(from)).type, 'grab');
    st.step(1, { x: from.x, y: 1.6, z: from.z });     // lift
    const above = { x: onto.x, y: onto.y + S + 0.3, z: onto.z };
    st.step(1, above);
    return st.step(0, above);
  };
  assert.equal(carry(red, blue).on, 'blue');
  assert.equal(carry(green, byId(st.blocks, 'red')).on, 'red');
  assert.ok(isOneStack(st.blocks));
});

test('the AUTO demo really stacks the left block on the right one', async () => {
  // Run the same steps as the main loop: eased arm pose -> FK gripper point -> stacker.
  const { armGoalFor, AUTO_PERIOD } = await import('../src/core/armMotion.js');
  const { blendPose } = await import('../src/core/agent.js');
  const { forwardKinematics } = await import('../src/core/ik.js');
  const { defaultArmPose } = await import('../src/core/armSpec.js');
  const st = createStacker(), cur = defaultArmPose(), events = [];
  for (let t = 0; t < AUTO_PERIOD; t += 1 / 60) {
    blendPose(cur, armGoalFor('AUTO', t).pose, 0.35);
    const ev = st.step(cur.grip, forwardKinematics(cur), cur.yaw);
    if (ev) events.push(ev);
  }
  assert.deepEqual(events.map((e) => e.type + ':' + (e.id || '')), ['grab:red', 'drop:red']);
  assert.equal(events[1].on, 'blue');
  assert.equal(events[1].snapped, true);
  near(byId(st.blocks, 'red').y, REST + S);
});
