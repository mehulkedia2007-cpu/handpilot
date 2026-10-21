// The humanoid robot from the prototype, built from boxes, cylinders and spheres.
// Joints are nested Groups: rotating a shoulder Group carries the elbow and hand with it.
import * as THREE from 'three';

export function buildHumanoid(scene) {
  const mBody = new THREE.MeshStandardMaterial({ color: 0x8f7cf6, metalness: 0.3, roughness: 0.5 });
  const mDark = new THREE.MeshStandardMaterial({ color: 0x2a3040, metalness: 0.5, roughness: 0.5 });
  const mGlow = new THREE.MeshStandardMaterial({ color: 0xf2c230, emissive: 0xf2c230, emissiveIntensity: 0.9 });
  const box = (w, h, d, m) => new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
  const cyl = (r1, r2, h, m) => new THREE.Mesh(new THREE.CylinderGeometry(r1, r2, h, 20), m);
  const sph = (r, m) => new THREE.Mesh(new THREE.SphereGeometry(r, 20, 16), m);
  const root = new THREE.Group(), body = new THREE.Group();
  root.add(body);

  for (const x of [-0.32, 0.32]) {
    const leg = cyl(0.16, 0.13, 0.95, mDark); leg.position.set(x, 0.62, 0); root.add(leg);
    const foot = box(0.42, 0.16, 0.65, mBody); foot.position.set(x, 0.08, 0.1); root.add(foot);
  }
  const pelvis = box(1.0, 0.32, 0.55, mDark); pelvis.position.set(0, 1.2, 0); root.add(pelvis);

  const torso = box(1.3, 1.25, 0.7, mBody); torso.position.set(0, 1.95, 0); body.add(torso);
  const core = box(0.5, 0.34, 0.05, mGlow); core.position.set(0, 1.95, 0.37); body.add(core);
  const neck = cyl(0.12, 0.12, 0.2, mDark); neck.position.set(0, 2.68, 0); body.add(neck);

  const head = new THREE.Group(); head.position.set(0, 2.8, 0); body.add(head);
  const skull = box(0.85, 0.62, 0.7, mBody); skull.position.y = 0.31; head.add(skull);
  const visor = box(0.7, 0.26, 0.08, mDark); visor.position.set(0, 0.33, 0.36); head.add(visor);
  for (const x of [-0.17, 0.17]) { const e = box(0.14, 0.1, 0.04, mGlow); e.position.set(x, 0.33, 0.41); head.add(e); }
  const ant = cyl(0.02, 0.02, 0.3, mDark); ant.position.set(0.25, 0.77, 0); head.add(ant);
  const tip = sph(0.06, mGlow); tip.position.set(0.25, 0.95, 0); head.add(tip);

  function arm(x) {
    const sh = new THREE.Group(); sh.position.set(x, 2.45, 0); body.add(sh);
    sh.add(sph(0.22, mDark));
    const up = cyl(0.13, 0.12, 0.8, mBody); up.position.y = -0.4; sh.add(up);
    const el = new THREE.Group(); el.position.y = -0.8; sh.add(el);
    el.add(sph(0.15, mDark));
    const fo = cyl(0.12, 0.1, 0.7, mBody); fo.position.y = -0.35; el.add(fo);
    const hand = box(0.26, 0.3, 0.2, mDark); hand.position.y = -0.82; el.add(hand);
    return { sh, el };
  }
  const R = arm(0.92), L = arm(-0.92);   // R is the arm on the right side of the screen
  scene.add(root);

  // Copy a pose (joint angles in radians) onto the model.
  function apply(p) {
    R.sh.rotation.z = p.rS;        // right arm is at +x: positive swings it outward and up
    L.sh.rotation.z = -p.lS;       // left arm is at -x: mirrored sign
    R.el.rotation.x = -p.rE;       // negative folds the forearm toward the viewer
    L.el.rotation.x = -p.lE;
    head.rotation.x = p.head;
    root.rotation.y = p.yaw;
    root.position.y = p.bob;
  }

  function setVisible(on) { root.visible = on; }

  return { apply, setVisible };
}
