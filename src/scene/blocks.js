// The table and the three blocks for the pick-and-place challenge.
// Where each block is comes from core/stacking.js; this file only draws it,
// plus a short falling animation so a dropped block doesn't teleport.
import * as THREE from 'three';
import { BLOCK_SIZE, TABLE } from '../core/stacking.js';

const COLORS = { red: 0xef6a6a, green: 0x4cc38a, blue: 0x6fb7ff };
const GRAVITY = 9.8;   // world units per second squared; the scene is roughly metre-sized

export function buildBlocks(scene) {
  const root = new THREE.Group();

  // Table: a thin top with four legs, its top surface at TABLE.top.
  const mTable = new THREE.MeshStandardMaterial({ color: 0x3a4352, metalness: 0.2, roughness: 0.8 });
  const w = TABLE.x[1] - TABLE.x[0], d = TABLE.z[1] - TABLE.z[0], thick = 0.06;
  const top = new THREE.Mesh(new THREE.BoxGeometry(w, thick, d), mTable);
  top.position.set((TABLE.x[0] + TABLE.x[1]) / 2, TABLE.top - thick / 2, (TABLE.z[0] + TABLE.z[1]) / 2);
  root.add(top);
  const legH = TABLE.top - thick;
  for (const x of [TABLE.x[0] + 0.1, TABLE.x[1] - 0.1]) {
    for (const z of [TABLE.z[0] + 0.1, TABLE.z[1] - 0.1]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.08, legH, 0.08), mTable);
      leg.position.set(x, legH / 2, z); root.add(leg);
    }
  }

  // One cube per block. `shownY` and `vy` drive the fall animation.
  const meshes = {};
  for (const [id, color] of Object.entries(COLORS)) {
    const m = new THREE.Mesh(
      new THREE.BoxGeometry(BLOCK_SIZE, BLOCK_SIZE, BLOCK_SIZE),
      new THREE.MeshStandardMaterial({ color, metalness: 0.1, roughness: 0.55, emissive: color, emissiveIntensity: 0 }),
    );
    m.userData = { shownY: null, vy: 0 };
    root.add(m); meshes[id] = m;
  }

  scene.add(root);

  // blocks: from the stacker. held: id being carried (follows exactly). hover: id the
  // gripper would grab now, which glows. dt: seconds since the last frame.
  function show(blocks, { held = null, hover = null, dt = 0 } = {}) {
    for (const b of blocks) {
      const m = meshes[b.id], u = m.userData;
      if (u.shownY === null || b.id === held || b.y >= u.shownY) {
        // Held, first frame, or moving up (a reset): jump straight there.
        u.shownY = b.y; u.vy = 0;
      } else {
        // Falling: speed up under gravity until it reaches its resting height.
        u.vy += GRAVITY * Math.min(dt, 0.05);
        u.shownY = Math.max(b.y, u.shownY - u.vy * Math.min(dt, 0.05));
        if (u.shownY === b.y) u.vy = 0;
      }
      m.position.set(b.x, u.shownY, b.z);
      m.rotation.y = b.yaw;
      m.material.emissiveIntensity = b.id === held ? 0.35 : b.id === hover ? 0.25 : 0;
    }
  }

  function setVisible(on) { root.visible = on; }

  return { show, setVisible };
}
