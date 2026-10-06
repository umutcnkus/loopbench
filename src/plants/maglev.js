// Magnetic levitation of a steel ball under an electromagnet (Quanser MAGLEV class).
// x is the air gap (positive downward from the magnet face), i the coil current.
// Coil inductance depends on the gap, L(x) = L∞ + K_m/x, which gives both the
// force F = K_m i² / (2x²) and the motional back-EMF in the circuit:
//   m ẍ = m g − K_m i²/(2x²) + contact forces
//   L(x) di/dt = V − R i + (K_m / x²) ẋ i
// A flyback diode keeps the current non-negative.

const XMIN = 0.0005; // ball touching the magnet face (spacer)
const XPOST = 0.014; // ball resting on the post

// smooth transition from the starting gap to the set-point over the first 0.8 s
function liftoff(t, target, s0) {
  const x0 = s0 ? Math.min(XPOST, Math.max(0.002, s0[0])) : target;
  const f = Math.min(1, t / 0.8);
  const e = f * f * f * (10 - 15 * f + 6 * f * f);
  return x0 + (target - x0) * e;
}

export default {
  id: 'maglev',
  name: 'Magnetic Levitation',
  category: 'Electromechanical',
  level: 'Intermediate',
  tagline: 'Float a steel ball below an electromagnet. Open-loop unstable, nonlinear, and 50 ms fast.',
  about:
    'The magnetic force grows with the square of the current and falls with the square of the gap, so the ball either drops or snaps up to the magnet unless the controller acts within milliseconds. The coil is a 0.41 H inductor, so current cannot change instantly: most working designs close a fast current loop inside the position loop. The flyback diode prevents negative current.',
  dt: 0.00025,
  controlRate: 1000,
  params: [
    { key: 'm', label: 'Ball mass', unit: 'kg', value: 0.068, min: 0.02, max: 0.2, step: 0.001 },
    { key: 'Km', label: 'Force constant K_m', unit: 'N·m²/A²', value: 6.53e-5, min: 2e-5, max: 2e-4, step: 1e-6 },
    { key: 'L', label: 'Coil inductance (far)', unit: 'H', value: 0.4, min: 0.05, max: 1, step: 0.005 },
    { key: 'R', label: 'Coil + sense resistance', unit: 'Ω', value: 11, min: 2, max: 30, step: 0.1 },
    { key: 'Vmax', label: 'Supply voltage', unit: 'V', value: 24, min: 6, max: 48, step: 1 },
    { key: 'c', label: 'Air drag', unit: 'N·s/m', value: 0.002, min: 0, max: 0.05, step: 0.001 },
    { key: 'g', label: 'Gravity', unit: 'm/s²', value: 9.81, min: 1, max: 25, step: 0.01 },
  ],
  derive(p) {
    return p;
  },
  states: [
    { key: 'x', label: 'Air gap', unit: 'm' },
    { key: 'xdot', label: 'Ball velocity (down)', unit: 'm/s' },
    { key: 'i', label: 'Coil current', unit: 'A' },
  ],
  inputs: [{ key: 'V', label: 'Coil voltage', unit: 'V', min: -24, max: 24 }],
  refs: [{ key: 'x', label: 'Gap set-point', unit: 'm' }],
  noise: [2e-5, 0.004, 0.004],
  quant: [0.014 / 4096, 0, 0.001],
  qIdx: [0],
  qdIdx: [1],
  dragK: 60,
  dragMass: 0.07,
  dragFmax: 1.2,
  dist: { label: 'Vertical force noise', unit: 'N', max: 0.3, step: 0.005, dims: 1, tau: 0.2, gust: 1 },
  poke: { body: 'ball', local: [0, 0, 0], f: [0, 0, 0.9], duration: 0.02 },
  deriv(t, s, u, p, ext, ds) {
    const x = Math.max(s[0], 1e-4), xd = s[1], i = s[2];
    const V = Math.max(-p.Vmax, Math.min(p.Vmax, u[0]));
    const F = (p.Km * i * i) / (2 * x * x);
    let Fc = 0;
    if (!p._model) {
      if (s[0] < XMIN) Fc += Math.max(0, 2e6 * (XMIN - s[0]) - 400 * xd);
      if (s[0] > XPOST) Fc += Math.min(0, -2e6 * (s[0] - XPOST) - 400 * xd);
    }
    const fd = p._d ? p._d[0] : 0;
    ds[0] = xd;
    // ext[0] is the generalized force along +x (downward)
    ds[1] = (p.m * p.g - F + Fc - p.c * xd + ext[0] + fd) / p.m;
    const Lx = p.L + p.Km / x;
    let di = (V - p.R * i + (p.Km / (x * x)) * xd * i) / Lx;
    if (!p._model && i <= 0 && di < 0) di = 0; // flyback diode
    ds[2] = di;
  },
  post(s) {
    if (s[2] < 0) s[2] = 0;
  },
  energy(s, p) {
    // kinetic + gravity (x downward) + magnetic energy stored in the coil
    return 0.5 * p.m * s[1] ** 2 - p.m * p.g * s[0] + 0.5 * (p.L + p.Km / Math.max(s[0], 1e-4)) * s[2] ** 2;
  },
  equilibrium(p) {
    const x0 = 0.007;
    const i0 = x0 * Math.sqrt((2 * p.m * p.g) / p.Km);
    return { x: [x0, 0, i0], u: [p.R * i0] };
  },
  bodies: ['ball'],
  // world frame: magnet face at z = ZF; the ball centre is below by (gap + radius)
  pose(s) {
    return { p: [0, 0, 0.3 - s[0] - 0.0127], q: [1, 0, 0, 0] };
  },
  pointJac(s) {
    return { pos: [0, 0, 0.3 - s[0] - 0.0127], v: [0, 0, -s[1]], J: [[0, 0, -1]] };
  },
  initialConditions: [
    { id: 'post', label: 'Resting on the post', fn: () => [XPOST, 0, 0] },
    { id: 'float', label: 'Floating at 7 mm', fn: (p) => [0.007, 0, 0.007 * Math.sqrt((2 * p.m * p.g) / p.Km)] },
    { id: 'stuck', label: 'Stuck to the magnet', fn: () => [XMIN, 0, 0.6] },
  ],
  refModes: [
    { id: 'hold', label: 'Hold a gap', smooth: true, params: [{ key: 'mm', label: 'Gap', unit: 'mm', value: 7, min: 3, max: 12, step: 0.1 }], fn: (t, o, st, i, dt, p, s0) => [liftoff(t, o.mm * 1e-3, s0)] },
    {
      id: 'square', label: 'Jump between two gaps',
      params: [{ key: 'a', label: 'Low gap', unit: 'mm', value: 5.5, min: 3, max: 12, step: 0.1 }, { key: 'b', label: 'High gap', unit: 'mm', value: 8.5, min: 3, max: 12, step: 0.1 }, { key: 'T', label: 'Period', unit: 's', value: 3, min: 0.5, max: 10, step: 0.1 }],
      fn: (t, o, st, i, dt, p, s0) => [t < 1.5 ? liftoff(t, o.b * 1e-3, s0) : (Math.floor((2 * (t - 1.5)) / o.T) % 2 === 0 ? o.a : o.b) * 1e-3],
    },
    {
      id: 'sine', label: 'Bounce (sine)',
      smooth: true,
      params: [{ key: 'A', label: 'Amplitude', unit: 'mm', value: 2, min: 0, max: 4, step: 0.1 }, { key: 'f', label: 'Frequency', unit: 'Hz', value: 1, min: 0.1, max: 8, step: 0.1 }],
      fn: (t, o, st, i, dt, p, s0) => [liftoff(t, 0.007, s0) + o.A * 1e-3 * Math.sin(2 * Math.PI * o.f * t) * Math.min(1, t / 1.5)],
    },
    {
      id: 'keys', label: 'Keyboard (↑ ↓)',
      params: [{ key: 'rate', label: 'Speed', unit: 'mm/s', value: 3, min: 0.5, max: 15, step: 0.5 }],
      fn: (t, o, st, input, dt, p, s0) => {
        st.x = Math.max(3, Math.min(12, (st.x ?? 7) - input.axes[1] * o.rate * dt));
        return [t < 0.8 ? liftoff(t, st.x * 1e-3, s0) : st.x * 1e-3];
      },
    },
  ],
  keysHelp: ['↑ ↓', 'raise / lower the ball'],
  trackError: (s, r) => s[0] - r[0],
  derived: [
    { key: 'gapmm', label: 'Gap', unit: 'mm', fn: (s) => s[0] * 1000 },
    { key: 'refmm', label: 'Gap set-point', unit: 'mm', fn: (s, p, a, r) => r[0] * 1000 },
    { key: 'force', label: 'Magnetic force', unit: 'N', fn: (s, p) => (p.Km * s[2] ** 2) / (2 * Math.max(s[0], 1e-4) ** 2) },
    { key: 'weight', label: 'Ball weight', unit: 'N', fn: (s, p) => p.m * p.g },
  ],
  plots: [
    { title: 'Air gap', unit: 'mm', series: [{ key: 'd.gapmm', label: 'gap' }, { key: 'd.refmm', label: 'set-point', ref: true, of: 'd.gapmm' }] },
    { title: 'Coil current', unit: 'A', series: [{ key: 'x.i', label: 'current' }] },
    { title: 'Coil voltage', unit: 'V', series: [{ key: 'u.V', label: 'command' }, { key: 'ua.V', label: 'applied' }] },
  ],
  status(s) {
    if (s[0] >= XPOST - 1e-4) return { level: 'idle', text: 'On the post' };
    if (s[0] <= XMIN + 1e-4) return { level: 'fail', text: 'Stuck to the magnet' };
    if (Math.abs(s[1]) < 0.02) return { level: 'ok', text: 'Levitating' };
    return { level: 'info', text: 'Moving' };
  },
};
