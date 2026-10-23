// The agent loop, split across HTTP requests (P5.3).
//
// The model's tools move the robot, and the robot lives in the browser, so the
// server can't run them itself. Instead each POST /agent does one round:
//   1. the browser sends a command and the scene, or the results of the last tools;
//   2. the server asks the model what to do next;
//   3. if the model wants tools, the server checks them and sends them back to the
//      browser, which runs them and comes back with the results (step 1 again);
//   4. when the model answers in plain text, or MAX_STEPS is reached, it's done.
// The conversation is kept here, in memory, under a random session id. That keeps
// the step count honest (the browser can't reset it) and the model's own messages
// are sent back to it exactly as it wrote them, which the API requires.
//
// The model client is passed in, so tests can use a fake model and no network.
import { randomUUID } from 'node:crypto';
import { TOOLS, checkToolCalls } from './tools.js';
import { SYSTEM_PROMPT } from './prompt.js';

export const MAX_COMMAND = 500;          // characters in a typed command
export const MAX_SCENE = 20000;          // characters of scene JSON from the browser
export const MAX_RESULT = 4000;          // characters of one tool result
const SESSION_TTL_MS = 3 * 60 * 1000;   // a session the browser stops answering is forgotten
const MAX_SESSIONS = 20;

// An error with an HTTP status, so index.js knows what to send.
export class AgentError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

const textOf = (content) => content.filter((b) => b.type === 'text').map((b) => b.text).join('\n').trim();
const clip = (s, n) => (s.length > n ? s.slice(0, n) + '…' : s);

// A tool result for the model. Results from the browser are capped in size.
function toolResult(id, content, isError = false) {
  const text = typeof content === 'string' ? content : JSON.stringify(content);
  return { type: 'tool_result', tool_use_id: id, content: clip(text ?? '', MAX_RESULT), ...(isError ? { is_error: true } : {}) };
}

// opts: { client, model, effort, fallback, maxSteps, timeoutMs, now }
export function createAgentService(opts) {
  const { client, model, effort = null, fallback = false, maxSteps = 6, timeoutMs = 30000, now = Date.now } = opts;
  const sessions = new Map();

  function sweep() {
    for (const [id, s] of sessions) if (now() - s.touched > SESSION_TTL_MS) sessions.delete(id);
  }

  async function callModel(s) {
    s.steps++;
    const params = { model, max_tokens: 16000, system: SYSTEM_PROMPT, tools: TOOLS, messages: s.messages };
    if (effort) params.output_config = { effort };
    // The timeout is per call; one retry covers a brief network blip.
    const options = { timeout: timeoutMs, maxRetries: 1 };
    if (fallback) {
      // Server-side fallback: if the model declines for safety reasons, the API
      // re-runs the request on a fallback model it picks, inside the same call.
      return client.beta.messages.create({ ...params, betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' }, options);
    }
    return client.messages.create(params, options);
  }

  // Ask the model until it wants tools the browser should run, or it's done.
  async function advance(s, rejectedSoFar = []) {
    const rejected = [...rejectedSoFar];
    const done = (reply, extra = {}) => {
      sessions.delete(s.id);
      return { status: 'done', id: s.id, step: s.steps, reply, rejected, ...extra };
    };
    for (;;) {
      if (s.steps >= maxSteps) return done(`Stopped after ${maxSteps} steps, the most one command may take.`, { limited: true });
      let res;
      try {
        res = await callModel(s);
      } catch (e) {
        sessions.delete(s.id);
        throw e;
      }
      // Keep the whole reply, thinking blocks included, exactly as the model wrote it.
      s.messages.push({ role: 'assistant', content: res.content });
      const text = textOf(res.content);
      if (res.stop_reason === 'refusal') return done(text || 'The model declined that request.', { refused: true });
      const uses = res.content.filter((b) => b.type === 'tool_use');
      if (!uses.length) return done(text || 'Done.');
      const check = checkToolCalls(uses.map((u) => ({ id: u.id, name: u.name, input: u.input })));
      rejected.push(...check.rejected.map(({ id, name, error }) => ({ id, name, error })));
      if (check.accepted.length) {
        s.pending = { order: uses.map((u) => u.id), accepted: check.accepted, rejected: check.rejected };
        return {
          status: 'tools', id: s.id, step: s.steps, text, rejected,
          calls: check.accepted.map(({ id, name, args, notes }) => ({ id, name, args, notes })),
        };
      }
      // Every call was rejected: tell the model why, in one message, and ask again.
      s.messages.push({ role: 'user', content: check.rejected.map((r) => toolResult(r.id, 'Rejected: ' + r.error, true)) });
    }
  }

  async function start(body) {
    const command = typeof body.command === 'string' ? body.command.trim() : '';
    if (!command) throw new AgentError(400, 'Type a command first.');
    if (command.length > MAX_COMMAND) throw new AgentError(400, `Commands can be up to ${MAX_COMMAND} characters.`);
    if (body.scene === null || typeof body.scene !== 'object' || Array.isArray(body.scene)) throw new AgentError(400, 'The request has no scene.');
    const scene = JSON.stringify(body.scene);
    if (scene.length > MAX_SCENE) throw new AgentError(400, 'The scene is too large.');
    if (sessions.size >= MAX_SESSIONS) throw new AgentError(429, 'Too many commands are running at once. Wait a moment.');
    const s = { id: randomUUID(), steps: 0, touched: now(), pending: null, messages: [
      { role: 'user', content: `The scene right now:\n${scene}\n\nCommand: ${command}` },
    ] };
    sessions.set(s.id, s);
    return advance(s);
  }

  // body.results: [{ id, ok, content }] for the calls the server handed out.
  async function resume(s, body) {
    if (!s.pending) throw new AgentError(409, 'This session is not waiting for tool results.');
    const { order, accepted, rejected } = s.pending;
    s.pending = null;
    const given = new Map((Array.isArray(body.results) ? body.results : []).filter((r) => r && typeof r.id === 'string').map((r) => [r.id, r]));
    const acceptedIds = new Set(accepted.map((c) => c.id));
    const errors = new Map(rejected.map((r) => [r.id, r.error]));
    // Every tool_use needs exactly one tool_result, all in one message, in the model's order.
    const content = order.map((id) => {
      if (errors.has(id)) return toolResult(id, 'Rejected: ' + errors.get(id), true);
      const r = acceptedIds.has(id) && given.get(id);
      if (!r) return toolResult(id, 'Not run.', true);
      return toolResult(id, r.content, r.ok === false);
    });
    s.messages.push({ role: 'user', content });
    return advance(s);
  }

  return {
    get size() { return sessions.size; },
    // One POST /agent. A body with `command` starts a session; `id` + `results`
    // continues it; `id` + `stop: true` drops it.
    async handle(body) {
      sweep();
      if (!body || typeof body !== 'object') throw new AgentError(400, 'Send a JSON body.');
      if (body.id === undefined) return start(body);
      const s = typeof body.id === 'string' && sessions.get(body.id);
      if (body.stop) {
        if (s) sessions.delete(s.id);
        return { status: 'stopped', id: body.id };
      }
      if (!s) throw new AgentError(404, 'That command has expired or already finished. Send it again.');
      s.touched = now();
      return resume(s, body);
    },
  };
}
