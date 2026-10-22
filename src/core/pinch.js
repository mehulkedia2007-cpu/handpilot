// Pinch to grab, with hysteresis.
// pinch = thumb tip to index tip / palm width (see pinchFromLandmarks in hand.js):
// about 0 when the tips touch, about 1 or more with the hand open.
//
// One threshold would flicker: a value hovering around it, plus a little noise,
// would cross it back and forth every frame and the gripper would chatter.
// Hysteresis uses two thresholds instead. The gripper closes only once pinch drops
// below `close`, and opens again only once it rises above the higher `open`.
// Anything in between keeps the current state, so noise smaller than the gap
// can never toggle it.
export const PINCH = { close: 0.35, open: 0.5 };

export function createPinchLatch({ close = PINCH.close, open = PINCH.open } = {}) {
  let closed = false;
  return {
    // value: the latest pinch, or null/NaN when there is none (simulator off, hand lost).
    // A missing value keeps the last state, so losing the hand for a frame doesn't drop the block.
    update(value) {
      if (!Number.isFinite(value)) return closed;
      if (!closed && value < close) closed = true;
      else if (closed && value > open) closed = false;
      return closed;
    },
    get closed() { return closed; },
    reset() { closed = false; },
  };
}
