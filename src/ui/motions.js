// Motions panel: record what the robot does, then play it back at 0.5x, 1x or 2x.
import { SPEEDS, motionDuration } from '../core/motion.js';
import { createSegmented } from './panels.js';

const ROBOT_NAMES = { humanoid: 'Humanoid', arm: 'Arm' };
const secs = (ms) => (ms / 1000).toFixed(1) + ' s';

// els: { rec, state, speed, list, note }. on: { record(), play(id), stop() }.
export function createMotionsPanel(els, on) {
  let speed = 1;
  createSegmented(els.speed, SPEEDS.map((v) => ({ value: v, label: v + '×' })), speed, (v) => { speed = v; });
  els.rec.addEventListener('click', () => on.record());

  // Rebuilt only when the list or the playing/recording state changes, never per frame.
  function render(motions, { recording, playingId }) {
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
      acts.append(play);
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
