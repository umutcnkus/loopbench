// Overhead gantry crane with a hoisted payload (3D spherical pendulum of
// variable length). Generalized coordinates q = [x, y, ℓ, θx, θy]:
//   bridge (M_b) moves in x, trolley (M_t) moves in x and y on the bridge,
//   the winch pays out cable length ℓ (reflected drum mass m_h),
//   payload position p = trolley + ℓ·(sinθx cosθy, sinθy, −cosθx cosθy).
// Exact Lagrangian dynamics for the point-mass payload via its Jacobian:
//   (D + m Jᵀ J) q̈ = Q_u + Jᵀ(F_gravity + F_drag + F_wind + F_floor) − m Jᵀ (J̇ q̇)
import { solveInPlace, softStop, qmul, qY, qX } from './common.js';

const HT = 3.0; // trolley rail height
const BOX = 0.3; // payload crate size

function geom(th1, th2) {
  const sx = Math.sin(th1), cx = Math.cos(th1), sy = Math.sin(th2), cy = Math.cos(th2);
  return {
    u: [sx * cy, sy, -cx * cy],
    ux: [cx * cy, 0, sx * cy],
    uy: [-sx * sy, cy, cx * sy],
    uxx: [-sx * cy, 0, cx * cy],
    uxy: [-cx * sy, 0, -sx * sy],
    uyy: [-sx * cy, -sy, cx * cy],
  };
}

