# Manual test checklist

Run `npm test` first; it must pass. Then go through this list in Chrome at the end of each phase. Tick an item only when you have actually tried it.

## Simulator only (no camera)
- [ ] The page loads with no errors in the console (DevTools → Console).
- [ ] The robot renders; dragging orbits the view and the scroll wheel zooms.
- [ ] With the 3D view focused (Tab to it), the arrow keys orbit and +/- zoom.
- [ ] Moving each finger slider moves the matching joint (see the "drives …" labels).
- [ ] The Turn slider turns the robot.
- [ ] Holding **Fist** for about 1 s switches to HOLD and the robot freezes.
- [ ] Holding **Open palm** returns to MANUAL.
- [ ] Holding **Peace sign** switches to AUTO (dance). Choosing Relax and then Peace sign again returns to MANUAL.
- [ ] Holding **Thumbs up** switches to GREET; after about 3 s it returns to MANUAL by itself.
- [ ] **Point** does nothing (it isn't a command).
- [ ] The hold ring fills up while a command is being held.
- [ ] The agent log shows a SEE / DECIDE / ACT line for each change.
- [ ] Every button and slider can be reached and used with Tab, Enter and the arrow keys.
- [ ] The top-right HUD shows **Render NN fps**, updating about once a second.
- [ ] Moving **Min cutoff** down and **Beta** up changes how fast the robot follows a preset change.
- [ ] Change the filter sliders, reload: the values are kept. **Reset to defaults** puts them back to 1.0 / 1.0, and they stay after a reload.
- [ ] In a private window the app still works (settings may or may not persist, but nothing breaks).

## Robot arm (Phase 2)
- [ ] The **Humanoid / Arm** switch in the header swaps the robot; the pressed button is highlighted.
- [ ] With **Arm** selected, the **Arm joints** panel appears; with Humanoid it is hidden.
- [ ] Each arm slider moves its joint: Base turns, Shoulder lifts, Elbow folds, Wrist tilts, Grip closes the fingers.
- [ ] **Park arm** returns the arm and its sliders to the folded pose.
- [ ] Select Arm and reload: the arm is still selected. **Reset to defaults** goes back to Humanoid.

## Camera (Chrome, Edge, Safari)
- [ ] **Start camera** asks for permission, then shows the preview with the hand skeleton. The note says whether the model runs on the GPU or CPU.
- [ ] The stage shows a **Left hand** / **Right hand** chip that matches the hand you actually raised.
- [ ] Under the gesture name, **MediaPipe: …** shows the built-in label and its confidence (e.g. `Victory 92%`).
- [ ] The HUD also shows **Tracking NN fps · N ms**.
- [ ] Holding your hand still, the robot doesn't shake; moving fast, it doesn't trail far behind.
- [ ] The finger channels follow your real fingers.
- [ ] Every gesture above works with a real hand.
- [ ] **Set open hand** and **Set fist** calibrate, and the calibration still works after a reload.
- [ ] Removing your hand for 3 s switches to IDLE; showing it again switches back to MANUAL.
- [ ] **Stop camera** gives control back to the simulator.
- [ ] Bad light, a partly visible hand, two hands in view: the app doesn't crash.
- [ ] Camera blocked (deny permission): a clear message appears and the simulator still works.
- [ ] Camera busy (open it in another app first): the "in use by another app" message appears.
- [ ] Model fails to load (DevTools → Network → Offline, then Start camera): the "hand model could not load" message appears, and Start camera works again once back online.

## Deployed site
- [ ] The live GitHub Pages link loads over HTTPS.
- [ ] The camera works on the live link.
