// End-to-end run of the docs/TESTING.md checklist in headless Chromium.
// It drives the simulator sliders (and a fake webcam with no hand in it), then reads
// the page's text: the mode badge, the agent log, the challenge panel.
// Run with `npm run e2e`. The first time, install the browser: `npx playwright install chromium`.
// It is not part of `npm test`: it takes about 2 minutes and needs a browser and the CDNs.
//
// Usage: node tests/e2e/checklist.mjs [url]. With no url it serves the repo itself.
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const PORT = 5199;
let server = null;
if (!process.argv[2]) {
  server = spawn(process.execPath, ['node_modules/http-server/bin/http-server', '.', '-p', String(PORT), '-c-1', '-s'], { cwd: ROOT, stdio: 'ignore' });
  process.on('exit', () => server.kill());
}
const URL_ = process.argv[2] || `http://localhost:${PORT}/`;
// Wait for the static server to answer before opening the page.
for (let i = 0; i < 50; i++) {
  try { if ((await fetch(URL_)).ok) break; } catch (_) { /* not up yet */ }
  await new Promise((r) => setTimeout(r, 100));
}
const results = [];
const check = (name, ok, info = '') => { results.push({ name, ok: !!ok, info }); console.log((ok ? 'PASS ' : 'FAIL ') + name + (info ? '  [' + info + ']' : '')); };
// Waits are generous: the hold-to-command gestures need ~0.9 s and the arm eases into place.
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await chromium.launch({
  args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, permissions: ['camera'] });
const page = await ctx.newPage();
const errors = [];
// MediaPipe's WASM prints this harmless INFO line through console.error; ignore only that.
page.on('console', (m) => { if (m.type() === 'error' && !/^INFO: Created TensorFlow Lite/.test(m.text())) errors.push(m.text()); });
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));

const set = (id, v) => page.evaluate(([id, v]) => { const e = document.getElementById(id); e.value = v; e.dispatchEvent(new Event('input', { bubbles: true })); e.dispatchEvent(new Event('change', { bubbles: true })); }, [id, v]);
const text = (id) => page.evaluate((id) => document.getElementById(id).textContent, id);
const hidden = (id) => page.evaluate((id) => document.getElementById(id).hidden, id);
// One line per log entry ("ACT grab the red block"), newest first.
const log = () => page.evaluate(() => [...document.querySelectorAll('#log li')].map((li) => li.children[1].textContent + ' ' + li.children[2].textContent).join('\n'));
const mode = () => text('modeName');
const preset = (name) => page.evaluate((n) => [...document.querySelectorAll('#presets button')].find((b) => b.textContent === n).click(), name);
const robot = (name) => page.evaluate((n) => [...document.querySelectorAll('#robotSwitch button')].find((b) => b.textContent === n).click(), name);
const joint = (j) => page.evaluate((j) => Number(document.getElementById('j_' + j).value), j);
// Gripper target in world units -> simulator sliders (see input/simulator.js + core/workspace.js).
async function moveTo(x, y, z = 1.6, wait = 1600) {
  await set('s_yaw', Math.round(x * 50));
  await set('s_height', Math.round((y - 0.3) / 2.1 * 100));
  await set('s_reach', Math.round((z - 1.1) / 1.2 * 100));
  await sleep(wait);
}
async function pinch(on) { await set('s_pinch', on ? 100 : 0); await sleep(700); }
async function fresh() {
  await page.evaluate(() => localStorage.clear());
  await page.reload(); await page.waitForSelector('#stage canvas'); await sleep(1200);
}

await page.goto(URL_); await page.waitForSelector('#stage canvas'); await fresh();

/* ---------- simulator (humanoid) ---------- */
check('page loads with no console errors', errors.length === 0, errors.join(' | '));
check('3D canvas renders', await page.evaluate(() => { const c = document.querySelector('#stage canvas'); return c.width > 0 && c.height > 0; }));
await sleep(1200);
const perf = await text('perf');
check('render FPS shows and is >= 30', /Render (\d+) fps/.test(perf) && Number(perf.match(/Render (\d+)/)[1]) >= 30, perf);

