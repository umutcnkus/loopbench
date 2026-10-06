import * as THREE from 'three';
import { materials, box, cyl, sphere, torus, at, makeTrail, setQuat, makeArrow } from '../kit.js';

function wheel(p, M) {
  const w = new THREE.Group();
  const tire = torus(p.r - 0.009, 0.009, M.rubber, { rs: 16, ts: 40 });
  tire.rotation.x = Math.PI / 2; // torus lies in xz-plane -> axis along y
  w.add(tire);
  const rim = cyl(p.r - 0.012, 0.018, M.alu, { axis: 'y', seg: 32 });
  w.add(rim);
  const hubMat = M.aluDark;
  for (let k = 0; k < 5; k++) {
    const spoke = box(p.r * 1.3, 0.02, 0.008, hubMat, {});
    spoke.rotation.y = (k * Math.PI) / 5;
    w.add(spoke);
  }
  w.add(cyl(0.012, 0.024, M.accent, { axis: 'y' }));
  return w;
}

export default function segwayView({ plant, p, theme }) {
  const M = materials();
  const g = new THREE.Group();
  // chassis (pitch + yaw), origin at the axle
  const body = new THREE.Group();
  g.add(body);
  const H = Math.max(0.2, 2.2 * p.l + 0.02);
  const plateMat = M.alu;
  for (const sy of [-1, 1]) body.add(at(box(0.075, 0.008, H, plateMat, { radius: 0.003 }), 0, sy * 0.07, H / 2 - 0.01));
  body.add(at(box(0.075, 0.148, 0.008, plateMat, {}), 0, 0, H - 0.01));
  body.add(at(box(0.075, 0.148, 0.008, plateMat, {}), 0, 0, 0.035));
  body.add(at(box(0.05, 0.12, 0.05, M.accent, { radius: 0.006 }), 0, 0, H * 0.45));
  body.add(at(box(0.004, 0.12, 0.08, M.pcb, {}), -0.03, 0, H * 0.72));
  body.add(at(box(0.012, 0.03, 0.012, M.black, {}), -0.034, 0.03, H * 0.72));
  // head with eyes
  const head = at(box(0.07, 0.13, 0.05, M.white, { radius: 0.012 }), 0.002, 0, H + 0.02);
  body.add(head);
  const eyeMat = new THREE.MeshStandardMaterial({ color: 0x0b0e11, emissive: 0x3bc9db, emissiveIntensity: 1.5 });
  for (const sy of [-1, 1]) body.add(at(sphere(0.008, eyeMat), 0.036, sy * 0.028, H + 0.024));
  // motors on the axle
  for (const sy of [-1, 1]) body.add(at(cyl(0.017, 0.05, M.graphite, { axis: 'y' }), 0, sy * 0.045, 0));
  // wheels: yaw-only frame
  const base = new THREE.Group();
  g.add(base);
  const wL = wheel(p, M), wR = wheel(p, M);
  wL.position.set(0, p.d, 0);
  wR.position.set(0, -p.d, 0);
  base.add(wL, wR);
  base.add(cyl(0.004, 2 * p.d, M.steel, { axis: 'y' }));
  // tracks
  const tcol = theme === 'dark' ? 0x5b6875 : 0x98a4b0;
  const tL = makeTrail(tcol, 1500, 0.9), tR = makeTrail(tcol, 1500, 0.9);
  tL.minStep = tR.minStep = 0.006;
  g.add(tL.object, tR.object);
  const cmd = makeArrow(0x0b8ba8, { shaft: 0.006, head: 0.02, headLen: 0.05 });
  g.add(cmd.object);
  let lastT = -1;
  return {
    group: g,
    grid: 0.25,
    scale: 1.2,
    followDefault: true,
    camera: { pos: [0.62, -0.86, 0.52], target: [0, 0, 0.17] },
    shadow: { extent: 1.4 },
    hint: 'Drag the robot to push it · pick "Keyboard drive" in Scenario to steer',
    pickables: [{ object: body, body: 'body' }],
    focus: (f) => [f.s[0], f.s[1], 0.15],
    update(f) {
      const s = f.s;
      const pb = plant.pose(s, p, f.aux, 'body');
      body.position.set(pb.p[0], pb.p[1], pb.p[2]);
      setQuat(body, pb.q);
      base.position.set(pb.p[0], pb.p[1], pb.p[2]);
      base.rotation.set(0, 0, s[2]);
      wL.rotation.y = s[7];
      wR.rotation.y = s[8];
      if (f.t < lastT) { tL.clear(); tR.clear(); }
      lastT = f.t;
      const c = Math.cos(s[2]), sn = Math.sin(s[2]);
      tL.push(s[0] - sn * p.d, s[1] + c * p.d, 0.001);
      tR.push(s[0] + sn * p.d, s[1] - c * p.d, 0.001);
      // commanded velocity arrow on the floor
      const v = f.r[0];
      cmd.set([s[0] + c * 0.12 * Math.sign(v || 1), s[1] + sn * 0.12 * Math.sign(v || 1), 0.004], [c * v * 0.4, sn * v * 0.4, 0], 0.01);
    },
    readouts: (f) => [
      ['pitch', (f.s[3] * 180) / Math.PI, '°', 1],
      ['speed', f.s[4], 'm/s', 2],
      ['turn rate', f.s[5], 'rad/s', 2],
      ['V left', f.u[0], 'V', 1],
      ['V right', f.u[1], 'V', 1],
    ],
    reset() { tL.clear(); tR.clear(); },
    dispose() { tL.dispose(); tR.dispose(); cmd.dispose(); },
  };
}
