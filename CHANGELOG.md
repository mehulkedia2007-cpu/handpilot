# Changelog

All notable changes to HandPilot are listed here, newest first.

## [Unreleased]

### Phase 2: Robot arm teleoperation
- P2.1: Robot arm model (`src/scene/arm.js`): base yaw, shoulder, elbow and wrist pitch, and a two-finger gripper, built from nested Groups. Its lengths, joint limits and parked pose live in `src/core/armSpec.js` so the IK solver (P2.3) can share them. A **Humanoid / Arm** switch in the header picks the robot and is saved in settings. With the arm selected, an **Arm joints** debug panel drives each joint, and **Park arm** resets it.
- P2.2: Hand position to a 3D target (`src/core/workspace.js`): palm x (mirrored) and y map across a workspace box in front of the arm, and palm width in the image gives depth (wider = closer to the camera = reach in toward the base). The box is drawn faintly and the target shows as a small sphere. The simulator gains **Height** and **Reach** sliders; **Turn** moves the target left and right.

### Phase 1: Pro hand tracking
- P1.1: Camera switched from the legacy `@mediapipe/hands` script to the MediaPipe Gesture Recognizer (`@mediapipe/tasks-vision@0.10.35`), on the GPU with a CPU fallback. Recognition only runs when the video has a new frame. HandFrames now carry world landmarks, handedness (shown as a chip on the stage), palm position and depth, pinch, and MediaPipe's built-in gesture (shown under the gesture name). Confident built-in gestures drive the agent; the rule-based classifier is the fallback and still drives the simulator.
- P1.2: One Euro filter (`src/core/filters.js`) with one filter per finger bend plus palm x/y/z and pinch, applied to both camera and simulator input. The Smoothing slider is replaced by **Min cutoff** and **Beta** sliders (defaults 1.0 and 1.0, tuned for 0–1 signals; the textbook beta of 0.01 is for pixel units and lagged about 12 frames here). The pose blend is now a fixed light ease. `smoothingAlpha` was removed from `core/agent.js`.
- P1.3: Settings (calibration, filter tuning, selected robot, gesture mappings) saved to `localStorage` under one versioned key, `handpilot.settings.v1`, through `src/core/settings.js`. Storage is passed in, every access is wrapped in try/catch, and each field is validated on load so one bad value never wipes the rest. A calibration saved by the Phase 0 app is migrated on first run. Added a **Reset to defaults** button. The robot and gesture-mapping fields are stored now and become editable in Phases 2 and 4.
- P1.4: Performance HUD on the stage: render FPS, tracking FPS and average milliseconds per recognition call, refreshed once a second by a small `PerfMeter` (`src/core/perf.js`).
- P1.5 (optional, Web Worker recognition) was skipped.
- Docs: README, `docs/ARCHITECTURE.md`, `docs/TESTING.md` and `docs/LEARNING.md` (Phase 1) updated.

### Phase 0: Set up the project
- P0.1: Repository skeleton, `package.json` with `dev` and `test` scripts, MIT licence, `.gitignore`.
- P0.2: Split the prototype into ES modules (`src/core`, `src/input`, `src/scene`, `src/ui`, `src/main.js`). Three.js r128 global script replaced by `three@0.160.0` through an import map, with lighting and colour settings adjusted so the robot looks the same. Added keyboard orbit (arrow keys, +/-) on the 3D view.
- P0.3: Unit tests with `node:test` for finger-bend maths, gesture classification, the agent state machine (fake clock) and pose mapping. The prototype had no test code, so these were written from its behaviour.
- P0.4: README v1 (pitch, features, run, test, architecture, privacy, credits, AI-assistance note), `docs/ARCHITECTURE.md`, `docs/LEARNING.md` (Phase 0), `docs/TESTING.md` manual checklist, `src/core/types.md`.
- P0.5: GitHub Actions workflow that runs the tests and deploys the repo root to GitHub Pages on every push to `main`. Setup steps documented in the README.
