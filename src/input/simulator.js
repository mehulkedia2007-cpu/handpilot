// Slider + preset input. Produces the same HandFrame shape as the camera,
// so the rest of the app never needs to know where the hand came from.
import { FINGERS, palmXFromYaw } from '../core/hand.js';

const NAMES = { thumb: 'Thumb', index: 'Index', middle: 'Middle', ring: 'Ring', pinky: 'Pinky' };
const PRESETS = [
  ['Open palm', [0, 0, 0, 0, 0]], ['Fist', [1, 1, 1, 1, 1]], ['Point', [1, 0, 1, 1, 1]],
  ['Peace sign', [1, 0, 0, 1, 1]], ['Thumbs up', [0, 1, 1, 1, 1]], ['Relax', [0.5, 0.8, 0.8, 0.8, 0.8]],
];

export function createSimulator(slidersEl, presetsEl) {
  const bends = { thumb: 0.5, index: 0.8, middle: 0.8, ring: 0.8, pinky: 0.8 };
  let yaw = 0;
  let locked = false;   // true while the camera is in control
  const sliders = {}, outs = {};

  const show = (n, v) => { sliders[n].value = v; outs[n].textContent = v; };

  for (const n of FINGERS) {
    const row = document.createElement('div'); row.className = 'srow';
    const v = Math.round(bends[n] * 100);
    row.innerHTML = `<label for="s_${n}">${NAMES[n]}</label><input id="s_${n}" type="range" min="0" max="100" value="${v}"><output id="o_${n}">${v}</output>`;
    slidersEl.appendChild(row);
    sliders[n] = row.querySelector('input'); outs[n] = row.querySelector('output');
    sliders[n].addEventListener('input', () => { bends[n] = sliders[n].value / 100; outs[n].textContent = sliders[n].value; });
  }

  const yawRow = document.createElement('div'); yawRow.className = 'srow';
  yawRow.innerHTML = '<label for="s_yaw">Turn</label><input id="s_yaw" type="range" min="-100" max="100" value="0"><output id="o_yaw">0</output>';
  slidersEl.appendChild(yawRow);
  const yawIn = yawRow.querySelector('input'), yawOut = yawRow.querySelector('output');
  yawIn.addEventListener('input', () => { yaw = yawIn.value / 100 * 0.8; yawOut.textContent = yawIn.value; });

  for (const [label, values] of PRESETS) {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'btn'; b.textContent = label;
    b.addEventListener('click', () => {
      if (locked) return;
      FINGERS.forEach((n, i) => { bends[n] = values[i]; show(n, Math.round(values[i] * 100)); });
    });
    presetsEl.appendChild(b);
  }

  return {
    // The simulated hand is always "present".
    read(now) {
      return {
        present: true, landmarks: null, world: null, handedness: null,
        bends: { ...bends },
        palm: { x: palmXFromYaw(yaw), y: 0.5, z: 0 },
        pinch: null, builtInGesture: null, t: now,
      };
    },
    // While the camera drives, the finger sliders are disabled and just display its values.
    setLocked(on) {
      locked = on;
      for (const n of FINGERS) {
        sliders[n].disabled = on;
        if (!on) show(n, Math.round(bends[n] * 100));
      }
    },
    display(b) { for (const n of FINGERS) show(n, Math.round(b[n] * 100)); },
  };
}
