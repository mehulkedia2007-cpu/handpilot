# Demo media

The README has slots for two recordings. They are recorded by hand; nothing here is generated.

## `demo.gif` (10–15 s)
1. `npm run dev`, select **Arm**, and start the camera (or use the simulator sliders).
2. Press **Start** on the Stacking challenge and stack all three blocks, ending on the "Stacked in …" timer.
3. Record just the 3D stage plus the camera preview, at about 800 px wide and 12–15 fps, so the GIF stays under about 5 MB. On macOS: record with Cmd+Shift+5, then convert, e.g. with `ffmpeg -i demo.mov -vf "fps=12,scale=800:-1:flags=lanczos" -loop 0 demo.gif`, or a GIF tool such as Gifski.
4. Save it as `docs/media/demo.gif` and swap the placeholder line at the top of the README for the commented image line above it.

## 30-second video
Show the hand-tracking overlay, the humanoid mirroring fingers, the arm following your hand, a full stacking run, and a peace-sign AUTO demo. Upload it (for example as an unlisted YouTube video) and put the link in the README's video slot.
