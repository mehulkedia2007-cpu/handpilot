# HandPilot

**Real-time hand-gesture control of a 3D robot in the browser. An agent watches your hand, decides which mode the robot should be in, and acts.**

**Live demo:** https://mehulkedia2007-cpu.github.io/handpilot/

<!-- DEMO GIF: record docs/media/demo.gif (10–15 s, see docs/media/README.md), then replace the line below with:
![HandPilot demo: stacking three blocks with a hand-controlled robot arm](docs/media/demo.gif) -->
> *Demo GIF: coming soon.*

<!-- DEMO VIDEO: upload the 30-second video (e.g. YouTube, unlisted), then replace the line below with:
**Watch the 30-second demo:** https://... -->
> *30-second demo video: coming soon.*

## Features

- **Webcam hand tracking.** The MediaPipe Gesture Recognizer finds 21 points on your hand, tells left from right, and names the gesture. HandPilot turns the points into five finger-bend numbers (0% straight to 100% curled). It runs on the GPU and falls back to the CPU.
- **Jitter filtering.** A One Euro filter smooths every bend and the palm position: steady when your hand is still, quick when it moves. Two sliders (Min cutoff, Beta) tune it live.
- **Performance HUD.** Render FPS, tracking FPS and milliseconds per recognition, updated once a second.
- **A 3D robot that mirrors your fingers.** Index and ring raise the shoulders, middle and pinky bend the elbows, the thumb nods the head, and moving your hand left or right turns the body.
- **Gesture commands handled by an agent.** Each frame the agent goes through SEE, DECIDE and ACT. Holding a gesture for about a second sends a command:

  | Gesture (held ~1 s) | Mode | Robot does |
  |---|---|---|
  | Open palm | MANUAL | Mirrors your fingers |
  | Fist | HOLD | Freezes |
  | Peace sign | AUTO (toggle) | Dances on its own |
  | Thumbs up | GREET | Waves for 3 s |
  | No hand for 3 s | IDLE | Neutral pose, resumes when your hand returns |

- **Works without a camera.** A slider simulator with presets drives the same pipeline, so you can try every gesture without a webcam.
- **Calibration and saved settings.** "Set open hand" and "Set fist" fit the bend scale to your hand. Calibration and filter settings are saved in your browser, with a Reset to defaults button.
- **Live agent log** showing every decision and why it was made.
- **Robot arm teleoperation.** Switch between Humanoid and Arm in the header. Your palm moves a target sphere inside a workspace box (left/right, up/down, and depth from how big your hand looks), with a **Hand sensitivity** slider so small hand movements can cover the whole box, and **inverse kinematics** works out the base, shoulder, elbow and wrist angles to put the gripper there, keeping it level. The sphere turns red when the target is out of reach. **Pinch** thumb and index to close the gripper; hysteresis stops it chattering. The same gestures work: fist holds, peace sign runs a pick-and-place demo, thumbs up waves, and with no hand the arm parks itself. A debug panel shows the live joint angles and can drive them by hand.
- **Pick-and-place stacking challenge.** With the arm selected, three blocks (red, green, blue) sit on a table. Move the gripper over a block until it glows, pinch to grab it, and open your fingers to drop it: it falls straight down onto the table or the highest block under it, and snaps neatly into line when it covers more than 60% of that block. Press **Start** and stack all three into one tower as fast as you can; the timer stops when the tower stands, and your best time is saved in the browser. The peace-sign AUTO demo uses the same rules and really stacks the red block on the blue one.

MediaPipe's built-in gestures drive the commands when it is confident; otherwise the rule-based classifier on the bends decides (and always does for the simulator).