const ch0 = await page.evaluate(() => document.querySelector('#channels .val').textContent);
await set('s_thumb', 10); await sleep(400);
const ch1 = await page.evaluate(() => document.querySelector('#channels .val').textContent);
check('finger slider moves its finger channel', ch0 !== ch1 && Number(ch1) <= 15, `${ch0} -> ${ch1}`);

await preset('Fist'); await sleep(1600);
check('Fist held ~1 s -> HOLD', (await mode()) === 'HOLD');
await preset('Open palm'); await sleep(1600);
check('Open palm -> MANUAL', (await mode()) === 'MANUAL');
await preset('Peace sign'); await sleep(1600);
check('Peace sign -> AUTO', (await mode()) === 'AUTO');
await preset('Relax'); await sleep(600); await preset('Peace sign'); await sleep(1600);
check('Relax then Peace sign -> back to MANUAL', (await mode()) === 'MANUAL');
await preset('Thumbs up'); await sleep(1500);
check('Thumbs up -> GREET', (await mode()) === 'GREET');
await preset('Relax'); await sleep(3500);
check('GREET returns to MANUAL by itself', (await mode()) === 'MANUAL');
await preset('Point'); await sleep(1600);
check('Point is not a command', (await mode()) === 'MANUAL');
await preset('Open palm'); await sleep(400);
check('agent log has SEE / DECIDE / ACT lines', /DECIDE/.test(await log()) && /ACT/.test(await log()));

// Keyboard: everything reachable by Tab, and the canvas is focusable.
const tabbable = await page.evaluate(() => {
  const els = [...document.querySelectorAll('button, input, [tabindex]')].filter((e) => !e.hidden && e.offsetParent && !e.disabled);
  return els.every((e) => e.tabIndex >= 0);
});
check('every visible control is keyboard focusable', tabbable);
await page.focus('#stage canvas'); await page.keyboard.press('ArrowLeft'); await page.keyboard.press('+');
check('arrow keys / + on the 3D view cause no errors', errors.length === 0);

// Filter settings persist, Reset to defaults restores.
await set('minCutoff', 0.4); await set('beta', 2.5); await set('handGain', 2.1);
await page.reload(); await page.waitForSelector('#stage canvas'); await sleep(800);
check('filter + sensitivity settings survive reload', (await text('minCutoffOut')) === '0.4' && (await text('betaOut')) === '2.5' && (await text('handGainOut')) === '2.1');
await page.click('#btnDefaults'); await page.reload(); await page.waitForSelector('#stage canvas'); await sleep(800);
check('Reset to defaults restores 1.0 / 1.0 / 1.6 and sticks after reload', (await text('minCutoffOut')) === '1.0' && (await text('betaOut')) === '1.0' && (await text('handGainOut')) === '1.6');

/* ---------- arm ---------- */
await fresh();
await robot('Arm'); await sleep(800);
check('Arm switch: arm panels shown', !(await hidden('armJoints')) && !(await hidden('challengePanel')));
check('Arm button is pressed', await page.evaluate(() => [...document.querySelectorAll('#robotSwitch button')].find((b) => b.textContent === 'Arm').getAttribute('aria-pressed') === 'true'));
await page.reload(); await page.waitForSelector('#stage canvas'); await sleep(1000);
check('Arm stays selected after reload', !(await hidden('challengePanel')));
check('HUD describes the arm', /Gripper/.test(await text('modeDesc')));

const y0 = await joint('yaw');
await moveTo(1.5, 1.2, 1.8);
const y1 = await joint('yaw');
await moveTo(-1.5, 1.2, 1.8);
const y2 = await joint('yaw');
check('Turn slider swings the base both ways (IK)', y1 > 30 && y2 < -30, `${y0} -> ${y1} / ${y2} deg`);
await moveTo(2, 0.3, 1.1);
check('far corner target stays inside limits, no NaN', [await joint('yaw'), await joint('shoulder'), await joint('elbow')].every(Number.isFinite));

