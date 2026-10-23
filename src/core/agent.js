// The agent: every frame it SEES (hand? which gesture?), DECIDES (which mode)
// and the page ACTS (moves the robot to the pose for that mode).
import { clamp, lerp } from './hand.js';
import { COMMANDS, SAYS } from './gestures.js';

export const MODES = ['MANUAL', 'HOLD', 'AUTO', 'IDLE', 'GREET', 'REPLAY'];

// What the agent says it will do when it enters each mode.
const ACT = {
  MANUAL: 'copy finger bends to joints',
  HOLD: 'freeze every joint at its current angle',
  AUTO: 'run the dance routine',
  GREET: 'wave the right arm for 3 s',
};

export class Agent {
  // onLog(tag, text) is called with tag SEE, DECIDE or ACT. now0 is the start time in ms.
  // Time is always passed in rather than read from a clock, so tests can use a fake clock.
  constructor(onLog, now0 = 0) {
    this.onLog = onLog || (() => {});
    this.mode = 'MANUAL'; this.modeSince = now0;
    this.handSeen = false; this.lastSeen = now0;
    this.cand = 'NONE'; this.candStart = now0; this.lastMatch = now0; this.fired = false;
    this.pend = null; this.pendSince = 0;
    this.holdMs = 900; this.idleMs = 3000; this.graceMs = 250; this.greetMs = 3000;
    this.progress = 0;
    this.actText = null;   // optional { MODE: text } to describe actions for another robot
    this.replay = null;    // { id, name } of the motion being replayed in REPLAY
    // Trained gestures (Phase 4): { gestureName: action }, where an action is
    // { type: 'mode', mode } or { type: 'motion', id, name }. Set by main.js.
    this.custom = {};
  }

  setMode(now, mode, why, act) {
    if (mode === this.mode) return;
    this.mode = mode; this.modeSince = now;
    this.onLog('DECIDE', why); this.onLog('ACT', (this.actText && this.actText[mode]) || act);
  }

  isCommand(g) { return Boolean(COMMANDS[g] || this.custom[g]); }

  // Only show hold progress for a gesture that would actually change something.
  wouldChange(g) {
    const c = this.custom[g];
    if (c) {
      if (c.type === 'motion') return !(this.mode === 'REPLAY' && this.replay && this.replay.id === c.id);
      return c.mode === 'AUTO' || this.mode !== c.mode;   // AUTO toggles, like the peace sign
    }
    if (g === 'FIST') return this.mode !== 'HOLD';
    if (g === 'OPEN') return this.mode !== 'MANUAL';
    if (g === 'PEACE') return true;
    if (g === 'THUMBS_UP') return this.mode !== 'GREET';
    return false;
  }

  // What holding g would do, for the HUD ("Keep holding to send HOLD").
  sends(g) {
    const c = this.custom[g];
    const mode = c ? (c.type === 'motion' ? null : c.mode) : COMMANDS[g];
    if (c && c.type === 'motion') return `replay "${c.name}"`;
    if (mode === 'AUTO' && this.mode === 'AUTO') return 'MANUAL';   // the toggle hands control back
    return mode || null;
  }

  // Switch to a mode because a command (built-in or trained) asked for it.
  commandMode(now, mode, who) {
    if (mode === 'AUTO' && this.mode === 'AUTO') this.setMode(now, 'MANUAL', who + ' held again, release AUTO', ACT.MANUAL);
    else if (mode === 'AUTO') this.setMode(now, 'AUTO', who + ' held, take over', ACT.AUTO);
    else if (mode === 'HOLD') this.setMode(now, 'HOLD', who + ' held, latch HOLD', ACT.HOLD);
    else if (mode === 'MANUAL') this.setMode(now, 'MANUAL', who + ' held, control returns to you', ACT.MANUAL);
    else if (mode === 'GREET') this.setMode(now, 'GREET', who + ' held, say hello', ACT.GREET);
  }

  runCommand(now, g) {
    const c = this.custom[g];
    if (c && c.type === 'motion') this.startReplay(now, c, `"${g}" held, replay a saved motion`);
    else if (c) this.commandMode(now, c.mode, `"${g}"`);
    // Peace toggles: it starts AUTO, and the same sign again hands control back.
    else this.commandMode(now, COMMANDS[g], SAYS[g]);
  }

  // REPLAY plays a saved motion (core/motion.js). It is started by the Play button
  // or a trained gesture, and ends with endReplay() when the motion finishes, or
  // when any command gesture is held.
  startReplay(now, motion, why) {
    this.replay = { id: motion.id, name: motion.name };
    this.mode = 'REPLAY'; this.modeSince = now;
    // The gesture being held right now doesn't count as an interruption, only
    // one you show after the replay starts. Otherwise an open hand in front of
    // the camera would stop every replay 0.9 s in.
    this.fired = true;
    this.onLog('DECIDE', why); this.onLog('ACT', `replay "${motion.name}"`);
  }

