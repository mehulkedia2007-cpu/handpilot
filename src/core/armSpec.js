// The robot arm's measurements and joint limits, shared by the 3D model
// (scene/arm.js) and, from P2.3, the inverse-kinematics solver (core/ik.js).
// Keeping them in one pure module means the model and the maths can never disagree.
//
// Angle conventions (radians), chosen to match the IK formulas in PLAN.md:
// - yaw:      turn of the base around the vertical axis. 0 points the arm at the viewer (+z).
// - shoulder: upper arm's angle above horizontal. 0 = level, PI/2 = straight up.
// - elbow:    how far the forearm folds down from the upper arm's line. 0 = straight.
// - wrist:    gripper tilt relative to the forearm. wrist = -(shoulder - elbow) keeps it level.
// - grip:     0 = fingers fully open, 1 = fully closed.

export const ARM = {
  shoulderHeight: 1.1,   // floor to shoulder axis
  L1: 1.6,               // shoulder axis to elbow axis
  L2: 1.4,               // elbow axis to wrist axis
  tool: 0.5,             // wrist axis to the middle of the gripper fingers (the point that grabs)
};

export const ARM_JOINTS = ['yaw', 'shoulder', 'elbow', 'wrist', 'grip'];

// Roughly what a desktop arm can do: the base can't spin all the way round
// (its cable would wind up), and the elbow only folds one way.
export const ARM_LIMITS = {
  yaw: [-2.6, 2.6],
  shoulder: [-0.2, 2.9],
  elbow: [0, 2.7],
  wrist: [-2.8, 2.8],
  grip: [0, 1],
};

// The parked pose: folded up and leaning back a little, gripper level.
export function defaultArmPose() {
  return { yaw: 0, shoulder: 1.2, elbow: 2.0, wrist: 0.8, grip: 0 };
}

// Keep every joint inside its limits. A missing or non-numeric value becomes
// the parked value, so a bad input can never put NaN on the model.
export function clampArmPose(p) {
  const park = defaultArmPose(), out = {};
  for (const j of ARM_JOINTS) {
    const [lo, hi] = ARM_LIMITS[j];
    const v = p && Number.isFinite(p[j]) ? p[j] : park[j];
    out[j] = Math.min(hi, Math.max(lo, v));
  }
  return out;
}
