import * as THREE from 'three';
import { materials, box, cyl, sphere, at, canvasTexture, setQuat, makeTrail } from '../kit.js';

const HP = 0.34;

export default function ballbeamView({ plant, p, theme }) {
  const M = materials();
  const g = new THREE.Group();
  // stand
  g.add(at(box(0.5, 0.26, 0.02, M.graphite, { radius: 0.008 }), 0, 0.05, 0.01));
  for (const sx of [-1, 1]) g.add(at(box(0.03, 0.04, HP - 0.02, M.aluDark, { radius: 0.004 }), sx * 0.09, 0.09, (HP - 0.02) / 2 + 0.01));
  g.add(at(box(0.22, 0.04, 0.03, M.aluDark, { radius: 0.004 }), 0, 0.09, HP - 0.07));
  // motor + gearbox behind the beam
  g.add(at(cyl(0.035, 0.09, M.graphite, { axis: 'y' }), 0, 0.12, HP - 0.012));
  g.add(at(cyl(0.04, 0.03, M.aluBrushed, { axis: 'y' }), 0, 0.06, HP - 0.012));
  g.add(at(cyl(0.008, 0.06, M.steel, { axis: 'y' }), 0, 0.02, HP - 0.012));
  // beam (frame at the pivot; rolling surface at local z = 0)
  const beam = new THREE.Group();
  g.add(beam);
  const L = p.L;
  beam.add(at(box(L, 0.05, 0.022, M.aluBrushed, { radius: 0.003 }), 0, 0, -0.011));
  for (const sy of [-1, 1]) beam.add(at(box(L, 0.006, 0.018, M.alu, { radius: 0.002 }), 0, sy * 0.022, 0.002));
  for (const sx of [-1, 1]) beam.add(at(box(0.02, 0.05, 0.04, M.rubber, { radius: 0.006 }), sx * (L / 2 - 0.01), 0, 0.012));
  beam.add(at(box(0.05, 0.02, 0.05, M.aluDark, { radius: 0.004 }), 0, 0.03, -0.012));
  // printed scale on the front face
  const scaleTex = canvasTexture(2048, 64, (c, w, h) => {
    c.fillStyle = '#f4f6f8';
    c.fillRect(0, 0, w, h);
    c.fillStyle = '#20262c';
    c.font = '600 20px "JetBrains Mono", monospace';
    c.textAlign = 'center';
    const n = Math.round(L * 100);
    for (let i = 0; i <= n; i++) {
      const x = (i / n) * w;
      const cm = i - n / 2;
      const len = cm % 10 === 0 ? 30 : cm % 5 === 0 ? 20 : 10;
      c.fillRect(Math.min(w - 2, Math.max(0, x - 1)), 0, 2, len);
      if (cm % 10 === 0) c.fillText(String(cm), Math.min(w - 20, Math.max(20, x)), 56);
    }
  });
  const scale = new THREE.Mesh(new THREE.PlaneGeometry(L - 0.06, 0.02), new THREE.MeshStandardMaterial({ map: scaleTex, roughness: 0.6 }));
  scale.rotation.x = Math.PI / 2;
  scale.position.set(0, -0.0255, -0.011);
  beam.add(scale);
  // IR distance sensor just beyond the left end
  beam.add(at(box(0.03, 0.04, 0.03, M.black, { radius: 0.004 }), -L / 2 - 0.02, 0, 0.012));
  beam.add(at(box(0.04, 0.03, 0.006, M.aluDark, {}), -L / 2 - 0.005, 0, -0.006));
  const irMat = new THREE.MeshBasicMaterial({ color: 0xff3b3b, transparent: true, opacity: 0.25, depthWrite: false });
  const ir = new THREE.Mesh(new THREE.BoxGeometry(1, 0.003, 0.003), irMat);
  beam.add(ir);
  // set-point marker
  const refMat = new THREE.MeshBasicMaterial({ color: 0x0b8ba8, transparent: true, opacity: 0.9, depthWrite: false });
  const ref = new THREE.Mesh(new THREE.ConeGeometry(0.012, 0.03, 3), refMat);
  ref.rotation.x = -Math.PI / 2;
  beam.add(ref);
  // ball with markings
  const ballTex = canvasTexture(512, 256, (c, w, h) => {
    c.fillStyle = '#c9ced4'; c.fillRect(0, 0, w, h);
    c.fillStyle = '#e8590c';
    for (const [x, y] of [[0.12, 0.3], [0.37, 0.7], [0.62, 0.3], [0.87, 0.7]]) { c.beginPath(); c.arc(x * w, y * h, 26, 0, Math.PI * 2); c.fill(); }
    c.fillStyle = '#1b1f24'; c.fillRect(0, h / 2 - 6, w, 12);
  });
  const ball = sphere(p.r, new THREE.MeshStandardMaterial({ map: ballTex, metalness: 0.85, roughness: 0.18 }), { seg: 40 });
  ball.rotation.order = 'YXZ';
  g.add(ball);
  const trail = makeTrail(0x0b8ba8, 10, 0);
  return {
    group: g,
    grid: 0.1,
    scale: 0.6,
    camera: { pos: [0.06, -1.08, 0.62], target: [0, 0, 0.34] },
    shadow: { center: [0, 0, 0.25], extent: 0.8 },
    hint: 'Drag the ball to push it · scroll to zoom',
    pickables: [{ object: ball, body: 'ball', plane: 'xz' }],
    update(f) {
      const s = f.s;
      const pb = plant.pose(s, p, f.aux, 'beam');
      beam.position.set(...pb.p);
      setQuat(beam, pb.q);
      const pl = plant.pose(s, p, f.aux, 'ball');
      ball.position.set(...pl.p);
      ball.rotation.set(0, -(s[1] - s[0] / p.r), 0);
      ref.position.set(f.r[0], 0, 0.045);
      const x0 = -L / 2 - 0.005;
      ir.scale.x = Math.max(0.001, s[0] - p.r - x0);
      ir.position.set((x0 + s[0] - p.r) / 2, 0, p.r);
      void trail;
    },
    readouts: (f) => [
      ['ball', f.s[0] * 100, 'cm', 1],
      ['beam', (f.s[1] * 180) / Math.PI, '°', 2],
      ['voltage', f.u[0], 'V', 2],
    ],
    dispose() { trail.dispose(); },
  };
}
