// Spacecraft attitude dynamics with three orthogonal reaction wheels and a
// reaction-control (thruster) torque. Body inertia includes products of inertia.
//   J ω̇ = −ω × (J ω + h) − (τ_w − friction) + τ_thr + τ_dist
//   ḣ   = τ_w − friction        (wheel momentum, saturates at ±h_max)
//   q̇   = ½ q ⊗ [0, ω]          (body → inertial)
// Without thrusters or disturbances the inertial angular momentum R(q)(Jω + h)
// is conserved exactly.
import { qmul } from './common.js';

function Jmat(p) {
  return [
    [p.Jx, p.Jxy, p.Jxz],
    [p.Jxy, p.Jy, p.Jyz],
    [p.Jxz, p.Jyz, p.Jz],
  ];
}
function inv3(M) {
  const [a, b, c] = M[0], [d, e, f] = M[1], [g, h, i] = M[2];
  const A = e * i - f * h, B = -(d * i - f * g), C = d * h - e * g;
  const det = a * A + b * B + c * C;
  return [
    [A / det, -(b * i - c * h) / det, (b * f - c * e) / det],
    [B / det, (a * i - c * g) / det, -(a * f - c * d) / det],
    [C / det, -(a * h - b * g) / det, (a * e - b * d) / det],
  ];
}
const mv = (M, v) => [M[0][0] * v[0] + M[0][1] * v[1] + M[0][2] * v[2], M[1][0] * v[0] + M[1][1] * v[1] + M[1][2] * v[2], M[2][0] * v[0] + M[2][1] * v[1] + M[2][2] * v[2]];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const fromEuler = (r, p, y) => {
  const cr = Math.cos(r / 2), sr = Math.sin(r / 2), cp = Math.cos(p / 2), sp = Math.sin(p / 2), cy = Math.cos(y / 2), sy = Math.sin(y / 2);
  return [cr * cp * cy + sr * sp * sy, sr * cp * cy - cr * sp * sy, cr * sp * cy + sr * cp * sy, cr * cp * sy - sr * sp * cy];
};
const D2R = Math.PI / 180;

