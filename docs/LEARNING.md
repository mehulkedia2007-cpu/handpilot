# Learning notes

Plain-language notes on the main ideas in HandPilot, one section per phase. The aim is that I can explain every part in an interview.

---

## Phase 0: From one big file to a real project

### 1. Why split one HTML file into modules?
The prototype was one 700-line HTML file. It worked, but everything could touch everything else. Splitting it into **ES modules** (`import` / `export`) gives each file one job: hand maths, gestures, the agent, the 3D robot or the UI. Each module's `import` lines show what it depends on, and a bug is easier to find because each file is small.

**Interview line:** *"I separated pure logic from side effects, so the core can be tested without a browser."*

### 2. Pure logic vs. side effects
A **pure function** gives the same output for the same input and doesn't touch anything outside itself: no DOM, no clock, no network. `classify(bends)` is pure: five numbers in, a gesture name out.

`src/core/` contains only pure code. That's why `npm test` can check it in Node in under a second with no browser. The agent doesn't read the clock itself either. It receives `now` as an argument, so a test can pass in fake times ("pretend 900 ms passed") instead of waiting.

### 3. How finger bend is measured
MediaPipe returns 21 points on the hand. For each finger we compare two distances:

```
ratio = (fingertip → wrist) / (knuckle → wrist)
```

A straight finger reaches far past its knuckle, so the ratio is about 1.75. A curled finger's tip folds back toward the wrist, so the ratio is about 0.9. Because it's a **ratio**, it doesn't matter how big the hand looks or how far it is from the camera. We then map the ratio onto 0–1 using the open and closed values from calibration, and clamp it to that range.

### 4. Classifying gestures with rules
A finger counts as **up** if its bend is below 0.3 and **down** if above 0.65. The gap between those numbers is a *dead zone*: a half-bent finger is neither up nor down, so the gesture doesn't flicker between two answers. Then simple rules apply, for example "index and middle up, ring and pinky down" means **peace**.

### 5. The agent: SEE → DECIDE → ACT
This is a small **state machine**. The robot is always in one *mode* (MANUAL, HOLD, AUTO, IDLE or GREET), and only certain events move it between modes. Each frame:
- **SEE:** is there a hand, and which gesture is it showing?
- **DECIDE:** should the mode change? For example, a gesture held for 0.9 s, no hand for 3 s, or the greeting finishing.
- **ACT:** compute the robot's target pose for that mode.

Three details make it feel reliable:
- **Hold-to-fire.** A gesture must be held for 0.9 s, so normal finger movement never triggers a command by accident.
- **Grace period.** A flicker shorter than 250 ms doesn't reset the hold timer, because tracking sometimes loses a frame.
- **Fire once.** Holding the peace sign toggles AUTO once, not on and off repeatedly.

### 6. Smooth motion with "lerp"
`lerp(a, b, t) = a + (b − a) · t` moves a fraction `t` of the way from `a` to `b`. Every frame the robot's joints move part of the way toward their target. Large gaps close quickly and small gaps slowly, which gives a natural ease-out. The Smoothing slider makes `t` smaller, so the robot moves more slowly and steadily.

### 7. Loading libraries without a bundler: import maps
Browsers can load ES modules directly. An **import map** in `index.html` tells the browser that `import * as THREE from 'three'` means a specific URL. We **pin exact versions** (`three@0.160.0`), so the app can't break when a library releases an update.

### 8. Upgrading Three.js from r128 to r160
New Three.js versions treat colour and light more realistically. With the same numbers, the robot looked different. We fixed it with documented compatibility settings: colour management off, linear output, and light intensities multiplied by π. The lesson is that **upgrading a dependency can change behaviour without causing any errors**, so it's worth comparing before and after.

### 9. Tests with `node:test`
Node has a built-in test runner, so no framework is needed. A test calls a function and uses `assert` to check the result. For the agent, a helper "plays" frames with a fake clock. For example: show a fist for 1.2 s, then check the mode is HOLD.

### 10. Deploying with GitHub Pages
The app is just static files, so GitHub Pages can host it for free. A GitHub Actions workflow runs on every push to `main`: it installs dependencies, runs the tests, and publishes the site only if they pass. Pages are served over **HTTPS**, which browsers require before they allow camera access.

---

## Phase 1: Pro hand tracking

