// Shared materials and 3D helpers for plant views. Everything a view builds lives
// in physics coordinates (z up); the viewport rotates the plant root into three's y-up.
import * as THREE from 'three';

let _mats = null;
export function materials() {
  if (_mats) return _mats;
  const std = (o) => new THREE.MeshStandardMaterial(o);
  const phys = (o) => new THREE.MeshPhysicalMaterial(o);
  _mats = {
    alu: std({ color: 0xc3cad2, metalness: 0.85, roughness: 0.34 }),
    aluBrushed: std({ color: 0xaeb6bf, metalness: 0.9, roughness: 0.45 }),
    aluDark: std({ color: 0x6d7782, metalness: 0.8, roughness: 0.42 }),
    steel: std({ color: 0xe9edf1, metalness: 1.0, roughness: 0.12 }),
    chrome: std({ color: 0xffffff, metalness: 1.0, roughness: 0.05 }),
    black: std({ color: 0x1b1f24, metalness: 0.1, roughness: 0.55 }),
    blackGloss: phys({ color: 0x14171b, metalness: 0.0, roughness: 0.22, clearcoat: 1, clearcoatRoughness: 0.15 }),
    graphite: std({ color: 0x2a3038, metalness: 0.35, roughness: 0.5 }),
    rubber: std({ color: 0x202328, metalness: 0.0, roughness: 0.92 }),
    white: phys({ color: 0xf2f4f6, metalness: 0.0, roughness: 0.32, clearcoat: 0.6, clearcoatRoughness: 0.2 }),
    accent: phys({ color: 0xe8590c, metalness: 0.15, roughness: 0.32, clearcoat: 0.7, clearcoatRoughness: 0.2 }),
    accentDark: std({ color: 0xa63d06, metalness: 0.2, roughness: 0.45 }),
    blue: phys({ color: 0x2466c8, metalness: 0.55, roughness: 0.3, clearcoat: 0.5 }),
    teal: phys({ color: 0x0f8c9c, metalness: 0.4, roughness: 0.3, clearcoat: 0.5 }),
    yellow: phys({ color: 0xf0b400, metalness: 0.1, roughness: 0.38, clearcoat: 0.5 }),
    copper: std({ color: 0xc27a45, metalness: 1.0, roughness: 0.28 }),
    brass: std({ color: 0xc9a44a, metalness: 1.0, roughness: 0.3 }),
    pcb: std({ color: 0x1f6f43, metalness: 0.2, roughness: 0.55 }),
    glass: phys({ color: 0xffffff, metalness: 0, roughness: 0.05, transmission: 0.9, thickness: 0.01, transparent: true, opacity: 0.35 }),
    ghost: new THREE.MeshBasicMaterial({ color: 0xe8590c, transparent: true, opacity: 0.18, depthWrite: false }),
  };
  return _mats;
}

export const V = (x, y, z) => new THREE.Vector3(x, y, z);

// Mesh builders (physics axes). Cylinders default to lying along +z.
export function box(sx, sy, sz, mat, opts = {}) {
  const geo = opts.radius ? roundedBoxGeo(sx, sy, sz, opts.radius, opts.segments ?? 3) : new THREE.BoxGeometry(sx, sy, sz);
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = opts.cast ?? true;
  m.receiveShadow = opts.receive ?? true;
  return m;
}
export function cyl(r, h, mat, opts = {}) {
  const geo = new THREE.CylinderGeometry(opts.r2 ?? r, r, h, opts.seg ?? 32, 1, opts.open ?? false);
  // three's cylinder is along +y; rotate so it runs along +z (physics up)
  geo.rotateX(Math.PI / 2);
  if (opts.axis === 'x') geo.rotateY(Math.PI / 2);
  if (opts.axis === 'y') geo.rotateX(Math.PI / 2);
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = opts.cast ?? true;
  m.receiveShadow = opts.receive ?? true;
  return m;
}
export function sphere(r, mat, opts = {}) {
  const m = new THREE.Mesh(new THREE.SphereGeometry(r, opts.seg ?? 32, opts.seg ? opts.seg / 2 : 24), mat);
  m.castShadow = opts.cast ?? true;
  m.receiveShadow = opts.receive ?? true;
  return m;
}
export function torus(R, r, mat, opts = {}) {
  const m = new THREE.Mesh(new THREE.TorusGeometry(R, r, opts.rs ?? 16, opts.ts ?? 48, opts.arc ?? Math.PI * 2), mat);
  m.castShadow = opts.cast ?? true;
  m.receiveShadow = opts.receive ?? true;
  return m;
}
export function at(obj, x, y, z) {
  obj.position.set(x, y, z);
  return obj;
}
export function group(...children) {
  const g = new THREE.Group();
  for (const c of children) if (c) g.add(c);
  return g;
}

