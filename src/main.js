// Wires everything together and runs the main loop:
// input (simulator or camera) -> gesture -> agent -> pose -> 3D robot + UI.
import { yawFromPalmX } from './core/hand.js';
import { pickGesture } from './core/gestures.js';
import { Agent, poseFor, blendPose } from './core/agent.js';
import { createHandFilter } from './core/filters.js';
import { PerfMeter } from './core/perf.js';
import { loadSettings, saveSettings, defaultSettings, ROBOTS } from './core/settings.js';
import { ARM_LIMITS, defaultArmPose, clampArmPose } from './core/armSpec.js';
import { targetFromPalm } from './core/workspace.js';
import { armGoalFor, ARM_MODE_DESC, ARM_ACT_TEXT } from './core/armMotion.js';
import { createPinchLatch } from './core/pinch.js';
import { forwardKinematics } from './core/ik.js';
import { createStacker, isOneStack, BLOCK_SIZE } from './core/stacking.js';
import { createChallenge, formatTime, loadBest, saveBest, isNewBest } from './core/challenge.js';
import { createSimulator } from './input/simulator.js';
import { createCamera, CAMERA_BLOCKED_MSG } from './input/camera.js';
import { createHud } from './ui/hud.js';
import { createChannels, createAgentPanel, buildGestureGuide, createRobotSwitch, createJointPanel } from './ui/panels.js';

const $ = (id) => document.getElementById(id);
const t0 = performance.now();

/* ---------- saved settings ---------- */
// Even reading window.localStorage can throw (blocked cookies, sandboxed iframes),
// so it is fetched inside try/catch. With null, settings just live in memory.
function getStorage() { try { return window.localStorage; } catch (_) { return null; } }
const storage = getStorage();
let settings = loadSettings(storage);
const persist = () => saveSettings(storage, settings);

/* ---------- UI + agent ---------- */
const panel = createAgentPanel({ agentMode: $('agentMode'), pSee: $('pSee'), pDecide: $('pDecide'), pAct: $('pAct'), log: $('log') }, t0);
const agent = new Agent(panel.add, performance.now());
panel.add('SEE', 'simulator input active');
panel.add('DECIDE', 'mode MANUAL, nothing to override');
panel.add('ACT', settings.robot === 'arm' ? ARM_ACT_TEXT.MANUAL : 'copy finger bends to joints');

const hud = createHud({
  modeBadge: $('modeBadge'), gestureBox: $('gestureBox'), modeName: $('modeName'), modeDesc: $('modeDesc'),
  gestureName: $('gestureName'), ringFg: $('ringFg'), holdHint: $('holdHint'),
  handChip: $('handChip'), builtInName: $('builtInName'), perf: $('perf'),
});
const channels = createChannels($('channels'));
buildGestureGuide($('glist'));

/* ---------- jitter filter ---------- */
// The One Euro filter does the real smoothing, so the pose only needs a light
// ease, mainly to soften jumps when the mode changes.
const POSE_ALPHA = 0.35;
const handFilter = createHandFilter(settings.filter);
const FILTER_KEYS = ['minCutoff', 'beta'];
function showFilter() {
  for (const k of FILTER_KEYS) { $(k).value = settings.filter[k]; $(k + 'Out').textContent = settings.filter[k].toFixed(1); }
  handFilter.setParams(settings.filter);
}
for (const k of FILTER_KEYS) {
  $(k).addEventListener('input', () => { settings.filter[k] = Number($(k).value); showFilter(); });
  $(k).addEventListener('change', persist);   // 'change' fires once on release, not on every pixel of a drag
}
showFilter();

/* ---------- inputs ---------- */
const sim = createSimulator($('sliders'), $('presets'));
const cam = createCamera($('video'), $('ovl'), {
  initialCal: settings.calibration,
  onCalChange: (cal) => { settings.calibration = cal; persist(); },
});

