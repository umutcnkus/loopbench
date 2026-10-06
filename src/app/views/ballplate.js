import * as THREE from 'three';
import { materials, box, cyl, sphere, at, makeTrail, makeTarget, canvasTexture, setQuat } from '../kit.js';

const HP = 0.3, TH = 0.006;

function rod(mat, r = 0.0025) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 1, 10), mat);
  m.castShadow = true;
  return m;
}
const _up = new THREE.Vector3(0, 1, 0);
function placeRod(m, a, b) {
  const va = new THREE.Vector3(...a), vb = new THREE.Vector3(...b);
  const d = vb.clone().sub(va);
  const L = d.length();
  m.position.copy(va).addScaledVector(d, 0.5);
  m.scale.set(1, L, 1);
  m.quaternion.setFromUnitVectors(_up, d.normalize());
}

export default function ballplateView({ plant, p, theme }) {
  const M = materials();
  const g = new THREE.Group();
  const a = p.a;
  // base, post, gimbal
  g.add(at(box(2 * a + 0.1, 2 * a + 0.1, 0.02, M.graphite, { radius: 0.008 }), 0, 0, 0.01));
  g.add(at(cyl(0.018, HP - 0.05, M.alu), 0, 0, 0.02 + (HP - 0.05) / 2));
  g.add(at(box(0.03, 0.03, 0.02, M.aluDark, { radius: 0.004 }), 0, 0, HP - 0.028));
  g.add(at(cyl(0.006, 0.05, M.steel, { axis: 'x' }), 0, 0, HP - 0.02));
  g.add(at(cyl(0.006, 0.05, M.steel, { axis: 'y' }), 0, 0, HP - 0.012));
  // plate with printed grid
  const plate = new THREE.Group();
  g.add(plate);
  const gridTex = canvasTexture(1024, 1024, (c, w, h) => {
    c.fillStyle = '#e9edf1';
    c.fillRect(0, 0, w, h);
    const n = Math.round((2 * a) / 0.02);
    c.strokeStyle = '#b4bec8';
    c.lineWidth = 2;
    for (let i = 1; i < n; i++) {
      const x = (i / n) * w;
      c.beginPath(); c.moveTo(x, 0); c.lineTo(x, h); c.stroke();
      c.beginPath(); c.moveTo(0, x); c.lineTo(w, x); c.stroke();
    }
    c.strokeStyle = '#7d8a97';
    c.lineWidth = 4;
    c.beginPath(); c.moveTo(w / 2, 0); c.lineTo(w / 2, h); c.moveTo(0, h / 2); c.lineTo(w, h / 2); c.stroke();
    c.fillStyle = '#7b8794';
    c.font = '600 26px "JetBrains Mono", monospace';
    c.fillText('+x', w - 60, h / 2 - 12);
    c.fillText('+y', w / 2 + 10, 36);
  });
  const top = new THREE.MeshPhysicalMaterial({ map: gridTex, roughness: 0.55, clearcoat: 0.35, clearcoatRoughness: 0.4 });
  const slab = box(2 * a, 2 * a, TH, [M.alu, M.alu, M.alu, M.alu, top, M.alu], {});
  slab.material = [M.alu, M.alu, M.alu, M.alu, top, M.alu];
  plate.add(slab);
  // BoxGeometry face order: +x, -x, +y, -y, +z, -z
  const frameMat = M.aluDark;
  for (const [sx, sy, w, h] of [[0, 1, 2 * a + 0.008, 0.004], [0, -1, 2 * a + 0.008, 0.004], [1, 0, 0.004, 2 * a + 0.008], [-1, 0, 0.004, 2 * a + 0.008]]) {
    plate.add(at(box(w, h, TH + 0.002, frameMat, {}), (sx * (a + 0.002)), (sy * (a + 0.002)), 0));
  }
  // attachment lugs under the plate
  const attachA = [a * 0.72, 0, -TH / 2 - 0.004], attachB = [0, a * 0.72, -TH / 2 - 0.004];
  plate.add(at(box(0.016, 0.01, 0.008, M.aluDark, {}), ...attachA));
  plate.add(at(box(0.01, 0.016, 0.008, M.aluDark, {}), ...attachB));
  // servos (bodies fixed on the base) and horns
  const servoPos = [[a * 0.72, -0.045, 0.075], [-0.045, a * 0.72, 0.075]];
  const horns = [];
  servoPos.forEach((sp, i) => {
    const body = box(i === 0 ? 0.02 : 0.04, i === 0 ? 0.04 : 0.02, 0.036, M.blue, { radius: 0.003 });
    body.position.set(sp[0], sp[1], sp[2] - 0.018);
    g.add(body);
    g.add(at(box(0.008, 0.008, sp[2] - 0.04, M.graphite, {}), sp[0], sp[1], (sp[2] - 0.04) / 2 + 0.02));
    const hornPivot = new THREE.Group();
    hornPivot.position.set(sp[0] + (i === 0 ? 0 : 0.012), sp[1] + (i === 0 ? 0.012 : 0), sp[2]);
    const horn = at(box(0.034, 0.004, 0.006, M.white, { radius: 0.002 }), 0.013, 0, 0);
    hornPivot.add(horn);
    if (i === 1) hornPivot.rotation.z = Math.PI / 2;
    g.add(hornPivot);
    horns.push(hornPivot);
  });
  const rods = [rod(M.steel), rod(M.steel)];
  rods.forEach((r) => g.add(r));
  // ball with markings so rolling is visible
  const ballTex = canvasTexture(512, 256, (c, w, h) => {
    c.fillStyle = '#c9ced4';
    c.fillRect(0, 0, w, h);
    c.fillStyle = '#e8590c';
    for (const [x, y] of [[0.12, 0.3], [0.37, 0.7], [0.62, 0.3], [0.87, 0.7], [0.25, 0.5], [0.75, 0.5]]) {
      c.beginPath(); c.arc(x * w, y * h, 22, 0, Math.PI * 2); c.fill();
    }
    c.fillStyle = '#1b1f24';
    c.fillRect(0, h / 2 - 5, w, 10);
  });
  const ballMat = new THREE.MeshStandardMaterial({ map: ballTex, metalness: 0.85, roughness: 0.18 });
  const ball = sphere(p.r, ballMat, { seg: 40 });
  g.add(ball);
  const ballQ = new THREE.Quaternion();
  // target + trail
  const tgt = makeTarget(0x0b8ba8, 0.018);
  plate.add(tgt.object);
  const trail = makeTrail(theme === 'dark' ? 0x3bc9db : 0x0b8ba8, 500, 0.9);
  trail.minStep = 0.0015;
  g.add(trail.object);
  const tv = new THREE.Vector3();

  let lastT = -1;
  return {
    group: g,
    grid: 0.1,
    scale: 0.5,
    camera: { pos: [0.34, -0.5, 0.58], target: [0, 0, 0.27] },
    shadow: { center: [0, 0, 0.2], extent: 0.55 },
    hint: 'Drag the ring to move the target · drag the ball to push it',
    pickables: [
      { object: tgt.object, kind: 'target', plane: 'horizontal' },
      { object: ball, body: 'ball', plane: 'horizontal' },
    ],
    targetToRef(target) {
      // world -> plate frame
      tv.set(target[0], target[1], target[2] - HP).applyQuaternion(plate.quaternion.clone().invert());
      const lim = 0.18;
      return { mode: 'point', params: { x: +Math.max(-lim, Math.min(lim, tv.x)).toFixed(3), y: +Math.max(-lim, Math.min(lim, tv.y)).toFixed(3) } };
    },
    update(f, dt) {
      const s = f.s;
      const pp = plant.pose(s, p, f.aux, 'plate');
      plate.position.set(pp.p[0], pp.p[1], pp.p[2]);
      setQuat(plate, pp.q);
      // servo horns follow the plate angles through the linkage ratio
      horns[0].rotation.y = -s[4] * 4.2;
      horns[1].rotation.set(0, 0, Math.PI / 2);
      horns[1].rotateY(-s[5] * 4.2);
      // pushrods: horn tip -> plate lug
      for (let i = 0; i < 2; i++) {
        const tip = new THREE.Vector3(0.026, 0, 0).applyQuaternion(horns[i].quaternion).add(horns[i].position);
        const lug = new THREE.Vector3(...(i === 0 ? attachA : attachB)).applyQuaternion(plate.quaternion).add(plate.position);
        placeRod(rods[i], [tip.x, tip.y, tip.z], [lug.x, lug.y, lug.z]);
      }
      const pb = plant.pose(s, p, f.aux, 'ball').p;
      ball.position.set(pb[0], pb[1], pb[2]);
      // integrate rolling orientation for display
      const h = Math.min(0.05, dt || 0.016);
      let vx, vy;
      if (f.aux.mode === 'plate') { vx = s[2]; vy = s[3]; } else if (f.aux.vw) { vx = f.aux.vw[0]; vy = f.aux.vw[1]; } else { vx = vy = 0; }
      const wx = -vy / p.r, wy = vx / p.r;
      const ang = Math.hypot(wx, wy) * h;
      if (ang > 1e-6) {
        const dq = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(wx, wy, 0).normalize(), ang);
        ballQ.premultiply(dq);
        ball.quaternion.copy(ballQ);
      }
      tgt.object.position.set(f.r[0], f.r[1], TH / 2 + 0.0008);
      if (f.t < lastT) { trail.clear(); ballQ.identity(); }
      lastT = f.t;
      if (f.aux.mode === 'plate') trail.push(pb[0], pb[1], pb[2] - p.r + 0.001);
    },
    readouts: (f) => [
      ['x', f.aux.mode === 'plate' ? f.s[0] * 1000 : NaN, 'mm', 1],
      ['y', f.aux.mode === 'plate' ? f.s[1] * 1000 : NaN, 'mm', 1],
      ['α', (f.s[4] * 180) / Math.PI, '°', 2],
      ['β', (f.s[5] * 180) / Math.PI, '°', 2],
    ],
    reset() { trail.clear(); ballQ.identity(); },
    dispose() { trail.dispose(); },
  };
}
