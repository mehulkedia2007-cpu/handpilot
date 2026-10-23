// Request limits for the server: which web pages may call it (CORS) and how
// often (a rate limit). Pure functions with the clock passed in, so they're testable.

// The live demo. Any localhost port is allowed too, for `npm run dev`.
export const PAGES_ORIGIN = 'https://mehulkedia2007-cpu.github.io';

// CORS: a browser sends an Origin header saying which site a script came from.
// Only our own pages may use the agent, so a random website you visit can't
// spend your API credit by calling http://localhost:8787 behind your back.
export function isAllowedOrigin(origin, extra = []) {
  if (typeof origin !== 'string') return false;
  if (origin === PAGES_ORIGIN || extra.includes(origin)) return true;
  return /^http:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(origin);
}

// Sliding-window rate limit: at most `max` hits per `windowMs` for each key.
export function createRateLimiter({ max, windowMs = 60000, now = Date.now }) {
  const hits = new Map();   // key -> timestamps of recent hits, oldest first
  return {
    // Records a hit if allowed. Returns { ok: true } or { ok: false, retryAfterMs }.
    hit(key) {
      const t = now(), recent = (hits.get(key) || []).filter((h) => t - h < windowMs);
      if (recent.length >= max) {
        hits.set(key, recent);
        return { ok: false, retryAfterMs: windowMs - (t - recent[0]) };
      }
      recent.push(t);
      hits.set(key, recent);
      return { ok: true };
    },
  };
}
