import * as THREE from 'three';
import { materials, box, cyl, at, canvasTexture, makeTrail, makeTarget, setQuat } from '../kit.js';

const H = 14, R = 0.8;

export default function rocketView({ plant, p, theme }) {
  const M = materials();
  const g = new THREE.Group();
  // --- vehicle (frame origin at the CG, +z along the axis)
  const veh = new THREE.Group();
  g.add(veh);
  const zb = -p.hcg; // engine plane
  const body = new THREE.MeshPhysicalMaterial({ color: 0xf1f3f5, roughness: 0.42, clearcoat: 0.4 });
  const soot = canvasTexture(64, 512, (c, w, h) => {
    const grd = c.createLinearGradient(0, h, 0, 0);
    grd.addColorStop(0, 'rgba(40,36,32,0.95)');
    grd.addColorStop(0.35, 'rgba(90,80,70,0.55)');
    grd.addColorStop(0.7, 'rgba(255,255,255,0)');
    c.fillStyle = '#f1f3f5'; c.fillRect(0, 0, w, h);
    c.fillStyle = grd; c.fillRect(0, 0, w, h);
  });
  const hull = new THREE.Mesh(new THREE.CylinderGeometry(R, R, H - 1.2, 40, 1), new THREE.MeshPhysicalMaterial({ map: soot, roughness: 0.5, clearcoat: 0.3 }));
  hull.rotation.x = Math.PI / 2;
  hull.position.z = zb + 0.6 + (H - 1.2) / 2;
  hull.castShadow = true;
  veh.add(hull);
  veh.add(at(cyl(R * 1.01, 1.1, M.graphite), 0, 0, zb + H - 1.2));
  veh.add(at(cyl(R * 0.98, 0.5, body), 0, 0, zb + H - 0.4));
  // grid fins
  for (let k = 0; k < 4; k++) {
    const a = (k * Math.PI) / 2;
    const fin = box(0.08, 0.9, 0.7, M.aluDark, {});
    fin.position.set(Math.cos(a) * (R + 0.45), Math.sin(a) * (R + 0.45), zb + H - 1.6);
    fin.rotation.z = a;
    veh.add(fin);
  }
  // legs
  for (let k = 0; k < 4; k++) {
    const a = (k * Math.PI) / 2 + Math.PI / 4;
    const top = new THREE.Vector3(Math.cos(a) * R, Math.sin(a) * R, zb + 3.2);
    const foot = new THREE.Vector3(Math.cos(a) * 3.1, Math.sin(a) * 3.1, zb - 0.02);
    const leg = cyl(0.12, top.distanceTo(foot), M.graphite);
    leg.position.copy(top.clone().add(foot).multiplyScalar(0.5));
    leg.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), foot.clone().sub(top).normalize());
    veh.add(leg, at(cyl(0.35, 0.12, M.graphite), foot.x, foot.y, foot.z + 0.06));
  }
  // engine bell (gimbals)
  const engine = new THREE.Group();
  engine.position.z = zb + 0.6;
  const bellPts = [];
  for (let i = 0; i <= 12; i++) { const t = i / 12; bellPts.push(new THREE.Vector2(0.25 + 0.45 * t * t, -1.3 * t)); }
  const bell = new THREE.Mesh(new THREE.LatheGeometry(bellPts, 32), new THREE.MeshStandardMaterial({ color: 0x3a3632, metalness: 0.9, roughness: 0.45, side: THREE.DoubleSide }));
  bell.rotation.x = Math.PI / 2;
  engine.add(bell);
  // flame: stacked additive cones with a gradient
  const flameTex = canvasTexture(64, 256, (c, w, h) => {
    const grd = c.createLinearGradient(0, 0, 0, h);
    grd.addColorStop(0, 'rgba(255,255,240,1)');
    grd.addColorStop(0.15, 'rgba(255,220,120,0.95)');
    grd.addColorStop(0.5, 'rgba(255,120,40,0.6)');
    grd.addColorStop(1, 'rgba(255,60,10,0)');
    c.fillStyle = grd; c.fillRect(0, 0, w, h);
  });
  const flameMat = new THREE.MeshBasicMaterial({ map: flameTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
  const flame = new THREE.Mesh(new THREE.ConeGeometry(0.62, 1, 24, 1, true), flameMat);
  flame.rotation.x = Math.PI / 2; // cone tip along -z after flip below
  const flameHolder = new THREE.Group();
  flameHolder.add(flame);
  flame.position.z = -0.5;
  flame.rotation.x = -Math.PI / 2;
  engine.add(flameHolder);
  const core = new THREE.Mesh(new THREE.ConeGeometry(0.3, 1, 16, 1, true), flameMat);
  core.rotation.x = -Math.PI / 2;
  core.position.z = -0.5;
  const coreHolder = new THREE.Group();
  coreHolder.add(core);
  engine.add(coreHolder);
  veh.add(engine);
  const glow = new THREE.PointLight(0xffa040, 0, 60, 1.6);
  glow.position.z = zb - 1.5;
  veh.add(glow);
  // RCS puffs at the top
  const puffMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false });
  const puffs = [-1, 1].map((sx) => {
    const c = new THREE.Mesh(new THREE.ConeGeometry(0.25, 1.4, 12, 1, true), puffMat);
    c.position.set(sx * (R + 0.7), 0, zb + H - 0.6);
    c.rotation.z = sx > 0 ? -Math.PI / 2 : Math.PI / 2;
    veh.add(c);
    return c;
  });
  // exhaust smoke particles (world)
  const NP = 220;
  const ppos = new Float32Array(NP * 3), pvel = new Float32Array(NP * 3), plife = new Float32Array(NP);
  const pgeo = new THREE.BufferGeometry();
  pgeo.setAttribute('position', new THREE.BufferAttribute(ppos, 3));
  const smokeTex = canvasTexture(64, 64, (c, w, h) => {
    const grd = c.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    grd.addColorStop(0, 'rgba(235,235,235,0.9)'); grd.addColorStop(1, 'rgba(235,235,235,0)');
    c.fillStyle = grd; c.fillRect(0, 0, w, h);
  });
  const smoke = new THREE.Points(pgeo, new THREE.PointsMaterial({ map: smokeTex, size: 3.2, transparent: true, depthWrite: false, opacity: theme === 'dark' ? 0.35 : 0.55, color: theme === 'dark' ? 0x9aa4ae : 0xd9dde1 }));
  smoke.frustumCulled = false;
  g.add(smoke);
  let pk = 0;
  // pad / barge / hover target
  const padTex = canvasTexture(512, 512, (c, w, h) => {
    c.fillStyle = '#9aa0a6'; c.fillRect(0, 0, w, h);
    c.fillStyle = 'rgba(0,0,0,0.06)';
    for (let i = 0; i < 400; i++) c.fillRect(Math.random() * w, Math.random() * h, 3, 3);
    c.strokeStyle = '#f5f5f5'; c.lineWidth = 18;
    c.beginPath(); c.arc(w / 2, h / 2, w * 0.42, 0, Math.PI * 2); c.stroke();
    c.lineWidth = 36;
    c.beginPath(); c.moveTo(w * 0.3, h * 0.3); c.lineTo(w * 0.7, h * 0.7); c.moveTo(w * 0.7, h * 0.3); c.lineTo(w * 0.3, h * 0.7); c.stroke();
  });
  const pad = new THREE.Mesh(new THREE.CylinderGeometry(9, 9.4, 0.3, 64), [new THREE.MeshStandardMaterial({ color: 0x80868c, roughness: 0.9 }), new THREE.MeshStandardMaterial({ map: padTex, roughness: 0.85 }), new THREE.MeshStandardMaterial({ color: 0x80868c })]);
  pad.rotation.x = Math.PI / 2;
  pad.position.z = -0.14;
  pad.receiveShadow = true;
  g.add(pad);
  const hoverTgt = makeTarget(0x0b8ba8, 3);
  g.add(hoverTgt.object);
  const trail = makeTrail(theme === 'dark' ? 0x3bc9db : 0x0b8ba8, 1500, 0.7);
  trail.minStep = 0.3;
  g.add(trail.object);
  let lastT = -1;
  const up = new THREE.Vector3(), tmp = new THREE.Vector3();
  const s0 = plant.initialConditions[0].fn(p);
  return {
    group: g,
    grid: 5,
    scale: 40,
    followDefault: true,
    camera: { pos: [s0[0] + 30, -62, s0[1] + 10], target: [s0[0], 0, s0[1]] },
    shadow: { extent: 22 },
    lighting: { key: 2.6 },
    hint: 'Camera follows the vehicle · drag the rocket to push it',
    pickables: [{ object: veh, body: 'body' }],
    focus: (f) => [f.s[0], 0, f.s[1]],
    update(f, dt) {
      const s = f.s;
      const step = Math.min(0.05, dt || 0.016);
      veh.position.set(s[0], 0, s[1]);
      setQuat(veh, [Math.cos(s[2] / 2), 0, Math.sin(s[2] / 2), 0]);
      const dlim = p.dlim;
      const d = Math.max(-dlim, Math.min(dlim, f.u[1]));
      engine.rotation.y = d;
      // thrust as the plant computes it
      const c = Math.max(0, Math.min(1, f.u[0]));
      const on = !f.aux.dead && s[6] > 0 && c >= 0.05;
      const thr = on ? Math.max(p.tmin, c) : 0;
      const L = thr * (7 + 2 * Math.random());
      flame.scale.set(1 + 0.08 * Math.random(), L, 1 + 0.08 * Math.random());
      flame.position.z = -1.3 - L / 2;
      core.scale.set(1, L * 0.55, 1);
      core.position.z = -1.3 - (L * 0.55) / 2;
      flame.visible = core.visible = thr > 0;
      glow.intensity = thr * 900 * (0.85 + 0.3 * Math.random());
      const rc = Math.max(-1, Math.min(1, f.u[2] || 0));
      puffMat.opacity = f.aux.dead ? 0 : Math.min(0.7, Math.abs(rc) * 0.9);
      puffs[0].visible = rc < -0.05;
      puffs[1].visible = rc > 0.05;
      // smoke: spawn at the nozzle, drift with the plume and wind
      up.set(Math.sin(s[2] + d), 0, Math.cos(s[2] + d));
      tmp.set(0, 0, zb - 1.5).applyQuaternion(veh.quaternion).add(veh.position);
      const spawn = Math.round(thr * 6);
      for (let k = 0; k < spawn; k++) {
        const i = pk++ % NP;
        ppos.set([tmp.x + (Math.random() - 0.5), tmp.y + (Math.random() - 0.5), tmp.z], i * 3);
        const sp = 18 + Math.random() * 10;
        pvel.set([-up.x * sp + (Math.random() - 0.5) * 3, (Math.random() - 0.5) * 3, -up.z * sp], i * 3);
        plife[i] = 1;
      }
      const wind = f.dist ? f.dist[0] : 0;
      for (let i = 0; i < NP; i++) {
        if (plife[i] <= 0) { ppos[i * 3 + 2] = -1000; continue; }
        plife[i] -= step * 0.45;
        pvel[i * 3] += (wind - pvel[i * 3]) * step * 0.8;
        pvel[i * 3 + 2] *= 1 - step * 1.2;
        if (ppos[i * 3 + 2] < 0.5) { pvel[i * 3 + 2] = Math.abs(pvel[i * 3 + 2]) * 0.2; pvel[i * 3] *= 1.02; pvel[i * 3] += (Math.random() - 0.5) * 8 * step * 10; }
        ppos[i * 3] += pvel[i * 3] * step;
        ppos[i * 3 + 1] += pvel[i * 3 + 1] * step;
        ppos[i * 3 + 2] += pvel[i * 3 + 2] * step;
      }
      pgeo.attributes.position.needsUpdate = true;
      // pad or hover target
      const hover = f.r[1] > 0.5;
      pad.visible = !hover;
      pad.position.x = f.r[0];
      hoverTgt.object.visible = hover;
      hoverTgt.object.position.set(f.r[0], 0, f.r[1] + p.hcg);
      if (f.t < lastT) { trail.clear(); plife.fill(0); }
      lastT = f.t;
      trail.push(s[0], 0, s[1]);
    },
    readouts: (f) => [
      ['altitude', f.s[1] - p.hcg, 'm', 1],
      ['descent', -f.s[4], 'm/s', 1],
      ['sideways', f.s[3], 'm/s', 1],
      ['propellant', f.s[6], 'kg', 0],
      ['throttle', f.aux.dead || f.s[6] <= 0 || f.u[0] < 0.05 ? 0 : Math.max(p.tmin, Math.min(1, f.u[0])) * 100, '%', 0],
    ],
    reset() { trail.clear(); plife.fill(0); },
    dispose() { trail.dispose(); pgeo.dispose(); },
  };
}
