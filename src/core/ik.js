// Inverse kinematics (IK) for the arm: given a point to reach, find the joint angles.
// Forward kinematics (FK) is the opposite: given the angles, where does the gripper end up?
// Pure maths, no DOM. Angle conventions are described in core/armSpec.js.
//
// The trick that keeps this simple: the base turns the whole arm toward the target,
// and then the shoulder and elbow only have to solve a flat 2D problem in that plane.
// Two links and the line from shoulder to wrist make a triangle, and the law of
// cosines gives its angles.
import { ARM, ARM_LIMITS } from './armSpec.js';
import { clamp } from './hand.js';

const EPS = 1e-6;
// acos is only defined on [-1, 1]; rounding can push a value just outside and give NaN.
const safeAcos = (v) => Math.acos(clamp(v, -1, 1));

// target: {x, y, z} for the gripper point. spec: { L1, L2, shoulderHeight, tool, limits }.
// Returns { yaw, shoulder, elbow, wrist, reachable }.
export function solveIK(target, spec = { ...ARM, limits: ARM_LIMITS }) {
  const { L1, L2, shoulderHeight, tool = 0, limits = ARM_LIMITS } = spec;
  // Treat missing or broken coordinates as 0 so the answer is never NaN.
  const num = (v) => (Number.isFinite(v) ? v : 0);
  const x = num(target && target.x), y = num(target && target.y), z = num(target && target.z);
  const finite = target && [target.x, target.y, target.z].every(Number.isFinite);

  // 1. Base: turn to face the target. yaw = 0 faces +z.
  const yaw = Math.atan2(x, z);
  // 2. Work in the arm's plane: r is horizontal distance, h is height above the shoulder.
  //    The gripper sticks out `tool` past the wrist and stays level, so the wrist aims short by that much.
  const r = Math.hypot(x, z) - tool;
  const h = y - shoulderHeight;
  // 3. Distance shoulder -> wrist, kept inside what two links can span. If it had to be
  //    clamped the target is out of reach, and the arm stretches (or folds) toward it instead.
  const rawD = Math.hypot(r, h);
  const d = clamp(rawD, Math.abs(L1 - L2) + EPS, L1 + L2 - EPS);
  let reachable = finite && d === rawD;
  // 4. Law of cosines for the elbow's inside angle; elbow = how far it folds from straight.
  const elbowInterior = safeAcos((L1 * L1 + L2 * L2 - d * d) / (2 * L1 * L2));
  const elbow = Math.PI - elbowInterior;
  // 5. Shoulder: angle up to the target, plus the triangle's angle at the shoulder.
  //    Adding (not subtracting) gives the "elbow-up" solution, like a desk lamp.
  const shoulder = Math.atan2(h, r) + safeAcos((L1 * L1 + d * d - L2 * L2) / (2 * L1 * d));

  // 6. Respect the joint limits. The wrist is worked out after clamping, so the
  //    gripper stays as level as the clamped arm allows.
  const lim = (j, v) => clamp(v, limits[j][0], limits[j][1]);
  const out = { yaw: lim('yaw', yaw), shoulder: lim('shoulder', shoulder), elbow: lim('elbow', elbow) };
  out.wrist = lim('wrist', -(out.shoulder - out.elbow));
  if (out.yaw !== yaw || out.shoulder !== shoulder || out.elbow !== elbow || out.wrist !== -(out.shoulder - out.elbow)) reachable = false;
  out.reachable = !!reachable;
  return out;
}

// Where the gripper point ends up for the given angles.
export function forwardKinematics(a, spec = ARM) {
  const { L1, L2, shoulderHeight, tool = 0 } = spec;
  const fore = a.shoulder - a.elbow;            // forearm angle above horizontal
  const grip = fore + a.wrist;                  // gripper angle above horizontal (0 when level)
  const r = L1 * Math.cos(a.shoulder) + L2 * Math.cos(fore) + tool * Math.cos(grip);
  const y = shoulderHeight + L1 * Math.sin(a.shoulder) + L2 * Math.sin(fore) + tool * Math.sin(grip);
  return { x: r * Math.sin(a.yaw), y, z: r * Math.cos(a.yaw) };
}