$('btnDefaults').addEventListener('click', () => {
  settings = defaultSettings();
  persist();
  showFilter();
  cam.setCal(settings.calibration);
  showRobot();
  panel.add('ACT', 'settings reset to defaults');
});
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
let stage = null, robot = null, arm = null, blocksView = null;
try {
  const [{ createStage }, { buildHumanoid }, { buildArm }, { buildBlocks }] = await Promise.all([
    import('./scene/stage.js'), import('./scene/humanoid.js'), import('./scene/arm.js'), import('./scene/blocks.js'),
  ]);
  stage = createStage($('stage'));
  robot = buildHumanoid(stage.scene);
  arm = buildArm(stage.scene);
  blocksView = buildBlocks(stage.scene);
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

/* ---------- robot choice + arm joints ---------- */
// Both robots stay in the scene and only one is visible, so switching is instant.
// The hand normally drives the arm through IK. Ticking "Drive joints with the sliders"
// hands the joints to the debug sliders instead, which is handy for checking the model.
const armCur = defaultArmPose();       // what the model shows, eased toward a goal each frame
let armSliderPose = defaultArmPose();  // the debug sliders' pose
let jointDebug = false;
const pinch = createPinchLatch();
// The blocks follow the arm's eased grip, not the pinch directly, so they also
// work with the debug sliders and in the AUTO demo.
const stacker = createStacker();
function logBlock(ev) {
  if (ev.type === 'grab') panel.add('ACT', `grab the ${ev.id} block`);
  else if (ev.type === 'drop') {
    const where = ev.on === 'table' || ev.on === 'floor' ? 'the ' + ev.on : `the ${ev.on} block` + (ev.snapped ? ', snapped into line' : '');
    panel.add('ACT', `drop the ${ev.id} block on ${where}`);
  }
}
const joints = createJointPanel($('jointSliders'), ARM_LIMITS, armSliderPose, (p) => { armSliderPose = clampArmPose(p); });
$('jointDebug').addEventListener('change', () => {
  jointDebug = $('jointDebug').checked;
  armSliderPose = { ...armCur };
  joints.setEnabled(jointDebug);
  $('btnPark').disabled = !jointDebug;
});
joints.setEnabled(false);
$('btnPark').disabled = true;
$('btnPark').addEventListener('click', () => { armSliderPose = defaultArmPose(); joints.show(armSliderPose); });

/* ---------- stacking challenge ---------- */
const challenge = createChallenge();
let best = loadBest(storage);
const CH_STATE = { ready: 'Ready', running: 'Running', won: 'Stacked' };
function showChallenge(now) {
  const time = formatTime(challenge.elapsed(now));
  $('chTime').textContent = time;
  $('chState').textContent = CH_STATE[challenge.state];
  $('chState').className = 'chip' + (challenge.state === 'won' ? ' on' : '');
  $('chBest').textContent = best === null ? '--' : formatTime(best);
  $('btnChStart').textContent = challenge.state === 'ready' ? 'Start' : challenge.state === 'running' ? 'Restart' : 'Play again';
  // The stage timer only shows during and right after a run, so it doesn't clutter free play.
  const hud = $('chHud');
  hud.hidden = challenge.state === 'ready' || settings.robot !== 'arm';
  hud.textContent = challenge.state === 'won' ? 'Stacked in ' + time : time;
  hud.classList.toggle('won', challenge.state === 'won');
}
$('btnChStart').addEventListener('click', () => {
  // Every run starts from the same three blocks in a row, with nothing held.
  stacker.release(); stacker.reset();
  challenge.start(performance.now());
  $('chNote').textContent = 'Go! Stack all three blocks into one tower.';
  panel.add('ACT', 'challenge started, blocks reset');
  showChallenge(performance.now());
});
$('btnChReset').addEventListener('click', () => {
  stacker.release(); stacker.reset(); challenge.reset();
  $('chNote').textContent = 'Blocks reset. Press Start to time a run, or just play.';
  panel.add('ACT', 'blocks reset');
  showChallenge(performance.now());
});
function checkWin(now) {
  if (!challenge.update(now, !stacker.held && isOneStack(stacker.blocks))) return;
  const ms = challenge.time, record = isNewBest(ms, best);
  if (record) { best = ms; saveBest(storage, ms); }
  $('chNote').textContent = `Tower built in ${formatTime(ms)}.` + (record ? ' New best time!' : ` Best is ${formatTime(best)}.`);
  panel.add('ACT', `tower complete in ${formatTime(ms)}` + (record ? ', new best' : ''));
  showChallenge(now);
}

function showRobot() {
  const isArm = settings.robot === 'arm';
  if (robot) robot.setVisible(!isArm);
  if (arm) arm.setVisible(isArm);
  if (blocksView) blocksView.setVisible(isArm);
  if (!isArm) { const ev = stacker.release(); if (ev) logBlock(ev); }
  if (stage) stage.setView(isArm ? 0.7 : 0.45, isArm ? 1.12 : 1.28, isArm ? { x: 0, y: 1.1, z: 0.9 } : { x: 0, y: 1.9, z: 0 });
  $('armJoints').hidden = !isArm;
  $('challengePanel').hidden = !isArm;
  if (!isArm && challenge.state === 'running') challenge.reset();   // a run only counts with the arm on screen
  showChallenge(performance.now());
  // Describe modes and actions in terms of the robot on screen.
  agent.actText = isArm ? ARM_ACT_TEXT : null;
  hud.setDescriptions(isArm ? ARM_MODE_DESC : null);
  panel.setActText(isArm ? ARM_ACT_TEXT : null);
  channels.setRobot(settings.robot);
  robotSwitch.show(settings.robot);
}
const robotSwitch = createRobotSwitch($('robotSwitch'), ROBOTS, settings.robot, (r) => {
  settings.robot = r;
  persist();
  showRobot();
  panel.add('ACT', 'robot switched to ' + r);
});
showRobot();

/* ---------- main loop ---------- */
let lastHud = 0, lastFrame = performance.now();
const renderPerf = new PerfMeter();
function frame() {
  requestAnimationFrame(frame);
  const now = performance.now(), t = (now - t0) / 1000;
  const dt = (now - lastFrame) / 1000;
  lastFrame = now;
  renderPerf.tick();
  const hf = handFilter.filter(source === 'cam' ? cam.read() : sim.read(now));
  const hand = hf.present, b = hf.bends;
  const g = pickGesture(hf);
  const st = agent.step(now, { hand, gesture: g });
  const target = poseFor(st.mode, t, b, yawFromPalmX(hf.palm.x));
  if (target) applyPose(target, POSE_ALPHA);
  if (arm && settings.robot === 'arm') {
    if (jointDebug) {
      blendPose(armCur, armSliderPose, POSE_ALPHA);
      arm.showTarget(null);
    } else {
      // Only a hand in MANUAL can grab; other modes leave the latch as it was.
      let closed = pinch.closed;
      if (st.mode === 'MANUAL' && hand) {
        const was = closed;
        closed = pinch.update(hf.pinch);
        if (closed !== was) panel.add('ACT', closed ? 'pinch seen, close the gripper' : 'pinch released, open the gripper');
      }
      const manual = { target: hand ? targetFromPalm(hf.palm) : null, closed };
      // Seconds since the mode began, so the AUTO demo always starts from the top.
      const goal = armGoalFor(st.mode, (now - agent.modeSince) / 1000, manual);
      // The grip eases toward its goal like the joints do, which animates the fingers.
      if (goal) blendPose(armCur, goal.pose, POSE_ALPHA);
      arm.showTarget(goal && goal.target, goal ? goal.reachable : true);
    }
    if (blocksView) {
      const tip = forwardKinematics(armCur);   // where the gripper really is, not where it's aiming
      const ev = stacker.step(armCur.grip, tip, armCur.yaw);
      if (ev) logBlock(ev);
      blocksView.show(stacker.blocks, { held: stacker.held, hover: stacker.hover(tip), dt });
      checkWin(now);
    }
    arm.apply(armCur, stacker.held ? BLOCK_SIZE : 0);
  }
  if (stage) stage.render();
  cam.perf.update(now);
  if (renderPerf.update(now)) hud.perf(renderPerf, source === 'cam' ? cam.perf : null);
  // The DOM is slow compared with WebGL, so the panels refresh about 14 times a second, not every frame.
  if (now - lastHud > 70) {
    lastHud = now;
    hud.update(st, g, hf);
    channels.update(b);
    if (source === 'cam') sim.display(b);
    panel.update(st.mode, g, hand);
    if (settings.robot === 'arm' && !jointDebug) joints.show(armCur);
    if (challenge.state === 'running') showChallenge(now);
  }
}
applyPose(poseFor('MANUAL', 0, sim.read(0).bends, 0), 1);
frame();

