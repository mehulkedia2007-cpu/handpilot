// The 3D stage: renderer, camera, lights, floor and a simple drag-to-orbit camera.
import * as THREE from 'three';
import { clamp } from '../core/hand.js';

// The prototype used Three.js r128. Since r152/r155 Three.js manages colour spaces
// and uses physically based light units. To keep the prototype's exact look we turn
// colour management off, output linear colour (like r128 did) and multiply light
// intensities by PI, which is the conversion the Three.js migration guide gives.
THREE.ColorManagement.enabled = false;
const LEGACY = Math.PI;

export function createStage(stageEl) {
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setClearColor(0x0c1015, 1);
  stageEl.insertBefore(renderer.domElement, stageEl.firstChild);

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0x0c1015, 14, 26);
  const camera = new THREE.PerspectiveCamera(40, 16 / 11, 0.1, 100);
  const target = new THREE.Vector3(0, 1.9, 0);

  scene.add(new THREE.AmbientLight(0x8a93aa, 0.75 * LEGACY));
  const key = new THREE.DirectionalLight(0xffffff, 0.95 * LEGACY);
  key.position.set(3, 6, 5); scene.add(key);
  // r128 point lights faded with decay 1; the new default is 2, so set it back.
  const rim = new THREE.PointLight(0x8f7cf6, 1.1 * LEGACY, 20, 1);
  rim.position.set(-4, 4, -4); scene.add(rim);

  scene.add(new THREE.GridHelper(16, 32, 0x2a3340, 0x1b222c));
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(1.45, 1.52, 64),
    new THREE.MeshBasicMaterial({ color: 0xf2c230, side: THREE.DoubleSide, transparent: true, opacity: 0.8 }),
  );
  ring.rotation.x = -Math.PI / 2; ring.position.y = 0.01; scene.add(ring);
  const blob = new THREE.Mesh(
    new THREE.CircleGeometry(1.2, 40),
    new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.35 }),
  );
  blob.rotation.x = -Math.PI / 2; blob.position.y = 0.005; scene.add(blob);

  const orbit = attachOrbit(renderer.domElement);

  const resize = () => {
    const w = stageEl.clientWidth, h = stageEl.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
  };
  if (window.ResizeObserver) new ResizeObserver(resize).observe(stageEl);
  else window.addEventListener('resize', resize);
  resize();

  function render() {
    // Spherical coordinates: theta spins around the robot, phi tilts up and down.
    const { theta, phi, radius } = orbit;
    camera.position.set(
      target.x + radius * Math.sin(phi) * Math.sin(theta),
      target.y + radius * Math.cos(phi),
      target.z + radius * Math.sin(phi) * Math.cos(theta),
    );
    camera.lookAt(target);
    renderer.render(scene, camera);
  }

  // Jump the orbit camera to a new angle (theta spins around, phi tilts). Used when the
  // robot changes: the arm reaches toward the viewer, so a side-on view shows it best.
  function setView(theta, phi = orbit.phi) { orbit.theta = theta; orbit.phi = phi; }

  return { scene, render, setView };
}

// Drag to orbit, scroll to zoom. Returns a live object the render loop reads.
// Arrow keys and +/- also work when the canvas has focus, so it is usable by keyboard.
function attachOrbit(dom) {
  const o = { theta: 0.45, phi: 1.28, radius: 9 };
  let drag = null;
  dom.tabIndex = 0;
  dom.setAttribute('aria-label', '3D view. Drag or use arrow keys to orbit, scroll or plus and minus to zoom.');
  dom.addEventListener('pointerdown', (e) => {
    drag = { x: e.clientX, y: e.clientY };
    try { dom.setPointerCapture(e.pointerId); } catch (_) { /* older browsers */ }
    dom.style.cursor = 'grabbing';
  });
  dom.addEventListener('pointermove', (e) => {
    if (!drag) return;
    o.theta -= (e.clientX - drag.x) * 0.008;
    o.phi = clamp(o.phi - (e.clientY - drag.y) * 0.006, 0.6, 1.7);
    drag = { x: e.clientX, y: e.clientY };
  });
  const end = () => { drag = null; dom.style.cursor = 'grab'; };
  dom.addEventListener('pointerup', end);
  dom.addEventListener('pointercancel', end);
  dom.addEventListener('wheel', (e) => { e.preventDefault(); o.radius = clamp(o.radius + e.deltaY * 0.01, 5, 14); }, { passive: false });
  dom.addEventListener('keydown', (e) => {
    const k = e.key;
    if (k === 'ArrowLeft') o.theta += 0.1;
    else if (k === 'ArrowRight') o.theta -= 0.1;
    else if (k === 'ArrowUp') o.phi = clamp(o.phi - 0.08, 0.6, 1.7);
    else if (k === 'ArrowDown') o.phi = clamp(o.phi + 0.08, 0.6, 1.7);
    else if (k === '+' || k === '=') o.radius = clamp(o.radius - 0.5, 5, 14);
    else if (k === '-') o.radius = clamp(o.radius + 0.5, 5, 14);
    else return;
    e.preventDefault();
  });
  return o;
}