### 1. A better hand model: the Gesture Recognizer
Phase 0 used an older MediaPipe library that only found the 21 hand points. The newer **Gesture Recognizer** (`@mediapipe/tasks-vision`) gives four things for every video frame:
- the 21 **landmarks** in image coordinates (0–1 across the picture);
- the same 21 points as **world landmarks** in metres, centred on the hand, which later helps with depth;
- **handedness**: Left or Right;
- a **built-in gesture** with a confidence score, from a small neural network trained on many hands (`Closed_Fist`, `Victory`, `Thumb_Up` and so on).

We map the built-in labels to our own gesture names. If MediaPipe is at least 60% sure, we use its answer. If not, the rule-based classifier from Phase 0 decides. The simulator has no camera, so it always uses the rules. Keeping both is a **fallback**: the app never depends on just one way of getting the answer.

Two details are worth knowing:
- **Only process new frames.** The page redraws about 60 times a second, but a webcam gives about 30 frames. We check `video.currentTime` and skip the model if the frame hasn't changed, which saves half the work.
- **Handedness is mirrored.** MediaPipe assumes a selfie image that has been flipped. Our video isn't flipped (only the preview is, with CSS), so we swap Left and Right.

**GPU with CPU fallback.** The model runs much faster on the graphics card (the "GPU delegate"), but some browsers can't set that up. So we try the GPU first, catch the error, and try again on the CPU.

### 2. Removing jitter: the One Euro filter
Hand tracking is noisy. Even a still hand makes the numbers wobble by a few percent each frame, so the robot shakes. The obvious fix is averaging, but averaging adds **lag**: the robot trails behind your hand. There's a trade-off between jitter and lag.

The **One Euro filter** gets around it by changing how much it smooths depending on speed:
- **Hand still** → smooth a lot (a low cutoff frequency). Jitter disappears.
- **Hand moving fast** → smooth very little (a high cutoff). Lag disappears.

It's a low-pass filter, `x̂ = x̂_prev + α·(x − x̂_prev)`, where `α` comes from a cutoff frequency and the time since the last sample:

```
α = 1 / (1 + τ/dt),  where τ = 1 / (2π·cutoff)
cutoff = minCutoff + beta · |speed|
```

`minCutoff` sets how steady it is when still. `beta` sets how quickly the smoothing backs off as speed rises. Those are the two sliders.

**A lesson about units.** The textbook default `beta = 0.01` assumes positions in pixels, which move hundreds of units a second. Our bends go from 0 to 1, so the speed numbers are about 100× smaller and `beta = 0.01` did almost nothing. Measured in a test: it took about 12 frames (0.4 s) to follow a jump. With `beta = 1.0` it takes 3 frames and still removes most of the noise. Tuning parameters depends on the units of your data.

We run one filter per number (five bends, palm x/y/z, pinch) because each moves on its own. When the hand disappears, the filters reset, so a hand that reappears somewhere else doesn't slide over from where it was.

### 3. Saving settings safely with localStorage
`localStorage` is a small key-value store in the browser that survives reloads. We save one JSON object under one key, `handpilot.settings.v1`. The `v1` is a **version**: if the format ever changes, a new key can't be confused with old data.

Three habits make it robust:
- **try/catch everywhere.** Storage can be blocked by privacy settings, full, or missing in some embedded views. Even reading `window.localStorage` can throw. If it fails, the app keeps the settings in memory and works normally.
- **Validate on load, field by field.** Stored data might be old, corrupt or hand-edited. We start from the defaults and copy over only the values that pass a check (a number in range, a known mode name). One bad field doesn't wipe the rest.
- **Dependency injection.** `loadSettings(storage)` receives the storage object instead of reaching for `localStorage` itself. In tests we pass a fake one built on a `Map`, or one that always throws, which is how we test "private mode" in Node.

### 4. Measuring performance
You can't improve what you don't measure. The HUD shows:
- **Render FPS**: how many frames Three.js draws per second (the target is at least 30);
- **Tracking FPS**: how many camera frames the model processed per second (the target is at least 20);
- **ms per recognition**: how long one model call takes.

A `PerfMeter` counts events and, once a second, divides the count by the elapsed time. Updating the text only once a second keeps the numbers readable and avoids touching the DOM every frame. If recognition takes, say, 25 ms, it uses a big part of the 16 ms budget for a 60 fps frame, which is why moving it to a **Web Worker** (a background thread) is the optional next step.

