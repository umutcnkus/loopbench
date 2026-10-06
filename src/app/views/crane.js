import * as THREE from 'three';
import { materials, box, cyl, at, makeSegment, makeTarget, canvasTexture, setQuat, makeTrail } from '../kit.js';

const HT = 3.0, BOX = 0.3;

export default function craneView({ plant, p, theme }) {
  const M = materials();
  const g = new THREE.Group();
  const yellow = M.yellow;
  const X = 2.9, Y = 1.55;
  // columns and runway beams
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) {
    g.add(at(box(0.16, 0.16, HT + 0.1, yellow, { radius: 0.01 }), sx * X, sy * Y, (HT + 0.1) / 2));
    g.add(at(box(0.36, 0.36, 0.04, M.graphite, { radius: 0.01 }), sx * X, sy * Y, 0.02));
  }
  for (const sy of [-1, 1]) {
    g.add(at(box(2 * X + 0.2, 0.14, 0.18, yellow, { radius: 0.01 }), 0, sy * Y, HT + 0.18));
    g.add(at(box(2 * X + 0.2, 0.05, 0.03, M.steel, {}), 0, sy * Y, HT + 0.285));
  }
  // bridge girder with hazard stripes on the ends
  const stripes = canvasTexture(256, 64, (c, w, h) => {
    c.fillStyle = '#f0b400';
    c.fillRect(0, 0, w, h);
    c.fillStyle = '#16191d';
    for (let x = -h; x < w + h; x += 32) {
      c.beginPath(); c.moveTo(x, h); c.lineTo(x + 16, h); c.lineTo(x + 16 + h, 0); c.lineTo(x + h, 0); c.fill();
    }
  });
  const stripeMat = new THREE.MeshStandardMaterial({ map: stripes, roughness: 0.5 });
  const bridge = new THREE.Group();
  bridge.add(at(box(0.22, 2 * Y + 0.3, 0.24, yellow, { radius: 0.01 }), 0, 0, 0.36));
  for (const sy of [-1, 1]) {
    bridge.add(at(box(0.5, 0.26, 0.2, M.graphite, { radius: 0.02 }), 0, sy * Y, 0.36));
    bridge.add(at(box(0.23, 0.3, 0.1, stripeMat, {}), 0, sy * (Y - 0.35), 0.36));
  }
  g.add(bridge);
  // trolley + winch
  const trolley = new THREE.Group();
  trolley.add(at(box(0.5, 0.36, 0.14, M.blue, { radius: 0.02 }), 0, 0, 0.18));
  trolley.add(at(cyl(0.09, 0.3, M.alu, { axis: 'x' }), 0, 0, 0.1));
  trolley.add(at(box(0.12, 0.16, 0.12, M.graphite, { radius: 0.01 }), 0.28, 0, 0.14));
  trolley.add(at(box(0.16, 0.12, 0.08, M.aluDark, { radius: 0.01 }), 0, 0, -0.22));
  g.add(trolley);
  // rope + crate
  const rope = makeSegment(theme === 'dark' ? 0xc9d2da : 0x2a3038, 1);
  rope.object.material.linewidth = 2;
  g.add(rope.object);
  const wood = canvasTexture(256, 256, (c, w, h) => {
    c.fillStyle = '#c98f4f';
    c.fillRect(0, 0, w, h);
    c.strokeStyle = 'rgba(90,50,20,0.55)';
    for (let y = 0; y < h; y += 7) { c.lineWidth = 1 + (y % 3); c.beginPath(); c.moveTo(0, y); c.bezierCurveTo(w / 3, y + 3, (2 * w) / 3, y - 3, w, y); c.stroke(); }
    c.fillStyle = '#7a4b22';
    c.fillRect(0, 0, w, 22); c.fillRect(0, h - 22, w, 22); c.fillRect(0, 0, 22, h); c.fillRect(w - 22, 0, 22, h);
    c.fillStyle = '#1b1f24';
    c.font = '700 44px "Barlow Semi Condensed", sans-serif';
    c.textAlign = 'center';
    c.fillText(`${p.m} kg`, w / 2, h / 2 + 16);
  });
  const crate = new THREE.Group();
  const s = BOX * Math.cbrt(p.m / 10);
  const crateMesh = box(s, s, s, new THREE.MeshStandardMaterial({ map: wood, roughness: 0.8 }), {});
  crate.add(crateMesh);
  crate.add(at(box(0.05, 0.05, 0.06, M.steel, {}), 0, 0, s / 2 + 0.03));
  g.add(crate);
  // floor zones
  const zone = (x, y, label) => {
    const tex = canvasTexture(256, 256, (c, w, h) => {
      c.strokeStyle = '#e8b400';
      c.lineWidth = 14;
      c.strokeRect(10, 10, w - 20, h - 20);
      c.fillStyle = '#e8b400';
      c.font = '700 72px "Barlow Semi Condensed", sans-serif';
      c.textAlign = 'center';
      c.fillText(label, w / 2, h / 2 + 26);
    });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.7), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }));
    m.position.set(x, y, 0.004);
    g.add(m);
  };
  zone(-1.6, -0.5, 'A');
  zone(1.7, 0.6, 'B');
  const tgt = makeTarget(0x0b8ba8, 0.3);
  g.add(tgt.object);
  const trail = makeTrail(theme === 'dark' ? 0x3bc9db : 0x0b8ba8, 800, 0.7);
  trail.minStep = 0.01;
  g.add(trail.object);
  let lastT = -1;
  return {
    group: g,
    grid: 0.5,
    scale: 3,
    camera: { pos: [3.6, -6.4, 4.1], target: [0, 0, 1.3] },
    shadow: { center: [0, 0, 1.5], extent: 4.5 },
    hint: 'Drag the target on the floor or push the crate with the mouse',
    pickables: [
      { object: tgt.object, kind: 'target', plane: 'horizontal' },
      { object: crate, body: 'payload' },
    ],
    targetToRef(t) {
      return { mode: 'point', params: { x: +Math.max(-2.4, Math.min(2.4, t[0])).toFixed(2), y: +Math.max(-1.1, Math.min(1.1, t[1])).toFixed(2) } };
    },
    update(f) {
      const st = f.s;
      bridge.position.set(st[0], 0, HT);
      trolley.position.set(st[0], st[1], HT);
      const pc = plant.pose(st, p, f.aux, 'payload');
      crate.position.set(...pc.p);
      setQuat(crate, pc.q);
      const top = new THREE.Vector3(0, 0, s / 2 + 0.06).applyQuaternion(crate.quaternion).add(crate.position);
      rope.set([st[0], st[1], HT - 0.25], [top.x, top.y, top.z]);
      tgt.object.position.set(f.r[0], f.r[1], 0.006);
      if (f.t < lastT) trail.clear();
      lastT = f.t;
      trail.push(pc.p[0], pc.p[1], pc.p[2] - s / 2);
    },
    readouts: (f) => {
      const st = f.s;
      const sw = Math.acos(Math.min(1, Math.cos(st[3]) * Math.cos(st[4])));
      return [
        ['bridge x', st[0], 'm', 2],
        ['trolley y', st[1], 'm', 2],
        ['rope', st[2], 'm', 2],
        ['swing', (sw * 180) / Math.PI, '°', 1],
      ];
    },
    reset() { trail.clear(); },
    dispose() { rope.dispose(); trail.dispose(); },
  };
}
