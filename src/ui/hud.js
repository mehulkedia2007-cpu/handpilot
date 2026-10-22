// Overlay on the 3D stage: mode badge, gesture name and the hold-progress ring.
import { COMMANDS, LABEL } from '../core/gestures.js';

export const MODE_DESC = {
  MANUAL: 'Robot mirrors your fingers',
  HOLD: 'Joints frozen. Show an open palm to resume',
  AUTO: 'Agent is driving. Show a peace sign to hand back',
  IDLE: 'Waiting for a hand. Robot at neutral pose',
  GREET: 'Waving hello',
};

// Circumference of the ring (2 * PI * r, r = 18). Shrinking the dash offset from
// this value to 0 draws the ring from empty to full.
const RING_LEN = 113.1;

export function createHud(els) {
  let desc = MODE_DESC;
  return {
    // Swap the mode descriptions when the robot changes (null = the humanoid's).
    setDescriptions(map) { desc = map || MODE_DESC; },
    // render and track are PerfMeters; track is null while the simulator drives.
    perf(render, track) {
      let text = `Render ${Math.round(render.rate)} fps`;
      if (track) {
        text += `\nTracking ${Math.round(track.rate)} fps`;
        if (track.avgMs != null) text += ` · ${track.avgMs.toFixed(1)} ms`;
      }
      els.perf.textContent = text;
    },
    // hf is the current HandFrame; handedness and the built-in label only exist for the camera.
    update(st, gesture, hf) {
      const hand = hf.present;
      els.modeBadge.dataset.mode = st.mode;
      els.gestureBox.dataset.mode = st.mode;
      els.modeName.textContent = st.mode;
      els.modeDesc.textContent = desc[st.mode];
      els.gestureName.textContent = hand ? LABEL[gesture] : 'no hand';
      els.ringFg.style.strokeDashoffset = String(RING_LEN * (1 - st.progress));
      els.handChip.hidden = !(hand && hf.handedness);
      if (hf.handedness) els.handChip.textContent = hf.handedness + ' hand';
      els.builtInName.hidden = !(hand && hf.builtInGesture);
      if (hf.builtInGesture) els.builtInName.textContent = 'MediaPipe: ' + hf.builtInGesture + ' ' + Math.round(hf.builtInScore * 100) + '%';
      els.holdHint.textContent = st.progress > 0 ? 'Keep holding to send ' + COMMANDS[st.candidate] : ' ';
    },
  };
}
