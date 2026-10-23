// Talks to the agent server in server/ (Phase 5). The page never sees the API
// key: it only sends a command plus the scene, and gets tool calls back.
// Every request has a timeout, and any of them can be cancelled (Stop).

export const DEFAULT_AGENT_URL = 'http://localhost:8787';
export const REQUEST_TIMEOUT_MS = 45000;   // a bit more than the server's own model timeout

// ?agent=http://localhost:9000 in the page address points at another server.
export function agentUrlFrom(search) {
  try {
    const u = new URL(new URLSearchParams(search).get('agent'));
    if (u.protocol === 'http:' || u.protocol === 'https:') return u.origin;
  } catch (_) { /* no or bad override */ }
  return DEFAULT_AGENT_URL;
}

// The server can't be reached at all (not started, wrong port, blocked).
export class OfflineError extends Error {}

// One signal that fires when either the caller cancels or the timeout runs out.
function withTimeout(signal, ms) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(new DOMException('timeout', 'TimeoutError')), ms);
  const onAbort = () => ctl.abort(signal.reason);
  if (signal) signal.aborted ? onAbort() : signal.addEventListener('abort', onAbort, { once: true });
  return { signal: ctl.signal, done: () => { clearTimeout(timer); if (signal) signal.removeEventListener('abort', onAbort); } };
}

export function createLlmClient(base = DEFAULT_AGENT_URL, timeoutMs = REQUEST_TIMEOUT_MS) {
  async function request(path, { body, signal, ms = timeoutMs } = {}) {
    const t = withTimeout(signal, ms);
    let res;
    try {
      res = await fetch(base + path, {
        method: body ? 'POST' : 'GET',
        headers: body ? { 'Content-Type': 'application/json' } : undefined,
        body: body ? JSON.stringify(body) : undefined,
        signal: t.signal,
      });
    } catch (e) {
      if (signal && signal.aborted) throw e;   // cancelled on purpose
      if (t.signal.aborted) throw new Error('The agent server took too long to answer.');
      throw new OfflineError(`Agent offline: nothing answered at ${base}.`);
    } finally {
      t.done();
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `The agent server answered ${res.status}.`);
    return data;
  }

  return {
    base,
    // { ok, ready, model, problems }, or throws OfflineError.
    health: () => request('/health', { ms: 3000 }),
    // Start a command. Returns { status: 'tools', id, calls, text, rejected } or { status: 'done', reply }.
    start: (command, scene, signal) => request('/agent', { body: { command, scene }, signal }),
    // Send the results of the last calls: [{ id, ok, content }]. Same answers as start.
    next: (id, results, signal) => request('/agent', { body: { id, results }, signal }),
    // Tell the server to forget a command (after Stop). Failures don't matter.
    stop: (id) => request('/agent', { body: { id, stop: true }, ms: 3000 }).catch(() => null),
  };
}