export default {
  id: 'crane',
  name: 'Gantry Crane',
  category: 'Industrial',
  level: 'Intermediate',
  tagline: 'Move a hanging crate across the hall and set it down without letting it swing.',
  about:
    'A 3D overhead crane: the bridge runs along x, the trolley along y, and a winch sets the rope length. The crate is a spherical pendulum whose length you control, so its natural frequency changes as you hoist. Payload air drag, wind and a hard floor are included; the rope is modelled as rigid while in tension.',
  dt: 0.001,
  controlRate: 100,
  params: [
    { key: 'Mb', label: 'Bridge mass', unit: 'kg', value: 25, min: 5, max: 100, step: 1 },
    { key: 'Mt', label: 'Trolley mass', unit: 'kg', value: 8, min: 2, max: 40, step: 0.5 },
    { key: 'mh', label: 'Winch (reflected) mass', unit: 'kg', value: 4, min: 0.5, max: 20, step: 0.5 },
    { key: 'm', label: 'Payload mass', unit: 'kg', value: 10, min: 1, max: 40, step: 0.5 },
    { key: 'bx', label: 'Drive friction', unit: 'N·s/m', value: 6, min: 0, max: 50, step: 0.5 },
    { key: 'cp', label: 'Payload air drag', unit: 'N·s/m', value: 0.4, min: 0, max: 5, step: 0.05 },
    { key: 'g', label: 'Gravity', unit: 'm/s²', value: 9.81, min: 1, max: 25, step: 0.01 },
  ],
  derive(p) {
    p.bh = 0.3 * p.bx; // winch friction
    return p;
  },
  states: [
    { key: 'x', label: 'Bridge x', unit: 'm' },
    { key: 'y', label: 'Trolley y', unit: 'm' },
    { key: 'l', label: 'Rope length', unit: 'm' },
    { key: 'thx', label: 'Swing angle θx', unit: 'rad' },
    { key: 'thy', label: 'Swing angle θy', unit: 'rad' },
    { key: 'xdot', label: 'Bridge speed', unit: 'm/s' },
    { key: 'ydot', label: 'Trolley speed', unit: 'm/s' },
    { key: 'ldot', label: 'Hoist speed', unit: 'm/s' },
    { key: 'thxdot', label: 'Swing rate θ̇x', unit: 'rad/s' },
    { key: 'thydot', label: 'Swing rate θ̇y', unit: 'rad/s' },
  ],
  inputs: [
    { key: 'Fx', label: 'Bridge drive force', unit: 'N', min: -250, max: 250 },
    { key: 'Fy', label: 'Trolley drive force', unit: 'N', min: -150, max: 150 },
    { key: 'Fh', label: 'Hoist force (lift)', unit: 'N', min: 0, max: 600 },
  ],
  refs: [
    { key: 'x', label: 'Bridge target', unit: 'm' },
    { key: 'y', label: 'Trolley target', unit: 'm' },
    { key: 'l', label: 'Rope length target', unit: 'm' },
  ],
  noise: [0.001, 0.001, 0.001, 0.002, 0.002, 0.005, 0.005, 0.005, 0.01, 0.01],
  qIdx: [0, 1, 2, 3, 4],
  qdIdx: [5, 6, 7, 8, 9],
  dragK: 150,
  dragMass: 10,
  dragFmax: 150,
  dist: { label: 'Wind on the crate', unit: 'N', max: 30, step: 0.5, dims: 2, bias: [0.4, 0.25], gust: 0.8, tau: 1.5 },
  poke: { body: 'payload', local: [0, 0, 0], f: [60, 30, 0], duration: 0.1 },
  deriv(t, s, u, p, ext, ds) {
    const l = s[2], th1 = s[3], th2 = s[4];
    const qd = [s[5], s[6], s[7], s[8], s[9]];
    const G = geom(th1, th2);
    // payload Jacobian columns (3-vectors) for x, y, l, θx, θy
    const J = [[1, 0, 0], [0, 1, 0], G.u, G.ux.map((v) => v * l), G.uy.map((v) => v * l)];
    const m = p.m;
    const Mx = [];
    const diagM = [p.Mb + p.Mt, p.Mt, p.mh, 0, 0];
    for (let i = 0; i < 5; i++) {
      Mx.push(new Array(5));
      for (let j = 0; j < 5; j++) Mx[i][j] = m * (J[i][0] * J[j][0] + J[i][1] * J[j][1] + J[i][2] * J[j][2]) + (i === j ? diagM[i] : 0);
    }
    // payload velocity and velocity-product acceleration J̇ q̇
    const v = [0, 0, 0], a = [0, 0, 0];
    for (let k = 0; k < 3; k++) {
      for (let i = 0; i < 5; i++) v[k] += J[i][k] * qd[i];
      a[k] = 2 * qd[2] * (G.ux[k] * qd[3] + G.uy[k] * qd[4]) + l * (G.uxx[k] * qd[3] * qd[3] + 2 * G.uxy[k] * qd[3] * qd[4] + G.uyy[k] * qd[4] * qd[4]);
    }
    // external forces on the payload (world)
    const F = [-p.cp * v[0], -p.cp * v[1], -p.cp * v[2] - m * p.g];
    if (p._d) { F[0] += p._d[0] || 0; F[1] += p._d[1] || 0; }
    if (!p._model) {
      const zb = HT - 0.25 + l * G.u[2] - BOX / 2; // crate bottom height
      if (zb < 0) {
        const N = Math.max(0, 40000 * -zb - 800 * v[2]);
        const vt = Math.hypot(v[0], v[1]);
        const fr = vt > 1e-9 ? (0.6 * N * Math.tanh(vt / 0.02)) / vt : 0;
        F[0] -= fr * v[0];
        F[1] -= fr * v[1];
        F[2] += N;
      }
    }
    const rhs = new Array(5);
    for (let i = 0; i < 5; i++) {
      rhs[i] = J[i][0] * (F[0] - m * a[0]) + J[i][1] * (F[1] - m * a[1]) + J[i][2] * (F[2] - m * a[2]) + ext[i];
    }
    rhs[0] += u[0] - p.bx * qd[0];
    rhs[1] += u[1] - p.bx * qd[1];
    rhs[2] += -u[2] - p.bh * qd[2];
    if (!p._model) {
      rhs[0] += softStop(s[0], qd[0], -2.6, 2.6, 2e4, 2000);
      rhs[1] += softStop(s[1], qd[1], -1.3, 1.3, 2e4, 1000);
      rhs[2] += softStop(l, qd[2], 0.45, 2.75, 3e4, 1500);
    }
    solveInPlace(Mx, rhs, 5);
    for (let i = 0; i < 5; i++) { ds[i] = qd[i]; ds[5 + i] = rhs[i]; }
  },
  energy(s, p) {
    const G = geom(s[3], s[4]);
    const J = [[1, 0, 0], [0, 1, 0], G.u, G.ux.map((v) => v * s[2]), G.uy.map((v) => v * s[2])];
    const v = [0, 0, 0];
    for (let k = 0; k < 3; k++) for (let i = 0; i < 5; i++) v[k] += J[i][k] * s[5 + i];
    const T = 0.5 * (p.Mb + p.Mt) * s[5] ** 2 + 0.5 * p.Mt * s[6] ** 2 + 0.5 * p.mh * s[7] ** 2 + 0.5 * p.m * (v[0] ** 2 + v[1] ** 2 + v[2] ** 2);
    return T + p.m * p.g * (s[2] * G.u[2]);
  },
  equilibrium: (p) => ({ x: [0, 0, 1.5, 0, 0, 0, 0, 0, 0, 0], u: [0, 0, p.m * p.g] }),
  u0: (p) => [0, 0, p.m * p.g],
  bodies: ['bridge', 'trolley', 'payload'],
  pose(s, p, aux, body) {
    if (body === 'bridge') return { p: [s[0], 0, HT], q: [1, 0, 0, 0] };
    if (body === 'trolley') return { p: [s[0], s[1], HT], q: [1, 0, 0, 0] };
    const G = geom(s[3], s[4]);
    const l = s[2];
    // crate hangs from the hook; orient it along the rope
    return { p: [s[0] + l * G.u[0], s[1] + l * G.u[1], HT - 0.25 + l * G.u[2]], q: qmul(qY(-s[3]), qX(s[4])) };
  },
  initialConditions: [
    { id: 'rest', label: 'Hanging at the left bay', fn: () => [-1.6, -0.5, 1.6, 0, 0, 0, 0, 0, 0, 0] },
    { id: 'swing', label: 'Swinging hard', fn: () => [0, 0, 1.8, 0.45, 0.25, 0, 0, 0, 0, 0] },
    { id: 'floor', label: 'Crate on the floor', fn: () => [-1.6, -0.5, 2.62, 0, 0, 0, 0, 0, 0, 0] },
  ],
  refModes: [
    {
      id: 'pick', label: 'Pick and place cycle',
      smooth: true,
      params: [
        { key: 'T', label: 'Travel time', unit: 's', value: 6, min: 2, max: 20, step: 0.5 },
        { key: 'lift', label: 'Lift time', unit: 's', value: 3, min: 1, max: 10, step: 0.5 },
      ],
      fn: (t, o) => {
        const A = [-1.6, -0.5], B = [1.7, 0.6];
        const lo = 2.585, hi = 1.2;
        const seq = [
          [o.lift, (f) => [A[0], A[1], 1.6 + (hi - 1.6) * f]],
          [o.T, (f) => [A[0] + (B[0] - A[0]) * f, A[1] + (B[1] - A[1]) * f, hi]],
          [o.lift, (f) => [B[0], B[1], hi + (lo - hi) * f]],
          [1.5, () => [B[0], B[1], lo]],
          [o.lift, (f) => [B[0], B[1], lo + (hi - lo) * f]],
          [o.T, (f) => [B[0] + (A[0] - B[0]) * f, B[1] + (A[1] - B[1]) * f, hi]],
          [o.lift, (f) => [A[0], A[1], hi + (1.6 - hi) * f]],
          [1.5, () => [A[0], A[1], 1.6]],
        ];
        const total = seq.reduce((q, s) => q + s[0], 0);
        let tt = Math.max(0, t - 1) % total;
        for (const [d, fn] of seq) {
          if (tt <= d) {
            const f = tt / d;
            return fn(f * f * f * (10 - 15 * f + 6 * f * f));
          }
          tt -= d;
        }
        return seq[seq.length - 1][1](1);
      },
    },
    {
      id: 'point', label: 'Go to a point',
      note: 'Drag the target marker on the floor.',
      params: [
        { key: 'x', label: 'Bridge x', unit: 'm', value: 1.5, min: -2.4, max: 2.4, step: 0.05 },
        { key: 'y', label: 'Trolley y', unit: 'm', value: 0.5, min: -1.1, max: 1.1, step: 0.05 },
        { key: 'l', label: 'Rope length', unit: 'm', value: 1.6, min: 0.5, max: 2.6, step: 0.05 },
      ],
      fn: (t, o) => [o.x, o.y, o.l],
    },
    {
      id: 'keys', label: 'Keyboard',
      note: 'Arrows / WASD move the crane, R/F hoist up/down.',
      params: [{ key: 'speed', label: 'Speed', unit: 'm/s', value: 0.6, min: 0.1, max: 1.5, step: 0.05 }],
      fn: (t, o, st, input, dt, p, s0) => {
        if (st.x === undefined) { st.x = s0 ? s0[0] : 0; st.y = s0 ? s0[1] : 0; st.l = s0 ? s0[2] : 1.6; }
        st.x = Math.max(-2.4, Math.min(2.4, st.x + input.axes[0] * o.speed * dt));
        st.y = Math.max(-1.1, Math.min(1.1, st.y + input.axes[1] * o.speed * dt));
        st.l = Math.max(0.5, Math.min(2.6, st.l - input.axes[2] * o.speed * 0.6 * dt));
        return [st.x, st.y, st.l];
      },
    },
  ],
  keysHelp: ['← →', 'bridge', '↑ ↓', 'trolley', 'R F', 'hoist'],
  trackError(s, r) {
    return Math.hypot(s[0] + s[2] * Math.sin(s[3]) * Math.cos(s[4]) - r[0], s[1] + s[2] * Math.sin(s[4]) - r[1]);
  },
  derived: [
    { key: 'swing', label: 'Swing angle', unit: '°', fn: (s) => (Math.acos(Math.min(1, Math.cos(s[3]) * Math.cos(s[4]))) * 180) / Math.PI },
    { key: 'px', label: 'Crate x', unit: 'm', fn: (s) => s[0] + s[2] * Math.sin(s[3]) * Math.cos(s[4]) },
    { key: 'py', label: 'Crate y', unit: 'm', fn: (s) => s[1] + s[2] * Math.sin(s[4]) },
    { key: 'pz', label: 'Crate height', unit: 'm', fn: (s) => HT - 0.25 - s[2] * Math.cos(s[3]) * Math.cos(s[4]) - BOX / 2 },
  ],
  plots: [
    { title: 'Crate position', unit: 'm', series: [{ key: 'd.px', label: 'x' }, { key: 'd.py', label: 'y' }, { key: 'r.x', label: 'x target', ref: true, of: 'd.px' }, { key: 'r.y', label: 'y target', ref: true, of: 'd.py' }] },
    { title: 'Swing', unit: '°', series: [{ key: 'd.swing', label: 'rope angle from vertical' }] },
    { title: 'Drive forces', unit: 'N', series: [{ key: 'ua.Fx', label: 'bridge' }, { key: 'ua.Fy', label: 'trolley' }, { key: 'ua.Fh', label: 'hoist' }] },
  ],
  status(s, p) {
    const sw = Math.acos(Math.min(1, Math.cos(s[3]) * Math.cos(s[4])));
    const zb = HT - 0.25 - s[2] * Math.cos(s[3]) * Math.cos(s[4]) - BOX / 2;
    if (zb < 0.01) return { level: 'idle', text: 'Crate on the floor' };
    if (sw > 0.2) return { level: 'warn', text: `Swinging ${((sw * 180) / Math.PI).toFixed(0)}°` };
    if (Math.hypot(s[5], s[6]) < 0.02) return { level: 'ok', text: 'Holding' };
    return { level: 'info', text: 'Moving' };
  },
};
