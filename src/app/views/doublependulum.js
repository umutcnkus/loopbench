import * as THREE from 'three';
import { materials, box, cyl, sphere, at, makeTrail, makeArrow, setQuat } from '../kit.js';

export default function doublePendulumView({ plant, p, theme }) {
  const M = materials();
  const g = new THREE.Group();
  const H0 = 0.34, T = p.track, railY = 0.06;
  const railLen = 2 * T + 0.34;
  g.add(at(box(railLen, 0.045, 0.045, M.aluBrushed, { radius: 0.006 }), 0, railY, H0 - 0.055));
  g.add(at(box(railLen, 0.006, 0.012, M.black, { cast: false }), 0, railY - 0.0225, H0 - 0.055));
  for (const sx of [-1, 1]) {
    const x = sx * (T + 0.13);
    g.add(at(box(0.045, 0.045, H0 - 0.08, M.aluDark, { radius: 0.004 }), x, railY, (H0 - 0.08) / 2));
    g.add(at(box(0.18, 0.13, 0.012, M.graphite, { radius: 0.004 }), x, railY, 0.006));
    g.add(at(box(0.03, 0.055, 0.055, M.rubber, { radius: 0.01 }), sx * (T + 0.1), railY, H0 - 0.055));
  }
  g.add(at(cyl(0.04, 0.11, M.graphite, { axis: 'y' }), T + 0.18, railY + 0.065, H0 - 0.055));
  // cart
  const cart = new THREE.Group();
  cart.add(at(box(0.24, 0.1, 0.08, M.accent, { radius: 0.014 }), 0, railY - 0.01, 0));
  cart.add(at(cyl(0.022, 0.035, M.steel, { axis: 'y' }), 0, -0.035, 0));
  g.add(cart);
  // rods (body frames at their lower joints, +z along the rod)
  const rodMat = M.alu;
  const rod1 = new THREE.Group();
  rod1.add(at(cyl(0.009, p.L1, rodMat), 0, -0.014, p.L1 / 2));
  rod1.add(at(cyl(0.018, 0.024, M.aluDark, { axis: 'y' }), 0, -0.014, 0));
  rod1.add(at(cyl(0.016, 0.03, M.blue, { axis: 'y' }), 0, -0.02, p.L1));
  g.add(rod1);
  const rod2 = new THREE.Group();
  rod2.add(at(cyl(0.008, p.L2, M.aluBrushed), 0, -0.03, p.L2 / 2));
  rod2.add(at(sphere(0.017, M.accent), 0, -0.03, p.L2));
  g.add(rod2);
  const trail = makeTrail(theme === 'dark' ? 0x3bc9db : 0x0b8ba8, 1400, 0.85);
  trail.minStep = 0.003;
  g.add(trail.object);
  const trail1 = makeTrail(theme === 'dark' ? 0xe44d8c : 0xc2255c, 700, 0.5);
  trail1.minStep = 0.003;
  g.add(trail1.object);
  const arrow = makeArrow(0xe8590c, { shaft: 0.008, head: 0.022, headLen: 0.055 });
  g.add(arrow.object);
  const refMat = new THREE.MeshBasicMaterial({ color: 0x0b8ba8, transparent: true, opacity: 0.85, depthWrite: false });
  const ref = new THREE.Mesh(new THREE.ConeGeometry(0.02, 0.04, 3), refMat);
  ref.rotation.x = -Math.PI / 2;
  g.add(ref);
  let lastT = -1;
  return {
    group: g,
    grid: 0.1,
    scale: 1.3,
    camera: { pos: [0.0, -3.3, 1.4], target: [0, 0, 0.58] },
    shadow: { center: [0, 0, 0.5], extent: 2.4 },
    pickables: [
      { object: rod2, body: 'rod2', plane: 'xz' },
      { object: rod1, body: 'rod1', plane: 'xz' },
      { object: cart, body: 'cart', plane: 'xz' },
    ],
    update(f) {
      const s = f.s;
      const pc = plant.pose(s, p, f.aux, 'cart');
      cart.position.set(...pc.p);
      const p1 = plant.pose(s, p, f.aux, 'rod1');
      rod1.position.set(...p1.p);
      setQuat(rod1, p1.q);
      const p2 = plant.pose(s, p, f.aux, 'rod2');
      rod2.position.set(...p2.p);
      setQuat(rod2, p2.q);
      if (f.t < lastT) { trail.clear(); trail1.clear(); }
      lastT = f.t;
      trail.push(p2.p[0] + p.L2 * Math.sin(s[2]), -0.03, p2.p[2] + p.L2 * Math.cos(s[2]));
      trail1.push(p2.p[0], -0.02, p2.p[2]);
      const F = f.u[0];
      arrow.set([s[0] + Math.sign(F) * 0.13, -0.08, H0], [F * 0.006, 0, 0], 0.01);
      ref.position.set(f.r[0], railY, H0 + 0.02);
    },
    readouts: (f) => [
      ['x', f.s[0], 'm', 3],
      ['θ1', wrapDeg(f.s[1]), '°', 2],
      ['θ2', wrapDeg(f.s[2]), '°', 2],
      ['F', f.u[0], 'N', 1],
    ],
    reset() { trail.clear(); trail1.clear(); },
    dispose() { trail.dispose(); trail1.dispose(); arrow.dispose(); },
  };
}
function wrapDeg(a) {
  a = (a + Math.PI) % (2 * Math.PI);
  if (a < 0) a += 2 * Math.PI;
  return ((a - Math.PI) * 180) / Math.PI;
}
