# Shared data shapes

## HandFrame

One frame of hand input. Both `input/camera.js` and `input/simulator.js` produce this shape, so the rest of the app doesn't care where the hand came from.

```js
HandFrame = {
  present: boolean,                 // is a hand in view? (the simulator is always true)
  landmarks: [{x,y,z}] | null,      // 21 image-space points, 0–1 (camera only)
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
obs = { hand: boolean, gesture: "FIST"|"OPEN"|"PEACE"|"THUMBS_UP"|"POINT"|"THUMBS_DOWN"|"I_LOVE_YOU"|"NONE" }
```

## AgentState

What `Agent.step` returns:

```js
AgentState = {
  mode: "MANUAL"|"HOLD"|"AUTO"|"IDLE"|"GREET",   // REPLAY (Phase 4) and LLM (Phase 5) come later
  progress: number,   // 0–1, how far through the ~0.9 s hold the current gesture is
  candidate: string   // the gesture currently being held
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
