// Reads the server's settings from environment variables (loaded from server/.env).
// Pure: it takes the env object as an argument, so tests can pass a fake one.
// Bad or missing values never crash the server; they become `problems`, which
// /health reports and the web page shows, so the fix is obvious.

export const EFFORTS = ['low', 'medium', 'high', 'xhigh', 'max'];

// A whole number from the env, kept inside [lo, hi]; fallback if it isn't a number.
function int(v, fallback, lo, hi) {
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : fallback;
}

export function readConfig(env = {}) {
  const text = (k) => (typeof env[k] === 'string' ? env[k].trim() : '');
  const problems = [];
  const apiKey = text('ANTHROPIC_API_KEY');
  if (!apiKey) problems.push('ANTHROPIC_API_KEY is not set. Copy server/.env.example to server/.env and add your key.');
  const model = text('AGENT_MODEL');
  if (!model) problems.push('AGENT_MODEL is not set in server/.env (for example AGENT_MODEL=claude-opus-5-5).');
  let effort = text('AGENT_EFFORT').toLowerCase() || null;
  if (effort && !EFFORTS.includes(effort)) {
    problems.push(`AGENT_EFFORT must be one of ${EFFORTS.join(', ')} (or empty); it is "${effort}".`);
    effort = null;
  }
  return {
    apiKey,
    model,
    effort,
    fallback: text('AGENT_FALLBACK').toLowerCase() === 'on',
    port: int(env.PORT, 8787, 1, 65535),
    maxSteps: int(env.MAX_STEPS, 6, 1, 20),
    maxRequestsPerMin: int(env.MAX_REQUESTS_PER_MIN, 10, 1, 120),
    timeoutMs: int(env.REQUEST_TIMEOUT_MS, 30000, 5000, 120000),
    allowedOrigins: text('ALLOWED_ORIGINS').split(',').map((s) => s.trim().replace(/\/$/, '')).filter(Boolean),
    problems,
  };
}
