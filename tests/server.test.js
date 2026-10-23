// The agent server's logic, with a fake model: no network, no API key, no Express.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createAgentService, AgentError, MAX_RESULT } from '../server/agent.js';
import { readConfig } from '../server/config.js';
import { isAllowedOrigin, createRateLimiter, PAGES_ORIGIN } from '../server/limits.js';
import { TOOLS } from '../server/tools.js';
import { SYSTEM_PROMPT } from '../server/prompt.js';

const SCENE = { robot: 'arm', blocks: [] };
const use = (id, name, input = {}) => ({ type: 'tool_use', id, name, input });
const text = (t) => ({ type: 'text', text: t });
const reply = (content, stop_reason) => ({ content, stop_reason: stop_reason || (content.some((b) => b.type === 'tool_use') ? 'tool_use' : 'end_turn') });

// A fake Anthropic client that answers from a script and records every request.
function fakeClient(script) {
  const calls = [];
  const create = async (params, options) => {
    // Copy the messages: the service keeps appending to the same array.
    calls.push({ params: { ...params, messages: structuredClone(params.messages) }, options });
    const next = script.shift();
    if (!next) throw new Error('script ran out');
    if (next instanceof Error) throw next;
    return next;
  };
  return { calls, messages: { create }, beta: { messages: { create } } };
}
const service = (script, opts = {}) => {
  const client = fakeClient(script);
  return { client, agent: createAgentService({ client, model: 'test-model', maxSteps: 6, ...opts }) };
};

test('a command goes to the model with the tools, the system prompt and the scene', async () => {
  const { client, agent } = service([reply([text('Nothing to do.')])]);
  const r = await agent.handle({ command: '  wave  ', scene: SCENE });
  assert.equal(r.status, 'done');
  assert.equal(r.reply, 'Nothing to do.');
  const p = client.calls[0].params;
  assert.equal(p.model, 'test-model');
  assert.equal(p.tools, TOOLS);
  assert.equal(p.system, SYSTEM_PROMPT);
  assert.match(p.messages[0].content, /"robot":"arm"/);
  assert.match(p.messages[0].content, /Command: wave$/);
  assert.equal(client.calls[0].options.maxRetries, 1);
  assert.ok(client.calls[0].options.timeout > 0);
  assert.equal(agent.size, 0, 'a finished command is forgotten');
});

test('tool calls go to the browser checked and clamped; results come back as one message in order', async () => {
  const { client, agent } = service([
    reply([text('Moving.'), use('t1', 'move_gripper_to', { x: 5, y: 1, z: 1.6 }), use('t2', 'close_gripper')]),
    reply([text('Picked it up.')]),
  ]);
  const r1 = await agent.handle({ command: 'pick up red', scene: SCENE });
  assert.equal(r1.status, 'tools');
  assert.equal(r1.text, 'Moving.');
  assert.deepEqual(r1.calls.map((c) => c.name), ['move_gripper_to', 'close_gripper']);
  assert.equal(r1.calls[0].args.x, 2);
  assert.match(r1.calls[0].notes[0], /clamped/);
  // Results arrive out of order; the server puts them back in the model's order.
  const r2 = await agent.handle({ id: r1.id, results: [{ id: 't2', ok: true, content: { grabbed: 'red' } }, { id: 't1', ok: true, content: 'ok' }] });
  assert.equal(r2.status, 'done');
  assert.equal(r2.reply, 'Picked it up.');
  const msgs = client.calls[1].params.messages;
  assert.equal(msgs[1].role, 'assistant');
  assert.equal(msgs[1].content.length, 3, 'the whole assistant reply is kept as written');
  assert.deepEqual(msgs[2].content.map((b) => b.tool_use_id), ['t1', 't2']);
  assert.equal(msgs[2].content[1].content, '{"grabbed":"red"}');
  assert.equal(msgs[2].content[0].is_error, undefined);
});

test('unknown tools and bad arguments are rejected and the model is told why', async () => {
  const { client, agent } = service([
    reply([use('a', 'self_destruct'), use('b', 'set_mode', { mode: 'TURBO' }), use('c', 'get_scene')]),
    reply([text('ok')]),
  ]);
  const r1 = await agent.handle({ command: 'go', scene: SCENE });
  assert.deepEqual(r1.calls.map((c) => c.id), ['c']);
  assert.deepEqual(r1.rejected.map((c) => c.id), ['a', 'b']);
  await agent.handle({ id: r1.id, results: [{ id: 'c', ok: true, content: {} }] });
  const results = client.calls[1].params.messages[2].content;
  assert.deepEqual(results.map((b) => [b.tool_use_id, !!b.is_error]), [['a', true], ['b', true], ['c', false]]);
  assert.match(results[0].content, /Rejected: unknown tool/);
  assert.match(results[1].content, /mode must be one of/);
});

