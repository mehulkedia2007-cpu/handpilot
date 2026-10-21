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
