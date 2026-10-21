# HandPilot: Build Plan

> **For Claude Code.** This file is the source of truth for building HandPilot. Read all of it before writing code. Then build **one phase at a time**, in order. After each phase, run the tests, update the README, commit, and stop so the owner can review and learn from it.

---

## 0. Instructions for Claude Code

1. **Start from the existing demo.** The file `gesture-robot-standalone.html` (the owner will place it in the repo root, or in `reference/`) is a working single-file prototype. It already has webcam hand tracking, finger-bend maths, gesture classification, a see/decide/act agent, a 3D humanoid robot, a slider simulator and tests. Reuse its logic; don't rewrite it from scratch.
2. **Work phase by phase.** Finish every task in a phase, meet its acceptance criteria, and run `npm test`. Then update `README.md` and `CHANGELOG.md` and make one commit per task, using clear messages. Stop at the end of each phase and summarise what changed.
3. **The owner is a first-year CS student learning as he builds.** Explain non-obvious code with short comments (the *why*, not the *what*). Keep functions small and named plainly. After each phase, add a short section to `docs/LEARNING.md` explaining the main ideas in simple language, so he can explain the project in an interview.
4. **Keep it runnable without a build step** (see the tech stack). Don't add frameworks, bundlers or dependencies that aren't listed here without asking first.
5. **Pure logic stays pure.** Maths, gesture classification, the agent state machine, IK, filters and KNN go in `src/core/` with no DOM, camera or Three.js access, so they can be unit-tested in Node.
6. **Never commit secrets.** API keys live only in `server/.env`, which is gitignored.
7. **Ask before** deleting files, changing the folder structure below, or adding a paid service.
8. Mark optional tasks as optional, and skip them unless the owner asks for them.

---

## 1. What HandPilot is

HandPilot is a browser app where you control a 3D robot with your hand through a webcam. An agent watches what you do, decides what mode the robot should be in, and acts. It goes beyond "fingers move a model" in three ways:

- **Teleoperation:** your hand moves a robot arm's gripper in 3D using inverse kinematics, and a pinch grabs objects.
- **Learning:** the robot records and replays motions, and learns new gestures you teach it with a KNN classifier that runs in the browser.
- **Agentic AI:** a language model takes text or voice commands ("stack the red block on the blue one") and controls the robot through tool calls, within safety limits.

The project is software-only by default. Driving real hardware (a servo over Web Serial) is an optional extra.

**One-line pitch:** *Real-time hand-gesture teleoperation of a 3D robot arm, with inverse kinematics, in-browser gesture learning, and an LLM agent that uses tool calling.*

---

## 2. Tools required

### Required for everyone
| Tool | Version | What it's for |
|---|---|---|
| **VS Code** | latest | Code editor |
| **Git** | latest | Version control |
| **GitHub account** | n/a | Hosting the repo and the live demo (GitHub Pages) |
| **Node.js** | 22 LTS (or the current LTS) | Running tests (`node --test`) and the local dev server; later, the agent backend |
| **npm** | comes with Node | Scripts, plus the backend's dependencies |
| **Chrome or Edge (desktop)** | latest | Development browser. Required for Web Serial; camera and WebGL work in all modern browsers |
| **A webcam** | built-in is fine | Hand tracking |
| **Claude Code** | latest | Building the project from this plan |

### Libraries (loaded in the browser, no install)
| Library | How it loads | Licence |
|---|---|---|
| **Three.js** | ES module from jsDelivr through an import map, **pinned to an exact version** (e.g. `three@0.160.0`; check it exists on npm before using it) | MIT |
| **MediaPipe Tasks Vision** (`@mediapipe/tasks-vision`) | ES module from jsDelivr, **pinned to an exact version**; WASM files from the same version's `/wasm` folder; model `gesture_recognizer.task` from Google's storage bucket (see the MediaPipe Web guide) | Apache 2.0 |

### Dev tooling (installed with `npm install`, dev-only)
| Tool | Purpose |
|---|---|
| `http-server` or `serve` | Local static server (`npm run dev`). The camera works on `localhost` |
| Node's built-in test runner | `npm test` runs `node --test tests/`, so no test framework is needed |
| *(optional)* `prettier` | Consistent formatting |

