// Blocks on a table, and the rules for grabbing them with the arm's gripper.
// Pure logic: block positions go in, block positions come out. The 3D scene
// (scene/blocks.js) only draws what this module says.
//
// A block is { id, x, y, z, yaw }: x, y, z is its centre in world units (same as
// the arm and workspace), yaw is its turn around the vertical axis.

export const BLOCK_SIZE = 0.3;   // every block is a cube this wide

// A low table in front of the arm. It covers the whole workspace box, so the
// gripper can always reach down to it.
export const TABLE = { top: 0.3, x: [-1.8, 1.8], z: [0.95, 2.5] };

// How close (world units) the gripper point must be to a block's top to grab it.
export const GRAB_RADIUS = 0.25;

// While held, the block's top sits this far above the gripper point, level with
// the top of the fingers, so the fingers look like they hold its upper half.
export const HOLD_TOP = 0.06;

// The eased grip (0 open .. 1 closed) has to pass these to count as closing or
// opening. Two thresholds again (like the pinch latch), so an in-between grip
// can never grab and drop on alternate frames.
export const GRIP = { close: 0.6, open: 0.4 };

export const BLOCK_IDS = ['red', 'green', 'blue'];
// Where each block starts. The AUTO demo picks up whatever is at x = -1.
const START = { red: { x: -1, z: 1.6 }, green: { x: 0, z: 1.6 }, blue: { x: 1, z: 1.6 } };

export function startBlocks(size = BLOCK_SIZE) {
  return BLOCK_IDS.map((id) => ({ id, x: START[id].x, y: TABLE.top + size / 2, z: START[id].z, yaw: 0 }));
}

const onTable = (x, z) => x >= TABLE.x[0] && x <= TABLE.x[1] && z >= TABLE.z[0] && z <= TABLE.z[1];

// The block's top centre, the point the gripper aims for.
export const topOf = (b, size = BLOCK_SIZE) => ({ x: b.x, y: b.y + size / 2, z: b.z });

// The nearest block whose top is within `radius` of the gripper point, or null.
export function findGrabbable(blocks, gripper, { radius = GRAB_RADIUS, size = BLOCK_SIZE } = {}) {
  let best = null, bestD = radius;
  for (const b of blocks) {
    const t = topOf(b, size);
    const d = Math.hypot(t.x - gripper.x, t.y - gripper.y, t.z - gripper.z);
    if (d <= bestD) { best = b.id; bestD = d; }
  }
  return best;
}

// Move block `id` with the gripper: centred under the fingers and turned with the base.
export function holdAt(blocks, id, gripper, yaw = 0, size = BLOCK_SIZE) {
  return blocks.map((b) => (b.id !== id ? b : {
    ...b, x: gripper.x, y: gripper.y + HOLD_TOP - size / 2, z: gripper.z, yaw,
  }));
}

// Let go of block `id`: it falls straight down onto the table (or the floor if it
// was carried off the table's edge) and sits square to the table again.
// Returns { blocks, on } where `on` says what it landed on.
export function dropBlock(blocks, id, size = BLOCK_SIZE) {
  const b = blocks.find((x) => x.id === id);
  if (!b) return { blocks, on: null };
  const table = onTable(b.x, b.z);
  const out = { ...b, y: (table ? TABLE.top : 0) + size / 2, yaw: 0 };
  return { blocks: blocks.map((x) => (x.id === id ? out : x)), on: table ? 'table' : 'floor' };
}

// Grabbing over time. Feed it the arm's eased grip and the gripper point every frame:
// the moment the grip closes it grabs the nearest block (if any), and the moment it
// opens it drops whatever it holds. Only one block can be held at a time.
export function createStacker(size = BLOCK_SIZE) {
  let blocks = startBlocks(size), held = null, closed = false;

  function drop() {
    if (!held) return null;
    const id = held, r = dropBlock(blocks, id, size);
    blocks = r.blocks; held = null;
    return { type: 'drop', id, on: r.on };
  }

  return {
    get blocks() { return blocks; },
    get held() { return held; },
    // Returns an event when something happened this frame ({type:'grab'|'miss'|'drop', ...}), else null.
    step(grip, gripper, yaw = 0) {
      let event = null;
      if (!closed && grip > GRIP.close) {
        closed = true;
        held = findGrabbable(blocks, gripper, { size });
        event = held ? { type: 'grab', id: held } : { type: 'miss' };
      } else if (closed && grip < GRIP.open) {
        closed = false;
        event = drop();
      }
      if (held) blocks = holdAt(blocks, held, gripper, yaw, size);
      return event;
    },
    // The block the gripper would grab if it closed now (for a hover highlight).
    hover(gripper) { return held ? null : findGrabbable(blocks, gripper, { size }); },
    // Drop whatever is held, e.g. when the arm is hidden.
    release: drop,
    // Blocks back to the start. The grip state is kept, so a gripper that is
    // already closed doesn't grab the moment the blocks reappear.
    reset() { blocks = startBlocks(size); held = null; },
  };
}