export default {
  id: 'spacecraft',
  name: 'Satellite Attitude',
  category: 'Space',
  level: 'Advanced',
  tagline: 'Slew a 150 kg satellite with three reaction wheels, dump wheel momentum with thrusters.',
  about:
    'A rigid spacecraft with full inertia tensor (including products of inertia) in free space. Three reaction wheels exchange momentum with the body: they can turn it but not change its total angular momentum, and each wheel saturates at ±2 N·m·s. A constant solar-pressure torque slowly loads the wheels, so the thrusters must occasionally dump momentum. Thruster use is counted as propellant.',
  dt: 0.002,
  controlRate: 50,
  params: [
    { key: 'Jx', label: 'Inertia Jxx', unit: 'kg·m²', value: 42, min: 5, max: 200, step: 1 },
    { key: 'Jy', label: 'Inertia Jyy', unit: 'kg·m²', value: 36, min: 5, max: 200, step: 1 },
    { key: 'Jz', label: 'Inertia Jzz', unit: 'kg·m²', value: 48, min: 5, max: 200, step: 1 },
    { key: 'Jxy', label: 'Product of inertia Jxy', unit: 'kg·m²', value: 1.2, min: -5, max: 5, step: 0.1 },
    { key: 'Jxz', label: 'Product of inertia Jxz', unit: 'kg·m²', value: -0.8, min: -5, max: 5, step: 0.1 },
    { key: 'Jyz', label: 'Product of inertia Jyz', unit: 'kg·m²', value: 0.6, min: -5, max: 5, step: 0.1 },
    { key: 'hmax', label: 'Wheel momentum limit', unit: 'N·m·s', value: 2, min: 0.2, max: 10, step: 0.1 },
    { key: 'cw', label: 'Wheel bearing friction', unit: '1/s', value: 0.002, min: 0, max: 0.05, step: 0.001 },
  ],
  derive(p) {
    p.J = Jmat(p);
    p.Jinv = inv3(p.J);
    return p;
  },
  derivedParams: ['J', 'Jinv'],
  states: [
    { key: 'qw', label: 'Attitude qw', unit: '' },
    { key: 'qx', label: 'Attitude qx', unit: '' },
    { key: 'qy', label: 'Attitude qy', unit: '' },
    { key: 'qz', label: 'Attitude qz', unit: '' },
    { key: 'wx', label: 'Body rate x', unit: 'rad/s' },
    { key: 'wy', label: 'Body rate y', unit: 'rad/s' },
    { key: 'wz', label: 'Body rate z', unit: 'rad/s' },
    { key: 'hx', label: 'Wheel momentum x', unit: 'N·m·s' },
    { key: 'hy', label: 'Wheel momentum y', unit: 'N·m·s' },
    { key: 'hz', label: 'Wheel momentum z', unit: 'N·m·s' },
  ],
  inputs: [
    { key: 'tx', label: 'Wheel torque x', unit: 'N·m', min: -0.2, max: 0.2 },
    { key: 'ty', label: 'Wheel torque y', unit: 'N·m', min: -0.2, max: 0.2 },
    { key: 'tz', label: 'Wheel torque z', unit: 'N·m', min: -0.2, max: 0.2 },
    { key: 'rx', label: 'Thruster torque x', unit: 'N·m', min: -0.5, max: 0.5 },
    { key: 'ry', label: 'Thruster torque y', unit: 'N·m', min: -0.5, max: 0.5 },
    { key: 'rz', label: 'Thruster torque z', unit: 'N·m', min: -0.5, max: 0.5 },
  ],
  refs: [
    { key: 'qw', label: 'Target qw', unit: '' },
    { key: 'qx', label: 'Target qx', unit: '' },
    { key: 'qy', label: 'Target qy', unit: '' },
    { key: 'qz', label: 'Target qz', unit: '' },
  ],
  noise: [2e-5, 2e-5, 2e-5, 2e-5, 5e-5, 5e-5, 5e-5, 0.001, 0.001, 0.001],
  postMeasure(y) {
    const n = Math.hypot(y[0], y[1], y[2], y[3]) || 1;
    for (let i = 0; i < 4; i++) y[i] /= n;
  },
  nGen: 6,
  dragK: 8,
  dragMass: 40,
  dragFmax: 4,
  dist: { label: 'Solar pressure torque', unit: 'mN·m', max: 5, step: 0.05, dims: 3, bias: [0.6, -0.3, 0.45], gust: 0.15, tau: 30 },
  poke: { body: 'bus', local: [0, 1.6, 0], f: [0, 0, 1.2], duration: 0.3 },
  initAux: () => ({ impulse: 0 }),
  deriv(t, s, u, p, ext, ds) {
    const q = [s[0], s[1], s[2], s[3]], w = [s[4], s[5], s[6]], h = [s[7], s[8], s[9]];
    // wheels: commanded torque, cut when saturated, minus bearing friction
    const tw = [0, 0, 0];
    for (let i = 0; i < 3; i++) {
      let c = u[i];
      if ((h[i] >= p.hmax && c > 0) || (h[i] <= -p.hmax && c < 0)) c = 0;
      tw[i] = c - p.cw * h[i];
    }
    const d = p._d || [0, 0, 0];
    const tau = [0, 1, 2].map((i) => -tw[i] + (u[3 + i] || 0) + (d[i] || 0) * 1e-3 + ext[3 + i]);
    const H = mv(p.J, w);
    const gyro = cross(w, [H[0] + h[0], H[1] + h[1], H[2] + h[2]]);
    const wd = mv(p.Jinv, [tau[0] - gyro[0], tau[1] - gyro[1], tau[2] - gyro[2]]);
    const qd = qmul(q, [0, w[0], w[1], w[2]]);
    for (let i = 0; i < 4; i++) ds[i] = 0.5 * qd[i];
    ds[4] = wd[0]; ds[5] = wd[1]; ds[6] = wd[2];
    ds[7] = tw[0]; ds[8] = tw[1]; ds[9] = tw[2];
  },
  post(s, p, aux, dt, t, u) {
    const n = Math.hypot(s[0], s[1], s[2], s[3]) || 1;
    for (let i = 0; i < 4; i++) s[i] /= n;
    for (let i = 7; i < 10; i++) s[i] = Math.max(-p.hmax * 1.001, Math.min(p.hmax * 1.001, s[i]));
    if (u && dt) aux.impulse += (Math.abs(u[3]) + Math.abs(u[4]) + Math.abs(u[5])) * dt;
  },
  energy(s, p) {
    const w = [s[4], s[5], s[6]];
    const H = mv(p.J, w);
    return 0.5 * (w[0] * H[0] + w[1] * H[1] + w[2] * H[2]);
  },
  equilibrium: () => ({ x: [1, 0, 0, 0, 0, 0, 0, 0, 0, 0], u: [0, 0, 0, 0, 0, 0] }),
  bodies: ['bus'],
  pose(s) {
    return { p: [0, 0, 0], q: [s[0], s[1], s[2], s[3]] };
  },
  pointJac(s, p, aux, body, local) {
    const q = [s[0], s[1], s[2], s[3]];
    const rot = (v) => {
      const w = q[0], x = q[1], y = q[2], z = q[3];
      const tx = 2 * (y * v[2] - z * v[1]), ty = 2 * (z * v[0] - x * v[2]), tz = 2 * (x * v[1] - y * v[0]);
      return [v[0] + w * tx + (y * tz - z * ty), v[1] + w * ty + (z * tx - x * tz), v[2] + w * tz + (x * ty - y * tx)];
    };
    const rw = rot(local);
    const ww = rot([s[4], s[5], s[6]]);
    const v = cross(ww, rw);
    const J = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
    for (let k = 0; k < 3; k++) {
      const ek = [0, 0, 0];
      ek[k] = 1;
      J.push(rot(cross(ek, local)));
    }
    return { pos: rw, v, J };
  },
  initialConditions: [
    { id: 'offset', label: 'Pointing off by 70°', fn: () => [...fromEuler(40 * D2R, -30 * D2R, 50 * D2R), 0, 0, 0, 0, 0, 0] },
    { id: 'tumble', label: 'Tumbling after separation', fn: () => [1, 0, 0, 0, 0.12, -0.09, 0.15, 0, 0, 0] },
    { id: 'aligned', label: 'Aligned, wheels loaded', fn: () => [1, 0, 0, 0, 0, 0, 0, 1.5, -1.2, 0.8] },
  ],
  refModes: [
    {
      id: 'euler', label: 'Target attitude (roll / pitch / yaw)',
      params: [
        { key: 'roll', label: 'Roll', unit: '°', value: 0, min: -180, max: 180, step: 1 },
        { key: 'pitch', label: 'Pitch', unit: '°', value: 0, min: -89, max: 89, step: 1 },
        { key: 'yaw', label: 'Yaw', unit: '°', value: 0, min: -180, max: 180, step: 1 },
      ],
      fn: (t, o) => fromEuler(o.roll * D2R, o.pitch * D2R, o.yaw * D2R),
    },
    {
      id: 'sequence', label: 'Slew sequence',
      params: [{ key: 'T', label: 'Time per target', unit: 's', value: 40, min: 10, max: 120, step: 5 }],
      fn: (t, o) => {
        const seq = [[0, 0, 0], [0, 0, 90], [45, 30, 90], [0, -60, 0], [-90, 0, -45], [0, 0, 180]];
        const k = Math.floor(t / o.T) % seq.length;
        const e = seq[k];
        return fromEuler(e[0] * D2R, e[1] * D2R, e[2] * D2R);
      },
    },
    {
      id: 'scan', label: 'Slow scan (tracking)',
      smooth: true,
      params: [{ key: 'rate', label: 'Scan rate', unit: '°/s', value: 1.5, min: 0.1, max: 6, step: 0.1 }],
      fn: (t, o) => fromEuler(15 * D2R * Math.sin(t * 0.05), 20 * D2R * Math.sin(t * 0.03), o.rate * D2R * t),
    },
    {
      id: 'keys', label: 'Keyboard (rates)',
      params: [{ key: 'rate', label: 'Rate', unit: '°/s', value: 4, min: 0.5, max: 10, step: 0.5 }],
      fn: (t, o, st, input, dt) => {
        if (!st.q) st.q = [1, 0, 0, 0];
        const a = input.axes;
        const w = [a[0] * o.rate * D2R, a[1] * o.rate * D2R, a[3] * o.rate * D2R];
        const dq = qmul(st.q, [0, w[0], w[1], w[2]]);
        for (let i = 0; i < 4; i++) st.q[i] += 0.5 * dq[i] * dt;
        const n = Math.hypot(...st.q);
        st.q = st.q.map((x) => x / n);
        return st.q.slice();
      },
    },
  ],
  keysHelp: ['← →', 'roll', '↑ ↓', 'pitch', 'Q E', 'yaw'],
  trackError(s, r) {
    const d = Math.abs(s[0] * r[0] + s[1] * r[1] + s[2] * r[2] + s[3] * r[3]);
    return 2 * Math.acos(Math.min(1, d));
  },
  derived: [
    { key: 'err', label: 'Pointing error', unit: '°', fn: (s, p, a, r) => (2 * Math.acos(Math.min(1, Math.abs(s[0] * r[0] + s[1] * r[1] + s[2] * r[2] + s[3] * r[3]))) * 180) / Math.PI },
    { key: 'rate', label: 'Body rate', unit: '°/s', fn: (s) => (Math.hypot(s[4], s[5], s[6]) * 180) / Math.PI },
    { key: 'impulse', label: 'Thruster impulse', unit: 'N·m·s', fn: (s, p, a) => a.impulse },
  ],
  plots: [
    { title: 'Pointing error', unit: '°', series: [{ key: 'd.err', label: 'angle to target' }] },
    { title: 'Wheel momentum', unit: 'N·m·s', series: [{ key: 'x.hx', label: 'hx' }, { key: 'x.hy', label: 'hy' }, { key: 'x.hz', label: 'hz' }] },
    { title: 'Wheel torque', unit: 'N·m', series: [{ key: 'ua.tx', label: 'x' }, { key: 'ua.ty', label: 'y' }, { key: 'ua.tz', label: 'z' }] },
  ],
  status(s, p, aux, r) {
    const e = this.trackError(s, r) * 57.3;
    const sat = Math.max(Math.abs(s[7]), Math.abs(s[8]), Math.abs(s[9])) >= p.hmax * 0.999;
    if (sat) return { level: 'warn', text: 'Wheel saturated' };
    if (e < 0.5) return { level: 'ok', text: `On target (${e.toFixed(2)}°)` };
    return { level: 'info', text: `Slewing — ${e.toFixed(1)}° to go` };
  },
};
