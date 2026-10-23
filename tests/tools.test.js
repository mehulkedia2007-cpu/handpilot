import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TOOLS, TOOL_NAMES, LLM_MODES, MAX_CALLS_PER_STEP, checkToolCall, checkToolCalls, describeCall } from '../src/core/tools.js';
import { WORKSPACE } from '../src/core/workspace.js';

const move = (input) => checkToolCall({ name: 'move_gripper_to', input });

test('the six planned tools exist, each with an object schema', () => {
  assert.deepEqual(TOOL_NAMES, ['move_gripper_to', 'open_gripper', 'close_gripper', 'play_motion', 'set_mode', 'get_scene']);
  for (const t of TOOLS) {
    assert.equal(t.input_schema.type, 'object', t.name);
    assert.ok(t.description.length > 10, t.name);
  }
});

test("move_gripper_to's schema uses the workspace box the hand uses", () => {
  const p = TOOLS.find((t) => t.name === 'move_gripper_to').input_schema.properties;
  for (const k of ['x', 'y', 'z']) assert.deepEqual([p[k].minimum, p[k].maximum], WORKSPACE[k]);
});

test('a move inside the box passes unchanged, with no notes', () => {
  const r = move({ x: -1, y: 0.55, z: 1.6 });
  assert.equal(r.ok, true);
  assert.deepEqual(r.args, { x: -1, y: 0.55, z: 1.6 });
  assert.deepEqual(r.notes, []);
});

test('out-of-range numbers are clamped to the box edge, and the note says so', () => {
  const r = move({ x: 9, y: -5, z: 1.6 });
  assert.equal(r.ok, true);
  assert.deepEqual(r.args, { x: WORKSPACE.x[1], y: WORKSPACE.y[0], z: 1.6 });
  assert.equal(r.notes.length, 2);
  assert.match(r.notes[0], /x 9 clamped to 2/);
  // Huge values too.
  assert.deepEqual(move({ x: -1e308, y: 1e308, z: 0 }).args, { x: WORKSPACE.x[0], y: WORKSPACE.y[1], z: WORKSPACE.z[0] });
});

test('malformed coordinates are rejected, not guessed', () => {
  for (const bad of [
    {}, { x: 0, y: 1 }, { x: '0.5', y: 1, z: 1.5 }, { x: NaN, y: 1, z: 1.5 }, { x: Infinity, y: 1, z: 1.5 },
    { x: null, y: 1, z: 1.5 }, { x: [0], y: 1, z: 1.5 }, { x: true, y: 1, z: 1.5 },
  ]) {
    const r = move(bad);
    assert.equal(r.ok, false, JSON.stringify(bad));
    assert.match(r.error, /must be a number/);
  }
});

test('the input must be an object', () => {
  for (const input of [null, 'x=1', 42, [1, 2, 3]]) {
    const r = checkToolCall({ name: 'open_gripper', input });
    assert.equal(r.ok, false);
    assert.match(r.error, /object/);
  }
  assert.equal(checkToolCall({ name: 'open_gripper' }).ok, true);   // no input at all is fine for a no-argument tool
});

test('unknown tools are rejected', () => {
  for (const name of ['rm_rf', 'Move_Gripper_To', '', undefined, null, 7, 'constructor', '__proto__']) {
    const r = checkToolCall({ name, input: {} });
    assert.equal(r.ok, false, String(name));
    assert.match(r.error, /unknown tool/);
  }
  assert.equal(checkToolCall(null).ok, false);
});

test('set_mode accepts only the listed modes', () => {
  for (const mode of LLM_MODES) assert.deepEqual(checkToolCall({ name: 'set_mode', input: { mode } }).args, { mode });
  for (const mode of ['GREET', 'REPLAY', 'LLM', 'manual', '', 3, undefined]) {
    const r = checkToolCall({ name: 'set_mode', input: { mode } });
    assert.equal(r.ok, false, String(mode));
    assert.match(r.error, /mode must be one of/);
  }
});

test('play_motion needs a sensible name, trimmed', () => {
  assert.deepEqual(checkToolCall({ name: 'play_motion', input: { name: '  Wave ' } }).args, { name: 'Wave' });
  for (const name of ['', '   ', 5, null, 'x'.repeat(61)]) assert.equal(checkToolCall({ name: 'play_motion', input: { name } }).ok, false);
});

test('a batch keeps ids, splits good from bad, and caps how many calls one reply may make', () => {
  const r = checkToolCalls([
    { id: 'a', name: 'get_scene', input: {} },
    { id: 'b', name: 'fly', input: {} },
    { id: 'c', name: 'move_gripper_to', input: { x: 0, y: 1, z: 5 } },
  ]);
  assert.deepEqual(r.accepted.map((c) => c.id), ['a', 'c']);
  assert.deepEqual(r.rejected.map((c) => c.id), ['b']);
  assert.equal(r.accepted[1].args.z, WORKSPACE.z[1]);

  const many = Array.from({ length: MAX_CALLS_PER_STEP + 3 }, (_, i) => ({ id: 'id' + i, name: 'open_gripper', input: {} }));
  const capped = checkToolCalls(many);
  assert.equal(capped.accepted.length, MAX_CALLS_PER_STEP);
  assert.equal(capped.rejected.length, 3);
  assert.match(capped.rejected[0].error, /more than/);
  assert.deepEqual(checkToolCalls('nonsense'), { accepted: [], rejected: [] });
});

test('describeCall gives a short line for the log', () => {
  assert.equal(describeCall({ name: 'move_gripper_to', args: { x: -1, y: 0.5512345, z: 1.6 } }), 'move_gripper_to(x=-1, y=0.551, z=1.6)');
  assert.equal(describeCall({ name: 'set_mode', args: { mode: 'HOLD' } }), 'set_mode(mode="HOLD")');
  assert.equal(describeCall({ name: 'open_gripper', args: {} }), 'open_gripper()');
});
