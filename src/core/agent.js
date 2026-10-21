// The agent: every frame it SEES (hand? which gesture?), DECIDES (which mode)
// and the page ACTS (moves the robot to the pose for that mode).
import { clamp, lerp } from './hand.js';
import { COMMANDS, SAYS } from './gestures.js';

export const MODES = ['MANUAL', 'HOLD', 'AUTO', 'IDLE', 'GREET'];

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
  }

  setMode(now, mode, why, act) {
    if (mode === this.mode) return;
    this.mode = mode; this.modeSince = now;
    this.onLog('DECIDE', why); this.onLog('ACT', act);
  }

  // Only show hold progress for a gesture that would actually change something.
  wouldChange(g) {
    if (g === 'FIST') return this.mode !== 'HOLD';
    if (g === 'OPEN') return this.mode !== 'MANUAL';
    if (g === 'PEACE') return true;
    if (g === 'THUMBS_UP') return this.mode !== 'GREET';
    return false;
  }

  runCommand(now, g) {
    const s = SAYS[g];
    if (g === 'FIST') this.setMode(now, 'HOLD', s + ' held, latch HOLD', 'freeze every joint at its current angle');
    else if (g === 'OPEN') this.setMode(now, 'MANUAL', s + ' held, control returns to you', 'copy finger bends to joints');
    else if (g === 'PEACE') {
      // Peace toggles: it starts AUTO, and the same sign again hands control back.
      if (this.mode === 'AUTO') this.setMode(now, 'MANUAL', s + ' held again, release AUTO', 'copy finger bends to joints');
      else this.setMode(now, 'AUTO', s + ' held, take over', 'run the dance routine');
    }
    else if (g === 'THUMBS_UP') this.setMode(now, 'GREET', s + ' held, say hello', 'wave the right arm for 3 s');
  }

  // obs = { hand: boolean, gesture: string }. Returns the AgentState.
  step(now, obs) {
    // SEE: is a hand there?
    if (obs.hand) {
      this.lastSeen = now;
      if (!this.handSeen) { this.handSeen = true; this.onLog('SEE', 'hand detected'); }
      if (this.mode === 'IDLE') this.setMode(now, 'MANUAL', 'hand is back, resume following', 'copy finger bends to joints');
    } else if (this.handSeen) {
      this.handSeen = false; this.onLog('SEE', 'hand lost');
    }
    // DECIDE: nothing to follow for a while -> go idle on my own.
    if (!obs.hand && this.mode === 'MANUAL' && now - this.lastSeen > this.idleMs)
      this.setMode(now, 'IDLE', 'no hand for 3 s, nothing to follow', 'ease the robot back to its neutral pose');
    // DECIDE: a one-shot greeting ends by itself.
    if (this.mode === 'GREET' && now - this.modeSince > this.greetMs)
      this.setMode(now, 'MANUAL', 'greeting finished', 'copy finger bends to joints');
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
    if (COMMANDS[this.cand] && !this.fired && this.wouldChange(this.cand)) {
      this.progress = clamp((now - this.candStart) / this.holdMs, 0, 1);
      if (this.progress >= 1) { this.fired = true; this.progress = 0; this.runCommand(now, this.cand); }
    }
    return { mode: this.mode, progress: this.progress, candidate: this.cand };
  }
}

// Target joint angles in radians for each mode.
// t is seconds since start, b the finger bends, yaw the body turn.
// HOLD returns null so the robot keeps its current pose.
export function poseFor(mode, t, b, yaw) {
  if (mode === 'HOLD') return null;
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

// Smoothing slider (0 none .. 1 max) to the per-frame blend factor.
export function smoothingAlpha(amount) { return lerp(0.5, 0.06, amount); }
