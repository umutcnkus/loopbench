import * as THREE from 'three';
import { materials, box, cyl, sphere, at, makeTrail, makeArrow, makeTarget, makeSegment, setQuat } from '../kit.js';

function propBlade(len, mat) {
  // tapered, slightly twisted blade from an extruded airfoil-ish outline
  const shape = new THREE.Shape();
  shape.moveTo(0, -0.006);
  shape.quadraticCurveTo(len * 0.35, -0.014, len, -0.004);
  shape.quadraticCurveTo(len * 1.02, 0, len, 0.004);
  shape.quadraticCurveTo(len * 0.4, 0.013, 0, 0.006);
  const geo = new THREE.ExtrudeGeometry(shape, { depth: 0.002, bevelEnabled: false, curveSegments: 8 });
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const tw = 0.35 * (1 - x / len);
    pos.setXYZ(i, x, y * Math.cos(tw) - z * Math.sin(tw), y * Math.sin(tw) + z * Math.cos(tw));
  }
  geo.computeVertexNormals();
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = true;
  return m;
}

export default function quadrotorView({ plant, p, theme }) {
  const M = materials();
  const g = new THREE.Group();
  const frame = new THREE.Group();
  g.add(frame);
  const carbon = new THREE.MeshPhysicalMaterial({ color: 0x1e2227, roughness: 0.35, metalness: 0.2, clearcoat: 0.8, clearcoatRoughness: 0.25 });
  const d = p.L / Math.SQRT2;
  // arms
  for (const [sx, sy] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
    const arm = box(p.L * 1.02, 0.022, 0.012, carbon, { radius: 0.004 });
    arm.position.set((sx * d) / 2, (sy * d) / 2, 0.005);
    arm.rotation.z = Math.atan2(sy, sx);
    frame.add(arm);
  }
  // body plates, stack, battery, GPS mast
  frame.add(at(box(0.12, 0.12, 0.004, carbon, { radius: 0.01 }), 0, 0, 0.014));
  frame.add(at(box(0.12, 0.12, 0.004, carbon, { radius: 0.01 }), 0, 0, -0.004));
  frame.add(at(box(0.05, 0.05, 0.02, M.pcb, { radius: 0.003 }), 0, 0, 0.026));
  const battery = at(box(0.13, 0.045, 0.032, M.accent, { radius: 0.008 }), 0, 0, -0.026);
  frame.add(battery);
  frame.add(at(box(0.132, 0.047, 0.006, M.black, { radius: 0.002 }), 0, 0, -0.026));
  frame.add(at(cyl(0.003, 0.06, M.aluDark), -0.03, 0, 0.066));
  frame.add(at(cyl(0.02, 0.008, M.white), -0.03, 0, 0.098));
  // canopy
  const canopy = new THREE.Mesh(new THREE.SphereGeometry(0.05, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2), M.blackGloss);
  canopy.rotation.x = Math.PI / 2;
  canopy.scale.set(1.3, 0.55, 1);
  canopy.position.set(0.015, 0, 0.016);
  canopy.castShadow = true;
  frame.add(canopy);
  // landing gear
  for (const [sx, sy] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
    const top = new THREE.Vector3(sx * 0.04, sy * 0.04, -0.005), bot = new THREE.Vector3(sx * 0.11, sy * 0.11, -0.08);
    const len = top.distanceTo(bot);
    const leg = cyl(0.004, len, M.aluDark);
    leg.position.copy(top.clone().add(bot).multiplyScalar(0.5));
    leg.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), bot.clone().sub(top).normalize());
    frame.add(leg);
    frame.add(at(sphere(0.008, M.rubber), bot.x, bot.y, bot.z));
  }
  // motors and props
  const rotors = [];
  const discMat = (col) => new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide });
  p.motors.forEach((mp, i) => {
    const front = mp[0] > 0;
    const mount = at(cyl(0.02, 0.006, carbon), mp[0], mp[1], 0.008);
    const stator = at(cyl(0.014, 0.018, M.black), mp[0], mp[1], 0.02);
    const bell = at(cyl(0.0145, 0.012, front ? M.accent : M.alu), mp[0], mp[1], 0.034);
    frame.add(mount, stator, bell);
    const hub = new THREE.Group();
    hub.position.set(mp[0], mp[1], 0.043);
    const pmat = front ? M.accent : M.graphite;
    const b1 = propBlade(0.11, pmat), b2 = propBlade(0.11, pmat);
    b2.rotation.z = Math.PI;
    if (p.spin[i] < 0) { b1.scale.y = -1; b2.scale.y = -1; }
    hub.add(b1, b2, at(cyl(0.006, 0.008, M.steel), 0, 0, 0.002));
    const disc = new THREE.Mesh(new THREE.RingGeometry(0.012, 0.113, 48), discMat(front ? 0xe8590c : 0x6d7782));
    disc.position.z = 0.003;
    disc.renderOrder = 5;
    hub.add(disc);
    frame.add(hub);
    // LED
    const led = new THREE.Mesh(new THREE.SphereGeometry(0.005, 12, 8), new THREE.MeshBasicMaterial({ color: front ? 0x40ff70 : 0xff3030 }));
    led.position.set(mp[0] * 1.02, mp[1] * 1.02, 0.004);
    frame.add(led);
    const arrow = makeArrow(0xe8590c, { shaft: 0.003, head: 0.009, headLen: 0.022 });
    g.add(arrow.object);
    rotors.push({ hub, blades: [b1, b2], disc, angle: Math.random() * 6, spin: p.spin[i], arrow, mp });
  });

  // target marker + altitude line + ground shadow ring
  const tgt = makeTarget(0x0b8ba8, 0.13);
  g.add(tgt.object);
  const tgtGround = makeTarget(0x0b8ba8, 0.08);
  tgtGround.ringMat.opacity = 0.35;
  tgtGround.discMat.opacity = 0.06;
  g.add(tgtGround.object);
  const tgtLine = makeSegment(0x0b8ba8, 0.35, true);
  g.add(tgtLine.object);
  const trail = makeTrail(theme === 'dark' ? 0x3bc9db : 0x0b8ba8, 900, 0.8);
  trail.minStep = 0.01;
  g.add(trail.object);

  // wind streaks
  const NW = 260;
  const wpos = new Float32Array(NW * 6);
  const wgeo = new THREE.BufferGeometry();
  wgeo.setAttribute('position', new THREE.BufferAttribute(wpos, 3));
  const wmat = new THREE.LineBasicMaterial({ color: theme === 'dark' ? 0x9fb3c8 : 0x5f7387, transparent: true, opacity: 0.0, depthWrite: false });
  const wind = new THREE.LineSegments(wgeo, wmat);
  wind.frustumCulled = false;
  g.add(wind);
  const seeds = Array.from({ length: NW }, () => [Math.random() * 8 - 4, Math.random() * 8 - 4, Math.random() * 3.5]);

  let lastT = -1;
  let visT = 0;
  return {
    group: g,
    grid: 0.5,
    scale: 2.5,
    camera: { pos: [1.9, -2.6, 2.0], target: [0, 0, 1.1] },
    shadow: { extent: 3 },
    hint: 'Drag the drone to push it · drag the ring to move the hover target',
    pickables: [
      { object: tgt.object, kind: 'target', plane: 'horizontal' },
      { object: frame, body: 'frame' },
    ],
    targetToRef(target, entry, mode) {
      const x = Math.max(-3, Math.min(3, target[0])), y = Math.max(-3, Math.min(3, target[1]));
      return { mode: 'hover', params: { x: +x.toFixed(2), y: +y.toFixed(2) } };
    },
    focus: (f) => [f.s[0], f.s[1], Math.max(0.5, f.s[2] * 0.7)],
    update(f, dt) {
      const s = f.s;
      frame.position.set(s[0], s[1], s[2]);
      setQuat(frame, [s[6], s[7], s[8], s[9]]);
      if (f.t < lastT) trail.clear();
      lastT = f.t;
      if (s[2] > 0.12 || Math.hypot(s[3], s[4], s[5]) > 0.05) trail.push(s[0], s[1], s[2]);
      visT += dt || 0.016;
      const q = [s[6], s[7], s[8], s[9]];
      const up = new THREE.Vector3(0, 0, 1).applyQuaternion(frame.quaternion);
      rotors.forEach((r, i) => {
        const Om = s[13 + i];
        const vis = Math.min(Om, 45);
        r.angle += r.spin * vis * (dt || 0.016);
        r.hub.rotation.z = r.angle;
        const blur = Math.min(1, Math.max(0, (Om - 60) / 250));
        r.disc.material.opacity = 0.28 * blur;
        for (const b of r.blades) b.visible = blur < 0.85 || f.aux.broken;
        if (f.aux.broken) { r.blades[1].visible = false; r.disc.material.opacity = 0; }
        const T = p.kf * Om * Om;
        const wp = new THREE.Vector3(r.mp[0], r.mp[1], 0.05).applyQuaternion(frame.quaternion).add(frame.position);
        r.arrow.set([wp.x, wp.y, wp.z], [up.x * T * 0.03, up.y * T * 0.03, up.z * T * 0.03], 0.01);
      });
      void q;
      // target
      const r = f.r;
      tgt.object.position.set(r[0], r[1], r[2]);
      tgt.object.rotation.z = r[3];
      tgtGround.object.position.set(r[0], r[1], 0.002);
      tgtLine.set([r[0], r[1], 0.002], [r[0], r[1], r[2]]);
      // wind streaks
      const w = f.dist || [0, 0, 0];
      const ws = Math.hypot(w[0], w[1], w[2]);
      wmat.opacity = Math.min(0.55, ws * 0.12);
      if (ws > 0.05) {
        const cx = s[0], cy = s[1];
        const step = dt || 0.016;
        for (let k = 0; k < NW; k++) {
          const sd = seeds[k];
          sd[0] += w[0] * step; sd[1] += w[1] * step; sd[2] += w[2] * step;
          for (let a = 0; a < 2; a++) {
            const ext = 4;
            if (sd[a] - (a ? cy : cx) > ext) sd[a] -= 2 * ext;
            if (sd[a] - (a ? cy : cx) < -ext) sd[a] += 2 * ext;
          }
          const len = 0.06 * ws;
          wpos.set([sd[0], sd[1], sd[2], sd[0] - (w[0] / ws) * len, sd[1] - (w[1] / ws) * len, sd[2] - (w[2] / ws) * len], k * 6);
        }
        wgeo.attributes.position.needsUpdate = true;
      }
    },
    readouts: (f) => {
      const s = f.s;
      const roll = Math.atan2(2 * (s[6] * s[7] + s[8] * s[9]), 1 - 2 * (s[7] ** 2 + s[8] ** 2));
      const pitch = Math.asin(Math.max(-1, Math.min(1, 2 * (s[6] * s[8] - s[9] * s[7]))));
      return [
        ['altitude', s[2], 'm', 2],
        ['speed', Math.hypot(s[3], s[4], s[5]), 'm/s', 2],
        ['roll', (roll * 180) / Math.PI, '°', 1],
        ['pitch', (pitch * 180) / Math.PI, '°', 1],
        ['thrust', p.kf * (s[13] ** 2 + s[14] ** 2 + s[15] ** 2 + s[16] ** 2), 'N', 1],
      ];
    },
    reset() { trail.clear(); },
    dispose() {
      trail.dispose();
      tgtLine.dispose();
      rotors.forEach((r) => r.arrow.dispose());
      wgeo.dispose();
      wmat.dispose();
    },
  };
}
