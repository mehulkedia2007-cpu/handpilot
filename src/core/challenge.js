// The stacking challenge: Start -> a timer runs -> win when all three blocks
// form one tower -> show the time and keep the best one. Pure logic; the clock
// (`now`, in ms) and the storage object are passed in, so tests can fake both.

export const BEST_KEY = 'handpilot.challenge.v1';

// state: 'ready' (not started), 'running' or 'won'.
export function createChallenge() {
  let state = 'ready', startedAt = 0, time = null;
  return {
    get state() { return state; },
    get time() { return time; },
    start(now) { state = 'running'; startedAt = now; time = null; },
    // done: the blocks form one tower and nothing is held. Returns true on the frame it is won.
    update(now, done) {
      if (state !== 'running' || !done) return false;
      state = 'won'; time = now - startedAt;
      return true;
    },
    // Time to show: live while running, frozen once won, 0 before a start.
    elapsed(now) { return state === 'running' ? now - startedAt : state === 'won' ? time : 0; },
    reset() { state = 'ready'; time = null; },
  };
}

// 12345 ms -> "0:12.3". Tenths are enough to compare runs; more would just flicker.
export function formatTime(ms) {
  const tenths = Math.floor(Math.max(0, Number.isFinite(ms) ? ms : 0) / 100);
  const m = Math.floor(tenths / 600), s = Math.floor(tenths / 10) % 60;
  return `${m}:${String(s).padStart(2, '0')}.${tenths % 10}`;
}

const validTime = (v) => typeof v === 'number' && Number.isFinite(v) && v > 0;

// Best time in ms, or null. Same rules as settings: try/catch everywhere, validate on load.
export function loadBest(storage) {
  try {
    const v = JSON.parse(storage.getItem(BEST_KEY));
    return v && validTime(v.best) ? v.best : null;
  } catch (_) {
    return null;
  }
}

export function saveBest(storage, ms) {
  try {
    storage.setItem(BEST_KEY, JSON.stringify({ best: ms }));
    return true;
  } catch (_) {
    return false;
  }
}

// A new time beats the best if there is no best yet, or it is faster.
export const isNewBest = (ms, best) => validTime(ms) && (best === null || ms < best);