**Interview line:** *"I replaced the hand-tracking model with MediaPipe's Gesture Recognizer, kept a rule-based fallback, and added a One Euro filter that adapts its smoothing to hand speed, so it's steady without lag. I measured render and tracking FPS to check performance."*

## Phase 2: Robot arm teleoperation

### 1. Building an arm from nested joints
The arm is a chain: base → shoulder → upper arm → elbow → forearm → wrist → gripper. In Three.js each joint is a `Group` placed inside the one before it. Rotating a group carries everything inside it, so turning the base swings the whole arm, and bending the shoulder carries the elbow, wrist and gripper along. This is called a **kinematic chain**, and it's how real robot arms and animated skeletons work.

The arm's sizes and joint limits live in `core/armSpec.js`, not in the 3D code. The model and the maths both read the same numbers, so they can't drift apart.

### 2. From a hand in a picture to a point in 3D
The camera gives the palm's position in the image (0–1 across and down). We map it into a **workspace box** in front of the arm:
- **x** from palm x, flipped so the target moves the same way as your hand on the mirrored preview;
- **y** from palm y, flipped because image y grows downward;
- **depth** from how wide your palm looks: closer to the camera means a bigger palm. It's a cheap stand-in for real depth that needs no extra sensor.

Clamping to the box means the arm is only ever asked to reach somewhere sensible, whatever your hand does.

### 3. Inverse kinematics (IK)
**Forward kinematics** is easy: given the joint angles, add up the links with sin and cos to find where the gripper is. **Inverse kinematics** is the opposite and harder question: given where the gripper should be, what angles get it there?

For this arm it splits into two easy steps:
1. **Turn the base to face the target:** `yaw = atan2(x, z)`. Now the rest of the problem is flat, in the plane the arm is pointing along.
2. **Solve a triangle.** The upper arm (L1), the forearm (L2) and the straight line from shoulder to wrist (d) make a triangle. The **law of cosines** gives its angles:
   - elbow: `cos(inside angle) = (L1² + L2² − d²) / (2·L1·L2)`, and the elbow bend is `π − inside angle`;
   - shoulder: the angle up to the target, `atan2(h, r)`, plus the triangle's angle at the shoulder.
   
   There are two answers (elbow up or elbow down); we always pick **elbow up**, like a desk lamp.

Then the wrist is set to `−(shoulder − elbow)`, which cancels the tilt of the forearm and keeps the gripper level.

Three things make it robust:
- **Reachability.** If `d` is longer than `L1 + L2`, no angles can reach. We clamp `d`, so the arm stretches toward the target, and set `reachable: false`; the sphere turns red. The same happens when a joint hits its limit.
- **No NaN.** `acos` only accepts −1 to 1, and rounding can push a value to 1.0000000001. We clamp before calling it, and treat missing coordinates as 0.
- **Testing with FK.** The best test of IK is: solve, then run forward kinematics on the answer and check you land on the target (within 1e-6). The tests do that for a dozen hand-picked targets and 2000 random ones.

### 4. Pinch to grab, and hysteresis
Pinch is the distance between thumb tip and index tip, divided by palm width so it doesn't depend on hand size. A single threshold ("closed below 0.4") would **flicker**: a value hovering at 0.4 plus a little noise crosses it every frame, and the gripper chatters.

**Hysteresis** uses two thresholds: close below 0.35, open only above 0.5. In between, keep whatever you were doing. Noise smaller than the 0.15 gap can never toggle it. Thermostats and the Schmitt trigger in electronics use the same idea. The tests feed it a noisy signal sitting right at each threshold and check that it switches at most once.

### 5. One agent, two robots
The agent from Phase 0 still decides the mode (MANUAL, HOLD, AUTO, IDLE, GREET) from gestures, and it doesn't know which robot is on screen. `core/armMotion.js` turns each mode into a goal for the arm: follow the hand, freeze, run a pick-and-place path, park, or wave. The AUTO path is a list of **keyframes** (time, position, grip), and the arm glides between them with **smoothstep** (`3u² − 2u³`), which starts and stops gently instead of jerking at each corner. Every point along the path goes through the same IK as your hand does.

Keeping the decision (agent) separate from the action (pose for each robot) is what made adding a second robot a small change instead of a rewrite.

