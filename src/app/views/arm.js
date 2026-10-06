import * as THREE from 'three';
import { materials, box, cyl, sphere, at, makeTrail, makeTarget, setQuat } from '../kit.js';

const HB = 0.95;

export default function armView({ plant, p, theme }) {
  const M = materials();
  const g = new THREE.Group();
  const paint = new THREE.MeshPhysicalMaterial({ color: 0xe9ecef, roughness: 0.38, metalness: 0.05, clearcoat: 0.6, clearcoatRoughness: 0.25 });
  // pedestal
  g.add(at(box(0.36, 0.36, 0.04, M.graphite, { radius: 0.01 }), 0, 0.06, 0.02));
  g.add(at(cyl(0.07, HB - 0.12, M.graphite), 0, 0.06, 0.04 + (HB - 0.12) / 2));
  g.add(at(box(0.16, 0.16, 0.1, M.graphite, { radius: 0.02 }), 0, 0.06, HB - 0.06));
  // shoulder housing (fixed) and motor cap
  g.add(at(cyl(0.075, 0.07, M.accent, { axis: 'y' }), 0, 0.075, HB));
  g.add(at(cyl(0.05, 0.02, M.alu, { axis: 'y' }), 0, 0.12, HB));
  // workspace boundary arc
  const reach = p.L1 + p.L2;
  const arcGeo = new THREE.RingGeometry(reach - 0.002, reach + 0.002, 128);
  const arc = new THREE.Mesh(arcGeo, new THREE.MeshBasicMaterial({ color: theme === 'dark' ? 0x5b6875 : 0x9aa6b2, transparent: true, opacity: 0.45, side: THREE.DoubleSide, depthWrite: false }));
  arc.rotation.x = Math.PI / 2; // ring in xz-plane
  arc.position.set(0, -0.001, HB);
  g.add(arc);
  // link 1
  const link1 = new THREE.Group();
  link1.add(at(box(p.L1, 0.07, 0.085, paint, { radius: 0.03 }), p.L1 / 2, 0, 0));
  link1.add(at(cyl(0.045, 0.09, M.aluDark, { axis: 'y' }), 0, 0, 0));
  link1.add(at(cyl(0.06, 0.08, M.accent, { axis: 'y' }), p.L1, -0.075, 0));
  link1.add(at(cyl(0.04, 0.02, M.alu, { axis: 'y' }), p.L1, -0.12, 0));
  link1.add(at(box(p.L1 * 0.5, 0.004, 0.03, M.accent, {}), p.L1 * 0.45, -0.0365, 0));
  g.add(link1);
  // link 2 with tool
  const link2 = new THREE.Group();
  link2.add(at(box(p.L2, 0.055, 0.065, paint, { radius: 0.024 }), p.L2 / 2, -0.07, 0));
  link2.add(at(cyl(0.035, 0.07, M.aluDark, { axis: 'y' }), 0, -0.07, 0));
  const tool = new THREE.Group();
  tool.position.set(p.L2, -0.07, 0);
  tool.add(at(cyl(0.03, 0.035, M.graphite, { axis: 'x' }), 0.0, 0, 0));
  for (const s of [-1, 1]) tool.add(at(box(0.05, 0.012, 0.012, M.alu, {}), 0.035, 0, s * 0.028));
  // payload block (size grows with mass)
  const side = 0.03 + 0.035 * Math.cbrt(Math.max(0, p.mp));
  const payload = at(box(side, side, side, M.blue, { radius: 0.004 }), 0.035 + side / 2 - 0.01, 0, 0);
  payload.visible = p.mp > 0.001;
  tool.add(payload);
  link2.add(tool);
  g.add(link2);
  // target + trail
  const tgt = new THREE.Group();
  const tmat = new THREE.MeshBasicMaterial({ color: 0x0b8ba8, transparent: true, opacity: 0.35, depthWrite: false });
  tgt.add(new THREE.Mesh(new THREE.SphereGeometry(0.03, 24, 16), tmat));
  const ring = makeTarget(0x0b8ba8, 0.045);
  ring.object.rotation.x = Math.PI / 2;
  tgt.add(ring.object);
  g.add(tgt);
  const trail = makeTrail(theme === 'dark' ? 0x3bc9db : 0x0b8ba8, 800, 0.9);
  trail.minStep = 0.003;
  g.add(trail.object);
  let lastT = -1;
  return {
    group: g,
    grid: 0.25,
    scale: 1,
    camera: { pos: [0.5, -2.35, 1.3], target: [0.12, 0, 0.82] },
    shadow: { center: [0, 0, 0.6], extent: 1.3 },
    hint: 'Drag the blue sphere to move the target · drag the arm to push it',
    pickables: [
      { object: tgt, kind: 'target', plane: 'xz' },
      { object: link2, body: 'link2', plane: 'xz' },
      { object: link1, body: 'link1', plane: 'xz' },
    ],
    targetToRef(t) {
      let x = t[0], z = t[2] - HB;
      const r = Math.hypot(x, z), R = reach * 0.98;
      if (r > R) { x *= R / r; z *= R / r; }
      return { mode: 'point', params: { x: +x.toFixed(3), z: +z.toFixed(3) } };
    },
    update(f) {
      const s = f.s;
      const p1 = plant.pose(s, p, f.aux, 'link1');
      link1.position.set(p1.p[0], p1.p[1], p1.p[2]);
      setQuat(link1, p1.q);
      const p2 = plant.pose(s, p, f.aux, 'link2');
      link2.position.set(p2.p[0], p2.p[1], p2.p[2]);
      setQuat(link2, p2.q);
      tgt.position.set(f.r[0], -0.145, HB + f.r[1]);
      const tx = p.L1 * Math.cos(s[0]) + p.L2 * Math.cos(s[0] + s[1]);
      const tz = HB + p.L1 * Math.sin(s[0]) + p.L2 * Math.sin(s[0] + s[1]);
      if (f.t < lastT) trail.clear();
      lastT = f.t;
      trail.push(tx, -0.145, tz);
    },
    readouts: (f) => {
      const s = f.s;
      const tx = p.L1 * Math.cos(s[0]) + p.L2 * Math.cos(s[0] + s[1]);
      const tz = p.L1 * Math.sin(s[0]) + p.L2 * Math.sin(s[0] + s[1]);
      return [
        ['q1', (s[0] * 180) / Math.PI, '°', 1],
        ['q2', (s[1] * 180) / Math.PI, '°', 1],
        ['error', 1000 * Math.hypot(tx - f.r[0], tz - f.r[1]), 'mm', 1],
        ['τ1', f.u[0], 'N·m', 1],
        ['τ2', f.u[1], 'N·m', 1],
      ];
    },
    reset() { trail.clear(); },
    dispose() { trail.dispose(); },
  };
}