// Rounded box geometry (small, dependency-free).
export function roundedBoxGeo(w, h, d, r, seg = 3) {
  r = Math.min(r, w / 2 - 1e-4, h / 2 - 1e-4, d / 2 - 1e-4);
  const shape = new THREE.Shape();
  const x = -w / 2, y = -h / 2;
  shape.moveTo(x + r, y);
  shape.lineTo(x + w - r, y);
  shape.quadraticCurveTo(x + w, y, x + w, y + r);
  shape.lineTo(x + w, y + h - r);
  shape.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  shape.lineTo(x + r, y + h);
  shape.quadraticCurveTo(x, y + h, x, y + h - r);
  shape.lineTo(x, y + r);
  shape.quadraticCurveTo(x, y, x + r, y);
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: d - 2 * r, bevelEnabled: true, bevelThickness: r, bevelSize: 0, bevelSegments: seg, curveSegments: seg * 2,
  });
  geo.translate(0, 0, -(d - 2 * r) / 2);
  geo.computeVertexNormals();
  return geo;
}

// Fading polyline trail (RGBA vertex colors).
export function makeTrail(color, n = 600, opacity = 0.9) {
  const pos = new Float32Array(n * 3);
  const col = new Float32Array(n * 4);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 4));
  geo.setDrawRange(0, 0);
  const mat = new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false });
  const line = new THREE.Line(geo, mat);
  line.frustumCulled = false;
  line.renderOrder = 2;
  const c = new THREE.Color(color);
  let count = 0;
  const pts = [];
  let last = null;
  const api = {
    object: line,
    minStep: 0.002,
    push(x, y, z) {
      if (last && Math.hypot(x - last[0], y - last[1], z - last[2]) < api.minStep) return;
      last = [x, y, z];
      pts.push(last);
      if (pts.length > n) pts.shift();
      count = pts.length;
      for (let i = 0; i < count; i++) {
        const p = pts[i];
        pos[3 * i] = p[0]; pos[3 * i + 1] = p[1]; pos[3 * i + 2] = p[2];
        const a = Math.pow(i / Math.max(1, count - 1), 1.6) * opacity;
        col[4 * i] = c.r; col[4 * i + 1] = c.g; col[4 * i + 2] = c.b; col[4 * i + 3] = a;
      }
      geo.attributes.position.needsUpdate = true;
      geo.attributes.color.needsUpdate = true;
      geo.setDrawRange(0, count);
    },
    clear() {
      pts.length = 0;
      count = 0;
      last = null;
      geo.setDrawRange(0, 0);
    },
    dispose() { geo.dispose(); mat.dispose(); },
  };
  return api;
}

