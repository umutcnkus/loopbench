// Two-link robot arm moving in a vertical plane under gravity.
//   M(q) q̈ + C(q, q̇) q̇ + G(q) = τ − B q̇ − τ_coulomb + τ_limits + Jᵀ F_ext
// Link 1 carries the elbow motor; link 2 carries a payload at the tool point.
// Joint angles: q1 from horizontal, q2 relative to link 1 (both CCW, x→z).
import { qY, coulomb, softStop } from './common.js';

const HB = 0.95; // shoulder height

function linkParams(p) {
  const M1 = p.m1 + p.me;
  const c1 = (p.m1 * p.L1 * 0.5 + p.me * p.L1) / M1;
  const J1 = (p.m1 * p.L1 * p.L1) / 3 + p.me * p.L1 * p.L1; // about the shoulder
  const I1 = J1 - M1 * c1 * c1; // about its COM
  const M2 = p.m2 + p.mp;
  const c2 = (p.m2 * p.L2 * 0.5 + p.mp * p.L2) / M2;
  const J2 = (p.m2 * p.L2 * p.L2) / 3 + p.mp * p.L2 * p.L2; // about the elbow
  const I2 = J2 - M2 * c2 * c2;
  return { M1, c1, I1, M2, c2, I2 };
}
function massMatrix(q2, lp, L1) {
  const { M1, c1, I1, M2, c2, I2 } = lp;
  const c = Math.cos(q2);
  const m11 = I1 + M1 * c1 * c1 + I2 + M2 * (L1 * L1 + c2 * c2 + 2 * L1 * c2 * c);
  const m12 = I2 + M2 * (c2 * c2 + L1 * c2 * c);
  const m22 = I2 + M2 * c2 * c2;
  return [m11, m12, m22];
}
function bias(q, qd, lp, L1, g) {
  const { M1, c1, M2, c2 } = lp;
  const h = M2 * L1 * c2 * Math.sin(q[1]);
  const c1q = -h * (2 * qd[0] * qd[1] + qd[1] * qd[1]);
  const c2q = h * qd[0] * qd[0];
  const g1 = (M1 * c1 + M2 * L1) * g * Math.cos(q[0]) + M2 * c2 * g * Math.cos(q[0] + q[1]);
  const g2 = M2 * c2 * g * Math.cos(q[0] + q[1]);
  return [c1q + g1, c2q + g2];
}

