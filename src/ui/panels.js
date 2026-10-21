// Side panels: finger channels, the agent pipeline + log, and the gesture guide.
import { FINGERS } from '../core/hand.js';
import { LABEL } from '../core/gestures.js';

const NAMES = { thumb: 'Thumb', index: 'Index', middle: 'Middle', ring: 'Ring', pinky: 'Pinky' };
const DRIVES = { thumb: 'drives head nod', index: 'drives right shoulder', middle: 'drives right elbow', ring: 'drives left shoulder', pinky: 'drives left elbow' };
const ACT_TEXT = { MANUAL: 'copy finger bends to joints', HOLD: 'hold every joint still', AUTO: 'run the dance routine', IDLE: 'ease to neutral pose', GREET: 'wave the right arm' };
const GUIDE = [
  ['Open palm', [0, 0, 0, 0, 0], 'MANUAL. The robot mirrors your fingers.'],
  ['Fist', [1, 1, 1, 1, 1], 'HOLD. Freezes the robot where it is.'],
  ['Peace sign', [1, 0, 0, 1, 1], 'AUTO. The agent runs a dance. Show it again to take control back.'],
  ['Thumbs up', [0, 1, 1, 1, 1], 'GREET. The robot waves for 3 seconds.'],
];

// One bar per finger showing its bend percentage.
export function createChannels(el) {
  const bars = {}, vals = {};
  for (const n of FINGERS) {
    const row = document.createElement('div'); row.className = 'ch';
    row.innerHTML = `<span class="n">${NAMES[n]}</span><span class="bar"><i></i></span><span class="val">0</span><span class="to">${DRIVES[n]}</span>`;
    el.appendChild(row);
    bars[n] = row.querySelector('i'); vals[n] = row.querySelector('.val');
  }
  return {
    update(b) {
      for (const n of FINGERS) {
        const v = Math.round(b[n] * 100);
        bars[n].style.width = v + '%'; vals[n].textContent = v;
      }
    },
  };
}

function fmt(ms) {
  const s = Math.floor(ms / 1000);
  return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');
}

// The agent panel: a live SEE/DECIDE/ACT summary plus a scrolling decision log.
export function createAgentPanel(els, t0) {
  const items = [];
  let dirty = true;   // only rebuild the log's DOM when something was added

  function add(tag, text) {
    items.unshift({ t: performance.now() - t0, tag, text });
    if (items.length > 40) items.pop();
    dirty = true;
  }

  function update(mode, gesture, hand) {
    els.agentMode.textContent = mode;
    els.pSee.textContent = hand ? 'hand tracked, gesture: ' + LABEL[gesture] : 'no hand in view';
    els.pDecide.textContent = 'mode ' + mode;
    els.pAct.textContent = ACT_TEXT[mode];
    if (!dirty) return;
    dirty = false;
    els.log.textContent = '';
    for (const it of items.slice(0, 30)) {
      const li = document.createElement('li'), tm = document.createElement('time');
      const tg = document.createElement('span'), tx = document.createElement('span');
      tm.textContent = fmt(it.t); tg.className = 'tag ' + it.tag; tg.textContent = it.tag; tx.textContent = it.text;
      li.append(tm, tg, tx); els.log.appendChild(li);
    }
  }

  return { add, update };
}

// Static list of command gestures with a little five-bar glyph of the hand shape.
export function buildGestureGuide(el) {
  for (const [title, shape, desc] of GUIDE) {
    const li = document.createElement('li'), glyph = document.createElement('div');
    glyph.className = 'glyph';
    for (const bend of shape) {
      const s = document.createElement('span');
      s.style.height = (5 + (1 - bend) * 21) + 'px';
      glyph.appendChild(s);
    }
    const d = document.createElement('div');
    d.innerHTML = '<div class="gt"></div><div class="gd"></div>';
    d.querySelector('.gt').textContent = title;
    d.querySelector('.gd').textContent = desc;
    li.append(glyph, d); el.appendChild(li);
  }
}
