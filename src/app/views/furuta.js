import * as THREE from 'three';
import { materials, box, cyl, sphere, at, makeTrail, setQuat } from '../kit.js';

export default function furutaView({ plant, p, theme }) {
  const M = materials();
  const g = new THREE.Group();
  const H = 0.128;
  // base cube with LED strip
  const body = at(box(0.102, 0.102, 0.102, M.blackGloss, { radius: 0.008 }), 0, 0, 0.051);
  g.add(body);
  const ledMat = new THREE.MeshStandardMaterial({ color: 0x111111, emissive: 0x40c057, emissiveIntensity: 1.6, roughness: 0.4 });
  const led = at(box(0.104, 0.104, 0.006, ledMat, { radius: 0.002, cast: false }), 0, 0, 0.012);
  g.add(led);
  const face = new THREE.MeshStandardMaterial({ color: 0x2a3038, roughness: 0.5, metalness: 0.2 });
  g.add(at(box(0.06, 0.002, 0.03, face, { cast: false }), 0, -0.0515, 0.06));
  // top hub
  g.add(at(cyl(0.036, 0.006, M.aluDark), 0, 0, 0.105));
  const hub = new THREE.Group();
  hub.position.set(0, 0, 0);
  g.add(hub);
  hub.add(at(cyl(0.02, 0.018, M.alu), 0, 0, 0.114));
  hub.add(at(cyl(0.006, 0.01, M.steel), 0, 0, 0.126));
  // arm (in hub frame, points along +x)
  const armLen = p.Lr + 0.018;
  const arm = at(box(armLen, 0.016, 0.01, M.black, { radius: 0.003 }), armLen / 2 - 0.012, 0, H);
  hub.add(arm);
  const enc = at(box(0.026, 0.03, 0.03, M.alu, { radius: 0.004 }), p.Lr + 0.004, 0, H);
  hub.add(enc);
  hub.add(at(cyl(0.004, 0.012, M.steel, { axis: 'x' }), p.Lr - 0.012, 0, H));
  // pendulum (frame: origin at pivot, +z along rod)
  const pend = new THREE.Group();
  const rodMat = new THREE.MeshPhysicalMaterial({ color: 0xd9480f, metalness: 0.55, roughness: 0.28, clearcoat: 0.6 });
  pend.add(at(cyl(0.0045, p.Lp, rodMat), 0, 0, p.Lp / 2));
  pend.add(at(cyl(0.008, 0.01, M.aluDark, { axis: 'x' }), -0.017, 0, 0));
  pend.add(at(sphere(0.0055, rodMat), 0, 0, p.Lp));
  g.add(pend);
  // torque arc
  const arcMat = new THREE.MeshBasicMaterial({ color: 0xe8590c, transparent: true, opacity: 0.75, side: THREE.DoubleSide, depthWrite: false });
  const arc = new THREE.Mesh(new THREE.RingGeometry(0.045, 0.05, 32, 1, 0, 0.1), arcMat);
  arc.position.z = 0.1085;
  g.add(arc);
  const trail = makeTrail(theme === 'dark' ? 0x3bc9db : 0x0b8ba8, 700, 0.8);
  trail.minStep = 0.0015;
  g.add(trail.object);
  // set-point tick on the base top
  const refMark = new THREE.Mesh(new THREE.BoxGeometry(0.024, 0.003, 0.002), new THREE.MeshBasicMaterial({ color: 0x0b8ba8 }));
  refMark.position.z = 0.1085;
  const refPivot = new THREE.Group();
  refPivot.add(refMark);
  refMark.position.x = 0.03;
  g.add(refPivot);

  let lastT = -1, lastV = 0;
  const statusColor = { ok: 0x40c057, info: 0xf08c00, idle: 0x228be6, warn: 0xf08c00, fail: 0xfa5252 };
  return {
    group: g,
    grid: 0.05,
    scale: 0.25,
    camera: { pos: [0.38, -0.44, 0.33], target: [0.02, 0, 0.115] },
    shadow: { center: [0, 0, 0.1], extent: 0.35 },
    pickables: [{ object: pend, body: 'pend' }],
    hint: 'Drag the red pendulum to disturb it · scroll to zoom',
    update(f) {
      const s = f.s;
      const pa = plant.pose(s, p, f.aux, 'arm');
      setQuat(hub, pa.q);
      const pp = plant.pose(s, p, f.aux, 'pend');
      pend.position.set(pp.p[0], pp.p[1], pp.p[2]);
      setQuat(pend, pp.q);
      const tip = new THREE.Vector3(0, 0, p.Lp).applyQuaternion(pend.quaternion).add(pend.position);
      if (f.t < lastT) trail.clear();
      lastT = f.t;
      trail.push(tip.x, tip.y, tip.z);
      const V = f.u[0];
      if (Math.abs(V - lastV) > 0.05) {
        lastV = V;
        const len = Math.min(Math.PI * 1.6, (Math.abs(V) / 10) * Math.PI * 1.6);
        arc.geometry.dispose();
        arc.geometry = new THREE.RingGeometry(0.045, 0.05, 32, 1, 0, Math.max(0.01, len));
        arc.rotation.z = s[0] + (V < 0 ? -len : 0);
      } else arc.rotation.z = s[0] + (V < 0 ? -Math.min(Math.PI * 1.6, (Math.abs(V) / 10) * Math.PI * 1.6) : 0);
      refPivot.rotation.z = f.r[0];
      if (f.status) ledMat.emissive.setHex(statusColor[f.status.level] ?? 0x40c057);
    },
    readouts: (f) => [
      ['arm θ', (f.s[0] * 180) / Math.PI, '°', 1],
      ['pendulum α', wrapDeg(f.s[1]), '°', 1],
      ['voltage', f.u[0], 'V', 2],
      ['current', (f.u[0] - p.km * f.s[2]) / p.Rm, 'A', 3],
    ],
    reset() { trail.clear(); },
    dispose() { trail.dispose(); },
  };
}
function wrapDeg(a) {
  a = (a + Math.PI) % (2 * Math.PI);
  if (a < 0) a += 2 * Math.PI;
  return ((a - Math.PI) * 180) / Math.PI;
}
