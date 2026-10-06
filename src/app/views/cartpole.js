import * as THREE from 'three';
import { materials, box, cyl, sphere, at, group, makeTrail, makeArrow, canvasTexture, setQuat } from '../kit.js';

export default function cartpoleView({ plant, p, theme }) {
  const M = materials();
  const g = new THREE.Group();
  const H0 = 0.32;
  const T = p.track;
  const railY = 0.055; // rail sits behind the pole plane (y = 0)

  // --- track: extrusion, legs, stops, motor, belt, scale
  const railLen = 2 * T + 0.32;
  const rail = at(box(railLen, 0.04, 0.04, M.aluBrushed, { radius: 0.006 }), 0, railY, H0 - 0.05);
  const slot = at(box(railLen, 0.006, 0.012, M.black, { cast: false }), 0, railY - 0.02, H0 - 0.05);
  g.add(rail, slot);
  for (const sx of [-1, 1]) {
    const x = sx * (T + 0.12);
    const leg = at(box(0.04, 0.04, H0 - 0.07, M.aluDark, { radius: 0.004 }), x, railY, (H0 - 0.07) / 2);
    const foot = at(box(0.16, 0.12, 0.012, M.graphite, { radius: 0.004 }), x, railY, 0.006);
    const stop = at(box(0.03, 0.05, 0.05, M.rubber, { radius: 0.01 }), sx * (T + 0.1), railY, H0 - 0.05);
    const bumper = at(box(0.012, 0.045, 0.045, M.accentDark, { radius: 0.005 }), sx * (T + 0.08), railY, H0 - 0.05);
    g.add(leg, foot, stop, bumper);
  }
  // motor at the right end
  const motor = at(cyl(0.035, 0.1, M.graphite, { axis: 'y' }), T + 0.16, railY + 0.06, H0 - 0.05);
  const motorCap = at(cyl(0.036, 0.012, M.alu, { axis: 'y' }), T + 0.16, railY + 0.115, H0 - 0.05);
  const pulleyL = at(cyl(0.018, 0.02, M.steel, { axis: 'y' }), -(T + 0.16), railY, H0 - 0.05);
  const pulleyR = at(cyl(0.018, 0.02, M.steel, { axis: 'y' }), T + 0.16, railY, H0 - 0.05);
  g.add(motor, motorCap, pulleyL, pulleyR);
  // belt (top & bottom runs)
  const beltTop = at(box(2 * (T + 0.16), 0.012, 0.004, M.black, { cast: false }), 0, railY, H0 - 0.05 + 0.019);
  g.add(beltTop);
  // scale strip printed in metres
  const scaleTex = canvasTexture(2048, 64, (c, w, h) => {
    c.fillStyle = '#f4f6f8';
    c.fillRect(0, 0, w, h);
    const m2px = w / (2 * T);
    c.fillStyle = '#20262c';
    c.font = '600 22px "JetBrains Mono", monospace';
    c.textAlign = 'center';
    for (let i = 0; i <= Math.round(2 * T * 100); i++) {
      const x = i / m2px === 0 ? 1 : (i / 100) * m2px;
      const xm = -T + i / 100;
      const major = Math.abs(Math.round(xm * 10) - xm * 10) < 1e-6;
      const big = Math.abs(Math.round(xm * 2) - xm * 2) < 1e-6;
      const len = big ? 30 : major ? 18 : 9;
      c.fillRect(Math.min(w - 2, x) - 1, 0, 2, len);
      if (big) c.fillText(xm.toFixed(1), Math.max(24, Math.min(w - 24, x)), 56);
    }
  });
  const scale = new THREE.Mesh(new THREE.PlaneGeometry(2 * T, 0.03), new THREE.MeshStandardMaterial({ map: scaleTex, roughness: 0.6 }));
  scale.rotation.x = Math.PI / 2; // face -y (toward camera)
  scale.position.set(0, railY - 0.0205, H0 - 0.075);
  g.add(scale);

  // --- cart
  const cart = new THREE.Group();
  const body = at(box(0.2, 0.09, 0.07, M.accent, { radius: 0.012 }), 0, railY - 0.01, 0.0);
  const plate = at(box(0.16, 0.012, 0.055, M.alu, { radius: 0.004 }), 0, -0.018, 0.0);
  const bearing = at(cyl(0.02, 0.03, M.steel, { axis: 'y' }), 0, -0.03, 0);
  const shaft = at(cyl(0.007, 0.05, M.chrome, { axis: 'y' }), 0, -0.03, 0);
  cart.add(body, plate, bearing, shaft);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const w = at(cyl(0.014, 0.012, M.rubber, { axis: 'y' }), sx * 0.07, railY - 0.03, sz * 0.03 - 0.02);
    cart.add(w);
  }
  g.add(cart);

  // --- pole (body frame: origin at pivot, +z along the rod)
  const pole = new THREE.Group();
  const L = p.L;
  const rod = at(cyl(0.008, L, M.alu), 0, -0.012, L / 2);
  const hub = at(cyl(0.016, 0.02, M.aluDark, { axis: 'y' }), 0, -0.012, 0);
  const tip = at(sphere(0.016, M.accent), 0, -0.012, L);
  pole.add(rod, hub, tip);
  g.add(pole);

  // --- overlays
  const arrow = makeArrow(0xe8590c, { shaft: 0.007, head: 0.02, headLen: 0.05 });
  g.add(arrow.object);
  const trail = makeTrail(theme === 'dark' ? 0x3bc9db : 0x0b8ba8, 500, 0.85);
  g.add(trail.object);
  // set-point marker on the rail
  const refMarker = new THREE.Group();
  const refMat = new THREE.MeshBasicMaterial({ color: 0x0b8ba8, transparent: true, opacity: 0.85, depthWrite: false });
  const tri = new THREE.Mesh(new THREE.ConeGeometry(0.018, 0.035, 3), refMat);
  tri.rotation.x = Math.PI / 2; // point along -z (down onto the rail)
  tri.rotation.z = Math.PI;
  tri.position.set(0, railY, H0 + 0.02);
  const refLine = new THREE.Mesh(new THREE.BoxGeometry(0.003, 0.003, 0.5), new THREE.MeshBasicMaterial({ color: 0x0b8ba8, transparent: true, opacity: 0.18, depthWrite: false }));
  refLine.position.set(0, railY + 0.02, H0 + 0.27);
  refMarker.add(tri, refLine);
  g.add(refMarker);

  let lastT = -1;
  return {
    group: g,
    grid: 0.1,
    scale: 1,
    camera: { pos: [0.0, -2.35, 1.0], target: [0, 0, 0.42] },
    shadow: { center: [0, 0, 0.3], extent: 2.0 },
    pickables: [
      { object: pole, body: 'pole', plane: 'xz' },
      { object: cart, body: 'cart', plane: 'xz' },
    ],
    update(f) {
      const s = f.s;
      const pc = plant.pose(s, p, f.aux, 'cart');
      cart.position.set(pc.p[0], pc.p[1], pc.p[2]);
      const pp = plant.pose(s, p, f.aux, 'pole');
      pole.position.set(pp.p[0], pp.p[1], pp.p[2]);
      setQuat(pole, pp.q);
      const th = s[1];
      const tipP = [s[0] + L * Math.sin(th), -0.012, H0 + L * Math.cos(th)];
      if (f.t < lastT) trail.clear();
      lastT = f.t;
      trail.push(tipP[0], tipP[1], tipP[2]);
      const F = f.u[0];
      arrow.set([s[0] + Math.sign(F) * 0.1, -0.07, H0], [F * 0.012, 0, 0], 0.01);
      refMarker.position.x = f.r[0];
    },
    focus: (f) => [f.s[0] * 0.5, 0, 0.35],
    readouts: (f) => [
      ['x', f.s[0], 'm', 3],
      ['θ', wrapDeg(f.s[1]), '°', 1],
      ['F', f.u[0], 'N', 1],
    ],
    dispose() { trail.dispose(); arrow.dispose(); },
  };
}

function wrapDeg(a) {
  a = (a + Math.PI) % (2 * Math.PI);
  if (a < 0) a += 2 * Math.PI;
  return ((a - Math.PI) * 180) / Math.PI;
}
