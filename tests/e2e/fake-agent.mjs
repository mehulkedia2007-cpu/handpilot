// A stand-in agent server for the end-to-end run. It uses the real agent loop
// (server/agent.js) and the real CORS check, but the "model" is a small script
// that follows the pick-and-place recipe in the system prompt. No API key, no cost.
import http from 'node:http';
import { createAgentService, AgentError } from '../../server/agent.js';
import { isAllowedOrigin } from '../../server/limits.js';

let n = 0;
const use = (name, input = {}) => ({ type: 'tool_use', id: 'toolu_fake_' + ++n, name, input });
const say = (text) => ({ content: [{ type: 'text', text }], stop_reason: 'end_turn' });
const tools = (text, list) => ({ content: [{ type: 'text', text }, ...list], stop_reason: 'tool_use' });

function pickUp(b) {
  return [
    use('move_gripper_to', { x: b.x, y: b.top + 0.5, z: b.z }),
    use('move_gripper_to', { x: b.x, y: b.top - 0.05, z: b.z }),
    use('close_gripper'),
    use('move_gripper_to', { x: b.x, y: 1.3, z: b.z }),
  ];
}
function placeOn(b) {
  return [
    use('move_gripper_to', { x: b.x, y: 1.3, z: b.z }),
    use('move_gripper_to', { x: b.x, y: b.top + 0.3, z: b.z }),
    use('open_gripper'),
    use('move_gripper_to', { x: b.x, y: 1.3, z: b.z }),
  ];
}

// Decide the next reply from the conversation so far, like a (very literal) model.
function plan(messages) {
  const first = messages[0].content;
  const scene = JSON.parse(first.slice(first.indexOf('{'), first.lastIndexOf('}') + 1));
  const command = first.slice(first.lastIndexOf('Command: ') + 9).toLowerCase();
  const turn = messages.filter((m) => m.role === 'assistant').length;
  const block = (id) => scene.blocks.find((b) => b.id === id);
  let m;
  if ((m = command.match(/stack (\w+) on (\w+)/))) {
    if (turn === 0) return tools(`Picking up ${m[1]}.`, pickUp(block(m[1])));
    if (turn === 1) return tools(`Placing it on ${m[2]}.`, placeOn(block(m[2])));
    return say(`Stacked the ${m[1]} block on the ${m[2]} block.`);
  }
  if ((m = command.match(/pick up the (\w+)/))) {
    if (turn === 0) return tools('', pickUp(block(m[1])));
    return say(`I'm holding the ${m[1]} block.`);
  }
  if (command.includes('bad')) {
    if (turn === 0) return tools('Trying.', [use('launch_rocket'), use('move_gripper_to', { x: 'left', y: 1, z: 1 }), use('move_gripper_to', { x: 9, y: 1.2, z: 1.6 })]);
    return say('Some of that was not allowed.');
  }
  if (command.includes('wander')) {
    if (turn === 0) return tools('Wandering.', [-1.5, 1.5, -1.5, 1.5, -1.5, 1.5].map((x) => use('move_gripper_to', { x, y: 1.6, z: 1.6 })));
    return say('Done wandering.');
  }
  return say("I can't do that.");
}

const fakeClient = { messages: { create: async (params) => plan(params.messages) } };

export function startFakeAgent(port) {
  const agent = createAgentService({ client: fakeClient, model: 'fake', maxSteps: 6 });
  const server = http.createServer(async (req, res) => {
    const origin = req.headers.origin;
    if (origin && !isAllowedOrigin(origin)) { res.writeHead(403).end(); return; }
    const headers = { 'Content-Type': 'application/json', ...(origin ? { 'Access-Control-Allow-Origin': origin } : {}) };
    if (req.method === 'OPTIONS') {
      res.writeHead(204, { ...headers, 'Access-Control-Allow-Methods': 'GET, POST', 'Access-Control-Allow-Headers': 'Content-Type' }).end();
      return;
    }
    if (req.url === '/health') { res.writeHead(200, headers).end(JSON.stringify({ ok: true, ready: true, model: 'fake model', problems: [] })); return; }
    let body = '';
    for await (const chunk of req) body += chunk;
    try {
      res.writeHead(200, headers).end(JSON.stringify(await agent.handle(JSON.parse(body))));
    } catch (e) {
      res.writeHead(e instanceof AgentError ? e.status : 500, headers).end(JSON.stringify({ error: e.message }));
    }
  });
  return new Promise((resolve) => server.listen(port, '127.0.0.1', () => resolve(server)));
}
