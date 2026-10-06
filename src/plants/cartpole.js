// Inverted pendulum on a cart (Lagrangian model, uniform rod pole).
//   q = [x, θ]  θ = 0 upright, θ > 0 leans toward +x
//   (M+m) ẍ + m l cosθ θ̈ − m l sinθ θ̇² = F − b_c ẋ − F_c sgn(ẋ) + F_stop + Q_x
//   m l cosθ ẍ + (I + m l²) θ̈ − m g l sinθ = −b_p θ̇ + Q_θ
import { coulomb, softStop, qY, qI, wrap, smoothSquare } from './common.js';

const H0 = 0.32; // pivot height above floor (visual/world frame)

export default {
  id: 'cartpole',
  name: 'Cart-Pole',
  category: 'Underactuated',
  level: 'Intermediate',
  tagline: 'Swing a pendulum up from rest and balance it upright on a motorized cart.',
  about:
    'A uniform rod hinged to a cart on a finite track. The only actuator is the horizontal force on the cart, so the pole can only be controlled through the cart motion. The model includes viscous and Coulomb cart friction, pivot damping and compliant end stops.',
  dt: 0.001,
  controlRate: 200,
  params: [
    { key: 'M', label: 'Cart mass', unit: 'kg', value: 1.0, min: 0.2, max: 5, step: 0.05 },
    { key: 'm', label: 'Pole mass', unit: 'kg', value: 0.25, min: 0.02, max: 2, step: 0.01 },
    { key: 'L', label: 'Pole length', unit: 'm', value: 0.6, min: 0.15, max: 1.5, step: 0.01 },
    { key: 'bc', label: 'Cart viscous friction', unit: 'N·s/m', value: 0.3, min: 0, max: 5, step: 0.05 },
    { key: 'Fc', label: 'Cart Coulomb friction', unit: 'N', value: 0.2, min: 0, max: 3, step: 0.05 },
    { key: 'bp', label: 'Pivot damping', unit: 'N·m·s', value: 0.0015, min: 0, max: 0.05, step: 0.0005 },
    { key: 'track', label: 'Track half-length', unit: 'm', value: 1.2, min: 0.4, max: 3, step: 0.05 },
    { key: 'g', label: 'Gravity', unit: 'm/s²', value: 9.81, min: 1, max: 25, step: 0.01 },
  ],
  derive(p) {
    p.l = p.L / 2;
    p.I = (p.m * p.L * p.L) / 12;
    p.Jp = p.I + p.m * p.l * p.l;
    return p;
  },
  states: [
    { key: 'x', label: 'Cart position', unit: 'm' },
    { key: 'theta', label: 'Pole angle', unit: 'rad' },
    { key: 'xdot', label: 'Cart velocity', unit: 'm/s' },
    { key: 'thetadot', label: 'Pole rate', unit: 'rad/s' },
  ],
  inputs: [{ key: 'F', label: 'Motor force', unit: 'N', min: -25, max: 25 }],
  refs: [{ key: 'x', label: 'Cart position set-point', unit: 'm' }],
  noise: [0.0002, 0.001, 0.005, 0.02],
  quant: [2e-5, (2 * Math.PI) / 4096, 0, 0],
  qIdx: [0, 1],
  qdIdx: [2, 3],
  dragK: 40,
  dragMass: 0.3,
  dragFmax: 30,
  dist: { label: 'Wind gusts on pole', unit: 'N', max: 0.5, step: 0.01, dims: 1, tau: 0.8, gust: 1 },
  poke: { body: 'pole', local: [0, 0, 0.6], f: [2.5, 0, 0], duration: 0.05 },

  deriv(t, s, u, p, ext, ds) {
    const th = s[1], xd = s[2], thd = s[3];
    const sn = Math.sin(th), cs = Math.cos(th);
    const ml = p.m * p.l;
    // wind gust: horizontal force acting at the pole's centre of mass
    const fd = p._d ? p._d[0] : 0;
    const Fstop = p._model ? 0 : softStop(s[0], xd, -p.track, p.track, 2e4, 150);
    const Ffric = p._model ? 0 : coulomb(p.Fc, xd);
    const f1 = u[0] - p.bc * xd - Ffric + Fstop + ml * sn * thd * thd + ext[0] + fd;
    const f2 = ml * p.g * sn - p.bp * thd + ext[1] + fd * p.l * cs;
    const a11 = p.M + p.m, a12 = ml * cs, a22 = p.Jp;
    const det = a11 * a22 - a12 * a12;
    ds[0] = xd;
    ds[1] = thd;
    ds[2] = (a22 * f1 - a12 * f2) / det;
    ds[3] = (a11 * f2 - a12 * f1) / det;
  },
  energy(s, p) {
    const xd = s[2], thd = s[3], cs = Math.cos(s[1]);
    const T = 0.5 * (p.M + p.m) * xd * xd + p.m * p.l * cs * xd * thd + 0.5 * p.Jp * thd * thd;
    return T + p.m * p.g * p.l * cs;
  },
  equilibrium: () => ({ x: [0, 0, 0, 0], u: [0] }),
  bodies: ['cart', 'pole'],
  pose(s, p, aux, body) {
    if (body === 'cart') return { p: [s[0], 0, H0], q: qI };
    return { p: [s[0], 0, H0], q: qY(s[1]) };
  },
  initialConditions: [
    { id: 'down', label: 'Hanging down', fn: () => [0, Math.PI, 0, 0] },
    { id: 'tilt', label: 'Upright, tilted 8°', fn: () => [0, 0.14, 0, 0] },
    { id: 'upright', label: 'Exactly upright', fn: () => [0, 0, 0, 0] },
    { id: 'random', label: 'Random', fn: (p, rng) => [(rng.uniform() - 0.5), (rng.uniform() * 2 - 1) * Math.PI, 0, (rng.uniform() - 0.5) * 2] },
  ],
  refModes: [
    { id: 'hold', label: 'Hold position', params: [{ key: 'x', label: 'Set-point', unit: 'm', value: 0, min: -1, max: 1, step: 0.01 }], fn: (t, o) => [o.x] },
    {
      id: 'square', label: 'Step between points',
      params: [{ key: 'A', label: 'Amplitude', unit: 'm', value: 0.5, min: 0, max: 1, step: 0.05 }, { key: 'T', label: 'Period', unit: 's', value: 10, min: 2, max: 30, step: 0.5 }],
      fn: (t, o) => [t < 3 ? 0 : o.A * (Math.floor((2 * (t - 3)) / o.T) % 2 === 0 ? 1 : -1)],
    },
    {
      id: 'sine', label: 'Sine sweep',
      params: [{ key: 'A', label: 'Amplitude', unit: 'm', value: 0.4, min: 0, max: 1, step: 0.05 }, { key: 'T', label: 'Period', unit: 's', value: 6, min: 1, max: 30, step: 0.5 }],
      fn: (t, o) => [o.A * Math.sin((2 * Math.PI * t) / o.T)],
    },
    {
      id: 'keys', label: 'Keyboard (← →)',
      params: [{ key: 'speed', label: 'Speed', unit: 'm/s', value: 0.5, min: 0.1, max: 1.5, step: 0.05 }],
      fn: (t, o, st, input, dt) => {
        st.x = Math.max(-1, Math.min(1, (st.x || 0) + input.axes[0] * o.speed * dt));
        return [st.x];
      },
    },
  ],
  trackError: (s, r) => s[0] - r[0],
  derived: [
    { key: 'thetaDeg', label: 'Pole angle (wrapped)', unit: '°', fn: (s) => (wrap(s[1]) * 180) / Math.PI },
    { key: 'E', label: 'Pendulum energy', unit: 'J', fn: (s, p) => 0.5 * p.Jp * s[3] * s[3] + p.m * p.g * p.l * (Math.cos(s[1]) - 1) },
  ],
  plots: [
    { title: 'Cart position', unit: 'm', series: [{ key: 'x.x', label: 'x' }, { key: 'r.x', label: 'set-point' }] },
    { title: 'Pole angle', unit: '°', series: [{ key: 'd.thetaDeg', label: 'θ (wrapped)', wrap: 360 }] },
    { title: 'Motor force', unit: 'N', series: [{ key: 'u.F', label: 'command' }, { key: 'ua.F', label: 'applied' }] },
  ],
  status(s, p) {
    const a = Math.abs(wrap(s[1]));
    if (Math.abs(s[0]) > p.track) return { level: 'warn', text: 'On end stop' };
    if (a < 0.2 && Math.abs(s[3]) < 2) return { level: 'ok', text: 'Balancing' };
    if (a > 2.9 && Math.abs(s[3]) < 0.3) return { level: 'idle', text: 'Hanging' };
    return { level: 'info', text: 'Swinging' };
  },
};
