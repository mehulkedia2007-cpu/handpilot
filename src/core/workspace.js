// Hand position -> a 3D target point for the arm's wrist.
// The target lives inside a fixed box in front of the arm (the "workspace"),
// so whatever the hand does, the arm is only ever asked to reach somewhere sensible.
import { clamp, lerp } from './hand.js';

// World units, same as the 3D scene. The arm stands at the origin facing +z (the viewer).
export const WORKSPACE = {
  x: [-1.6, 1.6],   // left .. right on screen
  y: [0.3, 2.6],    // floor .. above the shoulder
  z: [0.9, 2.5],    // near the base .. out toward the viewer
};

// Palm width in the image (HandFrame palm.z) for a hand far from / close to the camera.
// Bigger means closer. Values outside this range are clamped.
export const DEPTH_RANGE = [0.07, 0.2];

// palm: { x, y, z } from a HandFrame (x, y in 0–1 image space, z = palm width).
export function targetFromPalm(palm, ws = WORKSPACE, depth = DEPTH_RANGE) {
  const unit = (v, fallback) => (Number.isFinite(v) ? clamp(v, 0, 1) : fallback);
  // The camera image is not mirrored, but the preview is. Moving your hand to your
  // right makes palm.x smaller, so use 1 - x to make the target follow on screen.
  const sx = 1 - unit(palm && palm.x, 0.5);
  // Image y grows downward; world y grows upward.
  const sy = 1 - unit(palm && palm.y, 0.5);
  // Pushing your hand toward the camera (wider palm) pushes the target into the
  // screen, toward the arm's base: the arm reaches the way your hand moves.
  const w = palm && palm.z;
  const near = Number.isFinite(w) ? clamp((w - depth[0]) / (depth[1] - depth[0]), 0, 1) : 0.5;
  return {
    x: lerp(ws.x[0], ws.x[1], sx),
    y: lerp(ws.y[0], ws.y[1], sy),
    z: lerp(ws.z[1], ws.z[0], near),
  };
}
