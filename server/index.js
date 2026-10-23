// HandPilot's agent server (P5.1). A small Express app on 127.0.0.1:
//   GET  /health  is the server up, and is it set up? (the page shows "Agent offline" without it)
//   POST /agent   one round of the agent loop (see agent.js)
// The API key is read from server/.env and only ever used here, so it never
// reaches the web page or the repository.
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import express from 'express';
import Anthropic from '@anthropic-ai/sdk';
import { readConfig } from './config.js';
import { isAllowedOrigin, createRateLimiter } from './limits.js';
import { createAgentService, AgentError } from './agent.js';

dotenv.config({ path: fileURLToPath(new URL('.env', import.meta.url)), quiet: true });
const config = readConfig(process.env);
const ready = config.problems.length === 0;

const agent = ready
  ? createAgentService({ ...config, client: new Anthropic({ apiKey: config.apiKey }) })
  : null;
const limiter = createRateLimiter({ max: config.maxRequestsPerMin });

const app = express();
app.disable('x-powered-by');

// CORS, by hand: it's only a few headers. Requests from a page that isn't ours
// are refused outright. Requests with no Origin (curl, tests) aren't from a web page.
app.use((req, res, next) => {
  const origin = req.get('origin');
  if (origin !== undefined && !isAllowedOrigin(origin, config.allowedOrigins)) {
    return res.status(403).json({ error: 'This page is not allowed to use the agent.' });
  }
  if (origin) {
    res.set('Access-Control-Allow-Origin', origin);
    res.set('Vary', 'Origin');
  }
  if (req.method === 'OPTIONS') {
    res.set('Access-Control-Allow-Methods', 'GET, POST');
    res.set('Access-Control-Allow-Headers', 'Content-Type');
    // Chrome asks before a public page (GitHub Pages) may talk to localhost.
    if (req.get('access-control-request-private-network')) res.set('Access-Control-Allow-Private-Network', 'true');
    return res.sendStatus(204);
  }
  next();
});

app.use(express.json({ limit: '64kb' }));

app.get('/health', (req, res) => {
  res.json({ ok: true, ready, model: config.model || null, maxSteps: config.maxSteps, problems: config.problems });
});

app.post('/agent', async (req, res) => {
  if (!ready) return res.status(503).json({ error: 'The agent server is not set up: ' + config.problems.join(' ') });
  const body = req.body;
  // Only new commands count toward the rate limit; MAX_STEPS already caps the
  // rounds one command can take, so the worst case is limit × steps model calls a minute.
  if (body && typeof body === 'object' && body.id === undefined) {
    const r = limiter.hit(req.ip);
    if (!r.ok) {
      const s = Math.ceil(r.retryAfterMs / 1000);
      res.set('Retry-After', String(s));
      return res.status(429).json({ error: `Too many commands. Try again in ${s} s (limit: ${config.maxRequestsPerMin} a minute).` });
    }
  }
  try {
    res.json(await agent.handle(body));
  } catch (e) {
    const { status, message } = explain(e);
    if (status >= 500) console.error('[agent]', e);
    res.status(status).json({ error: message });
  }
});

// Turn an error into a status and a message a person can act on. Typed SDK
// errors are checked most specific first; the key itself is never echoed.
function explain(e) {
  if (e instanceof AgentError) return { status: e.status, message: e.message };
  if (e instanceof Anthropic.AuthenticationError) return { status: 502, message: 'The API key in server/.env was rejected. Check it and restart the server.' };
  if (e instanceof Anthropic.PermissionDeniedError) return { status: 502, message: 'The API key may not use this model. Check AGENT_MODEL in server/.env.' };
  if (e instanceof Anthropic.NotFoundError) return { status: 502, message: `The model "${config.model}" was not found. Check AGENT_MODEL in server/.env.` };
  if (e instanceof Anthropic.RateLimitError) return { status: 429, message: 'The model API is rate limiting this key. Wait a minute and try again.' };
  if (e instanceof Anthropic.BadRequestError) return { status: 502, message: 'The model API refused the request: ' + e.message };
  if (e instanceof Anthropic.APIConnectionTimeoutError) return { status: 504, message: `The model took longer than ${config.timeoutMs / 1000} s to answer.` };
  if (e instanceof Anthropic.APIConnectionError) return { status: 502, message: 'Could not reach the model API. Check your internet connection.' };
  if (e instanceof Anthropic.APIError) return { status: 502, message: `The model API failed (${e.status ?? 'no status'}). Try again.` };
  return { status: 500, message: 'Something went wrong in the agent server. See its terminal for details.' };
}

// Bad JSON and other errors before the routes.
app.use((err, req, res, next) => {
  if (res.headersSent) return next(err);
  res.status(err.status || 400).json({ error: err.type === 'entity.too.large' ? 'The request is too large.' : 'The request was not valid JSON.' });
});

// 127.0.0.1 only: the server is for this computer, not the network.
app.listen(config.port, '127.0.0.1', () => {
  console.log(`HandPilot agent server on http://localhost:${config.port}`);
  if (ready) console.log(`Model ${config.model}${config.effort ? `, effort ${config.effort}` : ''}, up to ${config.maxSteps} steps per command, ${config.maxRequestsPerMin} commands a minute.`);
  else for (const p of config.problems) console.error('Not ready: ' + p);
});
