// The tools the language-model agent (Phase 5) may call, and the checks every
// call must pass before anything moves. The same checks run twice: on the server,
// before a call is handed to the browser, and in the browser, before it runs.
// A model's output is untrusted input, just like an imported file.
// Pure: no DOM, no network.
import { WORKSPACE } from './workspace.js';
import { BLOCK_SIZE } from './stacking.js';

// Modes the agent may switch to. GREET and REPLAY are left out on purpose:
// a motion is played with play_motion, and waving is not a robot-control task.
export const LLM_MODES = ['MANUAL', 'HOLD', 'AUTO', 'IDLE'];

// At most this many tool calls are accepted from one model reply. Anything past
// it is rejected, so one reply can't queue up an endless list of moves.
export const MAX_CALLS_PER_STEP = 12;

export const MAX_NAME = 60;

const EMPTY = { type: 'object', properties: {}, additionalProperties: false };
const axis = (k, what) => ({ type: 'number', minimum: WORKSPACE[k][0], maximum: WORKSPACE[k][1], description: what });

// Tool definitions in the shape the Anthropic Messages API expects. The bounds
// are the workspace box the hand already uses (core/workspace.js), in the scene's
// own units (a block is 0.3 wide), so the model and the hand share one safe box.
export const TOOLS = [
  {
    name: 'move_gripper_to',
    description: `Glide the gripper point (between the fingers) in a straight line to a point in the workspace. Units are scene units; a block is ${BLOCK_SIZE} wide. x is left (-) to right (+), y is height above the floor, z is distance out from the robot base toward the viewer. Values outside the workspace are clamped to its edge. Returns where the gripper ended up.`,
    input_schema: {
      type: 'object',
      properties: {
        x: axis('x', 'left/right'),
        y: axis('y', 'height above the floor'),
        z: axis('z', 'distance out from the base'),
      },
      required: ['x', 'y', 'z'],
      additionalProperties: false,
    },
  },
  { name: 'open_gripper', description: 'Open the gripper. A held block is let go and falls straight down onto whatever is under it.', input_schema: EMPTY },
  { name: 'close_gripper', description: 'Close the gripper. It grabs the nearest uncovered block whose top centre is within 0.25 of the gripper point, if there is one.', input_schema: EMPTY },
  {
    name: 'play_motion',
    description: 'Play a saved motion by its name (get_scene lists them). Waits until it finishes.',
    input_schema: { type: 'object', properties: { name: { type: 'string', maxLength: MAX_NAME } }, required: ['name'], additionalProperties: false },
  },
  {
    name: 'set_mode',
    description: 'Set the robot mode. MANUAL hands control back to the user\'s hand, HOLD freezes the robot, AUTO runs the built-in pick-and-place demo, IDLE parks the arm.',
    input_schema: { type: 'object', properties: { mode: { type: 'string', enum: LLM_MODES } }, required: ['mode'], additionalProperties: false },
  },
  { name: 'get_scene', description: 'Get the block positions, the gripper position, what it holds, the mode and the saved motions.', input_schema: EMPTY },
];

export const TOOL_NAMES = TOOLS.map((t) => t.name);

const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const round = (v) => Math.round(v * 1000) / 1000;

// Check one call. call = { name, input }.
// Returns { ok: true, name, args, notes } with every number inside its bounds
// (notes says what was clamped), or { ok: false, name, error } to reject it.
export function checkToolCall(call) {
  const name = call && call.name;
  const reject = (error) => ({ ok: false, name: typeof name === 'string' ? name : String(name), error });
  if (typeof name !== 'string' || !TOOL_NAMES.includes(name)) return reject(`unknown tool "${name}"`);
  const input = call.input === undefined ? {} : call.input;
  if (!isObject(input)) return reject('the input must be an object');
  const notes = [];

  if (name === 'move_gripper_to') {
    const args = {};
    for (const k of ['x', 'y', 'z']) {
      const v = input[k];
      // A number only: a string such as "0.5" or a missing value is rejected,
      // not guessed at, because a wrong guess moves a real arm somewhere unplanned.
      if (typeof v !== 'number' || !Number.isFinite(v)) return reject(`${k} must be a number`);
      const [lo, hi] = WORKSPACE[k];
      args[k] = Math.min(hi, Math.max(lo, v));
      if (args[k] !== v) notes.push(`${k} ${round(v)} clamped to ${args[k]}`);
    }
    return { ok: true, name, args, notes };
  }
  if (name === 'play_motion') {
    if (typeof input.name !== 'string' || !input.name.trim()) return reject('name must be a non-empty string');
    if (input.name.length > MAX_NAME) return reject(`name is longer than ${MAX_NAME} characters`);
    return { ok: true, name, args: { name: input.name.trim() }, notes };
  }
  if (name === 'set_mode') {
    if (!LLM_MODES.includes(input.mode)) return reject(`mode must be one of ${LLM_MODES.join(', ')}`);
    return { ok: true, name, args: { mode: input.mode }, notes };
  }
  // open_gripper, close_gripper, get_scene take nothing.
  return { ok: true, name, args: {}, notes };
}

// Check every call in one model reply, in order. Calls past `max` are rejected.
// calls: [{ id, name, input }]. Returns { accepted, rejected }, both keeping the ids.
export function checkToolCalls(calls, max = MAX_CALLS_PER_STEP) {
  const accepted = [], rejected = [];
  (Array.isArray(calls) ? calls : []).forEach((c, i) => {
    const id = c && c.id;
    const r = i >= max ? { ok: false, name: String(c && c.name), error: `more than ${max} tool calls in one reply` } : checkToolCall(c);
    (r.ok ? accepted : rejected).push({ id, ...r });
  });
  return { accepted, rejected };
}

// A one-line description of a call for the agent log, e.g. move_gripper_to(x=-1, y=0.55, z=1.6).
export function describeCall(c) {
  const args = Object.entries(c.args || c.input || {}).map(([k, v]) => `${k}=${typeof v === 'number' ? round(v) : JSON.stringify(v)}`);
  return `${c.name}(${args.join(', ')})`;
}
