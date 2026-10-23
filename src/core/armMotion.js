// What the arm does in each agent mode. The agent (core/agent.js) decides the mode;
// this turns the mode into a goal pose for the arm. Pure maths, no DOM.
import { clamp, lerp } from './hand.js';
import { defaultArmPose, clampArmPose } from './armSpec.js';
import { solveIK } from './ik.js';

// The AUTO demo: pick a block up on the left and put it down on the right, then go home.
// Each key is a time (s), a gripper point and a grip. Between keys the arm glides.
// The points line up with the challenge's starting blocks (core/stacking.js): it closes
// just under the top of the left block, and lets go one block higher on the right, so
// it really does stack the left block on the right one.
const HOME = { x: 0, y: 1.6, z: 1.6 };
const A_UP = { x: -1, y: 1.3, z: 1.6 }, A_DOWN = { x: -1, y: 0.55, z: 1.6 };
const B_UP = { x: 1, y: 1.3, z: 1.6 }, B_DOWN = { x: 1, y: 0.9, z: 1.6 };
export const AUTO_PATH = [
  { t: 0.0, p: HOME, grip: 0 },
  { t: 1.2, p: A_UP, grip: 0 },
  { t: 2.0, p: A_DOWN, grip: 0 },
  { t: 2.6, p: A_DOWN, grip: 1 },   // close on the block
  { t: 3.4, p: A_UP, grip: 1 },
  { t: 5.0, p: B_UP, grip: 1 },
  { t: 5.8, p: B_DOWN, grip: 1 },
  { t: 6.4, p: B_DOWN, grip: 0 },   // let go
  { t: 7.2, p: B_UP, grip: 0 },
  { t: 8.4, p: HOME, grip: 0 },
];
export const AUTO_PERIOD = AUTO_PATH[AUTO_PATH.length - 1].t;

// Smoothstep eases in and out of each key, so the arm doesn't jerk at the corners.
const ease = (u) => u * u * (3 - 2 * u);

// Where the gripper should be t seconds into the demo. Loops forever.
export function autoPath(t) {
  const tt = ((Number.isFinite(t) ? t : 0) % AUTO_PERIOD + AUTO_PERIOD) % AUTO_PERIOD;
  let i = 0;
  while (i < AUTO_PATH.length - 2 && tt >= AUTO_PATH[i + 1].t) i++;
  const a = AUTO_PATH[i], b = AUTO_PATH[i + 1];
  const u = ease(clamp((tt - a.t) / (b.t - a.t), 0, 1));
  return {
    target: { x: lerp(a.p.x, b.p.x, u), y: lerp(a.p.y, b.p.y, u), z: lerp(a.p.z, b.p.z, u) },
    grip: lerp(a.grip, b.grip, u),
  };
}

// The goal for the arm in a mode.
// t: seconds since the mode began (so AUTO always starts at the top of its path).
// manual: { target, closed } from the hand; target is null when no hand is in view.
// llm: { target, grip } from the language agent (core/llmArm.js), used in LLM mode.
// Returns { pose, target, reachable }, or null to keep the arm exactly where it is.
// REPLAY is null too: main.js takes the pose from the motion being replayed.
export function armGoalFor(mode, t, manual = {}, llm = null) {
  if (mode === 'HOLD' || mode === 'REPLAY') return null;
  if (mode === 'IDLE') return { pose: defaultArmPose(), target: null, reachable: true };
  if (mode === 'GREET') {
    // Lift the arm and wave the gripper side to side, opening and closing it.
    const pose = { yaw: 0.35 * Math.sin(t * 4), shoulder: 1.5, elbow: 0.7, wrist: -0.3 + 0.4 * Math.sin(t * 8), grip: 0.5 + 0.5 * Math.sin(t * 8) };
    return { pose: clampArmPose(pose), target: null, reachable: true };
  }
  let target, grip;
  if (mode === 'AUTO') ({ target, grip } = autoPath(t));
  else if (mode === 'LLM') {
    if (!llm || !llm.target) return null;
    target = llm.target; grip = llm.grip;
  } else {
    // MANUAL: follow the hand. With no hand yet the arm waits where it is
    // (the agent parks it in IDLE after a few seconds).
    if (!manual.target) return null;
    target = manual.target; grip = manual.closed ? 1 : 0;
  }
  const ik = solveIK(target);
  return { pose: clampArmPose({ ...ik, grip }), target, reachable: ik.reachable };
}

// How the HUD and agent log describe each mode when the arm is selected.
export const ARM_MODE_DESC = {
  MANUAL: 'Gripper follows your hand. Pinch to grab',
  HOLD: 'Joints frozen. Show an open palm to resume',
  AUTO: 'Agent runs a pick-and-place demo. Show a peace sign to hand back',
  IDLE: 'Waiting for a hand. Arm parked',
  GREET: 'Waving hello',
  REPLAY: 'Playing a saved motion. Hold any command gesture to stop',
  LLM: 'The language agent is driving. Hold a fist or press Stop to take over',
};
export const ARM_ACT_TEXT = {
  MANUAL: 'move the gripper to your hand, pinch to grab',
  HOLD: 'freeze every joint at its current angle',
  AUTO: 'run the pick-and-place demo',
  IDLE: 'park the arm',
  GREET: 'wave the gripper for 3 s',
  REPLAY: 'play back a saved motion',
  LLM: 'move the gripper as the language agent asks',
};