### Needed for later phases
| Tool | Phase | Purpose |
|---|---|---|
| **Anthropic API key** (or another LLM provider's) | Phase 5 | The agent. Costs money per call, so set a spending limit |
| `express`, `dotenv`, `@anthropic-ai/sdk` | Phase 5 | Backend in `server/` |
| **Arduino IDE** | Phase 6 (optional) | Writing and uploading the servo sketch |
| **Wokwi** (free, browser) | Phase 6 (optional) | Simulating the Arduino and servo without hardware |
| Arduino Uno/Nano or ESP32, plus an SG90 servo | Phase 6 (optional) | Real hardware |
| A screen recorder / GIF tool | Phase 3 | Demo GIF for the README |

---

## 3. Tech stack and constraints

- **Plain HTML, CSS and JavaScript ES modules.** No React, no bundler. `index.html` loads `src/main.js` as `type="module"`, and an import map resolves `three` and `@mediapipe/tasks-vision` to pinned CDN URLs.
- **Runs from any static server**, and therefore on GitHub Pages with no build step.
- **Unit tests** with `node --test`, testing only `src/core/` modules.
- **Backend (Phase 5 only):** a small Node + Express server in `server/`, kept separate from the static site. The static site still works when the server isn't running; the agent panel then says "Agent offline".
- **Browsers:** latest Chrome, Edge, Firefox and Safari for the core features. Web Serial is Chrome/Edge desktop only, so feature-detect it and explain when it's missing.
- **Privacy:** video frames never leave the browser. Say so in the UI and the README.
- **Performance target:** at least 30 fps rendering and at least 20 fps tracking on a typical laptop.
- **Accessibility:** every control works by keyboard; the slider simulator must always work, so the app is usable without a camera.

---

## 4. Repository structure

```
handpilot/
├── index.html                 # app shell, import map, loads src/main.js
├── src/
│   ├── main.js                # wires everything together, main loop
│   ├── style.css
│   ├── core/                  # PURE logic: no DOM, no Three.js, unit-tested
│   │   ├── hand.js            # finger ratios, bends, normalisation, pinch
│   │   ├── gestures.js        # rule-based classifier + gesture → command map
│   │   ├── agent.js           # see/decide/act state machine (modes, hold timers)
│   │   ├── filters.js         # OneEuroFilter
│   │   ├── ik.js              # 2-link IK + forward kinematics
│   │   ├── knn.js             # KNN gesture classifier
│   │   ├── motion.js          # record / replay / interpolate
│   │   └── stacking.js        # block grab/drop/stack rules for the challenge
│   ├── input/
│   │   ├── camera.js          # getUserMedia + MediaPipe Gesture Recognizer
│   │   └── simulator.js       # slider/preset input (same output shape as camera)
│   ├── scene/
│   │   ├── stage.js           # renderer, camera, lights, orbit controls
│   │   ├── humanoid.js        # existing robot from the demo
│   │   ├── arm.js             # robot arm + gripper
│   │   └── blocks.js          # blocks for the challenge
│   ├── ui/
│   │   ├── hud.js             # mode badge, gesture ring, FPS
│   │   ├── panels.js          # camera, finger channels, agent log, settings
│   │   └── trainer.js         # gesture trainer UI
│   ├── agent-llm/
│   │   └── client.js          # talks to server/ (Phase 5)
│   └── hardware/
│       └── serial.js          # Web Serial (Phase 6, optional)
├── server/                    # Phase 5 only
│   ├── index.js               # Express app, POST /agent
│   ├── tools.js               # tool definitions + validation/clamping
│   ├── package.json
│   └── .env.example           # ANTHROPIC_API_KEY=, AGENT_MODEL=, PORT=8787
├── hardware/
│   └── handpilot_servo/handpilot_servo.ino   # Phase 6, optional
├── tests/
│   ├── hand.test.js
│   ├── gestures.test.js
│   ├── agent.test.js
│   ├── filters.test.js
│   ├── ik.test.js
│   ├── knn.test.js
│   ├── motion.test.js
│   └── stacking.test.js
├── docs/
│   ├── ARCHITECTURE.md        # diagram + data flow
│   ├── LEARNING.md            # plain-language explanations per phase
│   └── media/                 # screenshots, demo.gif
├── reference/
│   └── gesture-robot-standalone.html   # original prototype, kept for reference
├── .gitignore                 # node_modules, .env, .DS_Store
├── package.json               # scripts: dev, test
├── README.md
├── CHANGELOG.md
└── LICENSE                    # MIT
```

---

## 5. Architecture

```
Webcam ─► MediaPipe Gesture Recognizer ─► 21 landmarks (+ world landmarks, handedness, built-in gesture)
   │                                              │
Simulator sliders ────────────────────────────────┤  (same "HandFrame" shape from both sources)
                                                  ▼
                                   core/hand.js  → finger bends (0–1), palm position, pinch
                                   core/filters.js → One Euro smoothing
                                                  ▼
                       core/gestures.js + core/knn.js → gesture label + confidence
                                                  ▼
                 core/agent.js (SEE → DECIDE → ACT)  ◄── LLM agent commands (Phase 5)
                                                  ▼
                 target pose: joint angles (humanoid) or gripper target (arm, via core/ik.js)
                                                  ▼
          scene/* renders it with Three.js     hardware/serial.js mirrors it to a servo (optional)
```

**Shared data shapes** (document these in `src/core/types.md` or as JSDoc):

```js
// One frame of hand input, from camera or simulator
HandFrame = {
  present: boolean,
  landmarks: [{x,y,z}] | null,    // 21 image-space points (camera only)
  world: [{x,y,z}] | null,        // 21 world-space points in metres (camera only)
  handedness: "Left" | "Right" | null,
  bends: {thumb, index, middle, ring, pinky},  // 0 = straight, 1 = curled
  palm: {x, y, z},                // normalised 0–1 (z = relative depth)
  pinch: number,                  // 0 = touching, larger = apart (normalised by palm width)
  builtInGesture: string | null,  // MediaPipe label, e.g. "Closed_Fist"
  t: number                       // ms timestamp
}

AgentState = { mode: "MANUAL"|"HOLD"|"AUTO"|"IDLE"|"GREET"|"REPLAY"|"LLM", progress: 0–1, candidate: string }
```

**Agent modes** (keep the existing behaviour and extend it):

| Gesture (held ~0.9 s) | Mode | Robot does |
|---|---|---|
| Open palm | MANUAL | Mirrors the hand |
| Fist | HOLD | Freezes |
| Peace sign (Victory) | AUTO, toggles | Plays the built-in routine |
| Thumbs up | GREET (3 s) | Waves |
| No hand for 3 s | IDLE | Neutral pose, resumes when the hand returns |
| Trained gestures (Phase 4) | user-mapped | Any action, e.g. play a saved motion |
| LLM command (Phase 5) | LLM | Executes the tool calls, then returns to MANUAL |

---

## 6. Phases and tasks

Each task lists **steps** and **acceptance criteria (AC)**. A task is done only when its AC pass.

### Phase 0: Set up the project
*Milestone: HandPilot is on GitHub with a live demo link.*

**P0.1 Initialise the repo**
- Create the structure in §4, plus `package.json` with `"type": "module"` and scripts `dev` (static server on port 5173) and `test` (`node --test tests/`).
- Add `.gitignore`, an MIT `LICENSE` (copyright holder: the owner), and an empty `CHANGELOG.md`.
- AC: `npm install && npm run dev` serves the page; `npm test` runs, even with zero tests.

**P0.2 Port the prototype into modules**
- Split `reference/gesture-robot-standalone.html` into the modules in §4: `core/hand.js`, `core/gestures.js`, `core/agent.js`, `scene/humanoid.js`, `input/camera.js`, `input/simulator.js`, `ui/*`, `main.js`.
- Switch Three.js from the global r128 script to an ES module through the import map (pinned version). Fix any API differences.
- Keep the existing look and behaviour.
- AC: the app behaves exactly like the prototype (simulator, presets, gestures, modes, agent log, orbit, camera).

**P0.3 Port the tests**
- Convert the prototype's tests (finger bend, gesture classification, agent state machine, pose mapping) to `node:test` files.
- AC: `npm test` passes all of them.

**P0.4 README v1 and docs**
- The README covers: one-line pitch, live demo link, demo GIF placeholder, features, how to run, how to test, architecture summary (link to `docs/ARCHITECTURE.md`), privacy note, credits (Three.js MIT, MediaPipe Apache 2.0), licence, and an honest note that the project was built with AI assistance.
- AC: a stranger can run the project from the README alone.

**P0.5 Deploy to GitHub Pages**
- Add a GitHub Actions workflow that deploys the repo root to Pages on every push to `main`, or document using "Deploy from branch".
- AC: the live HTTPS link loads, the camera works on it, and the link is in the README.

---

### Phase 1: Pro hand tracking
*Milestone: real-time hand tracking with jitter filtering.*

**P1.1 Switch to the MediaPipe Gesture Recognizer**
- In `input/camera.js`, use `@mediapipe/tasks-vision`: `FilesetResolver.forVisionTasks(<pinned wasm url>)`, then `GestureRecognizer.createFromOptions(vision, { baseOptions: { modelAssetPath: <gesture_recognizer.task url>, delegate: "GPU" }, runningMode: "VIDEO", numHands: 1 })`.
- Call `recognizeForVideo(video, now)` only when `video.currentTime` changes.
- Produce a `HandFrame` that includes `handedness`, `world` landmarks and `builtInGesture`.
- Map the built-in labels (`Closed_Fist`, `Open_Palm`, `Victory`, `Thumb_Up`, `Thumb_Down`, `Pointing_Up`, `ILoveYou`) to the agent's commands. Keep the rule-based classifier as a fallback and for the simulator.
- Fall back to `delegate: "CPU"` if GPU init fails.
- Show clear messages for: camera blocked, no camera, camera busy, and model failed to load. Reuse the prototype's messages.
- AC: tracking works in Chrome, Edge and Safari; the handedness chip shows Left or Right; the built-in gesture name shows in the HUD.

**P1.2 One Euro filter**
- In `core/filters.js`, implement `OneEuroFilter({minCutoff=1.0, beta=0.01, dCutoff=1.0})` with `filter(value, timestampMs)`:
  - `alpha(cutoff, dt) = 1 / (1 + (1/(2π·cutoff)) / dt)`
  - Low-pass the derivative with `dCutoff`, then `cutoff = minCutoff + beta·|dx|`, then low-pass the value.
- Use one filter per finger bend, plus one each for palm x, y and z and pinch.
- Replace the Smoothing slider with **minCutoff** and **beta** sliders.
- AC: tests show the filter reduces the variance of a noisy constant signal and follows a step change within a bounded number of frames. The robot is visibly steadier with no obvious lag.

**P1.3 Persist settings and calibration**
- Save calibration, filter settings, the selected robot and gesture mappings to `localStorage` under one versioned key. Wrap every access in try/catch.
- Add "Reset to defaults".
- AC: settings survive a reload; the app still works in a private window.

**P1.4 Performance HUD**
- Show render FPS and tracking FPS, plus the time per recognition call in ms.
- AC: the numbers update about once a second.

**P1.5 (optional) Web Worker for recognition**
- Move recognition into a worker; send `ImageBitmap` frames and post results back.
- AC: render FPS doesn't drop when tracking is running.

---

### Phase 2: Robot arm teleoperation
*Milestone: gesture teleoperation of a robot arm using inverse kinematics.*

**P2.1 Robot arm model**
- In `scene/arm.js`, build a base (yaw) → shoulder (pitch) → upper arm (L1) → elbow (pitch) → forearm (L2) → wrist (pitch, kept level) → two-finger gripper. Use nested `Group`s.
- Add a robot switcher (Humanoid / Arm), saved in settings.
- AC: the arm renders, and each joint can be driven from a debug panel.

**P2.2 Hand → 3D target**
- Map the palm position to a target inside a workspace box in front of the arm: `x` from palm x (mirrored), `y` from palm y, and depth from hand size (palm width in image space) or `world` z.
- Show the target as a small sphere, and the workspace box faintly.
- AC: moving the hand moves the sphere smoothly within the box.

**P2.3 Inverse kinematics** (`core/ik.js`)
- `solveIK(target, {L1, L2, shoulderHeight, limits}) → {yaw, shoulder, elbow, wristPitch, reachable}`:
  - `yaw = atan2(x, z)`
  - `r = sqrt(x² + z²)`, `h = y − shoulderHeight`, `d = clamp(sqrt(r² + h²), |L1−L2| + ε, L1 + L2 − ε)`
  - `elbowInterior = acos((L1² + L2² − d²) / (2·L1·L2))`, so `elbow = π − elbowInterior`
  - `shoulder = atan2(h, r) + acos((L1² + d² − L2²) / (2·L1·d))` (elbow-up solution)
  - `wristPitch = −(shoulder − elbow)`, keeping the gripper level
  - Clamp every angle to `limits`; set `reachable = false` when `d` was clamped.
- Also implement `forwardKinematics(angles) → {x,y,z}`.
- AC: tests pass for at least 10 reachable targets (FK(IK(t)) is within 1e-6 of t); unreachable targets return `reachable: false` and point toward the target; no NaN for any input.

**P2.4 Pinch to grab**
- `pinch = dist(landmark 4, landmark 8) / palmWidth`. Use **hysteresis**: close when below 0.35, open when above 0.5. Tune these.
- Animate the gripper fingers.
- AC: no flicker at the boundary (tested with a noisy signal); the gripper opens and closes reliably.

**P2.5 Agent modes for the arm**
- MANUAL means follow the target, HOLD freezes it, AUTO runs a demo pick-and-place path, and IDLE parks the arm.
- AC: all modes work with the arm selected, and existing agent tests still pass.

---

### Phase 3: Pick-and-place challenge
*Milestone: a playable demo where you stack blocks with only your hand.*

**P3.1 Blocks and grabbing** (`scene/blocks.js`, `core/stacking.js`)
- Put 3 coloured blocks (red, green, blue) on a table.
- If the gripper closes within a grab radius of a block's top, attach that block to the gripper.
- AC: you can pick up any block; only one block is held at a time.

**P3.2 Drop and stack**
- On release, the block falls straight down until it rests on the table or on the highest block beneath its footprint. Snap it upright and align it if it is mostly overlapping (more than 60% footprint overlap).
- Keep this logic pure in `core/stacking.js` (positions in, positions out).
- AC: tests cover dropping on the table, dropping on a block, and partial overlap.

**P3.3 Challenge mode**
- Add Start → a timer runs → a win when all 3 blocks form one stack → show the time, with the best time saved locally. Add a Reset button.
- AC: the full loop works; the best time persists.

**P3.4 Demo media**
- Record `docs/media/demo.gif` (10–15 s) and a 30-second video. Embed the GIF at the top of the README. *(The owner records these; Claude Code prepares the README slots.)*

---

### Phase 4: The robot learns
*Milestone: the robot learns motions and custom gestures in the browser (KNN).*

**P4.1 Record and replay** (`core/motion.js`)
- Record `{t, joints}` samples at about 30 Hz while recording. Replay with linear interpolation between samples, at speeds 0.5×, 1× and 2×.
- Add a REPLAY agent mode; any held command gesture interrupts it.
- AC: tests check interpolation at, between and beyond samples; replay looks smooth.

**P4.2 Motion library**
- Name and save motions to `localStorage`; rename, delete, export to `.json` and import from `.json`, with schema validation on import.
- AC: an exported file imports back identically; an invalid file shows a clear error.

**P4.3 Normalise landmarks** (`core/hand.js`)
- `normalise(landmarks)`: subtract the wrist (point 0), divide by palm size (distance 0→9), optionally rotate so 0→9 points up, then flatten to 63 numbers (or 42 if you drop z).
- AC: the same hand shape at different sizes and positions gives nearly identical vectors (test it).

**P4.4 Gesture trainer** (`core/knn.js`, `ui/trainer.js`)
- Trainer UI: type a gesture name, click Record, and it collects about 30 samples over 3 seconds, with a countdown and a sample counter.
- `KNN({k:5})`: `add(vector, label)`, `predict(vector) → {label, confidence}`. Confidence is the fraction of k neighbours that agree. Return `"unknown"` if confidence is below 0.6 or the nearest distance is above a threshold.
- Map each trained gesture to an action (any agent command or a saved motion). Trained gestures take priority over built-in ones when confident.
- Save training data locally, with export and import.
- AC: tests check that KNN separates synthetic clusters; in the app, two custom gestures are recognised reliably.

**P4.5 Accuracy report**
- Use a hold-out split (80/20) and show per-gesture accuracy plus a small confusion table in the trainer.
- AC: the numbers display, and tests cover the split and the accuracy maths.

---

### Phase 5: Agentic AI (LLM with tool calling)
*Milestone: an LLM agent with tool calling and safety limits controls the robot.*

**P5.1 Backend** (`server/`)
- Express app with `POST /agent`, CORS limited to `localhost` and the GitHub Pages origin.
- Configuration via `.env`: `ANTHROPIC_API_KEY`, `AGENT_MODEL` (configurable, no hard-coded model), `PORT=8787`, `MAX_STEPS=6`, `MAX_REQUESTS_PER_MIN=10`.
- Commit `.env.example`, never `.env`.
- AC: `npm run dev` inside `server/` starts it; missing-key errors are clear; no key appears anywhere in the frontend or the repo.

**P5.2 Tools** (`server/tools.js`), validated and clamped on the server **and** in the browser:
```json
[
  {"name":"move_gripper_to","description":"Move the gripper to a point in the workspace (metres, robot frame).",
   "input_schema":{"type":"object","properties":{"x":{"type":"number","minimum":-0.3,"maximum":0.3},"y":{"type":"number","minimum":0.0,"maximum":0.4},"z":{"type":"number","minimum":0.1,"maximum":0.45}},"required":["x","y","z"]}},
  {"name":"open_gripper","description":"Open the gripper.","input_schema":{"type":"object","properties":{}}},
  {"name":"close_gripper","description":"Close the gripper to grab whatever is between the fingers.","input_schema":{"type":"object","properties":{}}},
  {"name":"play_motion","description":"Play a saved motion by name.","input_schema":{"type":"object","properties":{"name":{"type":"string"}},"required":["name"]}},
  {"name":"set_mode","description":"Set the robot mode.","input_schema":{"type":"object","properties":{"mode":{"type":"string","enum":["MANUAL","HOLD","AUTO","IDLE"]}},"required":["mode"]}},
  {"name":"get_scene","description":"Get current block positions, gripper position and mode.","input_schema":{"type":"object","properties":{}}}
]
```
Use the workspace bounds the app actually uses; the numbers above are placeholders.

**P5.3 Agent loop**
- The browser sends `{command, scene}`. The server runs the model with the tools; for each tool call, it returns the requested actions to the browser. The browser executes them and returns the results, and this repeats until the model gives a final text answer or `MAX_STEPS` is reached. *(Alternative: the browser streams tool requests over Server-Sent Events. Pick the simpler design and document it.)*
- The system prompt describes the robot, the coordinate frame and the safety rules, and asks for short replies.
- AC: "pick up the red block" and "stack red on blue" work in at least 4 of 5 tries on a fresh scene.

**P5.4 Safety**
- Clamp every numeric argument to its bounds, reject unknown tools and invalid enums, cap the steps, rate-limit requests, add a timeout per request, and give the user a visible **Stop** button that halts the agent and switches to HOLD.
- AC: tests feed malformed and out-of-range tool calls and check that they are clamped or rejected.

**P5.5 UI**
- Add a command box, plus an agent log showing each SEE / DECIDE / ACT step, tool names and arguments, and the final reply. Show an "Agent offline" state when the server is unreachable.
- AC: works end to end locally; the static site still works with no server.

**P5.6 (optional) Voice**
- Web Speech API for speech-to-text (feature-detected), and `speechSynthesis` for spoken replies. Add a note that recognition may use an online service in some browsers.

---

### Phase 6: Hardware (optional) and launch
*Milestone: the same gestures can move a real servo; the project is ready to show.*

**P6.1 (optional) Arduino sketch** (`hardware/handpilot_servo/handpilot_servo.ino`)
- Read newline-terminated lines at 115200 baud, such as `S,90,45,120\n` (base, shoulder, elbow in degrees). Validate, clamp to 0–180, and call `servo.write()`. Reply `OK\n` or `ERR\n`.
- Document the wiring (servo signal → pin 9/10/11, external 5 V for more than one servo, common ground). Include a Wokwi simulation link or diagram JSON.
- AC: it works in Wokwi, or on a real board.

**P6.2 (optional) Web Serial** (`src/hardware/serial.js`)
- A **Connect device** button calls `navigator.serial.requestPort()` (it needs a user click and HTTPS or localhost), then `port.open({ baudRate: 115200 })`. Send the current angles at up to 20 Hz, and only when they change by at least 1°.
- Feature-detect it, and show "Web Serial works in Chrome or Edge on desktop" otherwise. Handle the device unplugging.
- AC: the servo mirrors the 3D arm; unplugging is handled cleanly.

**P6.3 Launch polish**
- README final pass: demo GIF, live link, features, architecture diagram, how it works (short), limitations, roadmap, credits and licence.
- `docs/ARCHITECTURE.md` with the diagram from §5.
- `docs/LEARNING.md` complete for all phases.
- Suggested resume bullet in the README's "About" section (the owner edits it):
  *"Built HandPilot, a browser app for real-time hand-gesture teleoperation of a 3D robot arm (MediaPipe, Three.js) with inverse kinematics, in-browser KNN gesture learning, and an LLM agent using tool calling with safety limits."*
- AC: Lighthouse accessibility score of at least 90; no console errors; all tests pass.

---

## 7. Testing strategy

- **Unit tests (required):** everything in `src/core/`: hand maths, gestures, the agent state machine (with a fake clock), the One Euro filter, IK/FK, KNN, motion interpolation, stacking, and the tool-argument validation.
- **Manual test checklist** in `docs/TESTING.md`, run at the end of each phase:
  - Simulator only (no camera): every gesture and mode.
  - Camera in Chrome, Edge and Safari: tracking, calibration, every gesture.
  - Bad light, partly visible hand, two hands in view, no hand.
  - Reload: settings persist.
  - Live GitHub Pages link works.
- Keep `npm test` fast (under 5 s) with no network access.

---

## 8. Definition of done (every task)

- Its acceptance criteria pass.
- `npm test` passes.
- There are no console errors in Chrome.
- README / CHANGELOG / LEARNING.md are updated where relevant.
- It's committed with a clear message.

---

## 9. Out of scope (for now)

- Mobile-first layout (it must not break on phones, but desktop is the target).
- User accounts or a database.
- Multiplayer.
- VR/WebXR hand tracking (a possible future idea: WebXR exposes 25 joints per hand on Meta Quest).
- Training deep-learning models (MediaPipe Model Maker custom gestures could be a future upgrade).

---

## 10. Reference links

- MediaPipe Gesture Recognizer (overview): https://developers.google.com/edge/mediapipe/solutions/vision/gesture_recognizer
- MediaPipe Gesture Recognizer for Web: https://developers.google.com/edge/mediapipe/solutions/vision/gesture_recognizer/web_js
- Three.js docs: https://threejs.org/docs/
- One Euro filter (reference API): https://engine.needle.tools/docs/api/OneEuroFilter
- Web Serial API (MDN): https://developer.mozilla.org/en-US/docs/Web/API/Web_Serial_API
- Web Speech API (MDN): https://developer.mozilla.org/docs/Web/API/Web_Speech_API
- Example of LLM tool calling controlling a robot, with safety clamps: https://stem-docs.intellectualpoint.com/genai/day-3/llm-controlled-robot.md
- WebXR hands (future): https://developers.meta.com/horizon/documentation/web/webxr-hands/
