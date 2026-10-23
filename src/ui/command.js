// The "Ask the arm" box in the agent panel (Phase 5): a command input, Send and
// Stop, the server's status, and the agent's final reply. The SEE / DECIDE / ACT
// steps themselves go into the agent log (panels.js).

const STATE = {
  unknown: ['Not connected', ''],
  checking: ['Checking', ''],
  online: ['Online', 'on'],
  offline: ['Agent offline', 'err'],
  setup: ['Not set up', 'err'],
  busy: ['Working', 'on'],
};

// handlers: { send(text), stop() }
export function createCommandPanel(els, handlers) {
  let busy = false, server = 'unknown';

  els.form.addEventListener('submit', (e) => {
    e.preventDefault();
    const text = els.input.value.trim();
    if (!text || busy) return;
    handlers.send(text);
  });
  els.stop.addEventListener('click', () => handlers.stop());
  // Escape in the box stops a running command too.
  els.input.addEventListener('keydown', (e) => { if (e.key === 'Escape' && busy) handlers.stop(); });

  function chip(state) {
    const [text, cls] = STATE[state];
    els.state.textContent = text;
    els.state.className = 'chip' + (cls ? ' ' + cls : '');
  }
  // Send stays enabled while offline: pressing it tries again, so starting the
  // server later just works.
  function refresh() {
    els.send.disabled = busy;
    els.stop.disabled = !busy;
  }

  return {
    get busy() { return busy; },
    // state: 'online' | 'offline' | 'setup' | 'checking' | 'unknown'. note explains offline / setup.
    setServer(state, note) {
      server = state;
      if (!busy) chip(state);
      if (note) els.note.textContent = note;
      refresh();
    },
    setBusy(on) {
      busy = on;
      chip(on ? 'busy' : server);
      refresh();
    },
    // The model's answer, or an error (err = true).
    reply(text, err = false) {
      els.reply.hidden = !text;
      els.reply.textContent = text || '';
      els.reply.classList.toggle('err', err);
    },
    clear() { els.input.value = ''; },
  };
}
