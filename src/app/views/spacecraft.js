import * as THREE from 'three';
import { materials, box, cyl, sphere, at, canvasTexture, makeArrow, setQuat } from '../kit.js';

function noise2(seed) {
  // small value-noise generator for procedural textures
  const perm = new Uint8Array(512);
  let s = seed;
  for (let i = 0; i < 256; i++) perm[i] = i;
  for (let i = 255; i > 0; i--) { s = (s * 16807) % 2147483647; const j = s % (i + 1); [perm[i], perm[j]] = [perm[j], perm[i]]; }
  for (let i = 0; i < 256; i++) perm[256 + i] = perm[i];
  const grad = (h, x, y) => ((h & 1 ? -x : x) + (h & 2 ? -y : y));
  const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);
  return (x, y) => {
    const X = Math.floor(x) & 255, Y = Math.floor(y) & 255;
    x -= Math.floor(x); y -= Math.floor(y);
    const u = fade(x), v = fade(y);
    const a = perm[X] + Y, b = perm[X + 1] + Y;
    const l1 = grad(perm[a], x, y) + u * (grad(perm[b], x - 1, y) - grad(perm[a], x, y));
    const l2 = grad(perm[a + 1], x, y - 1) + u * (grad(perm[b + 1], x - 1, y - 1) - grad(perm[a + 1], x, y - 1));
    return l1 + v * (l2 - l1);
  };
}

function earthTexture() {
  const n = noise2(7), c = noise2(11);
  return canvasTexture(1024, 512, (g, w, h) => {
    const img = g.createImageData(w, h);
    for (let y = 0; y < h; y++) {
      const lat = (y / h - 0.5) * Math.PI;
      for (let x = 0; x < w; x++) {
        const lon = (x / w) * Math.PI * 2;
        const px = Math.cos(lat) * Math.cos(lon), py = Math.cos(lat) * Math.sin(lon);
        let e = 0, a = 1, f = 1.3;
        for (let o = 0; o < 5; o++) { e += a * n(px * f + 3 + Math.sin(lat) * f * 0.7, py * f - 2 + Math.sin(lat) * f); a *= 0.5; f *= 2.1; }
        let cl = 0; a = 1; f = 2.5;
        for (let o = 0; o < 4; o++) { cl += a * c(px * f + 11, py * f + Math.sin(lat) * f * 1.3); a *= 0.5; f *= 2.2; }
        const ice = Math.abs(lat) > 1.25;
        let r, gg, b;
        if (ice) { r = 235; gg = 240; b = 245; }
        else if (e > 0.08) { const t = Math.min(1, (e - 0.08) * 3); r = 70 + 90 * t; gg = 110 + 40 * t; b = 60 + 20 * t; }
        else { const t = Math.max(0, Math.min(1, (e + 0.3) * 1.6)); r = 18 + 20 * t; gg = 60 + 50 * t; b = 120 + 60 * t; }
        const cw = Math.max(0, Math.min(1, (cl - 0.05) * 2.2));
        r = r * (1 - cw) + 245 * cw; gg = gg * (1 - cw) + 248 * cw; b = b * (1 - cw) + 252 * cw;
        const k = (y * w + x) * 4;
        img.data[k] = r; img.data[k + 1] = gg; img.data[k + 2] = b; img.data[k + 3] = 255;
      }
    }
    g.putImageData(img, 0, 0);
  });
}

