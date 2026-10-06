// Double inverted pendulum on a cart (two uniform rods, absolute angles from
// upright). Lagrangian model:
//   M(q) q̈ = f(q, q̇) + Q,  q = [x, θ1, θ2]
//   M11 = M + m1 + m2,  M12 = (m1 l1 + m2 L1) cosθ1,  M13 = m2 l2 cosθ2
//   M22 = m1 l1² + m2 L1² + I1,  M23 = m2 L1 l2 cos(θ1 − θ2),  M33 = m2 l2² + I2
import { coulomb, softStop, qY, qI, wrap, solveInPlace } from './common.js';

const H0 = 0.34;

export default {
  id: 'doublependulum',
  name: 'Double Pendulum',
  category: 'Underactuated',
  level: 'Advanced',
  tagline: 'Two rods stacked on a cart: balance both upright with one force, or watch them go chaotic.',
  about:
    'Two uniform rods hinged in series on a cart. Six states, one input, two unstable modes: a linear quadratic regulator can hold both links upright, but only in a small region. With the controller off, the free double pendulum is a textbook chaotic system; tiny differences in the start grow exponentially.',
  dt: 0.0005,
  controlRate: 500,
  params: [
    { key: 'M', label: 'Cart mass', unit: 'kg', value: 1.5, min: 0.3, max: 6, step: 0.05 },
    { key: 'm1', label: 'Lower rod mass', unit: 'kg', value: 0.3, min: 0.02, max: 2, step: 0.01 },
    { key: 'L1', label: 'Lower rod length', unit: 'm', value: 0.5, min: 0.15, max: 1.2, step: 0.01 },
    { key: 'm2', label: 'Upper rod mass', unit: 'kg', value: 0.2, min: 0.02, max: 2, step: 0.01 },
    { key: 'L2', label: 'Upper rod length', unit: 'm', value: 0.42, min: 0.15, max: 1.2, step: 0.01 },
    { key: 'bc', label: 'Cart friction', unit: 'N·s/m', value: 0.4, min: 0, max: 5, step: 0.05 },
    { key: 'bj', label: 'Joint damping', unit: 'N·m·s', value: 0.0008, min: 0, max: 0.02, step: 0.0001 },
    { key: 'track', label: 'Track half-length', unit: 'm', value: 1.8, min: 0.5, max: 4, step: 0.05 },
    { key: 'g', label: 'Gravity', unit: 'm/s²', value: 9.81, min: 1, max: 25, step: 0.01 },
  ],
  geomParams: ['L1', 'L2', 'track'],
  derive(p) {
    p.l1 = p.L1 / 2;
    p.l2 = p.L2 / 2;
    p.I1 = (p.m1 * p.L1 * p.L1) / 12;
    p.I2 = (p.m2 * p.L2 * p.L2) / 12;
    p.Fc = 0.3;
    return p;
  },
  derivedParams: ['l1', 'l2', 'I1', 'I2'],
  states: [
    { key: 'x', label: 'Cart position', unit: 'm' },
    { key: 'th1', label: 'Lower rod angle', unit: 'rad' },
    { key: 'th2', label: 'Upper rod angle', unit: 'rad' },
    { key: 'xdot', label: 'Cart velocity', unit: 'm/s' },
    { key: 'th1dot', label: 'Lower rod rate', unit: 'rad/s' },
    { key: 'th2dot', label: 'Upper rod rate', unit: 'rad/s' },
  ],
  inputs: [{ key: 'F', label: 'Cart force', unit: 'N', min: -60, max: 60 }],
  refs: [{ key: 'x', label: 'Cart set-point', unit: 'm' }],
  noise: [0.0002, 0.0008, 0.0008, 0.004, 0.015, 0.015],
  quant: [2e-5, (2 * Math.PI) / 8192, (2 * Math.PI) / 8192, 0, 0, 0],
  qIdx: [0, 1, 2],
  qdIdx: [3, 4, 5],
  dragK: 30,
  dragMass: 0.4,
  dragFmax: 25,
  poke: { body: 'rod2', local: [0, 0, 0.42], f: [1.5, 0, 0], duration: 0.04 },
  deriv(t, s, u, p, ext, ds) {
    const t1 = s[1], t2 = s[2], xd = s[3], w1 = s[4], w2 = s[5];
    const c1 = Math.cos(t1), s1 = Math.sin(t1), c2 = Math.cos(t2), s2 = Math.sin(t2);
    const c12 = Math.cos(t1 - t2), s12 = Math.sin(t1 - t2);
    const a = p.m1 * p.l1 + p.m2 * p.L1, c = p.m2 * p.l2, d = p.m2 * p.L1 * p.l2;
    const J1 = p.m1 * p.l1 * p.l1 + p.m2 * p.L1 * p.L1 + p.I1, J2 = p.m2 * p.l2 * p.l2 + p.I2;
    const Mx = [
      [p.M + p.m1 + p.m2, a * c1, c * c2],
      [a * c1, J1, d * c12],
      [c * c2, d * c12, J2],
    ];
    const Fstop = p._model ? 0 : softStop(s[0], xd, -p.track, p.track, 3e4, 250);
    const Ffr = p._model ? 0 : coulomb(p.Fc, xd);
    const tj2 = -p.bj * (w2 - w1);
    const f = [
      u[0] - p.bc * xd - Ffr + Fstop + a * s1 * w1 * w1 + c * s2 * w2 * w2 + ext[0],
      -d * s12 * w2 * w2 + a * p.g * s1 - p.bj * w1 - tj2 + ext[1],
      d * s12 * w1 * w1 + c * p.g * s2 + tj2 + ext[2],
    ];
    solveInPlace(Mx, f, 3);
    ds[0] = xd;
    ds[1] = w1;
    ds[2] = w2;
    ds[3] = f[0];
    ds[4] = f[1];
    ds[5] = f[2];
  },
  energy(s, p) {
    const t1 = s[1], t2 = s[2], xd = s[3], w1 = s[4], w2 = s[5];
    const a = p.m1 * p.l1 + p.m2 * p.L1, c = p.m2 * p.l2, d = p.m2 * p.L1 * p.l2;
    const J1 = p.m1 * p.l1 * p.l1 + p.m2 * p.L1 * p.L1 + p.I1, J2 = p.m2 * p.l2 * p.l2 + p.I2;
    const T = 0.5 * (p.M + p.m1 + p.m2) * xd * xd + a * Math.cos(t1) * xd * w1 + c * Math.cos(t2) * xd * w2 + 0.5 * J1 * w1 * w1 + 0.5 * J2 * w2 * w2 + d * Math.cos(t1 - t2) * w1 * w2;
    return T + p.g * (a * Math.cos(t1) + c * Math.cos(t2));
  },
  equilibrium: () => ({ x: [0, 0, 0, 0, 0, 0], u: [0] }),
  bodies: ['cart', 'rod1', 'rod2'],
  pose(s, p, aux, body) {
    if (body === 'cart') return { p: [s[0], 0, H0], q: qI };
    if (body === 'rod1') return { p: [s[0], 0, H0], q: qY(s[1]) };
    return { p: [s[0] + p.L1 * Math.sin(s[1]), 0, H0 + p.L1 * Math.cos(s[1])], q: qY(s[2]) };
  },
  initialConditions: [
    { id: 'tilt', label: 'Upright, slightly bent', fn: () => [0, 0.06, -0.04, 0, 0, 0] },
    { id: 'upright', label: 'Exactly upright', fn: () => [0, 0, 0, 0, 0, 0] },
    { id: 'chaos', label: 'High release (chaos demo)', fn: () => [0, 2.3, 2.9, 0, 0, 0] },
    { id: 'down', label: 'Hanging down', fn: () => [0, Math.PI, Math.PI, 0, 0, 0] },
  ],
  refModes: [
    { id: 'hold', label: 'Hold position', params: [{ key: 'x', label: 'Set-point', unit: 'm', value: 0, min: -1.2, max: 1.2, step: 0.01 }], fn: (t, o) => [o.x] },
    {
      id: 'sine', label: 'Slow sine',
      smooth: true,
      params: [{ key: 'A', label: 'Amplitude', unit: 'm', value: 0.4, min: 0, max: 1, step: 0.05 }, { key: 'T', label: 'Period', unit: 's', value: 8, min: 3, max: 30, step: 0.5 }],
      fn: (t, o) => [o.A * Math.sin((2 * Math.PI * t) / o.T)],
    },
    {
      id: 'keys', label: 'Keyboard (← →)',
      params: [{ key: 'speed', label: 'Speed', unit: 'm/s', value: 0.3, min: 0.05, max: 1, step: 0.05 }],
      fn: (t, o, st, input, dt) => {
        st.x = Math.max(-1.2, Math.min(1.2, (st.x || 0) + input.axes[0] * o.speed * dt));
        return [st.x];
      },
    },
  ],
  keysHelp: ['← →', 'move the set-point'],
  trackError: (s, r) => s[0] - r[0],
  derived: [
    { key: 't1', label: 'Lower rod', unit: '°', fn: (s) => (wrap(s[1]) * 180) / Math.PI },
    { key: 't2', label: 'Upper rod', unit: '°', fn: (s) => (wrap(s[2]) * 180) / Math.PI },
  ],
  plots: [
    { title: 'Cart position', unit: 'm', series: [{ key: 'x.x', label: 'x' }, { key: 'r.x', label: 'set-point' }] },
    { title: 'Rod angles', unit: '°', series: [{ key: 'd.t1', label: 'θ1', wrap: 360 }, { key: 'd.t2', label: 'θ2', wrap: 360 }] },
    { title: 'Force', unit: 'N', series: [{ key: 'u.F', label: 'command' }, { key: 'ua.F', label: 'applied' }] },
  ],
  status(s, p) {
    if (Math.abs(s[0]) > p.track) return { level: 'warn', text: 'On end stop' };
    if (Math.abs(wrap(s[1])) < 0.2 && Math.abs(wrap(s[2])) < 0.2) return { level: 'ok', text: 'Both rods up' };
    return { level: 'info', text: 'Falling / swinging' };
  },
};
