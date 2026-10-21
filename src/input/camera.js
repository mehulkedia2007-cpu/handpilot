// Webcam + MediaPipe Hands. Turns video frames into HandFrames.
// Phase 0 keeps the prototype's legacy @mediapipe/hands library; Phase 1 swaps
// it for the newer Gesture Recognizer from @mediapipe/tasks-vision.
import { FINGERS, lerp, fingerRatios, bendsFromRatios, DEFAULT_CAL, copyCal, isUsableCal } from '../core/hand.js';

const HANDS_BASE = 'https://cdn.jsdelivr.net/npm/@mediapipe/hands@0.4.1675469240/';
const CAL_KEY = 'gesture-robot-cal';
// Pairs of landmark indexes to draw as bones on the preview.
const LINKS = [[0,1],[1,2],[2,3],[3,4],[0,5],[5,6],[6,7],[7,8],[5,9],[9,10],[10,11],[11,12],[9,13],[13,14],[14,15],[15,16],[13,17],[17,18],[18,19],[19,20],[0,17]];
const TIPS = [4, 8, 12, 16, 20];

export const CAMERA_BLOCKED_MSG = 'The camera is blocked in this view. Use the simulator, or open HandPilot from localhost or its HTTPS link in Chrome or Edge.';

export function describeCamError(e) {
  const n = e && e.name;
  if (n === 'NotAllowedError' || n === 'SecurityError') return CAMERA_BLOCKED_MSG;
  if (n === 'NotFoundError' || n === 'OverconstrainedError') return 'No camera was found on this device.';
  if (n === 'NotReadableError') return 'The camera is in use by another app. Close it and try again.';
  return 'The camera could not start. Use the simulator instead.';
}

// The legacy library is a classic script, not an ES module, so it is injected with a <script> tag.
function loadScript(src) {
  return new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = src; s.onload = res; s.onerror = () => rej(new Error('load failed'));
    document.head.appendChild(s);
  });
}

function loadCal() {
  try {
    const p = JSON.parse(localStorage.getItem(CAL_KEY));
    if (p && p.open && p.closed) return p;
  } catch (_) { /* storage blocked or bad JSON: use defaults */ }
  return copyCal(DEFAULT_CAL);
}
function saveCal(cal) { try { localStorage.setItem(CAL_KEY, JSON.stringify(cal)); } catch (_) { /* private mode */ } }

export function createCamera(video, overlay) {
  const octx = overlay.getContext('2d');
  let stream = null, hands = null, running = false, busy = false;
  let cal = loadCal();
  let ratios = null;                // smoothed raw ratios, kept for calibration
  let present = false, landmarks = null, palmX = 0.5;
  const bends = { thumb: 0.5, index: 0.8, middle: 0.8, ring: 0.8, pinky: 0.8 };

  function stopStream() {
    if (stream) { stream.getTracks().forEach((t) => t.stop()); stream = null; }
    video.srcObject = null;
  }

  // Throws an Error whose message is ready to show the user.
  async function start(onStatus) {
    if (running) return;
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia)
      throw new Error('This browser view cannot reach a camera. Use the simulator.');
    onStatus('Starting', 'Asking the browser for your camera.');
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' }, audio: false });
    } catch (e) { throw new Error(describeCamError(e)); }
    video.srcObject = stream;
    try { await video.play(); } catch (_) { /* autoplay quirks; frames still arrive */ }
    onStatus('Loading', 'Loading the hand model. The first time takes a few seconds.');
    try {
      if (!window.Hands) await loadScript(HANDS_BASE + 'hands.js');
      hands = new window.Hands({ locateFile: (f) => HANDS_BASE + f });
      hands.setOptions({ maxNumHands: 1, modelComplexity: 1, minDetectionConfidence: 0.6, minTrackingConfidence: 0.5 });
      hands.onResults(onResults);
      await hands.initialize();
    } catch (_) {
      stopStream();
      throw new Error('The hand model could not load. Check your connection and try again.');
    }
    running = true; present = false;
    loop();
  }

  function stop() {
    running = false; stopStream();
    try { if (hands && hands.close) hands.close(); } catch (_) { /* already closed */ }
    hands = null; present = false; landmarks = null;
    octx.clearRect(0, 0, overlay.width, overlay.height);
  }

  // One recognition at a time: if the model is still busy, skip this video frame.
  async function loop() {
    if (!running) return;
    if (video.readyState >= 2 && !busy && hands) {
      busy = true;
      try { await hands.send({ image: video }); } catch (_) { /* dropped frame */ }
      busy = false;
    }
    if (running) requestAnimationFrame(loop);
  }

  function onResults(res) {
    if (overlay.width !== video.videoWidth && video.videoWidth) { overlay.width = video.videoWidth; overlay.height = video.videoHeight; }
    octx.clearRect(0, 0, overlay.width, overlay.height);
    const lm = res.multiHandLandmarks && res.multiHandLandmarks[0];
    present = !!lm; landmarks = lm || null;
    if (!lm) return;
    drawHand(lm);
    // Light smoothing on the ratios so the bends don't jitter. Phase 1 replaces this with a One Euro filter.
    const raw = fingerRatios(lm);
    ratios = ratios || raw;
    for (const n of FINGERS) ratios[n] = lerp(ratios[n], raw[n], 0.5);
    Object.assign(bends, bendsFromRatios(ratios, cal));
    palmX = lerp(palmX, lm[9].x, 0.4);
  }

  function drawHand(lm) {
    const W = overlay.width, H = overlay.height;
    octx.lineWidth = 3; octx.strokeStyle = '#f2c230'; octx.beginPath();
    for (const [a, b] of LINKS) { octx.moveTo(lm[a].x * W, lm[a].y * H); octx.lineTo(lm[b].x * W, lm[b].y * H); }
    octx.stroke();
    lm.forEach((p, i) => {
      const tip = TIPS.includes(i);
      octx.beginPath(); octx.arc(p.x * W, p.y * H, tip ? 6 : 3.5, 0, Math.PI * 2);
      octx.fillStyle = tip ? '#f2c230' : '#e7ecf3'; octx.fill();
    });
  }

  // which = 'open' or 'closed'. Returns a message for the user.
  function calibrate(which) {
    if (!ratios || !present) return 'Show your hand to the camera first, then press the button.';
    const next = copyCal(cal);
    for (const n of FINGERS) next[which][n] = ratios[n];
    if (!isUsableCal(next)) return 'That reading is too close to the other pose. Open your hand fully or make a tight fist, then try again.';
    cal = next; saveCal(cal);
    return (which === 'open' ? 'Open hand' : 'Fist') + ' saved. Straight fingers now read 0%, curled fingers 100%.';
  }

  function resetCal() { cal = copyCal(DEFAULT_CAL); saveCal(cal); return 'Calibration reset to defaults.'; }

  return {
    start, stop, calibrate, resetCal,
    get running() { return running; },
    read(now) {
      return {
        present, landmarks, world: null, handedness: null,
        bends: { ...bends },
        palm: { x: palmX, y: 0.5, z: 0 },
        pinch: null, builtInGesture: null, t: now,
      };
    },
  };
}
