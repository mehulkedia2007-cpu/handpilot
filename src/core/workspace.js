// Hand position -> a 3D target point for the arm's wrist.
// The target lives inside a fixed box in front of the arm (the "workspace"),
// so whatever the hand does, the arm is only ever asked to reach somewhere sensible.
import { clamp, lerp } from './hand.js';

// World units, same as the 3D scene. The arm stands at the origin facing +z (the viewer).
export const WORKSPACE = {
  x: [-2.0, 2.0],   // left .. right on screen; at the near edge the base turns about 60° each way
  y: [0.3, 2.4],    // floor .. above the shoulder
  z: [1.1, 2.3],    // near the base .. out toward the viewer
};

// Palm width in the image (HandFrame palm.z) for a hand far from / close to the camera.
// Bigger means closer. Values outside this range are clamped.
export const DEPTH_RANGE = [0.07, 0.2];

// Hand sensitivity: how much the hand's movement is stretched around the middle of
// the camera image. With 1, the palm would have to reach the very edge of the image
// to reach the edge of the box, but your hand leaves the frame well before its middle
// knuckle gets there. With 1.6, the middle ~60% of the image already covers the box.
export const GAIN_RANGE = [1, 2.5];
export const DEFAULT_GAIN = 1.6;

// palm: { x, y, z } from a HandFrame (x, y in 0–1 image space, z = palm width).
// gain: hand sensitivity (see above); the simulator passes 1 because its sliders already span 0–1.
export function targetFromPalm(palm, ws = WORKSPACE, depth = DEPTH_RANGE, gain = 1) {
  const g = Number.isFinite(gain) ? clamp(gain, GAIN_RANGE[0], GAIN_RANGE[1]) : 1;
  // Stretch around the centre, then clamp, so the target pins at the box edge instead of leaving it.
  const unit = (v, fallback) => (Number.isFinite(v) ? clamp(0.5 + (v - 0.5) * g, 0, 1) : fallback);
  // The camera image is not mirrored, but the preview is. Moving your hand to your
  // right makes palm.x smaller, so use 1 - x to make the target follow on screen.
  const sx = 1 - unit(palm && palm.x, 0.5);
  // Image y grows downward; world y grows upward.
  const sy = 1 - unit(palm && palm.y, 0.5);
  // Pushing your hand toward the camera (wider palm) pushes the target into the
  // screen, toward the arm's base: the arm reaches the way your hand moves.
  const w = palm && palm.z;
  const near = Number.isFinite(w) ? unit((w - depth[0]) / (depth[1] - depth[0]), 0.5) : 0.5;
  return {
    x: lerp(ws.x[0], ws.x[1], sx),
    y: lerp(ws.y[0], ws.y[1], sy),
    z: lerp(ws.z[1], ws.z[0], near),
  };
}