export default function spacecraftView({ plant, p }) {
  const M = materials();
  const g = new THREE.Group();
  // --- starfield
  const starGeo = new THREE.BufferGeometry();
  const N = 2500, pos = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) {
    const u = Math.random() * 2 - 1, th = Math.random() * Math.PI * 2, r = 900;
    const s = Math.sqrt(1 - u * u);
    pos.set([r * s * Math.cos(th), r * s * Math.sin(th), r * u], i * 3);
  }
  starGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.add(new THREE.Points(starGeo, new THREE.PointsMaterial({ color: 0xdfe7ff, size: 1.6, sizeAttenuation: false })));
  // --- Earth
  const earth = new THREE.Mesh(new THREE.SphereGeometry(150, 96, 64), new THREE.MeshStandardMaterial({ map: earthTexture(), roughness: 0.9, metalness: 0 }));
  earth.position.set(-120, 200, -170);
  earth.rotation.x = Math.PI / 2;
  g.add(earth);
  const atmo = new THREE.Mesh(new THREE.SphereGeometry(154, 64, 48), new THREE.MeshBasicMaterial({ color: 0x5aa2ff, transparent: true, opacity: 0.12, side: THREE.BackSide, depthWrite: false }));
  atmo.position.copy(earth.position);
  g.add(atmo);
  // --- satellite
  const sat = new THREE.Group();
  g.add(sat);
  const foil = canvasTexture(512, 512, (c, w, h) => {
    const grd = c.createLinearGradient(0, 0, w, h);
    grd.addColorStop(0, '#b8862b'); grd.addColorStop(0.5, '#f0cc70'); grd.addColorStop(1, '#a8761f');
    c.fillStyle = grd; c.fillRect(0, 0, w, h);
    for (let i = 0; i < 260; i++) {
      c.strokeStyle = `rgba(${Math.random() < 0.5 ? '255,240,190' : '90,60,10'},${0.15 + Math.random() * 0.25})`;
      c.lineWidth = 1 + Math.random() * 3;
      c.beginPath();
      const x = Math.random() * w, y = Math.random() * h;
      c.moveTo(x, y); c.lineTo(x + (Math.random() - 0.5) * 120, y + (Math.random() - 0.5) * 120); c.stroke();
    }
  });
  const foilMat = new THREE.MeshStandardMaterial({ map: foil, metalness: 1, roughness: 0.3 });
  sat.add(box(1.0, 1.0, 1.2, foilMat, { radius: 0.03 }));
  for (const sz of [-1, 1]) sat.add(at(box(1.04, 1.04, 0.04, M.aluBrushed, { radius: 0.01 }), 0, 0, sz * 0.6));
  // solar wings
  const cells = canvasTexture(512, 256, (c, w, h) => {
    c.fillStyle = '#0d1a3a'; c.fillRect(0, 0, w, h);
    c.strokeStyle = '#8aa0c8'; c.lineWidth = 2;
    for (let x = 0; x <= w; x += w / 8) { c.beginPath(); c.moveTo(x, 0); c.lineTo(x, h); c.stroke(); }
    for (let y = 0; y <= h; y += h / 4) { c.beginPath(); c.moveTo(0, y); c.lineTo(w, y); c.stroke(); }
    c.fillStyle = 'rgba(80,120,220,0.25)';
    for (let i = 0; i < 32; i++) c.fillRect((i % 8) * (w / 8) + 6, Math.floor(i / 8) * (h / 4) + 6, w / 8 - 12, h / 4 - 12);
  });
  const panelMat = new THREE.MeshStandardMaterial({ map: cells, metalness: 0.6, roughness: 0.25 });
  for (const sy of [-1, 1]) {
    sat.add(at(cyl(0.03, 0.5, M.aluDark, { axis: 'y' }), 0, sy * 0.75, 0));
    const wing = box(0.95, 2.6, 0.03, [M.aluDark, M.aluDark, M.aluDark, M.aluDark, panelMat, M.graphite], {});
    wing.position.set(0, sy * 2.3, 0);
    sat.add(wing);
  }
  // antenna dish (+z) and camera (+x)
  const dishPts = [];
  for (let i = 0; i <= 16; i++) { const r = (i / 16) * 0.45; dishPts.push(new THREE.Vector2(r, (r * r) / 0.9)); }
  const dish = new THREE.Mesh(new THREE.LatheGeometry(dishPts, 48), new THREE.MeshStandardMaterial({ color: 0xf2f4f6, roughness: 0.4, side: THREE.DoubleSide }));
  dish.rotation.x = Math.PI / 2;
  dish.position.set(0, 0, 0.72);
  sat.add(dish, at(cyl(0.03, 0.12, M.aluDark), 0, 0, 0.66), at(cyl(0.012, 0.3, M.alu), 0, 0, 0.9));
  sat.add(at(cyl(0.14, 0.25, M.black, { axis: 'x' }), 0.62, 0.2, -0.2));
  sat.add(at(cyl(0.1, 0.02, new THREE.MeshPhysicalMaterial({ color: 0x223355, metalness: 0.2, roughness: 0.05, clearcoat: 1 }), { axis: 'x' }), 0.745, 0.2, -0.2));
  // reaction wheels in a glass housing on -z
  const wheels = [];
  const housing = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.7, 0.3), new THREE.MeshPhysicalMaterial({ color: 0xffffff, transmission: 0.9, transparent: true, opacity: 0.25, roughness: 0.1 }));
  housing.position.set(0, 0, -0.78);
  sat.add(housing);
  const wheelDefs = [['x', [0.18, -0.15, -0.78]], ['y', [-0.18, -0.15, -0.78]], ['z', [0, 0.18, -0.78]]];
  const wcol = [0xe44d8c, 0x23993c, 0x1c7ed6];
  wheelDefs.forEach(([ax, at3], i) => {
    const wg = new THREE.Group();
    wg.position.set(...at3);
    const wmat = new THREE.MeshStandardMaterial({ color: wcol[i], metalness: 0.6, roughness: 0.3 });
    const disk = cyl(0.11, 0.035, wmat, { axis: ax === 'z' ? undefined : ax, seg: 24 });
    const mark = box(ax === 'x' ? 0.04 : 0.2, ax === 'y' ? 0.04 : 0.2, ax === 'z' ? 0.04 : 0.02, M.white, {});
    if (ax === 'x') mark.scale.set(1, 1, 1);
    wg.add(disk, mark);
    sat.add(wg);
    wheels.push({ wg, ax, angle: 0 });
  });
  // thruster plumes
  const plumeMat = new THREE.MeshBasicMaterial({ color: 0x9fd4ff, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });
  const plumes = [];
  for (const [x, y, z, dir] of [[0.5, 0.5, 0.6, [1, 0, 0]], [-0.5, -0.5, 0.6, [-1, 0, 0]], [0.5, -0.5, -0.6, [0, -1, 0]], [-0.5, 0.5, -0.6, [0, 1, 0]]]) {
    const cone = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.4, 16, 1, true), plumeMat);
    cone.position.set(x + dir[0] * 0.2, y + dir[1] * 0.2, z + dir[2] * 0.2);
    cone.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), new THREE.Vector3(...dir));
    sat.add(cone);
    plumes.push(cone);
  }
  // axes: body (solid) and target (ghost)
  const axesBody = [0xe03131, 0x2f9e44, 0x1971c2].map((c) => makeArrow(c, { shaft: 0.02, head: 0.06, headLen: 0.16 }));
  axesBody.forEach((a) => g.add(a.object));
  const ghost = new THREE.Group();
  const ghostMat = new THREE.LineBasicMaterial({ color: 0x3bc9db, transparent: true, opacity: 0.8 });
  ghost.add(new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(1.02, 1.02, 1.22)), ghostMat));
  for (const sy of [-1, 1]) {
    const e = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(0.95, 2.6, 0.03)), ghostMat);
    e.position.set(0, sy * 2.3, 0);
    ghost.add(e);
  }
  const boresight = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 6, 8), new THREE.MeshBasicMaterial({ color: 0x3bc9db, transparent: true, opacity: 0.5 }));
  boresight.rotation.z = Math.PI / 2;
  boresight.position.x = 3.6;
  ghost.add(boresight);
  g.add(ghost);
  const V = new THREE.Vector3();
  return {
    group: g,
    space: true,
    floor: false,
    grid: 1,
    scale: 4,
    lighting: { hemi: 0.12, env: 0.35, key: 3.2 },
    camera: { pos: [5.2, -6.8, 3.2], target: [0, 0, 0] },
    shadow: { center: [0, 0, 0], extent: 3.6 },
    hint: 'The cyan outline is the target attitude · drag a solar wing to apply a torque',
    pickables: [{ object: sat, body: 'bus' }],
    update(f, dt) {
      const s = f.s;
      const q = [s[0], s[1], s[2], s[3]];
      setQuat(sat, q);
      setQuat(ghost, f.r);
      ['x', 'y', 'z'].forEach((ax, i) => {
        const e = [0, 0, 0];
        e[i] = 1.9;
        V.set(...e).applyQuaternion(sat.quaternion);
        axesBody[i].set([0, 0, 0], [V.x, V.y, V.z]);
      });
      const step = dt || 0.016;
      wheels.forEach((w, i) => {
        w.angle += Math.max(-30, Math.min(30, s[7 + i] * 40)) * step;
        if (w.ax === 'x') w.wg.rotation.set(w.angle, 0, 0);
        else if (w.ax === 'y') w.wg.rotation.set(0, w.angle, 0);
        else w.wg.rotation.set(0, 0, w.angle);
      });
      const thr = Math.abs(f.u[3]) + Math.abs(f.u[4]) + Math.abs(f.u[5]);
      plumeMat.opacity = Math.min(0.85, thr * 1.6) * (0.75 + 0.25 * Math.random());
      earth.rotation.y += step * 0.004;
    },
    readouts: (f) => {
      const s = f.s, r = f.r;
      const d = Math.abs(s[0] * r[0] + s[1] * r[1] + s[2] * r[2] + s[3] * r[3]);
      return [
        ['error', (2 * Math.acos(Math.min(1, d)) * 180) / Math.PI, '°', 2],
        ['rate', (Math.hypot(s[4], s[5], s[6]) * 180) / Math.PI, '°/s', 3],
        ['|h| wheels', Math.hypot(s[7], s[8], s[9]), 'N·m·s', 2],
        ['thrusters', Math.abs(f.u[3]) + Math.abs(f.u[4]) + Math.abs(f.u[5]), 'N·m', 2],
      ];
    },
    dispose() { axesBody.forEach((a) => a.dispose()); starGeo.dispose(); },
  };
}
