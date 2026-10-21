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

## Camera (Chrome, Edge, Safari)
- [ ] **Start camera** asks for permission, then shows the preview with the hand skeleton.
- [ ] The finger channels follow your real fingers.
- [ ] Every gesture above works with a real hand.
- [ ] **Set open hand** and **Set fist** calibrate, and the calibration still works after a reload.
- [ ] Removing your hand for 3 s switches to IDLE; showing it again switches back to MANUAL.
- [ ] **Stop camera** gives control back to the simulator.
- [ ] Bad light, a partly visible hand, two hands in view: the app doesn't crash.
- [ ] Camera blocked (deny permission): a clear message appears and the simulator still works.

## Deployed site
- [ ] The live GitHub Pages link loads over HTTPS.
- [ ] The camera works on the live link.
