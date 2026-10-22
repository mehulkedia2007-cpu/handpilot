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
- [ ] The **Turn**, **Height** and **Reach** sliders move the target sphere inside the faint workspace box, and the gripper follows it with the fingers level.
- [ ] Moving the target into a far corner or right next to the base turns the sphere red; the arm stretches toward it without glitching.
- [ ] The **Pinch** slider closes the gripper above about 70% and opens it again below about 60%; nothing flickers in between. Each change is logged.
- [ ] With the arm: **Fist** freezes it, **Open palm** resumes, **Peace sign** runs the pick-and-place demo (closes on the left, opens on the right) and **Thumbs up** waves for 3 s.
- [ ] The HUD description, the agent panel's ACT line and the finger channel labels talk about the arm when it is selected.
- [ ] Ticking **Drive joints with the sliders** lets each slider move its joint; **Park arm** returns to the folded pose. Unticking hands control back to the hand.
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
- [ ] Arm: moving your hand moves the target sphere smoothly; pushing your hand toward the camera moves it toward the arm's base.
- [ ] Arm: pinching thumb and index closes the gripper, opening them releases it, with no flicker at the edge.
- [ ] Arm: removing your hand for 3 s parks the arm.
- [ ] Camera blocked (deny permission): a clear message appears and the simulator still works.
- [ ] Camera busy (open it in another app first): the "in use by another app" message appears.
- [ ] Model fails to load (DevTools → Network → Offline, then Start camera): the "hand model could not load" message appears, and Start camera works again once back online.

## Deployed site
- [ ] The live GitHub Pages link loads over HTTPS.
- [ ] The camera works on the live link.