await pinch(true);
check('Pinch closes the gripper (logged)', /pinch seen, close the gripper/.test(await log()));
await set('s_pinch', 65); await sleep(500);
const flick = (await log()).match(/pinch released/g)?.length || 0;
check('pinch 65% (between thresholds) keeps it closed', flick === 0);
await pinch(false);
check('Pinch release opens the gripper (logged)', /pinch released, open the gripper/.test(await log()));

// Grab red, carry it over blue, drop -> stacks and snaps.
await moveTo(-1, 1.2); await moveTo(-1, 0.55);
await pinch(true);
check('grab the red block', /grab the red block/.test(await log()));
await moveTo(-1, 1.4); await moveTo(1.03, 1.4); await moveTo(1.03, 0.95);
await pinch(false); await sleep(600);
check('drop red on blue, snapped into line', /drop the red block on the blue block, snapped/.test(await log()), (await log()).split('\n').slice(0, 3).join(' '));

// Covered block can't be grabbed: try to grab blue (now under red) at blue's top height.
await moveTo(1, 1.4); await moveTo(1, 0.6); await pinch(true);
check('blue (covered) cannot be grabbed', !/grab the blue block/.test(await log()));
await pinch(false);

// Closing on air grabs nothing.
await moveTo(-0.5, 1.5); await pinch(true);
check('closing on air grabs nothing', (await log()).split('\n')[0] === 'ACT pinch seen, close the gripper', (await log()).split('\n').slice(0, 8).join(' / '));
await pinch(false);

// Partial overlap: grab green, drop half over the tower -> lands on red, not snapped.
await moveTo(0, 1.2); await moveTo(0, 0.55); await pinch(true);
check('grab green', /grab the green block/.test(await log()));
await moveTo(0, 1.6); await moveTo(1.18, 1.6); await moveTo(1.18, 1.25);
await pinch(false); await sleep(600);
check('partial overlap lands on red without snapping', /drop the green block on the red block$|drop the green block on the red block\n/m.test(await log()) && !/green block on the red block, snapped/.test(await log()), (await log()).split('\n').slice(0, 3).join(' '));

/* ---------- challenge ---------- */
await page.click('#btnChStart'); await sleep(300);
check('Start: state Running, stage timer visible', (await text('chState')) === 'Running' && !(await hidden('chHud')));
check('Start resets blocks (logged)', /challenge started, blocks reset/.test(await log()));
await sleep(1200);
check('timer counts up', (await text('chTime')) !== '0:00.0', await text('chTime'));
// Build the tower: red onto blue, then green onto red.
await moveTo(-1, 1.2); await moveTo(-1, 0.55); await pinch(true);
await moveTo(-1, 1.4); await moveTo(1, 1.4); await moveTo(1, 0.95); await pinch(false); await sleep(500);
await moveTo(0, 1.4); await moveTo(0, 0.55); await pinch(true);
await moveTo(0, 1.6); await moveTo(1, 1.6); await moveTo(1, 1.25); await pinch(false); await sleep(800);
check('full tower wins: state Stacked', (await text('chState')) === 'Stacked', await text('chNote'));
check('win shows time + new best', /Tower built in \d:\d\d\.\d\. New best time!/.test(await text('chNote')), await text('chNote'));
const best = await text('chBest');
check('best time displayed', /^\d:\d\d\.\d$/.test(best), best);
const tWon = await text('chTime'); await sleep(1000);
check('timer frozen after the win', (await text('chTime')) === tWon);
await page.reload(); await page.waitForSelector('#stage canvas'); await sleep(800);
check('best time survives reload', (await text('chBest')) === best);
await page.click('#btnDefaults'); await sleep(200); await robot('Arm'); await sleep(300);
check('Reset to defaults keeps the best time', (await text('chBest')) === best);
await page.click('#btnChStart'); await sleep(300); await page.click('#btnChReset'); await sleep(300);
check('Reset blocks: state Ready, stage timer hidden', (await text('chState')) === 'Ready' && (await hidden('chHud')));

