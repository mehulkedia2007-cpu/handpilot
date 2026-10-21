# Architecture

## Data flow

```
Webcam ─► MediaPipe Hands (Phase 1: Gesture Recognizer) ─► 21 landmarks
   │                                                          │
Simulator sliders ────────────────────────────────────────────┤  same "HandFrame" shape
                                                              ▼
                               core/hand.js  → finger ratios → bends (0–1), palm x → body yaw
                                                              ▼
                               core/gestures.js → gesture name (FIST, OPEN, PEACE, THUMBS_UP, POINT, NONE)
                                                              ▼
                               core/agent.js  SEE → DECIDE (mode) → ACT (target pose via poseFor)
                                                              ▼
                               blendPose eases the current pose toward the target
                                                              ▼
                               scene/humanoid.js rotates the robot's joints; stage.js renders
```

Later phases add these pieces:
- `core/filters.js` (One Euro smoothing, Phase 1)
- `core/ik.js` and `scene/arm.js` (Phase 2)
- `core/stacking.js` (Phase 3)
- `core/knn.js` and `core/motion.js` (Phase 4)
- the LLM agent and `server/` (Phase 5)

## The main loop (`src/main.js`)

The loop runs once per animation frame, about 60 times a second:

1. **Read input.** `cam.read(now)` or `sim.read(now)` returns a `HandFrame`.
2. **Classify.** `classify(frame.bends)` returns a gesture name.
3. **Agent step.** `agent.step(now, { hand, gesture })` returns `{ mode, progress, candidate }`.
4. **Pose.** `poseFor(mode, t, bends, yaw)` returns target joint angles, or `null` in HOLD.
5. **Ease.** `blendPose(cur, target, alpha)` moves the current angles part of the way to the target.
6. **Render.** The robot copies `cur` onto its joints, and Three.js draws the frame.
7. **UI.** Every ~70 ms the HUD and panels refresh. The DOM is slower than WebGL, so this doesn't run every frame.

The camera runs its own loop (`input/camera.js`). It sends one video frame at a time to MediaPipe and stores the latest result, and `read()` returns whatever is newest. This means slow hand tracking never slows down rendering.

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
- In Phase 0 the camera uses the legacy `@mediapipe/hands` script, the same as the prototype. Phase 1 replaces it with the Gesture Recognizer from `@mediapipe/tasks-vision`.

## Three.js r128 → r160

The prototype used the old global `THREE` script (r128). Newer versions manage colour spaces and use physically based light units, which made the robot look different. `scene/stage.js` keeps the original look in three ways:
- it switches colour management off and outputs linear colour;
- it multiplies the ambient and directional light intensities by π;
- it gives the point light `decay = 1`.
