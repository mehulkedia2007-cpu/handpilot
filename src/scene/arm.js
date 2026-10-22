// A desktop robot arm: base (yaw) -> shoulder (pitch) -> upper arm -> elbow (pitch)
// -> forearm -> wrist (pitch) -> two-finger gripper.
// Like the humanoid, each joint is a nested Group, so turning the base carries
// everything above it, and bending the shoulder carries the elbow, wrist and gripper.
// Every link points along its Group's local +z, which makes yaw = 0 face the viewer.
import * as THREE from 'three';
import { ARM } from '../core/armSpec.js';
import { WORKSPACE } from '../core/workspace.js';

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

  // The workspace box, drawn faintly, and a small sphere at the target the hand is pointing at.
  // They hang off root (not base), so they stay put while the arm turns.
  const ws = WORKSPACE, size = (r) => r[1] - r[0], mid = (r) => (r[0] + r[1]) / 2;
  const box3 = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.BoxGeometry(size(ws.x), size(ws.y), size(ws.z))),
    new THREE.LineBasicMaterial({ color: 0x8996a8, transparent: true, opacity: 0.25 }),
  );
  box3.position.set(mid(ws.x), mid(ws.y), mid(ws.z)); root.add(box3);
  const mTarget = new THREE.MeshBasicMaterial({ color: 0x4cc38a, transparent: true, opacity: 0.85 });
  const target = new THREE.Mesh(new THREE.SphereGeometry(0.08, 16, 12), mTarget);
  target.visible = false; root.add(target);

  scene.add(root);

  // Copy arm angles (see core/armSpec.js for what each one means) onto the model.
  // Rotating +z by a positive angle around x tips it down, so "up" angles are negated.
  // holdWidth: width of a block between the fingers, or 0. The fingers stop at its
  // sides instead of closing through it.
  function apply(p, holdWidth = 0) {
    base.rotation.y = p.yaw;
    shoulder.rotation.x = -p.shoulder;
    elbow.rotation.x = p.elbow;      // positive folds the forearm down, away from the upper arm's line
    wrist.rotation.x = -p.wrist;
    // Fingers slide toward each other as grip goes 0 -> 1. 0.035 is half a finger's thickness.
    const gap = Math.max(0.24 - p.grip * 0.19, holdWidth ? holdWidth / 2 + 0.035 : 0);
    for (const f of fingers) f.position.x = f.userData.side * gap;
  }

  function setVisible(on) { root.visible = on; }

  // pos is {x,y,z} or null to hide it. Green when the arm can reach it, red when not.
  function showTarget(pos, reachable = true) {
    target.visible = !!pos;
    if (!pos) return;
    target.position.set(pos.x, pos.y, pos.z);
    mTarget.color.setHex(reachable ? 0x4cc38a : 0xef6a6a);
  }

  return { apply, setVisible, showTarget };
}