Coming next (see [the build plan](#roadmap)): recording and replaying motions, in-browser gesture learning (KNN), and an LLM agent with tool calling.

## Run it locally

You need **Node.js 22 LTS or newer** ([nodejs.org](https://nodejs.org)), **Git**, and a recent **Chrome or Edge** (Firefox and Safari also work).

```bash
git clone https://github.com/mehulkedia2007-cpu/handpilot.git
cd handpilot
npm install
npm run dev
```

Your browser opens **http://localhost:5173**. Click **Start camera** and allow access, or use the simulator sliders.

> The camera only works on `localhost` or `https://` pages. Opening `index.html` directly as a file will not work, because browsers block ES modules on `file://`, so always use `npm run dev`.

## Run the tests

```bash
npm test
```

This runs Node's built-in test runner on `tests/`. The tests cover the pure logic in `src/core/` (finger maths, gesture rules, the agent state machine, robot poses, the One Euro filter, saved settings, the FPS meter, inverse kinematics, pinch, block stacking and the challenge timer), need no browser or network, and finish in under a second.

## How it works

```
Webcam ─► MediaPipe Gesture Recognizer ─► 21 landmarks, handedness, built-in gesture ─┐
Simulator sliders ─────────────────────────────────────────────────────────────────────┤  same HandFrame shape
                                           ▼
                 core/hand.js     finger ratios ─► bends (0–1), palm, pinch
                 core/filters.js  One Euro filter removes jitter
                 core/gestures.js built-in label, or rules on the bends ─► gesture name
                 core/agent.js    SEE ─► DECIDE (mode) ─► ACT (target pose)
                 core/workspace.js + core/ik.js + core/pinch.js  (arm) palm ─► 3D target ─► joint angles, pinch ─► grip
                 core/stacking.js + core/challenge.js  grip + gripper point ─► grab, drop, stack ─► timer
                                           ▼
                 scene/*          Three.js renders the robot
```

- `src/core/` holds the **pure logic**: no DOM, camera or Three.js, so it can be unit-tested in Node.
- `src/input/` holds the **sources**: camera and simulator. Both produce the same `HandFrame` object.
- `src/scene/` holds the **3D world**: stage, lights, orbit camera and the robot.
- `src/ui/` holds the **panels**: HUD, finger channels, agent log and gesture guide.
- `src/main.js` holds the **main loop**, which wires the parts together once per animation frame.

More detail is in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md). Plain-language explanations of the ideas are in [docs/LEARNING.md](docs/LEARNING.md).

## Privacy

**Video never leaves your browser.** Every frame is processed on your own machine inside the browser tab. Nothing is uploaded, recorded or stored. The only network requests download libraries (Three.js, MediaPipe) and fonts from public CDNs. Calibration and filter settings are saved in your browser's `localStorage` (key `handpilot.settings.v1`), and your best challenge time under `handpilot.challenge.v1`. Neither is ever sent anywhere.

## Deploy

The site is static, so it runs on GitHub Pages with no build step.

1. Create an empty GitHub repo named `handpilot` and push this project to its `main` branch.
2. In the repo, open **Settings → Pages** and set **Source** to **GitHub Actions**.
3. Each push to `main` runs [.github/workflows/pages.yml](.github/workflows/pages.yml). The workflow runs the tests and then publishes the site.
4. The site appears at `https://<your-username>.github.io/handpilot/`. Pages are served over HTTPS, so the camera works.

## Project structure

```
index.html          app shell + import map (pinned Three.js and MediaPipe versions)
src/main.js         main loop
src/core/           pure logic (unit-tested)
src/input/          camera + simulator
src/scene/          Three.js stage and robot
src/ui/             HUD and panels
tests/              node:test unit tests
docs/               architecture, learning notes, manual test checklist, media (demo GIF)
reference/          the original single-file prototype
```

## Roadmap

| Phase | Milestone |
|---|---|
| 0 ✅ | Project set up: modules, tests, docs, deploy |
| 1 ✅ | MediaPipe Gesture Recognizer, One Euro filter, saved settings, FPS HUD |
| 2 ✅ | Robot arm teleoperation with inverse kinematics and pinch-to-grab |
| 3 ✅ | Pick-and-place block-stacking challenge |
| 4 | Record/replay motions and train custom gestures in the browser (KNN) |
| 5 | LLM agent with tool calling and safety limits |
| 6 | Optional real servo over Web Serial, and launch polish |

## Credits

- [Three.js](https://threejs.org/) for 3D rendering (MIT licence).
- [MediaPipe](https://developers.google.com/mediapipe) by Google for hand tracking (Apache 2.0 licence).
- Fonts: Barlow, Barlow Condensed and IBM Plex Mono from Google Fonts (SIL Open Font License).

## Built with AI assistance

I built this project with help from an AI coding assistant (Claude Code), working from a phase-by-phase plan I wrote. I review, run and test each change, and I write up what I learn in [docs/LEARNING.md](docs/LEARNING.md).

## Licence

[MIT](LICENSE) © 2026 Mehul Kedia