test('when every call is rejected the server asks the model again by itself', async () => {
  const { client, agent } = service([
    reply([use('a', 'move_gripper_to', { x: 'left', y: 1, z: 1 })]),
    reply([text('Sorry, I could not do that.')]),
  ]);
  const r = await agent.handle({ command: 'go left', scene: SCENE });
  assert.equal(r.status, 'done');
  assert.equal(r.rejected.length, 1);
  assert.equal(client.calls.length, 2);
  assert.equal(client.calls[1].params.messages[2].content[0].is_error, true);
});

test('MAX_STEPS caps how many times the model is asked for one command', async () => {
  const loop = () => reply([use('id' + Math.random(), 'get_scene')]);
  const { client, agent } = service([loop(), loop(), loop(), loop()], { maxSteps: 3 });
  let r = await agent.handle({ command: 'spin forever', scene: SCENE });
  while (r.status === 'tools') r = await agent.handle({ id: r.id, results: r.calls.map((c) => ({ id: c.id, ok: true, content: '{}' })) });
  assert.equal(r.status, 'done');
  assert.equal(r.limited, true);
  assert.match(r.reply, /3 steps/);
  assert.equal(client.calls.length, 3);
  // A loop of rejected calls is capped too.
  const bad = () => reply([use('x', 'nope')]);
  const s2 = service([bad(), bad(), bad(), bad()], { maxSteps: 2 });
  const r2 = await s2.agent.handle({ command: 'x', scene: SCENE });
  assert.equal(r2.limited, true);
  assert.equal(s2.client.calls.length, 2);
});

test('missing results become "Not run" errors, and huge results are cut short', async () => {
  const { client, agent } = service([reply([use('a', 'get_scene'), use('b', 'open_gripper')]), reply([text('ok')])]);
  const r = await agent.handle({ command: 'x', scene: SCENE });
  await agent.handle({ id: r.id, results: [{ id: 'a', ok: true, content: 'x'.repeat(MAX_RESULT * 3) }, { id: 'zzz', ok: true, content: 'not asked for' }, 'junk', null] });
  const results = client.calls[1].params.messages[2].content;
  assert.equal(results.length, 2);
  assert.ok(results[0].content.length <= MAX_RESULT + 1);
  assert.deepEqual([results[1].content, results[1].is_error], ['Not run.', true]);
});

test('a failed tool is reported as an error result', async () => {
  const { client, agent } = service([reply([use('a', 'play_motion', { name: 'Ghost' })]), reply([text('No such motion.')])]);
  const r = await agent.handle({ command: 'dance', scene: SCENE });
  await agent.handle({ id: r.id, results: [{ id: 'a', ok: false, content: 'No motion called "Ghost".' }] });
  assert.equal(client.calls[1].params.messages[2].content[0].is_error, true);
});

test('bad requests are refused with a clear message', async () => {
  const { agent } = service([]);
  const status = async (body) => { try { await agent.handle(body); return 'no error'; } catch (e) { assert.ok(e instanceof AgentError); return e.status; } };
  assert.equal(await status(null), 400);
  assert.equal(await status({ command: '', scene: SCENE }), 400);
  assert.equal(await status({ command: 42, scene: SCENE }), 400);
  assert.equal(await status({ command: 'x'.repeat(501), scene: SCENE }), 400);
  assert.equal(await status({ command: 'hi' }), 400);
  assert.equal(await status({ command: 'hi', scene: [1] }), 400);
  assert.equal(await status({ command: 'hi', scene: { big: 'x'.repeat(30000) } }), 400);
  assert.equal(await status({ id: 'no-such-session', results: [] }), 404);
  assert.equal(await status({ id: 12, results: [] }), 404);
});

