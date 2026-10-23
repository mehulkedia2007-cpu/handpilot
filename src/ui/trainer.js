// Gesture trainer panel: type a name, record ~30 examples of a hand shape,
// then pick what that gesture should do. A live read-out shows what the
// classifier thinks it sees right now.
import { ACTION_MODES, DISTANCE_RANGE } from '../core/training.js';
import { NAME_MAX } from '../core/motion.js';
import { createFilePicker } from './panels.js';

const MODE_TEXT = { MANUAL: 'MANUAL (follow me)', HOLD: 'HOLD (freeze)', AUTO: 'AUTO (toggle routine)', GREET: 'GREET (wave)' };

// The <select> stores an action as text: '' (none), 'mode:HOLD' or 'motion:<id>'.
const actionValue = (a) => (!a ? '' : a.type === 'mode' ? 'mode:' + a.mode : 'motion:' + a.id);
function actionFrom(value) {
  const [type, x] = value.split(':');
  if (type === 'mode') return { type: 'mode', mode: x };
  if (type === 'motion') return { type: 'motion', id: x };
  return null;
}

// els: { name, rec, status, seen, list, distance, distanceOut, exportBtn, importBtn, note }.
// on: { record(name), cancel(), setAction(name, action), remove(name), setDistance(v), exportAll(), importText(text) }.
export function createTrainerPanel(els, on) {
  let sampling = false;
  els.name.maxLength = NAME_MAX;
  els.rec.addEventListener('click', () => (sampling ? on.cancel() : on.record(els.name.value)));
  els.name.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); if (!sampling) on.record(els.name.value); } });
  els.distance.min = DISTANCE_RANGE[0]; els.distance.max = DISTANCE_RANGE[1];
  els.distance.addEventListener('input', () => { els.distanceOut.textContent = Number(els.distance.value).toFixed(2); });
  els.distance.addEventListener('change', () => on.setDistance(Number(els.distance.value)));
  els.exportBtn.addEventListener('click', () => on.exportAll());
  createFilePicker(els.importBtn, '.json,application/json', (text) => on.importText(text));

  function actionSelect(g, motions) {
    const sel = document.createElement('select');
    sel.setAttribute('aria-label', `Action for ${g.name}`);
    const opt = (value, text) => { const o = document.createElement('option'); o.value = value; o.textContent = text; return o; };
    sel.append(opt('', 'No action (just recognise it)'));
    const modes = document.createElement('optgroup'); modes.label = 'Switch mode';
    for (const m of ACTION_MODES) modes.append(opt('mode:' + m, MODE_TEXT[m]));
    sel.append(modes);
    if (motions.length) {
      const group = document.createElement('optgroup'); group.label = 'Play a motion';
      for (const m of motions) group.append(opt('motion:' + m.id, 'Play "' + m.name + '"'));
      sel.append(group);
    }
    sel.value = actionValue(g.action);
    if (sel.value !== actionValue(g.action)) sel.value = '';   // its motion was deleted
    sel.addEventListener('change', () => on.setAction(g.name, actionFrom(sel.value)));
    return sel;
  }

  function render(data, motions) {
    els.distance.value = data.maxDistance;
    els.distanceOut.textContent = data.maxDistance.toFixed(2);
    els.exportBtn.disabled = !data.gestures.length;
    els.list.textContent = '';
    if (!data.gestures.length) {
      const li = document.createElement('li'); li.className = 'empty';
      li.textContent = 'No trained gestures yet. Type a name, hold the hand shape and press Record.';
      els.list.appendChild(li);
    }
    for (const g of data.gestures) {
      const li = document.createElement('li');
      const info = document.createElement('div'); info.className = 'm-info';
      const name = document.createElement('span'); name.className = 'm-name'; name.textContent = g.name;
      const meta = document.createElement('span'); meta.className = 'hint'; meta.textContent = `${g.samples.length} samples`;
      info.append(name, meta);
      const acts = document.createElement('div'); acts.className = 'm-acts';
      const more = document.createElement('button');
      more.type = 'button'; more.className = 'btn'; more.textContent = 'Add samples';
      more.setAttribute('aria-label', 'Record more samples of ' + g.name);
      more.addEventListener('click', () => { els.name.value = g.name; on.record(g.name); });
      const del = document.createElement('button');
      del.type = 'button'; del.className = 'btn'; del.textContent = 'Delete';
      del.setAttribute('aria-label', 'Delete ' + g.name);
      del.addEventListener('click', () => { if (window.confirm(`Delete the gesture "${g.name}" and its samples?`)) on.remove(g.name); });
      more.disabled = del.disabled = sampling;
      acts.append(actionSelect(g, motions), more, del);
      li.append(info, acts);
      els.list.appendChild(li);
    }
  }

  return {
    render,
    // r: the sampler's step() result, or null when not recording.
    showSampling(r, name) {
      const on_ = Boolean(r && (r.phase === 'countdown' || r.phase === 'recording'));
      if (on_ !== sampling) {
        sampling = on_;
        els.rec.textContent = sampling ? 'Cancel' : 'Record';
        els.rec.classList.toggle('rec', sampling);
        els.name.disabled = sampling;
        for (const b of els.list.querySelectorAll('button')) b.disabled = sampling;
      }
      if (!r) return;
      if (r.phase === 'countdown') els.status.textContent = `Get ready: show "${name}" in ${r.secondsLeft}…`;
      else if (r.phase === 'recording') els.status.textContent = `Recording "${name}": ${r.count} / 30 samples`;
    },
    // p: the classifier's prediction, or null when there's nothing to classify.
    showSeen(p, trained) {
      if (!trained) els.seen.textContent = 'Train a gesture to see what the robot recognises.';
      else if (!p) els.seen.textContent = 'Sees: no hand';
      else if (p.label !== 'unknown') els.seen.textContent = `Sees: ${p.label} · ${Math.round(p.confidence * 100)}% of neighbours agree · distance ${p.distance.toFixed(2)}`;
      else els.seen.textContent = `Sees: nothing it was taught (closest: ${p.best}, distance ${p.distance.toFixed(2)})`;
    },
    status(text) { els.status.textContent = text; },
    note(text) { els.note.textContent = text; },
    clearName() { els.name.value = ''; },
  };
}
