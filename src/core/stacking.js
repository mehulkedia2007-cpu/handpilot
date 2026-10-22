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

// A dropped block that covers more than this share of the block under it snaps
// exactly on top of it. Less than that, it stays where it was let go.
export const SNAP_OVERLAP = 0.6;

export const BLOCK_IDS = ['red', 'green', 'blue'];
// Where each block starts. The AUTO demo picks up whatever is at x = -1.
const START = { red: { x: -1, z: 1.6 }, green: { x: 0, z: 1.6 }, blue: { x: 1, z: 1.6 } };

export function startBlocks(size = BLOCK_SIZE) {
  return BLOCK_IDS.map((id) => ({ id, x: START[id].x, y: TABLE.top + size / 2, z: START[id].z, yaw: 0 }));
}

const onTable = (x, z) => x >= TABLE.x[0] && x <= TABLE.x[1] && z >= TABLE.z[0] && z <= TABLE.z[1];

// The block's top centre, the point the gripper aims for.
export const topOf = (b, size = BLOCK_SIZE) => ({ x: b.x, y: b.y + size / 2, z: b.z });

// How much of one block's footprint (seen from above) the other covers, 0 to 1.
// Blocks at rest are always square to the table, so the footprints are axis-aligned
// squares and the overlap is just (overlap in x) * (overlap in z) / area.
export function footprintOverlap(a, b, size = BLOCK_SIZE) {
  const ox = Math.max(0, size - Math.abs(a.x - b.x));
  const oz = Math.max(0, size - Math.abs(a.z - b.z));
  return (ox * oz) / (size * size);
}

// What block `b` would land on if it fell straight down from where it is:
// the highest block under its footprint (any overlap counts), else the table,
// else the floor. Returns { top, under } with `under` the supporting block or null.
// Blocks whose centre is not below b's centre are ignored: they are beside or above it.
export function supportFor(blocks, b, size = BLOCK_SIZE) {
  let top = onTable(b.x, b.z) ? TABLE.top : 0, under = null;
  for (const o of blocks) {
    if (o.id === b.id || o.y >= b.y || footprintOverlap(o, b, size) === 0) continue;
    if (o.y + size / 2 > top) { top = o.y + size / 2; under = o; }
  }
  return { top, under };
}

// A block with another block resting on it can't be pulled out from under it.
export function isCovered(blocks, b, size = BLOCK_SIZE) {
  return blocks.some((o) => o.id !== b.id && o.y > b.y && footprintOverlap(o, b, size) > 0);
}

// The nearest uncovered block whose top is within `radius` of the gripper point, or null.
export function findGrabbable(blocks, gripper, { radius = GRAB_RADIUS, size = BLOCK_SIZE } = {}) {
  let best = null, bestD = radius;
  for (const b of blocks) {
    if (isCovered(blocks, b, size)) continue;
    const t = topOf(b, size);
    const d = Math.hypot(t.x - gripper.x, t.y - gripper.y, t.z - gripper.z);
    if (d <= bestD) { best = b.id; bestD = d; }
  }
  return best;
}

// Move block `id` with the gripper: centred under the fingers and turned with the base.
// Pushing it down into the table or onto another block can't sink it in: it stops
// on whatever is under it, as if resting there while still held.
export function holdAt(blocks, id, gripper, yaw = 0, size = BLOCK_SIZE) {
  return blocks.map((b) => {
    if (b.id !== id) return b;
    const moved = { ...b, x: gripper.x, y: gripper.y + HOLD_TOP - size / 2, z: gripper.z, yaw };
    moved.y = Math.max(moved.y, supportFor(blocks, moved, size).top + size / 2);
    return moved;
  });
}

// Let go of block `id`: it falls straight down until it rests on the table (or the
// floor, off the table's edge) or on the highest block beneath its footprint. It
// lands square to the table, and if it mostly covers the block under it (more than
// SNAP_OVERLAP) it snaps exactly on top, so a tower lines up neatly.
// Returns { blocks, on, snapped }: `on` is 'table', 'floor' or the id of the block under it.
export function dropBlock(blocks, id, size = BLOCK_SIZE) {
  const b = blocks.find((x) => x.id === id);
  if (!b) return { blocks, on: null, snapped: false };
  const { top, under } = supportFor(blocks, b, size);
  const out = { ...b, y: top + size / 2, yaw: 0 };
  const snapped = !!under && footprintOverlap(b, under, size) > SNAP_OVERLAP;
  if (snapped) { out.x = under.x; out.z = under.z; }
  const on = under ? under.id : onTable(b.x, b.z) ? 'table' : 'floor';
  return { blocks: blocks.map((x) => (x.id === id ? out : x)), on, snapped };
}

// True when every block is part of one tower: sorted by height, each one rests
// exactly one block-height above the one before and overlaps it.
export function isOneStack(blocks, size = BLOCK_SIZE) {
  const s = [...blocks].sort((a, b) => a.y - b.y);
  for (let i = 1; i < s.length; i++) {
    if (Math.abs(s[i].y - s[i - 1].y - size) > 1e-6 || footprintOverlap(s[i], s[i - 1], size) === 0) return false;
  }
  return s.length > 0;
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
    return { type: 'drop', id, on: r.on, snapped: r.snapped };
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
