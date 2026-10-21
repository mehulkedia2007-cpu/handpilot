// A desktop robot arm: base (yaw) -> shoulder (pitch) -> upper arm -> elbow (pitch)
// -> forearm -> wrist (pitch) -> two-finger gripper.
// Like the humanoid, each joint is a nested Group, so turning the base carries
// everything above it, and bending the shoulder carries the elbow, wrist and gripper.
// Every link points along its Group's local +z, which makes yaw = 0 face the viewer.
import * as THREE from 'three';
import { ARM } from '../core/armSpec.js';

export function buildArm(scene) {
  const mBody = new THREE.MeshStandardMaterial({ color: 0x8f7cf6, metalness: 0.3, roughness: 0.5 });
  const mDark = new THREE.MeshStandardMaterial({ color: 0x2a3040, metalness: 0.5, roughness: 0.5 });
  const mGlow = new THREE.MeshStandardMaterial({ color: 0xf2c230, emissive: 0xf2c230, emissiveIntensity: 0.9 });
  const box = (w, h, d, m) => new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
  const cyl = (r1, r2, h, m) => new THREE.Mesh(new THREE.CylinderGeometry(r1, r2, h, 24), m);
  // A joint hub is a short cylinder lying along x, the axis the pitch joints turn around.
  const hub = (r, w) => { const c = cyl(r, r, w, mDark); c.rotation.z = Math.PI / 2; return c; };
  const { shoulderHeight, L1, L2 } = ARM;

  const root = new THREE.Group();
  const plate = cyl(0.75, 0.85, 0.16, mDark); plate.position.y = 0.08; root.add(plate);

  const base = new THREE.Group(); root.add(base);
  const column = cyl(0.36, 0.44, shoulderHeight - 0.16, mBody);
  column.position.y = 0.16 + (shoulderHeight - 0.16) / 2; base.add(column);
  const band = cyl(0.45, 0.45, 0.06, mGlow); band.position.y = 0.3; base.add(band);

  const shoulder = new THREE.Group(); shoulder.position.y = shoulderHeight; base.add(shoulder);
  shoulder.add(hub(0.26, 0.62));
  const upper = box(0.26, 0.26, L1, mBody); upper.position.z = L1 / 2; shoulder.add(upper);

  const elbow = new THREE.Group(); elbow.position.z = L1; shoulder.add(elbow);
  elbow.add(hub(0.2, 0.5));
  const fore = box(0.2, 0.2, L2, mBody); fore.position.z = L2 / 2; elbow.add(fore);

  const wrist = new THREE.Group(); wrist.position.z = L2; elbow.add(wrist);
  wrist.add(hub(0.14, 0.38));
  const palm = box(0.56, 0.14, 0.22, mDark); palm.position.z = 0.18; wrist.add(palm);
  const fingers = [-1, 1].map((side) => {
    const f = box(0.07, 0.12, 0.4, mGlow); f.position.z = 0.48; f.userData.side = side;
    wrist.add(f); return f;
  });

  scene.add(root);

  // Copy arm angles (see core/armSpec.js for what each one means) onto the model.
  // Rotating +z by a positive angle around x tips it down, so "up" angles are negated.
  function apply(p) {
    base.rotation.y = p.yaw;
    shoulder.rotation.x = -p.shoulder;
    elbow.rotation.x = p.elbow;      // positive folds the forearm down, away from the upper arm's line
    wrist.rotation.x = -p.wrist;
    const gap = 0.24 - p.grip * 0.19; // fingers slide toward each other as grip goes 0 -> 1
    for (const f of fingers) f.position.x = f.userData.side * gap;
  }

  function setVisible(on) { root.visible = on; }

  return { apply, setVisible };
}
