import * as THREE from 'three';
import { materials, box, cyl, sphere, at, canvasTexture, makeTrail } from '../kit.js';

const ZF = 0.3; // magnet face height
const RB = 0.0127;
const XPOST = 0.014;

export default function maglevView({ plant, p, theme }) {
  const M = materials();
  const g = new THREE.Group();
  // base and frame
  g.add(at(box(0.2, 0.14, 0.016, M.graphite, { radius: 0.005 }), 0, 0, 0.008));
  for (const sx of [-1, 1]) g.add(at(box(0.018, 0.04, ZF + 0.07, M.alu, { radius: 0.003 }), sx * 0.085, 0.03, (ZF + 0.07) / 2 + 0.016));
  g.add(at(box(0.19, 0.04, 0.02, M.alu, { radius: 0.003 }), 0, 0.03, ZF + 0.086));
  g.add(at(box(0.05, 0.03, 0.03, M.aluDark, { radius: 0.003 }), 0, 0.02, ZF + 0.07));
  // coil with copper windings
  const wind = canvasTexture(64, 512, (c, w, h) => {
    const grd = c.createLinearGradient(0, 0, w, 0);
    grd.addColorStop(0, '#8a4b1f');
    grd.addColorStop(0.5, '#e09a5a');
    grd.addColorStop(1, '#8a4b1f');
    c.fillStyle = grd;
    c.fillRect(0, 0, w, h);
    c.fillStyle = 'rgba(60,25,5,0.55)';
    for (let y = 0; y < h; y += 6) c.fillRect(0, y, w, 1.4);
  }, { repeat: [8, 1] });
  const coilMat = new THREE.MeshStandardMaterial({ map: wind, metalness: 0.85, roughness: 0.32, emissive: 0xff5a1f, emissiveIntensity: 0 });
  const coil = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.032, 0.05, 48, 1, true), coilMat);
  coil.rotation.x = Math.PI / 2;
  coil.position.set(0, 0, ZF + 0.03);
  coil.castShadow = true;
  g.add(coil);
  g.add(at(cyl(0.035, 0.006, M.black), 0, 0, ZF + 0.058));
  g.add(at(cyl(0.035, 0.006, M.black), 0, 0, ZF + 0.004));
  g.add(at(cyl(0.012, 0.064, M.steel), 0, 0, ZF + 0.03)); // iron core
  // post
  const postTop = ZF - XPOST - 2 * RB;
  g.add(at(cyl(0.004, postTop - 0.016, M.black), 0, 0, 0.016 + (postTop - 0.016) / 2));
  g.add(at(cyl(0.007, 0.004, M.rubber), 0, 0, postTop - 0.002));
  // optical sensor (emitter + receiver) with IR beam
  const sensZ = ZF - 0.007 - RB;
  for (const sx of [-1, 1]) {
    g.add(at(box(0.012, 0.02, 0.03, M.black, { radius: 0.002 }), sx * 0.05, 0, sensZ));
    g.add(at(box(0.004, 0.01, 0.018, M.aluDark, {}), sx * 0.063, 0, sensZ));
  }
  const beamMat = new THREE.MeshBasicMaterial({ color: 0xff2d2d, transparent: true, opacity: 0.35, depthWrite: false });
  const beam = new THREE.Mesh(new THREE.BoxGeometry(0.088, 0.003, 0.018), beamMat);
  beam.position.set(0, 0, sensZ);
  g.add(beam);
  // ball
  const ball = sphere(RB, M.chrome, { seg: 48 });
  g.add(ball);
  // set-point ghost
  const ghost = new THREE.Mesh(new THREE.SphereGeometry(RB * 1.02, 32, 16), new THREE.MeshBasicMaterial({ color: 0x0b8ba8, transparent: true, opacity: 0.18, depthWrite: false, wireframe: false }));
  g.add(ghost);
  const ghostRing = new THREE.Mesh(new THREE.TorusGeometry(RB * 1.35, 0.0008, 8, 48), new THREE.MeshBasicMaterial({ color: 0x0b8ba8 }));
  g.add(ghostRing);
  // field lines between the pole and the ball
  const fieldMat = new THREE.MeshBasicMaterial({ color: theme === 'dark' ? 0x74c0fc : 0x1c7ed6, transparent: true, opacity: 0, depthWrite: false });
  const lines = [];
  for (let k = 0; k < 10; k++) {
    const tor = new THREE.Mesh(new THREE.TorusGeometry(1, 0.03, 6, 32, Math.PI), fieldMat);
    tor.userData.ang = (k / 10) * Math.PI * 2;
    tor.rotation.order = 'ZYX';
    g.add(tor);
    lines.push(tor);
  }
  const trail = makeTrail(0x0b8ba8, 10, 0);
  let phase = 0;
  return {
    group: g,
    grid: 0.05,
    scale: 0.2,
    camera: { pos: [0.24, -0.46, 0.4], target: [0, 0, 0.24] },
    shadow: { center: [0, 0, 0.2], extent: 0.3 },
    hint: 'Drag the ball up or down to disturb it',
    pickables: [{ object: ball, body: 'ball', plane: 'xz' }],
    update(f, dt) {
      const s = f.s;
      const zb = ZF - s[0] - RB;
      ball.position.set(0, 0, zb);
      const zr = ZF - f.r[0] - RB;
      ghost.position.set(0, 0, zr);
      ghostRing.position.set(0, 0, zr);
      const i = Math.max(0, s[2]);
      coilMat.emissiveIntensity = Math.min(1.6, i * i * 0.35);
      const F = (p.Km * i * i) / (2 * Math.max(s[0], 1e-4) ** 2);
      fieldMat.opacity = Math.min(0.55, (F / (p.m * p.g)) * 0.3);
      phase += (dt || 0.016) * (1 + i);
      // arcs from the pole face down to the ball's top
      const gap = Math.max(s[0], 0.0005);
      lines.forEach((l, k) => {
        const a = l.userData.ang + phase * 0.3;
        const r = 0.006 + 0.004 * ((k % 3) / 2);
        l.scale.set(gap / 2 + 0.002, r, 1);
        l.position.set(Math.cos(a) * 0.0, Math.sin(a) * 0.0, ZF - gap / 2);
        l.rotation.set(0, Math.PI / 2, a);
      });
      beamMat.opacity = 0.2 + 0.25 * Math.max(0, 1 - Math.abs(zb - sensZ) / 0.02);
      void trail;
    },
    readouts: (f) => {
      const i = Math.max(0, f.s[2]);
      return [
        ['gap', f.s[0] * 1000, 'mm', 2],
        ['current', i, 'A', 3],
        ['voltage', f.u[0], 'V', 1],
        ['force / weight', (p.Km * i * i) / (2 * Math.max(f.s[0], 1e-4) ** 2) / (p.m * p.g), '', 2],
      ];
    },
    dispose() { trail.dispose(); },
  };
}