// Force / vector arrow: shaft + head, drawn from origin along a vector.
export function makeArrow(color, { shaft = 0.006, head = 0.018, headLen = 0.045 } = {}) {
  const mat = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.35, roughness: 0.4, metalness: 0.1, transparent: true, opacity: 0.95 });
  const s = new THREE.Mesh(new THREE.CylinderGeometry(shaft, shaft, 1, 12), mat);
  const h = new THREE.Mesh(new THREE.ConeGeometry(head, headLen, 16), mat);
  const g = new THREE.Group();
  g.add(s, h);
  s.castShadow = h.castShadow = false;
  const up = new THREE.Vector3(0, 1, 0);
  const dir = new THREE.Vector3();
  return {
    object: g,
    set(origin, vec, visibleMin = 1e-4) {
      const L = Math.hypot(vec[0], vec[1], vec[2]);
      if (L < visibleMin) { g.visible = false; return; }
      g.visible = true;
      g.position.set(origin[0], origin[1], origin[2]);
      dir.set(vec[0] / L, vec[1] / L, vec[2] / L);
      g.quaternion.setFromUnitVectors(up, dir);
      const hl = Math.min(headLen, L * 0.45);
      const sl = Math.max(1e-4, L - hl);
      s.scale.set(1, sl, 1);
      s.position.set(0, sl / 2, 0);
      h.scale.set(1, hl / headLen, 1);
      h.position.set(0, sl + hl / 2, 0);
    },
    dispose() { s.geometry.dispose(); h.geometry.dispose(); mat.dispose(); },
  };
}

// Target marker: flat ring with a soft disc, drawn in the xy plane.
export function makeTarget(color, r = 0.05) {
  const g = new THREE.Group();
  const ringMat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide });
  const discMat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.14, depthWrite: false, side: THREE.DoubleSide });
  const ring = new THREE.Mesh(new THREE.RingGeometry(r * 0.82, r, 48), ringMat);
  const disc = new THREE.Mesh(new THREE.CircleGeometry(r * 0.82, 48), discMat);
  const cross1 = new THREE.Mesh(new THREE.PlaneGeometry(r * 0.5, r * 0.06), ringMat);
  const cross2 = cross1.clone();
  cross2.rotation.z = Math.PI / 2;
  g.add(disc, ring, cross1, cross2);
  g.renderOrder = 3;
  return { object: g, ringMat, discMat };
}

// Thin line between two points (used for drag springs, cables...)
export function makeSegment(color, opacity = 1, dashed = false) {
  const geo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(0, 0, 1)]);
  const mat = dashed
    ? new THREE.LineDashedMaterial({ color, dashSize: 0.02, gapSize: 0.014, transparent: true, opacity, depthWrite: false })
    : new THREE.LineBasicMaterial({ color, transparent: true, opacity, depthWrite: false });
  const line = new THREE.Line(geo, mat);
  line.frustumCulled = false;
  line.renderOrder = 4;
  return {
    object: line,
    set(a, b) {
      const p = geo.attributes.position.array;
      p[0] = a[0]; p[1] = a[1]; p[2] = a[2]; p[3] = b[0]; p[4] = b[1]; p[5] = b[2];
      geo.attributes.position.needsUpdate = true;
      if (dashed) line.computeLineDistances();
    },
    dispose() { geo.dispose(); mat.dispose(); },
  };
}

// Canvas texture helper
export function canvasTexture(w, h, draw, opts = {}) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = opts.linear ? THREE.NoColorSpace : THREE.SRGBColorSpace;
  if (opts.repeat) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(opts.repeat[0], opts.repeat[1]);
  }
  t.anisotropy = 8;
  return t;
}

export function setQuat(obj, q) {
  obj.quaternion.set(q[1], q[2], q[3], q[0]);
}

export function disposeTree(obj) {
  obj.traverse((o) => {
    if (o.geometry) o.geometry.dispose();
    if (o.material) {
      const ms = Array.isArray(o.material) ? o.material : [o.material];
      for (const m of ms) {
        if (_mats && Object.values(_mats).includes(m)) continue;
        for (const k of ['map', 'normalMap', 'roughnessMap', 'emissiveMap', 'alphaMap']) if (m[k]) m[k].dispose();
        m.dispose();
      }
    }
  });
}