**Interview line:** *"I added a robot arm you control with your hand. The palm position maps to a 3D target, and I wrote an analytic inverse-kinematics solver (base yaw plus the law of cosines) that I test by checking forward kinematics lands back on the target. Pinch-to-grab uses hysteresis so the gripper doesn't flicker, and the same agent drives both robots."*

## Phase 3: Pick-and-place challenge

### 1. Logic in, positions out
All the block rules live in `core/stacking.js` as pure functions: block positions go in, new positions come out. The 3D code in `scene/blocks.js` only draws them. That split means every rule (grab, drop, stack, snap, "is it one tower?") is tested in Node, and the drawing code has nothing to get wrong except where to put a cube.

There's no physics engine. A real one (gravity, friction, collisions) would be a big dependency and hard to make behave. Three simple rules are enough for a fun game:
- **Grab:** when the grip closes, take the nearest block whose top is within a small radius of the gripper point.
- **Drop:** when it opens, the block falls straight down onto whatever is highest under it.
- **Snap:** if it lands mostly on another block, line it up exactly.

### 2. Where is the gripper, really?
The hand sets a *target*, but the arm eases toward it and might not reach it. To decide what's under the gripper, we use **forward kinematics** on the arm's current angles, which gives where the gripper actually is. The same FK we wrote to test IK in Phase 2 now does real work.

The blocks also listen to the arm's eased **grip**, not the pinch. So anything that moves the arm (your hand, the debug sliders, the AUTO demo) can pick blocks up, with no special cases. The grip gets its own two thresholds (close above 0.6, open below 0.4), which is the same hysteresis idea as the pinch.

### 3. Footprint overlap
Seen from above, a block is a square. Two squares that are axis-aligned overlap by

```
overlap = max(0, size − |dx|) × max(0, size − |dz|) / size²
```

which is 1 when they line up, 0 when they don't touch, and 0.5 when one is shifted half a block. Blocks are always set down square to the table (yaw = 0), which keeps this formula exact. When a dropped block lands on another with more than 0.6 overlap, we snap it to the same x and z. That makes stacking forgiving with a wobbly hand, without making sloppy drops look perfect.

### 4. Falling, and finding what's beneath
"Falls straight down" means: look at every other block that overlaps the falling block's footprint and sits lower, take the highest top among them (or the table), and rest there. The logic answers instantly; the scene then animates the fall with simple gravity (`v += g·dt`, `y −= v·dt`) so it doesn't teleport. Keeping the animation in the scene and the answer in the logic means the tests never have to wait for anything to fall.

### 5. Sensitivity: why the arm barely turned
The first version mapped the whole camera image (0 to 1) onto the workspace box. But the palm point is the middle knuckle, and your hand leaves the frame long before that knuckle reaches the image edge, so in practice only about 15–85% of the range was usable. The arm only got about two-thirds of the way across. The fix is a **gain** around the image centre:

```
u = clamp(0.5 + (palm − 0.5) × gain, 0, 1)
```

With gain 1.6, the middle ~60% of the image covers the whole box, and anything further out just pins the target at the edge. It's the same idea as mouse sensitivity. The simulator uses gain 1, because its sliders already span the full range. The humanoid's body turn uses the same `stretch`, so one slider tunes both robots.

The humanoid also felt laggy because two smoothers were stacked: the One Euro filter, and then an ease that moved the pose only 35% of the way to its target each frame. Easing is still useful when the mode changes (a dance stopping shouldn't snap), but once you're in control the filter is enough. So in MANUAL, after a short 0.6 s settling time, the ease goes up to 70%. Each smoother should have one job.

### 6. A tiny state machine for the game
The challenge is three states: **ready → running → won**. Start resets the blocks and records the start time. Each frame it checks "one tower, nothing held"; the first time that's true it stores the time and moves to won. Like the agent, it takes `now` as an argument instead of reading the clock, so tests can pretend 12.5 seconds passed. The best time is stored in `localStorage` with the same try/catch and validation as the settings.

**Interview line:** *"I turned the arm into a game: you stack blocks with your hand against a timer. The grab, drop and stacking rules are pure functions I unit-test, including an end-to-end test where the arm's automatic routine really stacks one block on another. I used forward kinematics to find where the gripper actually is, and footprint overlap to decide when a block snaps into place."*