// Holding a block and switching to Humanoid drops it; switching during a run cancels it.
await moveTo(-1, 1.2); await moveTo(-1, 0.55); await pinch(true);
await page.click('#btnChStart'); await sleep(200);
await moveTo(-1, 0.55); await pinch(false); await pinch(true);
await moveTo(-1, 1.3);
await robot('Humanoid'); await sleep(300);
check('switch to Humanoid while holding drops the block', /drop the red block/.test((await log()).split('\n').slice(0, 9).join('\n')));
check('humanoid hides arm panels', (await hidden('challengePanel')) && (await hidden('armJoints')));
await robot('Arm'); await sleep(300);
check('switching robots during a run cancels it', (await text('chState')) === 'Ready');
await pinch(false);

// AUTO stacks red on blue from fresh blocks.
await page.click('#btnChReset'); await moveTo(0, 1.6);
await preset('Peace sign'); await sleep(1500);
check('arm AUTO mode', (await mode()) === 'AUTO');
await sleep(9500);
check('AUTO picks red and stacks it on blue', /grab the red block/.test(await log()) && /drop the red block on the blue block, snapped/.test(await log()));
await preset('Relax'); await sleep(500); await preset('Peace sign'); await sleep(1600);
await preset('Fist'); await sleep(1600);
check('arm HOLD via fist', (await mode()) === 'HOLD');
await preset('Open palm'); await sleep(1600);

// Joint debug sliders.
await page.check('#jointDebug'); await sleep(200);
check('joint debug enables sliders and Park', await page.evaluate(() => !document.getElementById('j_yaw').disabled && !document.getElementById('btnPark').disabled));
await set('j_yaw', 60); await sleep(300);
check('debug yaw slider drives the joint', (await joint('yaw')) === 60);
await page.click('#btnPark'); await sleep(200);
check('Park arm resets sliders', (await joint('yaw')) === 0);
await page.uncheck('#jointDebug');

/* ---------- camera (fake device, no hand) ---------- */
await page.click('#btnCam');
let camState = '';
for (let i = 0; i < 40; i++) { await sleep(500); camState = await text('camState'); if (camState !== 'Off' && !/Loading|Starting/i.test(camState)) break; }
const camNote = await text('camNote');
check('Start camera with a fake webcam: Live, or a clear message', camState === 'Live' || camState === 'Unavailable', camState + ' :: ' + camNote.slice(0, 120));
if (camState === 'Live') {
  check('camera note says GPU or CPU', /GPU|CPU/.test(camNote));
  await sleep(4500);
  check('no hand for 3 s -> IDLE', (await mode()) === 'IDLE');
  await page.click('#btnStop'); await sleep(500);
  check('Stop camera returns to the simulator', (await text('srcChip')) === 'Source: simulator');
}

/* ---------- phone width ---------- */
await page.setViewportSize({ width: 375, height: 812 }); await sleep(600);
const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
check('no horizontal scroll at phone width', overflow <= 0, 'overflow ' + overflow + 'px');
await page.setViewportSize({ width: 1280, height: 900 }); await sleep(400);

check('no console errors during the whole run', errors.length === 0, errors.slice(0, 5).join(' | '));

// Private-window style: storage that throws.
const p2 = await ctx.newPage();
const err2 = [];
p2.on('pageerror', (e) => err2.push(e.message));
await p2.addInitScript(() => { Object.defineProperty(window, 'localStorage', { get() { throw new Error('SecurityError'); } }); });
await p2.goto(URL_); await p2.waitForSelector('#stage canvas'); await sleep(1200);
check('works when localStorage is blocked', err2.length === 0 && (await p2.evaluate(() => document.getElementById('modeName').textContent)) === 'MANUAL', err2.join(' | '));

await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