export default {
  id: 'arm',
  name: 'Robot Arm',
  category: 'Manipulator',
  level: 'Intermediate',
  tagline: 'A two-link arm in a vertical plane: move the tool to targets with torque-controlled joints.',
  about:
    'Full rigid-body dynamics with configuration-dependent inertia, Coriolis and centrifugal torques and gravity. The elbow motor sits on link 1 and a payload hangs at the tool; change the payload without telling the controller to see what model error does. Joints have viscous and Coulomb friction, the elbow has soft limits at ±160°, and the arm lands on the floor if the torques are switched off.',
  dt: 0.001,
  controlRate: 500,
  params: [
    { key: 'L1', label: 'Upper arm length', unit: 'm', value: 0.5, min: 0.2, max: 0.8, step: 0.01 },
    { key: 'L2', label: 'Forearm length', unit: 'm', value: 0.42, min: 0.15, max: 0.8, step: 0.01 },
    { key: 'm1', label: 'Upper arm mass', unit: 'kg', value: 2.0, min: 0.3, max: 6, step: 0.05 },
    { key: 'm2', label: 'Forearm mass', unit: 'kg', value: 1.2, min: 0.2, max: 5, step: 0.05 },
    { key: 'me', label: 'Elbow motor mass', unit: 'kg', value: 0.6, min: 0, max: 3, step: 0.05 },
    { key: 'mp', label: 'Payload mass', unit: 'kg', value: 0.5, min: 0, max: 4, step: 0.05 },
    { key: 'b', label: 'Joint viscous friction', unit: 'N·m·s', value: 0.3, min: 0, max: 3, step: 0.05 },
    { key: 'fc', label: 'Joint Coulomb friction', unit: 'N·m', value: 0.5, min: 0, max: 5, step: 0.05 },
    { key: 'g', label: 'Gravity', unit: 'm/s²', value: 9.81, min: 0, max: 25, step: 0.01 },
  ],
  geomParams: ['L1', 'L2', 'mp'],
  derive(p) {
    p.lp = linkParams(p);
    return p;
  },
  derivedParams: ['lp'],
  states: [
    { key: 'q1', label: 'Shoulder angle', unit: 'rad' },
    { key: 'q2', label: 'Elbow angle', unit: 'rad' },
    { key: 'q1dot', label: 'Shoulder rate', unit: 'rad/s' },
    { key: 'q2dot', label: 'Elbow rate', unit: 'rad/s' },
  ],
  inputs: [
    { key: 'tau1', label: 'Shoulder torque', unit: 'N·m', min: -60, max: 60 },
    { key: 'tau2', label: 'Elbow torque', unit: 'N·m', min: -30, max: 30 },
  ],
  refs: [
    { key: 'x', label: 'Tool target x', unit: 'm' },
    { key: 'z', label: 'Tool target z', unit: 'm' },
  ],
  noise: [0.0002, 0.0002, 0.005, 0.005],
  quant: [(2 * Math.PI) / 20000, (2 * Math.PI) / 20000, 0, 0],
  qIdx: [0, 1],
  qdIdx: [2, 3],
  dragK: 120,
  dragMass: 1.5,
  dragFmax: 80,
  dist: { label: 'Force noise at the tool', unit: 'N', max: 20, step: 0.5, dims: 2, tau: 0.5, gust: 1 },
  poke: { body: 'link2', local: [0.42, 0, 0], f: [0, 0, -60], duration: 0.08 },
  deriv(t, s, u, p, ext, ds) {
    const q = [s[0], s[1]], qd = [s[2], s[3]];
    const lp = p.lp;
    const [m11, m12, m22] = massMatrix(q[1], lp, p.L1);
    const bq = bias(q, qd, lp, p.L1, p.g);
    let f1 = u[0] - bq[0] - p.b * qd[0] + ext[0];
    let f2 = u[1] - bq[1] - p.b * qd[1] + ext[1];
    if (!p._model) {
      f1 -= coulomb(p.fc, qd[0], 0.01);
      f2 -= coulomb(p.fc, qd[1], 0.01);
      f2 += softStop(q[1], qd[1], -2.8, 2.8, 400, 12);
      // floor contact at the elbow and tool (unilateral spring + friction)
      const c1 = Math.cos(q[0]), s1 = Math.sin(q[0]), c12 = Math.cos(q[0] + q[1]), s12 = Math.sin(q[0] + q[1]);
      const pts = [
        { z: HB + p.L1 * s1, J: [[-p.L1 * s1, 0], [p.L1 * c1, 0]] },
        { z: HB + p.L1 * s1 + p.L2 * s12, J: [[-p.L1 * s1 - p.L2 * s12, -p.L2 * s12], [p.L1 * c1 + p.L2 * c12, p.L2 * c12]] },
      ];
      for (const pt of pts) {
        if (pt.z > 0.03) continue;
        const vz = pt.J[1][0] * qd[0] + pt.J[1][1] * qd[1];
        const vx = pt.J[0][0] * qd[0] + pt.J[0][1] * qd[1];
        const N = Math.max(0, 8000 * (0.03 - pt.z) - 120 * vz);
        const Fx = -0.6 * N * Math.tanh(vx / 0.02);
        f1 += pt.J[0][0] * Fx + pt.J[1][0] * N;
        f2 += pt.J[0][1] * Fx + pt.J[1][1] * N;
      }
      // tool force disturbance (x, z)
      if (p._d) {
        const J = pts[1].J;
        f1 += J[0][0] * p._d[0] + J[1][0] * p._d[1];
        f2 += J[0][1] * p._d[0] + J[1][1] * p._d[1];
      }
    }
    const det = m11 * m22 - m12 * m12;
    ds[0] = qd[0];
    ds[1] = qd[1];
    ds[2] = (m22 * f1 - m12 * f2) / det;
    ds[3] = (m11 * f2 - m12 * f1) / det;
  },
  energy(s, p) {
    const [m11, m12, m22] = massMatrix(s[1], p.lp, p.L1);
    const T = 0.5 * (m11 * s[2] ** 2 + 2 * m12 * s[2] * s[3] + m22 * s[3] ** 2);
    const { M1, c1, M2, c2 } = p.lp;
    const V = p.g * (M1 * c1 * Math.sin(s[0]) + M2 * (p.L1 * Math.sin(s[0]) + c2 * Math.sin(s[0] + s[1])));
    return T + V;
  },
  equilibrium: () => ({ x: [0.6, -1.2, 0, 0], u: [0, 0] }),
  modelExtras(p) {
    const L1 = p.L1, L2 = p.L2;
    return {
      fk: (q) => [L1 * Math.cos(q[0]) + L2 * Math.cos(q[0] + q[1]), L1 * Math.sin(q[0]) + L2 * Math.sin(q[0] + q[1])],
      jacobian: (q) => {
        const s1 = Math.sin(q[0]), c1 = Math.cos(q[0]), s12 = Math.sin(q[0] + q[1]), c12 = Math.cos(q[0] + q[1]);
        return [[-L1 * s1 - L2 * s12, -L2 * s12], [L1 * c1 + L2 * c12, L2 * c12]];
      },
      jacobianDot: (q, qd) => {
        const s1 = Math.sin(q[0]), c1 = Math.cos(q[0]), s12 = Math.sin(q[0] + q[1]), c12 = Math.cos(q[0] + q[1]);
        const w1 = qd[0], w12 = qd[0] + qd[1];
        return [[-L1 * c1 * w1 - L2 * c12 * w12, -L2 * c12 * w12], [-L1 * s1 * w1 - L2 * s12 * w12, -L2 * s12 * w12]];
      },
      ik: (x, z, elbowUp = true) => {
        const r2 = x * x + z * z;
        let c2 = (r2 - L1 * L1 - L2 * L2) / (2 * L1 * L2);
        c2 = Math.max(-1, Math.min(1, c2));
        const q2 = (elbowUp ? 1 : -1) * -Math.acos(c2);
        const q1 = Math.atan2(z, x) - Math.atan2(L2 * Math.sin(q2), L1 + L2 * Math.cos(q2));
        return [q1, q2];
      },
      M: (q) => {
        const [a, b, c] = massMatrix(q[1], p.lp, L1);
        return [[a, b], [b, c]];
      },
      bias: (q, qd) => bias(q, qd, p.lp, L1, p.g),
      gravity: (q) => bias(q, [0, 0], p.lp, L1, p.g),
      reach: L1 + L2,
    };
  },
  modelDocs: [['fk'], ['ik'], ['jacobian'], ['jacobianDot'], ['M'], ['bias'], ['gravity'], ['reach']],
  bodies: ['link1', 'link2'],
  pose(s, p, aux, body) {
    if (body === 'link1') return { p: [0, 0, HB], q: qY(-s[0]) };
    return { p: [p.L1 * Math.cos(s[0]), 0, HB + p.L1 * Math.sin(s[0])], q: qY(-(s[0] + s[1])) };
  },
  initialConditions: [
    { id: 'ready', label: 'Ready pose', fn: () => [0.6, -1.2, 0, 0] },
    { id: 'hanging', label: 'Hanging down', fn: () => [-Math.PI / 2, 0, 0, 0] },
    { id: 'floor', label: 'Resting on the floor', fn: () => [-1.1, -0.35, 0, 0] },
    { id: 'up', label: 'Pointing straight up', fn: () => [Math.PI / 2, 0, 0, 0] },
  ],
  refModes: [
    {
      id: 'point', label: 'Reach a point',
      note: 'Drag the target sphere in the 3D view.',
      smooth: true,
      params: [
        { key: 'x', label: 'x', unit: 'm', value: 0.55, min: -0.85, max: 0.85, step: 0.01 },
        { key: 'z', label: 'z (above shoulder)', unit: 'm', value: 0.15, min: -0.85, max: 0.85, step: 0.01 },
      ],
      fn: (t, o) => [o.x, o.z],
    },
    {
      id: 'circle', label: 'Draw a circle',
      smooth: true,
      params: [
        { key: 'cx', label: 'Centre x', unit: 'm', value: 0.5, min: -0.6, max: 0.6, step: 0.01 },
        { key: 'cz', label: 'Centre z', unit: 'm', value: 0.1, min: -0.6, max: 0.6, step: 0.01 },
        { key: 'R', label: 'Radius', unit: 'm', value: 0.2, min: 0.02, max: 0.35, step: 0.01 },
        { key: 'T', label: 'Period', unit: 's', value: 3, min: 0.8, max: 12, step: 0.1 },
      ],
      fn: (t, o) => {
        const k = Math.min(1, t / 1.5);
        const e = k * k * (3 - 2 * k);
        const ph = (2 * Math.PI * t) / o.T;
        return [o.cx + o.R * e * Math.cos(ph), o.cz + o.R * e * Math.sin(ph)];
      },
    },
    {
      id: 'pick', label: 'Pick and place',
      smooth: true,
      params: [
        { key: 'T', label: 'Move time', unit: 's', value: 1.2, min: 0.3, max: 4, step: 0.05 },
        { key: 'dwell', label: 'Pause', unit: 's', value: 0.8, min: 0, max: 3, step: 0.05 },
      ],
      fn: (t, o) => {
        const pts = [[0.55, 0.15], [0.45, -0.55], [0.55, 0.15], [-0.2, 0.6], [-0.55, -0.4], [-0.2, 0.6]];
        const leg = o.T + o.dwell;
        const k = Math.floor(t / leg);
        const f = Math.min(1, (t - k * leg) / o.T);
        const a = pts[k % pts.length], b = pts[(k + 1) % pts.length];
        const e = f * f * f * (10 - 15 * f + 6 * f * f);
        return [a[0] + (b[0] - a[0]) * e, a[1] + (b[1] - a[1]) * e];
      },
    },
    {
      id: 'keys', label: 'Keyboard',
      params: [{ key: 'speed', label: 'Speed', unit: 'm/s', value: 0.4, min: 0.05, max: 1.5, step: 0.05 }],
      fn: (t, o, st, input, dt) => {
        if (st.x === undefined) { st.x = 0.55; st.z = 0.15; }
        st.x += input.axes[0] * o.speed * dt;
        st.z += input.axes[1] * o.speed * dt;
        const r = Math.hypot(st.x, st.z), R = 0.9;
        if (r > R) { st.x *= R / r; st.z *= R / r; }
        return [st.x, st.z];
      },
    },
  ],
  keysHelp: ['← →', 'target x', '↑ ↓', 'target z'],
  trackError(s, r, p) {
    const x = p.L1 * Math.cos(s[0]) + p.L2 * Math.cos(s[0] + s[1]);
    const z = p.L1 * Math.sin(s[0]) + p.L2 * Math.sin(s[0] + s[1]);
    return Math.hypot(x - r[0], z - r[1]);
  },
  derived: [
    { key: 'tx', label: 'Tool x', unit: 'm', fn: (s, p) => p.L1 * Math.cos(s[0]) + p.L2 * Math.cos(s[0] + s[1]) },
    { key: 'tz', label: 'Tool z', unit: 'm', fn: (s, p) => p.L1 * Math.sin(s[0]) + p.L2 * Math.sin(s[0] + s[1]) },
    { key: 'err', label: 'Tool error', unit: 'mm', fn: (s, p, a, r) => 1000 * Math.hypot(p.L1 * Math.cos(s[0]) + p.L2 * Math.cos(s[0] + s[1]) - r[0], p.L1 * Math.sin(s[0]) + p.L2 * Math.sin(s[0] + s[1]) - r[1]) },
  ],
  plots: [
    { title: 'Tool position', unit: 'm', series: [{ key: 'd.tx', label: 'x' }, { key: 'd.tz', label: 'z' }, { key: 'r.x', label: 'x target', ref: true, of: 'd.tx' }, { key: 'r.z', label: 'z target', ref: true, of: 'd.tz' }] },
    { title: 'Tracking error', unit: 'mm', series: [{ key: 'd.err', label: '|e|' }] },
    { title: 'Joint torques', unit: 'N·m', series: [{ key: 'ua.tau1', label: 'shoulder' }, { key: 'ua.tau2', label: 'elbow' }] },
  ],
  status(s, p, aux, r) {
    const e = this.trackError(s, r, p);
    const z = HB + p.L1 * Math.sin(s[0]) + p.L2 * Math.sin(s[0] + s[1]);
    if (z < 0.04) return { level: 'warn', text: 'Touching the floor' };
    if (e < 0.005) return { level: 'ok', text: 'On target' };
    return { level: 'info', text: `Error ${(e * 1000).toFixed(0)} mm` };
  },
};
