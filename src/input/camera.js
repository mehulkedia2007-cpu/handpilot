// Webcam + MediaPipe Gesture Recognizer (@mediapipe/tasks-vision).
// Turns video frames into HandFrames: 21 landmarks, world landmarks in metres,
// which hand it is, and MediaPipe's own guess at the gesture.
import { PerfMeter } from '../core/perf.js';
import { FINGERS, lerp, fingerRatios, bendsFromRatios, palmFromLandmarks, pinchFromLandmarks, DEFAULT_CAL, copyCal, isUsableCal } from '../core/hand.js';

// The WASM files must come from the same version as the JS in the import map (index.html).
const VISION_VERSION = '0.10.35';
const WASM_URL = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${VISION_VERSION}/wasm`;
const MODEL_URL = 'https://storage.googleapis.com/mediapipe-models/gesture_recognizer/gesture_recognizer/float16/1/gesture_recognizer.task';
// Pairs of landmark indexes to draw as bones on the preview.
const LINKS = [[0,1],[1,2],[2,3],[3,4],[0,5],[5,6],[6,7],[7,8],[5,9],[9,10],[10,11],[11,12],[9,13],[13,14],[14,15],[15,16],[13,17],[17,18],[18,19],[19,20],[0,17]];
const TIPS = [4, 8, 12, 16, 20];

export const CAMERA_BLOCKED_MSG = 'The camera is blocked in this view. Use the simulator, or open HandPilot from localhost or its HTTPS link in Chrome or Edge.';
export const MODEL_FAILED_MSG = 'The hand model could not load. Check your connection and try again.';

export function describeCamError(e) {
  const n = e && e.name;
  if (n === 'NotAllowedError' || n === 'SecurityError') return CAMERA_BLOCKED_MSG;
  if (n === 'NotFoundError' || n === 'OverconstrainedError') return 'No camera was found on this device.';
  if (n === 'NotReadableError') return 'The camera is in use by another app. Close it and try again.';
  return 'The camera could not start. Use the simulator instead.';
}

// MediaPipe labels handedness as if the image were mirrored (a selfie). Our video
// frames are not mirrored (only the preview is, with CSS), so the label is swapped.
function flipHandedness(label) {
  if (label === 'Left') return 'Right';
  if (label === 'Right') return 'Left';
  return null;
}

// Loaded once and kept, so stopping and restarting the camera is instant.
// The GPU is much faster, but some browsers or drivers can't create a WebGL
// context for it, so we fall back to the CPU instead of failing.
let recognizerPromise = null;
function loadRecognizer() {
  recognizerPromise ??= (async () => {
    const { FilesetResolver, GestureRecognizer } = await import('@mediapipe/tasks-vision');
    const vision = await FilesetResolver.forVisionTasks(WASM_URL);
    const options = (delegate) => ({
      baseOptions: { modelAssetPath: MODEL_URL, delegate },
      runningMode: 'VIDEO', numHands: 1,
    });
    try {
      return { recognizer: await GestureRecognizer.createFromOptions(vision, options('GPU')), delegate: 'GPU' };
    } catch (err) {
      console.warn('GPU delegate failed, falling back to CPU', err);
      return { recognizer: await GestureRecognizer.createFromOptions(vision, options('CPU')), delegate: 'CPU' };
    }
  })();
  // A failed load shouldn't be cached forever: let the next click try again.
  recognizerPromise.catch(() => { recognizerPromise = null; });
  return recognizerPromise;
}

// initialCal comes from the saved settings; onCalChange(cal) is called whenever
// the user calibrates, so main.js can save it.
export function createCamera(video, overlay, { initialCal = DEFAULT_CAL, onCalChange = () => {} } = {}) {
  const octx = overlay.getContext('2d');
  let stream = null, recognizer = null, delegate = null, running = false;
  let lastVideoTime = -1;
  const perf = new PerfMeter();   // recognitions per second and ms per call
  let cal = copyCal(initialCal);
  let calRatios = null;   // lightly averaged raw ratios, used only when calibrating
  let frame = emptyFrame(0);

  function emptyFrame(t) {
    return {
      present: false, landmarks: null, world: null, handedness: null,
      bends: { thumb: 0.5, index: 0.8, middle: 0.8, ring: 0.8, pinky: 0.8 },
      palm: { x: 0.5, y: 0.5, z: 0 }, pinch: null,
      builtInGesture: null, builtInScore: 0, t,
    };
  }

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
    onStatus('Loading', 'Loading the gesture model. The first time takes a few seconds.');
    try {
      ({ recognizer, delegate } = await loadRecognizer());
    } catch (err) {
      console.warn(err);
      stopStream();
      throw new Error(MODEL_FAILED_MSG);
    }
    running = true; lastVideoTime = -1; frame = emptyFrame(performance.now());
    loop();
  }

  function stop() {
    running = false; stopStream();
    frame = emptyFrame(performance.now());
    octx.clearRect(0, 0, overlay.width, overlay.height);
  }

  // The browser may draw the page at 60+ fps while the camera only delivers
  // 30 new frames a second. Running the model twice on the same frame wastes
  // time, so we only call it when the video has actually moved on.
  function loop() {
    if (!running) return;
    if (video.readyState >= 2 && video.currentTime !== lastVideoTime) {
      lastVideoTime = video.currentTime;
      const ts = performance.now();
      try {
        // Timestamps must always increase; performance.now() guarantees that.
        const res = recognizer.recognizeForVideo(video, ts);
        perf.tick(performance.now() - ts);   // time the model only, not our drawing
        onResults(res, ts);
      } catch (err) { console.warn('recognition failed for one frame', err); }
    }
    requestAnimationFrame(loop);
  }

  function onResults(res, ts) {
    if (overlay.width !== video.videoWidth && video.videoWidth) { overlay.width = video.videoWidth; overlay.height = video.videoHeight; }
    octx.clearRect(0, 0, overlay.width, overlay.height);
    const lm = res.landmarks && res.landmarks[0];
    if (!lm) { frame = emptyFrame(ts); return; }
    drawHand(lm);
    const raw = fingerRatios(lm);
    calRatios = calRatios || { ...raw };
    for (const n of FINGERS) calRatios[n] = lerp(calRatios[n], raw[n], 0.5);
    const top = res.gestures && res.gestures[0] && res.gestures[0][0];
    const hand = res.handedness && res.handedness[0] && res.handedness[0][0];
    frame = {
      present: true,
      landmarks: lm,
      world: (res.worldLandmarks && res.worldLandmarks[0]) || null,
      handedness: hand ? flipHandedness(hand.categoryName) : null,
      bends: bendsFromRatios(raw, cal),
      palm: palmFromLandmarks(lm),
      pinch: pinchFromLandmarks(lm),
      builtInGesture: top ? top.categoryName : null,
      builtInScore: top ? top.score : 0,
      t: ts,
    };
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
    if (!calRatios || !frame.present) return 'Show your hand to the camera first, then press the button.';
    const next = copyCal(cal);
    for (const n of FINGERS) next[which][n] = calRatios[n];
    if (!isUsableCal(next)) return 'That reading is too close to the other pose. Open your hand fully or make a tight fist, then try again.';
    cal = next; onCalChange(copyCal(cal));
    return (which === 'open' ? 'Open hand' : 'Fist') + ' saved. Straight fingers now read 0%, curled fingers 100%.';
  }

  function resetCal() { setCal(DEFAULT_CAL); onCalChange(copyCal(cal)); return 'Calibration reset to defaults.'; }
  function setCal(next) { cal = copyCal(next); }

  return {
    start, stop, calibrate, resetCal, setCal,
    get running() { return running; },
    get delegate() { return delegate; },
    perf,
    // t is the time of the last recognition, not the time of this read, so the
    // filter downstream can tell a new camera frame from a repeat of the old one.
    read() {
      return { ...frame, bends: { ...frame.bends }, palm: { ...frame.palm } };
    },
  };
}
