# Manual test checklist

Run `npm test` first; it must pass. Then go through this list in Chrome at the end of each phase. Tick an item only when you have actually tried it.

## Simulator only (no camera)
- [x] The page loads with no errors in the console (DevTools → Console).
- [x] The robot renders; dragging orbits the view and the scroll wheel zooms.
- [x] With the 3D view focused (Tab to it), the arrow keys orbit and +/- zoom.
- [ ] Moving each finger slider moves the matching joint (see the "drives …" labels).
- [x] The Turn slider turns the robot.
- [x] Holding **Fist** for about 1 s switches to HOLD and the robot freezes.
- [x] Holding **Open palm** returns to MANUAL.
- [x] Holding **Peace sign** switches to AUTO (dance). Choosing Relax and then Peace sign again returns to MANUAL.
- [x] Holding **Thumbs up** switches to GREET; after about 3 s it returns to MANUAL by itself.
- [x] **Point** does nothing (it isn't a command).
- [ ] The hold ring fills up while a command is being held.
- [x] The agent log shows a SEE / DECIDE / ACT line for each change.
- [ ] Every button and slider can be reached and used with Tab, Enter and the arrow keys.
- [x] The top-right HUD shows **Render NN fps**, updating about once a second.
- [ ] Moving **Min cutoff** down and **Beta** up changes how fast the robot follows a preset change.
- [x] Change the filter sliders, reload: the values are kept. **Reset to defaults** puts them back to 1.0 / 1.0, and they stay after a reload.
- [ ] In a private window the app still works (settings may or may not persist, but nothing breaks).

## Robot arm (Phase 2)
- [x] The **Humanoid / Arm** switch in the header swaps the robot; the pressed button is highlighted.
- [x] With **Arm** selected, the **Arm joints** panel appears; with Humanoid it is hidden.
- [x] The **Turn**, **Height** and **Reach** sliders move the target sphere inside the faint workspace box, and the gripper follows it with the fingers level.
- [x] Moving the target into a far corner or right next to the base turns the sphere red; the arm stretches toward it without glitching.
- [x] The **Pinch** slider closes the gripper above about 70% and opens it again below about 60%; nothing flickers in between. Each change is logged.
- [x] With the arm: **Fist** freezes it, **Open palm** resumes, **Peace sign** runs the pick-and-place demo (closes on the left, opens on the right) and **Thumbs up** waves for 3 s.
- [x] The HUD description, the agent panel's ACT line and the finger channel labels talk about the arm when it is selected.
- [x] Ticking **Drive joints with the sliders** lets each slider move its joint; **Park arm** returns to the folded pose. Unticking hands control back to the hand.
- [x] Select Arm and reload: the arm is still selected. **Reset to defaults** goes back to Humanoid.

## Pick-and-place challenge (Phase 3)
- [ ] With **Arm** selected, a table with red, green and blue blocks appears, plus the **Stacking challenge** panel. With Humanoid, both are hidden.
- [ ] Moving the gripper (Turn / Height / Reach) close to the top of a block makes it glow.
- [ ] Raising **Pinch** above about 70% while a block glows grabs it; it moves and turns with the gripper. The fingers stop at its sides.
- [ ] Closing the gripper away from every block grabs nothing; sweeping a closed gripper over a block doesn't pick it up.
- [ ] Pushing a held block down into the table or another block doesn't sink it in.
- [ ] Opening the pinch over the table drops the block; it falls and lands flat and square.
- [ ] Dropping a block mostly over another lands it on top and lines it up exactly; dropping it about half over lands on top but leaves it offset.
- [ ] A block with another block on top can't be grabbed.
- [ ] **Peace sign** (AUTO) on fresh blocks picks up red and stacks it on blue.
- [ ] **Start** resets the blocks and starts the timer (also shown on the stage). Stacking all three into one tower stops it, shows the time, and saves it as best if faster.
- [ ] Reload: the best time is still shown. **Reset to defaults** doesn't clear it.
- [ ] **Restart** during a run starts a fresh run; **Reset blocks** puts the blocks back and stops the timer.
- [ ] Switching to Humanoid while holding a block drops it; switching during a run cancels the run.

## Camera (Chrome, Edge, Safari)
- [x] **Start camera** asks for permission, then shows the preview with the hand skeleton. The note says whether the model runs on the GPU or CPU.
- [ ] The stage shows a **Left hand** / **Right hand** chip that matches the hand you actually raised.
- [ ] Under the gesture name, **MediaPipe: …** shows the built-in label and its confidence (e.g. `Victory 92%`).
- [x] The HUD also shows **Tracking NN fps · N ms**.
- [x] Holding your hand still, the robot doesn't shake; moving fast, it doesn't trail far behind.
- [ ] The finger channels follow your real fingers.
- [x] Every gesture above works with a real hand.
- [ ] **Set open hand** and **Set fist** calibrate, and the calibration still works after a reload.
- [x] Removing your hand for 3 s switches to IDLE; showing it again switches back to MANUAL.
- [x] **Stop camera** gives control back to the simulator.
- [ ] Bad light, a partly visible hand, two hands in view: the app doesn't crash.
- [x] Arm: moving your hand moves the target sphere smoothly; pushing your hand toward the camera moves it toward the arm's base.
- [x] Arm: pinching thumb and index closes the gripper, opening them releases it, with no flicker at the edge.
- [x] Arm: removing your hand for 3 s parks the arm.
- [ ] Challenge: a full tower can be built with a real hand (pinch to grab, open to drop).
- [ ] Humanoid: moving your hand left and right without leaving the picture turns the robot fully each way, and quick finger movements are followed without a noticeable delay.
- [ ] Arm: at the default **Hand sensitivity** (1.6), moving your hand left and right without leaving the picture swings the arm to both ends of the table. Raising it makes the arm move further for the same hand movement; the setting survives a reload.
- [ ] Camera blocked (deny permission): a clear message appears and the simulator still works.
- [ ] Camera busy (open it in another app first): the "in use by another app" message appears.
- [ ] Model fails to load (DevTools → Network → Offline, then Start camera): the "hand model could not load" message appears, and Start camera works again once back online.

## Deployed site
- [ ] The live GitHub Pages link loads over HTTPS.
- [ ] The camera works on the live link.
