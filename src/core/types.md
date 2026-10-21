# Shared data shapes

## HandFrame

One frame of hand input. Both `input/camera.js` and `input/simulator.js` produce this shape, so the rest of the app doesn't care where the hand came from.

```js
HandFrame = {
  present: boolean,                 // is a hand in view? (the simulator is always true)
  landmarks: [{x,y,z}] | null,      // 21 image-space points, 0–1 (camera only)
  world: [{x,y,z}] | null,          // 21 world-space points in metres (Phase 1, camera only)
  handedness: "Left"|"Right"|null,  // Phase 1
  bends: {thumb, index, middle, ring, pinky},  // 0 = straight, 1 = curled
  palm: {x, y, z},                  // normalised 0–1; Phase 0 only uses x (it turns the body)
  pinch: number | null,             // Phase 2; null until then
  builtInGesture: string | null,    // Phase 1: MediaPipe label such as "Closed_Fist"
  t: number                         // timestamp in ms (performance.now())
}
```

## Agent observation

What `Agent.step(now, obs)` receives each frame:

```js
obs = { hand: boolean, gesture: "FIST"|"OPEN"|"PEACE"|"THUMBS_UP"|"POINT"|"NONE" }
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