test('a session can only be continued while it waits, and stop forgets it', async () => {
  const { agent } = service([reply([use('a', 'get_scene')]), reply([text('ok')])]);
  const r = await agent.handle({ command: 'x', scene: SCENE });
  assert.equal(agent.size, 1);
  assert.deepEqual(await agent.handle({ id: r.id, stop: true }), { status: 'stopped', id: r.id });
  assert.equal(agent.size, 0);
  await assert.rejects(agent.handle({ id: r.id, results: [] }), (e) => e.status === 404);
});

test('sessions the browser abandons expire', async () => {
  let t = 0;
  const { agent } = service([reply([use('a', 'get_scene')]), reply([text('ok')])], { now: () => t });
  const r = await agent.handle({ command: 'x', scene: SCENE });
  t += 10 * 60 * 1000;
  await assert.rejects(agent.handle({ id: r.id, results: [] }), (e) => e.status === 404);
});

test('a model error ends the session and is passed on; a refusal is a final reply', async () => {
  const boom = new Error('network');
  const s1 = service([boom]);
  await assert.rejects(s1.agent.handle({ command: 'x', scene: SCENE }), boom);
  assert.equal(s1.agent.size, 0);
  const s2 = service([reply([], 'refusal')]);
  const r = await s2.agent.handle({ command: 'x', scene: SCENE });
  assert.equal(r.status, 'done');
  assert.equal(r.refused, true);
});

test('effort and server-side fallback are sent only when configured', async () => {
  const s1 = service([reply([text('a')])]);
  await s1.agent.handle({ command: 'x', scene: SCENE });
  assert.equal(s1.client.calls[0].params.output_config, undefined);
  assert.equal(s1.client.calls[0].params.fallbacks, undefined);
  const s2 = service([reply([text('a')])], { effort: 'low', fallback: true });
  await s2.agent.handle({ command: 'x', scene: SCENE });
  const p = s2.client.calls[0].params;
  assert.deepEqual(p.output_config, { effort: 'low' });
  assert.equal(p.fallbacks, 'default');
  assert.deepEqual(p.betas, ['server-side-fallback-2026-07-01']);
});

test('config: missing key and model are reported, numbers are bounded', () => {
  const c = readConfig({});
  assert.equal(c.problems.length, 2);
  assert.match(c.problems[0], /ANTHROPIC_API_KEY/);
  assert.match(c.problems[1], /AGENT_MODEL/);
  assert.deepEqual([c.port, c.maxSteps, c.maxRequestsPerMin, c.fallback, c.effort], [8787, 6, 10, false, null]);
  const d = readConfig({ ANTHROPIC_API_KEY: ' k ', AGENT_MODEL: 'm', MAX_STEPS: '999', MAX_REQUESTS_PER_MIN: 'lots', AGENT_FALLBACK: 'ON', AGENT_EFFORT: 'Low', ALLOWED_ORIGINS: 'https://a.example/, ,https://b.example' });
  assert.deepEqual(d.problems, []);
  assert.deepEqual([d.apiKey, d.maxSteps, d.maxRequestsPerMin, d.fallback, d.effort], ['k', 20, 10, true, 'low']);
  assert.deepEqual(d.allowedOrigins, ['https://a.example', 'https://b.example']);
  assert.match(readConfig({ ANTHROPIC_API_KEY: 'k', AGENT_MODEL: 'm', AGENT_EFFORT: 'turbo' }).problems[0], /AGENT_EFFORT/);
});

test('CORS: only localhost, the live site and listed origins', () => {
  for (const o of ['http://localhost:5173', 'http://127.0.0.1:8080', 'http://localhost', PAGES_ORIGIN]) assert.equal(isAllowedOrigin(o), true, o);
  for (const o of ['https://evil.example', 'http://localhost.evil.example', 'https://mehulkedia2007-cpu.github.io.evil.example', 'null', '', undefined]) assert.equal(isAllowedOrigin(o), false, String(o));
  assert.equal(isAllowedOrigin('https://friend.example', ['https://friend.example']), true);
});

test('rate limit: max hits per window, per key, then a retry time', () => {
  let t = 0;
  const lim = createRateLimiter({ max: 3, windowMs: 60000, now: () => t });
  for (let i = 0; i < 3; i++) assert.equal(lim.hit('me').ok, true);
  t = 20000;
  const r = lim.hit('me');
  assert.equal(r.ok, false);
  assert.equal(r.retryAfterMs, 40000);
  assert.equal(lim.hit('someone else').ok, true);
  t = 60001;
  assert.equal(lim.hit('me').ok, true);
});
