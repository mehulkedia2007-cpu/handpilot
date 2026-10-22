# Architecture

## Data flow

```
Webcam ─► MediaPipe Gesture Recognizer ─► 21 landmarks + world landmarks, handedness, built-in gesture
   │                                                          │
Simulator sliders ────────────────────────────────────────────┤  same "HandFrame" shape
                                                              ▼
                               core/hand.js  → finger ratios → bends (0–1), palm x/y/z, pinch
                                                              ▼
                               core/filters.js → One Euro filter on every bend, palm x/y/z and pinch
                                                              ▼
                               core/gestures.js → pickGesture: confident built-in label, else rules on the bends
                                                              ▼
                               core/agent.js  SEE → DECIDE (mode) → ACT (target pose via poseFor)
                                                              ▼
                               blendPose eases the current pose toward the target
                                                              ▼
                               scene/humanoid.js rotates the robot's joints; stage.js renders
```

With the **arm** selected, step ACT takes a different route (`core/armMotion.js`):

```
palm x, y, width ─► core/workspace.js targetFromPalm ─► 3D target in the workspace box
                                                              ▼
pinch ─► core/pinch.js latch (close < 0.35, open > 0.5) ──► armGoalFor(mode, t, {target, closed})
                                                              │  MANUAL: core/ik.js solveIK(target) + grip
                                                              │  AUTO: IK along the looping pick-and-place path
                                                              │  HOLD: null (keep pose)  IDLE: park  GREET: wave
                                                              ▼
                               blendPose eases the arm's angles toward the goal
                                                              ▼
                               scene/arm.js rotates base, shoulder, elbow, wrist and slides the gripper fingers
```

Then the blocks (Phase 3):

```
eased arm pose ─► core/ik.js forwardKinematics ─► gripper point (where the gripper really is)
                                                              ▼
eased grip ─► core/stacking.js createStacker.step(grip, point, yaw)
                │  grip passes 0.6: grab the nearest uncovered block whose top is within 0.25
                │  while held: the block hangs from the fingers (never sunk into the table or a block)
                │  grip passes 0.4: dropBlock, which lands it on the highest block under it or the table,
                │                   snapping into line above 60% overlap
                ▼
scene/blocks.js draws the table and blocks (with a short fall animation)
core/challenge.js: Start → running → won when isOneStack(blocks) and nothing is held → best time saved
```

The blocks follow the arm's *eased* grip, not the pinch, so whatever moves the arm (hand, joint sliders, the AUTO demo) can pick blocks up.

The agent itself doesn't know which robot is on screen. It decides the mode the same way for both; `main.js` only gives it different wording (`agent.actText`) for the log.

Later phases add these pieces:
- `core/knn.js` and `core/motion.js` (Phase 4)
- the LLM agent and `server/` (Phase 5)

## The main loop (`src/main.js`)

The loop runs once per animation frame, about 60 times a second:

1. **Read input.** `cam.read()` or `sim.read(now)` returns a `HandFrame`.
2. **Filter.** `handFilter.filter(frame)` smooths it with One Euro filters. The camera frame's `t` is the time of its recognition, so a repeated frame is recognised and not filtered twice.
3. **Classify.** `pickGesture(frame)` returns a gesture name.
4. **Agent step.** `agent.step(now, { hand, gesture })` returns `{ mode, progress, candidate }`.
5. **Pose.** `poseFor(mode, t, bends, yaw)` returns target joint angles, or `null` in HOLD.
6. **Ease.** `blendPose(cur, target, alpha)` moves the current angles part of the way to the target. The filter already removed jitter, so this mainly softens jumps between modes: alpha is 0.35 normally, and 0.7 once the humanoid has been in MANUAL for 0.6 s, so it keeps up with fast finger movement. With the camera, palm x is first stretched by the **Hand sensitivity** gain (`stretch` in `core/hand.js`) before it becomes the body turn.
7. **Render.** The robot copies `cur` onto its joints, and Three.js draws the frame.
8. **UI.** Every ~70 ms the HUD and panels refresh, and once a second the FPS readout. The DOM is slower than WebGL, so this doesn't run every frame.

The camera runs its own loop (`input/camera.js`). It calls `recognizeForVideo` only when `video.currentTime` has changed, so the model never runs twice on the same frame, and stores the latest result; `read()` returns whatever is newest. Recognition is synchronous, so it does share the main thread with rendering; the performance HUD shows its cost in ms. Moving it to a Web Worker is the optional P1.5.

## Saved settings

`core/settings.js` loads and saves one JSON object under `handpilot.settings.v1`: calibration, filter settings, selected robot and gesture mappings. `main.js` passes in `localStorage` (or `null` if even touching it throws). Every field is validated on load, so a corrupt or old value falls back to its default without losing the others.

The challenge's best time is kept under its own key, `handpilot.challenge.v1`, by `core/challenge.js`, with the same try/catch and validation. It is separate so that **Reset to defaults** doesn't wipe a record.

## Module rules

| Folder | Can use | Must not use |
|---|---|---|
| `src/core/` | other `core/` modules | DOM, `window`, camera, Three.js |
| `src/input/` | `core/`, DOM, camera | Three.js |
| `src/scene/` | `core/`, Three.js | the agent |
| `src/ui/` | `core/`, DOM | Three.js |
| `src/main.js` | everything | |

Keeping `core/` pure means every rule and formula can be tested in Node in milliseconds with `npm test`.

## Shared data shapes

These are defined in [src/core/types.md](../src/core/types.md).

## Libraries and loading

- No bundler. `index.html` has an **import map** that maps `three` and `@mediapipe/tasks-vision` to exact, pinned versions on jsDelivr.
- `main.js` loads the 3D modules with a dynamic `import()`. If the Three.js CDN is unreachable, the simulator, agent and panels still work, and the stage shows a clear message.
- The camera loads `@mediapipe/tasks-vision` with a dynamic `import()` on the first **Start camera** click, then its WASM files from the same pinned version and the `gesture_recognizer.task` model from Google's storage bucket. The recognizer is created with the GPU delegate and retried on the CPU if that fails, and is kept for later restarts.

## Three.js r128 → r160

The prototype used the old global `THREE` script (r128). Newer versions manage colour spaces and use physically based light units, which made the robot look different. `scene/stage.js` keeps the original look in three ways:
- it switches colour management off and outputs linear colour;
- it multiplies the ambient and directional light intensities by π;
- it gives the point light `decay = 1`.
