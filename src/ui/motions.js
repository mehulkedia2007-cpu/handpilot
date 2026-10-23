// Motions panel: record what the robot does, play it back at 0.5x, 1x or 2x,
// and rename, delete, export or import saved motions.
import { SPEEDS, NAME_MAX, motionDuration } from '../core/motion.js';
import { createSegmented, createFilePicker } from './panels.js';

const ROBOT_NAMES = { humanoid: 'Humanoid', arm: 'Arm' };
const secs = (ms) => (ms / 1000).toFixed(1) + ' s';

// els: { rec, state, speed, list, note, exportBtn, importBtn }.
// on: { record(), play(id), stop(), rename(id, name) -> error|null, remove(id), exportAll(), importText(text) }.
export function createMotionsPanel(els, on) {
  let speed = 1;
  let editing = null;   // id of the motion whose name is being edited
  let last = [[], {}];  // what was last rendered, to re-render after an edit
  createSegmented(els.speed, SPEEDS.map((v) => ({ value: v, label: v + '×' })), speed, (v) => { speed = v; });
  els.rec.addEventListener('click', () => on.record());
  els.exportBtn.addEventListener('click', () => on.exportAll());
  createFilePicker(els.importBtn, '.json,application/json', (text) => on.importText(text));

  const button = (label, aria, onClick) => {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'btn'; b.textContent = label;
    b.setAttribute('aria-label', aria);
    b.addEventListener('click', onClick);
    return b;
  };

  // The name turns into a text box; Enter or Save keeps it, Escape or Cancel doesn't.
  function renameRow(m) {
    const form = document.createElement('form'); form.className = 'm-rename';
    const input = document.createElement('input');
    input.type = 'text'; input.value = m.name; input.maxLength = NAME_MAX;
    input.setAttribute('aria-label', 'New name for ' + m.name);
    const save = document.createElement('button'); save.type = 'submit'; save.className = 'btn primary'; save.textContent = 'Save';
    const cancel = button('Cancel', 'Cancel renaming', () => { editing = null; render(...last); });
    form.append(input, save, cancel);
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const err = on.rename(m.id, input.value);
      if (err) { els.note.textContent = err; input.focus(); return; }
      editing = null; render(...last);
    });
    input.addEventListener('keydown', (e) => { if (e.key === 'Escape') { editing = null; render(...last); } });
    requestAnimationFrame(() => { input.focus(); input.select(); });
    return form;
  }

  // Rebuilt only when the list or the playing/recording state changes, never per frame.
  function render(motions, { recording, playingId }) {
    last = [motions, { recording, playingId }];
    els.exportBtn.disabled = !motions.length;
    els.rec.textContent = recording ? 'Stop recording' : 'Record';
    els.rec.classList.toggle('rec', recording);
    els.list.textContent = '';
    if (!motions.length) {
      const li = document.createElement('li'); li.className = 'empty';
      li.textContent = 'No motions yet. Press Record, move the robot, then press Stop recording.';
      els.list.appendChild(li);
    }
    for (const m of motions) {
      const li = document.createElement('li');
      if (m.id === editing) { li.appendChild(renameRow(m)); els.list.appendChild(li); continue; }
      const info = document.createElement('div'); info.className = 'm-info';
      const name = document.createElement('span'); name.className = 'm-name'; name.textContent = m.name;
      const meta = document.createElement('span'); meta.className = 'hint';
      meta.textContent = `${ROBOT_NAMES[m.robot]} · ${secs(motionDuration(m))} · ${m.samples.length} samples`;
      info.append(name, meta);
      const acts = document.createElement('div'); acts.className = 'm-acts';
      const play = document.createElement('button');
      play.type = 'button'; play.className = 'btn';
      const playing = m.id === playingId;
      play.textContent = playing ? 'Stop' : 'Play';
      play.setAttribute('aria-label', (playing ? 'Stop ' : 'Play ') + m.name);
      play.disabled = recording;
      play.addEventListener('click', () => (playing ? on.stop() : on.play(m.id)));
      const ren = button('Rename', 'Rename ' + m.name, () => { editing = m.id; render(...last); });
      const del = button('Delete', 'Delete ' + m.name, () => {
        if (window.confirm(`Delete the motion "${m.name}"? This can't be undone.`)) on.remove(m.id);
      });
      ren.disabled = del.disabled = recording || playing;
      acts.append(play, ren, del);
      li.append(info, acts);
      els.list.appendChild(li);
    }
  }

  return {
    get speed() { return speed; },
    render,
    setState(text, cls) { els.state.textContent = text; els.state.className = 'chip' + (cls ? ' ' + cls : ''); },
    note(text) { els.note.textContent = text; },
  };
}
