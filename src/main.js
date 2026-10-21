// Wires everything together and runs the main loop:
// input (simulator or camera) -> gesture -> agent -> pose -> 3D robot + UI.
import { yawFromPalmX } from './core/hand.js';
import { pickGesture } from './core/gestures.js';
import { Agent, poseFor, blendPose, smoothingAlpha } from './core/agent.js';
import { createSimulator } from './input/simulator.js';
import { createCamera, CAMERA_BLOCKED_MSG } from './input/camera.js';
import { createHud } from './ui/hud.js';
import { createChannels, createAgentPanel, buildGestureGuide } from './ui/panels.js';

const $ = (id) => document.getElementById(id);
const t0 = performance.now();

/* ---------- UI + agent ---------- */
const panel = createAgentPanel({ agentMode: $('agentMode'), pSee: $('pSee'), pDecide: $('pDecide'), pAct: $('pAct'), log: $('log') }, t0);
const agent = new Agent(panel.add, performance.now());
panel.add('SEE', 'simulator input active');
panel.add('DECIDE', 'mode MANUAL, nothing to override');
panel.add('ACT', 'copy finger bends to joints');

const hud = createHud({
  modeBadge: $('modeBadge'), gestureBox: $('gestureBox'), modeName: $('modeName'), modeDesc: $('modeDesc'),
  gestureName: $('gestureName'), ringFg: $('ringFg'), holdHint: $('holdHint'),
  handChip: $('handChip'), builtInName: $('builtInName'),
});
const channels = createChannels($('channels'));
buildGestureGuide($('glist'));

const smooth = $('smooth');
smooth.addEventListener('input', () => { $('smoothOut').textContent = smooth.value; });

/* ---------- inputs ---------- */
const sim = createSimulator($('sliders'), $('presets'));
const cam = createCamera($('video'), $('ovl'));
let source = 'sim';

function setCam(state, note, cls) {
  const c = $('camState');
  c.textContent = state; c.className = 'chip' + (cls ? ' ' + cls : '');
  if (note) $('camNote').textContent = note;
}

async function startCamera() {
  if (cam.running) return;
  try {
    await cam.start(setCam);
  } catch (e) {
    setCam('Unavailable', e.message, 'err');
    $('btnCam').hidden = false; $('btnStop').hidden = true;
    return;
  }
  source = 'cam';
  agent.lastSeen = performance.now();   // give the user time to raise a hand before IDLE kicks in
  setCam('Live', `Show your hand to the camera. Straight fingers are 0%, curled fingers are 100%. Use the buttons below to calibrate to your hand. (Model running on the ${cam.delegate}.)`, 'on');
  $('btnCam').hidden = true; $('btnStop').hidden = false; $('calRow').hidden = false; $('previewEmpty').hidden = true;
  $('srcChip').textContent = 'Source: camera';
  sim.setLocked(true);
  panel.add('SEE', 'camera on, looking for a hand');
}

function stopCamera() {
  cam.stop(); source = 'sim';
  setCam('Off', 'Camera stopped. The simulator is back in control.');
  $('btnCam').hidden = false; $('btnStop').hidden = true; $('calRow').hidden = true; $('previewEmpty').hidden = false;
  $('srcChip').textContent = 'Source: simulator';
  sim.setLocked(false);
  panel.add('SEE', 'camera off, simulator input active');
}

$('btnCam').addEventListener('click', startCamera);
$('btnStop').addEventListener('click', stopCamera);
$('btnOpen').addEventListener('click', () => { $('camNote').textContent = cam.calibrate('open'); });
$('btnFist').addEventListener('click', () => { $('camNote').textContent = cam.calibrate('closed'); });
$('btnResetCal').addEventListener('click', () => { $('camNote').textContent = cam.resetCal(); });

// Some embedded views forbid the camera outright; say so before the user clicks.
try {
  const pp = document.permissionsPolicy || document.featurePolicy;
  if (pp && pp.allowsFeature && !pp.allowsFeature('camera')) setCam('Blocked', CAMERA_BLOCKED_MSG, 'err');
} catch (_) { /* API not supported */ }

/* ---------- 3D scene ---------- */
// Loaded dynamically so that if the Three.js CDN fails, the rest of the app
// (simulator, agent, panels) still works and we can show a clear message.
let stage = null, robot = null;
try {
  const [{ createStage }, { buildHumanoid }] = await Promise.all([import('./scene/stage.js'), import('./scene/humanoid.js')]);
  stage = createStage($('stage'));
  robot = buildHumanoid(stage.scene);
} catch (err) {
  console.warn(err);
  const m = $('stageMsg');
  m.hidden = false;
  m.textContent = 'The 3D library did not load. Check your connection and reload.';
}

const cur = { rS: 0.5, rE: 0.2, lS: 0.5, lE: 0.2, head: 0, yaw: 0, bob: 0 };
function applyPose(target, alpha) {
  blendPose(cur, target, alpha);
  if (robot) robot.apply(cur);
}

/* ---------- main loop ---------- */
let lastHud = 0;
function frame() {
  requestAnimationFrame(frame);
  const now = performance.now(), t = (now - t0) / 1000;
  const hf = source === 'cam' ? cam.read() : sim.read(now);
  const hand = hf.present, b = hf.bends;
  const g = pickGesture(hf);
  const st = agent.step(now, { hand, gesture: g });
  const target = poseFor(st.mode, t, b, yawFromPalmX(hf.palm.x));
  if (target) applyPose(target, smoothingAlpha(smooth.value / 100));
  if (stage) stage.render();
  // The DOM is slow compared with WebGL, so the panels refresh about 14 times a second, not every frame.
  if (now - lastHud > 70) {
    lastHud = now;
    hud.update(st, g, hf);
    channels.update(b);
    if (source === 'cam') sim.display(b);
    panel.update(st.mode, g, hand);
  }
}
applyPose(poseFor('MANUAL', 0, sim.read(0).bends, 0), 1);
frame();

