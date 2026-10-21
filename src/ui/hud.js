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
  return {
    update(st, gesture, hand) {
      els.modeBadge.dataset.mode = st.mode;
      els.gestureBox.dataset.mode = st.mode;
      els.modeName.textContent = st.mode;
      els.modeDesc.textContent = MODE_DESC[st.mode];
      els.gestureName.textContent = hand ? LABEL[gesture] : 'no hand';
      els.ringFg.style.strokeDashoffset = String(RING_LEN * (1 - st.progress));
      els.holdHint.textContent = st.progress > 0 ? 'Keep holding to send ' + COMMANDS[st.candidate] : ' ';
    },
  };
}