  endReplay(now, why = 'replay finished') {
    if (this.mode === 'REPLAY') this.setMode(now, 'MANUAL', why, ACT.MANUAL);
  }

  // obs = { hand: boolean, gesture: string }. Returns the AgentState.
  step(now, obs) {
    // SEE: is a hand there?
    if (obs.hand) {
      this.lastSeen = now;
      if (!this.handSeen) { this.handSeen = true; this.onLog('SEE', 'hand detected'); }
      if (this.mode === 'IDLE') this.setMode(now, 'MANUAL', 'hand is back, resume following', ACT.MANUAL);
    } else if (this.handSeen) {
      this.handSeen = false; this.onLog('SEE', 'hand lost');
    }
    // DECIDE: nothing to follow for a while -> go idle on my own.
    if (!obs.hand && this.mode === 'MANUAL' && now - this.lastSeen > this.idleMs)
      this.setMode(now, 'IDLE', 'no hand for 3 s, nothing to follow', 'ease the robot back to its neutral pose');
    // DECIDE: a one-shot greeting ends by itself.
    if (this.mode === 'GREET' && now - this.modeSince > this.greetMs)
      this.setMode(now, 'MANUAL', 'greeting finished', ACT.MANUAL);
    // Gesture must be held. A short flicker (graceMs) does not reset the timer,
    // and the hold is timed from the first moment the new gesture was seen.
    const g = obs.hand ? obs.gesture : 'NONE';
    if (g === this.cand) { this.lastMatch = now; this.pend = null; }
    else {
      if (this.pend !== g) { this.pend = g; this.pendSince = now; }
      if (now - this.lastMatch > this.graceMs) {
        this.cand = g; this.candStart = this.pendSince; this.lastMatch = now; this.fired = false; this.pend = null;
      }
    }
    this.progress = 0;
    if (this.isCommand(this.cand) && !this.fired && this.wouldChange(this.cand)) {
      this.progress = clamp((now - this.candStart) / this.holdMs, 0, 1);
      if (this.progress >= 1) { this.fired = true; this.progress = 0; this.runCommand(now, this.cand); }
    }
    return { mode: this.mode, progress: this.progress, candidate: this.cand, sends: this.progress > 0 ? this.sends(this.cand) : null };
  }
}

// Target joint angles in radians for each mode.
// t is seconds since start, b the finger bends, yaw the body turn.
// HOLD returns null so the robot keeps its current pose. REPLAY also returns
// null: main.js takes the pose from the motion being replayed instead.
export function poseFor(mode, t, b, yaw) {
  if (mode === 'HOLD' || mode === 'REPLAY') return null;
  if (mode === 'AUTO') {
    return {
      rS: 1.5 + Math.sin(t * 2.2) * 0.9, rE: 0.6 + 0.5 * Math.sin(t * 4.4 + 1),
      lS: 1.5 + Math.sin(t * 2.2 + Math.PI) * 0.9, lE: 0.6 + 0.5 * Math.sin(t * 4.4 + 2.5),
      head: Math.sin(t * 2.2) * 0.25, yaw: Math.sin(t * 0.8) * 0.6, bob: Math.abs(Math.sin(t * 2.2)) * 0.08,
    };
  }
  if (mode === 'IDLE') {
    return {
      rS: 0.12 + 0.03 * Math.sin(t * 1.4), rE: 0.1, lS: 0.12 + 0.03 * Math.sin(t * 1.4), lE: 0.1,
      head: 0.05 * Math.sin(t * 0.9), yaw: 0, bob: 0.015 * Math.sin(t * 1.4),
    };
  }
  if (mode === 'GREET') {
    return { rS: 2.55, rE: 0.7 + 0.55 * Math.sin(t * 9), lS: 0.12, lE: 0.1, head: 0.15, yaw: 0, bob: 0 };
  }
  // MANUAL: each finger drives one joint.
  return {
    rS: (1 - b.index) * 2.7, rE: b.middle * 2.0, lS: (1 - b.ring) * 2.7, lE: b.pinky * 2.0,
    head: (b.thumb - 0.5) * 0.8, yaw, bob: 0,
  };
}

// Move the current pose a fraction alpha of the way to the target (in place).
// Doing this every frame gives a smooth ease-out instead of jumping.
export function blendPose(cur, target, alpha) {
  for (const k in cur) cur[k] = lerp(cur[k], target[k], alpha);
  return cur;
}
