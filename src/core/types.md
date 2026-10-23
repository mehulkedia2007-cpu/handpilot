# Shared data shapes

## HandFrame

One frame of hand input. Both `input/camera.js` and `input/simulator.js` produce this shape, so the rest of the app doesn't care where the hand came from.

```js
HandFrame = {
  present: boolean,                 // is a hand in view? (the simulator is always true)
  landmarks: [{x,y,z}] | null,      // 21 image-space points, 0–1 (the simulator makes up a hand from its sliders)
  world: [{x,y,z}] | null,          // 21 world-space points in metres, origin near the hand's centre (camera only)
  handedness: "Left"|"Right"|null,  // the user's real hand (camera only)
  bends: {thumb, index, middle, ring, pinky},  // 0 = straight, 1 = curled
  palm: {x, y, z},                  // x, y: middle knuckle in the image (0–1); z: palm width in the image, bigger = closer
  pinch: number | null,             // thumb-tip to index-tip / palm width; ~0 touching (camera only, used in Phase 2)
  builtInGesture: string | null,    // MediaPipe label such as "Closed_Fist" or "None" (camera only)
  builtInScore: number,             // MediaPipe's confidence in that label, 0–1
  t: number                         // ms (performance.now()). Camera: time of the recognition, so repeats keep the same t
}
```

## Agent observation

What `Agent.step(now, obs)` receives each frame:

```js
obs = { hand: boolean, gesture: "FIST"|"OPEN"|"PEACE"|"THUMBS_UP"|"POINT"|"THUMBS_DOWN"|"I_LOVE_YOU"|"NONE"|"trained:<name>" }
```

## AgentState

What `Agent.step` returns:

```js
AgentState = {
  mode: "MANUAL"|"HOLD"|"AUTO"|"IDLE"|"GREET"|"REPLAY"|"LLM",   // LLM: the language agent drives the arm (Phase 5)
  progress: number,   // 0–1, how far through the ~0.9 s hold the current gesture is
  candidate: string,  // the gesture currently being held
  sends: string|null  // what holding it will do: a mode ("HOLD") or 'replay "Wave"'; null when nothing is being held
}
```

`agent.replay` is `{ id, name }` of the motion playing in REPLAY. `agent.custom` maps trained gestures to actions:

```js
agent.custom = {
  "trained:rock": { type: "mode", mode: "HOLD", label: "rock" },
  "trained:swirl": { type: "motion", id: "m…", name: "Wave", label: "swirl" }
}
```

## Pose (humanoid)

Joint angles in radians, returned by `poseFor(mode, t, bends, yaw)`. In HOLD it returns `null`.

```js
Pose = {
  rS, rE,   // right shoulder raise, right elbow bend (right as seen on screen)
  lS, lE,   // left shoulder raise, left elbow bend
  head,     // head nod
  yaw,      // whole-body turn
  bob       // small vertical bounce (metres) used by the animations
}
```

## ArmPose

Joint angles for the robot arm, in radians (grip is 0–1). Limits and sizes are in `core/armSpec.js`.

```js
ArmPose = {
  yaw,       // base turn; 0 faces the viewer
  shoulder,  // upper arm above horizontal; 0 = level
  elbow,     // forearm fold down from the upper arm's line; 0 = straight
  wrist,     // gripper tilt; -(shoulder - elbow) keeps it level
  grip       // 0 = open, 1 = closed
}
```

## Block

One block in the stacking challenge (`core/stacking.js`). Every block is a cube `BLOCK_SIZE` wide.

```js
Block = {
  id,        // "red" | "green" | "blue"
  x, y, z,   // centre, world units; resting on the table means y = TABLE.top + BLOCK_SIZE / 2
  yaw        // turn around the vertical axis; follows the arm while held, 0 once dropped
}
```

## Motion

A recorded motion (`core/motion.js`), saved under `handpilot.motions.v1` and in exported `.json` files.

```js
Motion = {
  id,        // short id like "mlz3k9a0q1"; stays the same when renamed
  name,      // up to 40 characters, unique (ignoring case)
  robot,     // "humanoid" | "arm": which robot's joints it holds
  hz,        // recording rate, 30
  samples: [{ t, joints }]   // t: ms from the start, increasing; joints: Pose fields (humanoid) or ArmPose fields (arm)
}
// Export file: { format: "handpilot-motions", version: 1, motions: [Motion] }
```

## Training data

The gesture trainer's data (`core/training.js`), saved under `handpilot.gestures.v1`.

```js
Training = {
  maxDistance,   // KNN match distance, 0.2–1.5 (palm lengths), default 0.6
  gestures: [{
    name,        // unique (ignoring case)
    action,      // null | { type: "mode", mode: "MANUAL"|"HOLD"|"AUTO"|"GREET" } | { type: "motion", id }
    samples      // up to 300 vectors of 63 numbers from normalise(): (x, y, z) for each of the 21 points
  }]
}
// Export file: { format: "handpilot-gestures", version: 1, ...Training }
```

## Tool calls (Phase 5)

The language agent's tools are defined in `core/tools.js`. A checked call, as the server sends it to the page:

```js
ToolCall = {
  id,      // the model's tool_use id, e.g. "toolu_01..."
  name,    // "move_gripper_to" | "open_gripper" | "close_gripper" | "play_motion" | "set_mode" | "get_scene"
  args,    // after checkToolCall: { x, y, z } clamped to WORKSPACE | { name } | { mode } | {}
  notes    // what was clamped, e.g. ["x 9 clamped to 2"]
}
```

`POST /agent` bodies and answers:

```js
// page -> server
{ command, scene }                  // start: command up to 500 characters, scene from describeScene
{ id, results: [{ id, ok, content }] }   // the results of the last calls; content is JSON or text
{ id, stop: true }                  // forget this command (Stop)

// server -> page
{ status: "tools", id, step, text, calls: [ToolCall], rejected: [{ id, name, error }] }
{ status: "done", id, step, reply, rejected, limited?, refused? }
{ error }                           // with a 4xx/5xx status
```

The scene the model reads (`describeScene` in `core/llmArm.js`), numbers rounded to 2 decimals:

```js
Scene = {
  robot, mode,
  gripper: { x, y, z, closed, holding },   // holding: a block id or null
  blocks: [{ id, x, y, z, top, on, covered }],   // on: "table" | "floor" | "gripper" | a block id
  block_size, workspace, motions           // motions: saved motion names
}
```
