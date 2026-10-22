// Slider + preset input. Produces the same HandFrame shape as the camera,
// so the rest of the app never needs to know where the hand came from.
import { FINGERS, palmXFromYaw, lerp } from '../core/hand.js';
import { DEPTH_RANGE } from '../core/workspace.js';

const NAMES = { thumb: 'Thumb', index: 'Index', middle: 'Middle', ring: 'Ring', pinky: 'Pinky' };
const PRESETS = [
  ['Open palm', [0, 0, 0, 0, 0]], ['Fist', [1, 1, 1, 1, 1]], ['Point', [1, 0, 1, 1, 1]],
  ['Peace sign', [1, 0, 0, 1, 1]], ['Thumbs up', [0, 1, 1, 1, 1]], ['Relax', [0.5, 0.8, 0.8, 0.8, 0.8]],
];

export function createSimulator(slidersEl, presetsEl) {
  const bends = { thumb: 0.5, index: 0.8, middle: 0.8, ring: 0.8, pinky: 0.8 };
  let yaw = 0;
  let height = 0.5, reach = 0.5, pinch = 0;   // 0–1, only used by the arm
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

  // Height and Reach stand in for moving your hand up/down and toward/away from the camera.
  function addSlider(id, label, value, onInput) {
    const row = document.createElement('div'); row.className = 'srow';
    row.innerHTML = `<label for="s_${id}">${label}</label><input id="s_${id}" type="range" min="0" max="100" value="${value}"><output>${value}</output>`;
    slidersEl.appendChild(row);
    const input = row.querySelector('input'), out = row.querySelector('output');
    input.addEventListener('input', () => { out.textContent = input.value; onInput(input.value / 100); });
  }
  addSlider('height', 'Height', 50, (v) => { height = v; });
  addSlider('reach', 'Reach', 50, (v) => { reach = v; });
  addSlider('pinch', 'Pinch', 0, (v) => { pinch = v; });

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
        // y: image y grows downward, so a higher hand has a smaller y.
        // z: reaching out means a smaller (farther) palm in the image.
        palm: { x: palmXFromYaw(yaw), y: 1 - height, z: lerp(DEPTH_RANGE[1], DEPTH_RANGE[0], reach) },
        // Pinch 0% = thumb and index apart (about 1.2 palm widths), 100% = touching.
        pinch: lerp(1.2, 0, pinch), builtInGesture: null, builtInScore: 0, t: now,
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
