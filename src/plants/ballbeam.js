// Ball rolling on a beam that a geared DC motor tilts about its centre.
// Ball centre sits a radius r above the beam axis; rolling without slipping
// gives the ball spin ω = α̇ − ẋ/r. Lagrangian with q = [x, α]:
//   T = ½m[(ẋ − rα̇)² + x²α̇²] + ½J_b(α̇ − ẋ/r)² + ½J α̇²
//   V = m g (x sinα + r cosα)
// Motor: τ = K_g k_t (V − K_g k_m α̇)/R.
import { coulomb, softStop, qY, wrap } from './common.js';

const HP = 0.34; // pivot height

export default {
  id: 'ballbeam',
  name: 'Ball & Beam',
  category: 'Mechatronics',
  level: 'Beginner',
  tagline: 'Roll a steel ball to a set-point along a motor-driven beam. The classic double-integrator lab.',
  about:
    'A 1 m beam pivots at its centre on a geared DC motor. The ball rolls without slipping, so its spin couples back into the beam dynamics, and the ball sits a radius above the pivot line. Ends have rubber bumpers. Input is the motor voltage, so back-EMF and gear friction are part of the plant.',
  dt: 0.0005,
  controlRate: 200,
  params: [
    { key: 'm', label: 'Ball mass', unit: 'kg', value: 0.11, min: 0.01, max: 0.5, step: 0.005 },
    { key: 'r', label: 'Ball radius', unit: 'm', value: 0.015, min: 0.005, max: 0.04, step: 0.001 },
    { key: 'L', label: 'Beam length', unit: 'm', value: 1.0, min: 0.4, max: 2, step: 0.05 },
    { key: 'Jbeam', label: 'Beam inertia', unit: 'kg·m²', value: 0.03, min: 0.005, max: 0.3, step: 0.001 },
    { key: 'Kg', label: 'Gear ratio', unit: '', value: 30, min: 5, max: 100, step: 1 },
    { key: 'Rm', label: 'Motor resistance', unit: 'Ω', value: 2.6, min: 0.5, max: 10, step: 0.1 },
    { key: 'kt', label: 'Motor torque constant', unit: 'N·m/A', value: 0.0077, min: 0.002, max: 0.05, step: 0.0001 },
    { key: 'bg', label: 'Gear friction', unit: 'N·m·s', value: 0.005, min: 0, max: 0.05, step: 0.001 },
    { key: 'crr', label: 'Rolling resistance', unit: '', value: 0.002, min: 0, max: 0.02, step: 0.0005 },
    { key: 'g', label: 'Gravity', unit: 'm/s²', value: 9.81, min: 1, max: 25, step: 0.01 },
  ],
  geomParams: ['L', 'r'],
  derive(p) {
    p.Jb = 0.4 * p.m * p.r * p.r;
    p.km = p.kt;
    p.xlim = p.L / 2 - 0.02 - p.r;
    return p;
  },
  derivedParams: ['Jb', 'km', 'xlim'],
  states: [
    { key: 'x', label: 'Ball position', unit: 'm' },
    { key: 'alpha', label: 'Beam angle', unit: 'rad' },
    { key: 'xdot', label: 'Ball velocity', unit: 'm/s' },
    { key: 'alphadot', label: 'Beam rate', unit: 'rad/s' },
  ],
  inputs: [{ key: 'V', label: 'Motor voltage', unit: 'V', min: -12, max: 12 }],
  refs: [{ key: 'x', label: 'Ball set-point', unit: 'm' }],
  noise: [0.0008, 0.0005, 0.01, 0.01],
  quant: [0.0005, (2 * Math.PI) / 4096, 0, 0],
  qIdx: [0, 1],
  qdIdx: [2, 3],
  dragK: 8,
  dragMass: 0.1,
  dragFmax: 3,
  dist: { label: 'Random push on the ball', unit: 'N', max: 0.2, step: 0.005, dims: 1, tau: 0.5, gust: 1 },
  poke: { body: 'ball', local: [0, 0, 0], f: [0.9, 0, 0], duration: 0.05 },
  deriv(t, s, u, p, ext, ds) {
    const x = s[0], al = s[1], xd = s[2], ad = s[3];
    const sa = Math.sin(al), ca = Math.cos(al);
    const m = p.m, r = p.r;
    const tau = (p.Kg * p.kt * (u[0] - p.Kg * p.km * ad)) / p.Rm - p.bg * ad;
    const Mxx = m + p.Jb / (r * r), Mxa = -m * r - p.Jb / r, Maa = m * r * r + m * x * x + p.Jb + p.Jbeam;
    let Qx = ext[0] + (p._d ? p._d[0] : 0);
    let Qa = tau + ext[1];
    if (!p._model) {
      Qx += -coulomb(p.crr * m * p.g, xd, 0.003) + softStop(x, xd, -p.xlim, p.xlim, 6000, 3);
      Qa += softStop(al, ad, -0.5, 0.5, 60, 1.5);
    }
    const f1 = Qx + m * x * ad * ad - m * p.g * sa;
    const f2 = Qa - 2 * m * x * xd * ad - m * p.g * (x * ca - r * sa);
    const det = Mxx * Maa - Mxa * Mxa;
    ds[0] = xd;
    ds[1] = ad;
    ds[2] = (Maa * f1 - Mxa * f2) / det;
    ds[3] = (Mxx * f2 - Mxa * f1) / det;
  },
  energy(s, p) {
    const x = s[0], al = s[1], xd = s[2], ad = s[3];
    const T = 0.5 * p.m * ((xd - p.r * ad) ** 2 + x * x * ad * ad) + 0.5 * p.Jb * (ad - xd / p.r) ** 2 + 0.5 * p.Jbeam * ad * ad;
    return T + p.m * p.g * (x * Math.sin(al) + p.r * Math.cos(al));
  },
  equilibrium: () => ({ x: [0, 0, 0, 0], u: [0] }),
  bodies: ['beam', 'ball'],
  pose(s, p, aux, body) {
    // beam angle α rotates +x upward: rotation about −y
    const q = qY(-s[1]);
    if (body === 'beam') return { p: [0, 0, HP], q };
    const c = Math.cos(s[1]), sn = Math.sin(s[1]);
    const off = p.r; // ball centre a radius above the rolling line through the pivot
    return { p: [s[0] * c - off * sn, 0, HP + s[0] * sn + off * c], q };
  },
  initialConditions: [
    { id: 'end', label: 'Ball at the left end', fn: (p) => [-p.xlim + 0.01, 0, 0, 0] },
    { id: 'center', label: 'Ball at the centre', fn: () => [0, 0, 0, 0] },
    { id: 'rolling', label: 'Ball rolling fast', fn: () => [0.2, 0, -0.6, 0] },
  ],
  refModes: [
    { id: 'hold', label: 'Hold a point', smooth: true, params: [{ key: 'x', label: 'Set-point', unit: 'm', value: 0.2, min: -0.4, max: 0.4, step: 0.01 }], fn: (t, o) => [o.x] },
    {
      id: 'square', label: 'Step back and forth',
      params: [{ key: 'A', label: 'Amplitude', unit: 'm', value: 0.25, min: 0, max: 0.4, step: 0.01 }, { key: 'T', label: 'Period', unit: 's', value: 10, min: 3, max: 30, step: 0.5 }],
      fn: (t, o) => [o.A * (Math.floor((2 * t) / o.T) % 2 === 0 ? 1 : -1)],
    },
    {
      id: 'sine', label: 'Sine',
      smooth: true,
      params: [{ key: 'A', label: 'Amplitude', unit: 'm', value: 0.25, min: 0, max: 0.4, step: 0.01 }, { key: 'T', label: 'Period', unit: 's', value: 8, min: 2, max: 30, step: 0.5 }],
      fn: (t, o) => [o.A * Math.sin((2 * Math.PI * t) / o.T)],
    },
    {
      id: 'keys', label: 'Keyboard (← →)',
      params: [{ key: 'speed', label: 'Speed', unit: 'm/s', value: 0.2, min: 0.05, max: 0.6, step: 0.01 }],
      fn: (t, o, st, input, dt) => {
        st.x = Math.max(-0.4, Math.min(0.4, (st.x || 0) + input.axes[0] * o.speed * dt));
        return [st.x];
      },
    },
  ],
  keysHelp: ['← →', 'move the set-point'],
  trackError: (s, r) => s[0] - r[0],
  derived: [
    { key: 'xcm', label: 'Ball', unit: 'cm', fn: (s) => s[0] * 100 },
    { key: 'rcm', label: 'Set-point', unit: 'cm', fn: (s, p, a, r) => r[0] * 100 },
    { key: 'aDeg', label: 'Beam angle', unit: '°', fn: (s) => (s[1] * 180) / Math.PI },
  ],
  plots: [
    { title: 'Ball position', unit: 'cm', series: [{ key: 'd.xcm', label: 'x' }, { key: 'd.rcm', label: 'set-point', ref: true, of: 'd.xcm' }] },
    { title: 'Beam angle', unit: '°', series: [{ key: 'd.aDeg', label: 'α' }] },
    { title: 'Motor', unit: 'V', series: [{ key: 'u.V', label: 'command' }, { key: 'ua.V', label: 'applied' }] },
  ],
  status(s, p, aux, r) {
    if (Math.abs(s[0]) >= p.xlim - 1e-3) return { level: 'warn', text: 'Ball at the end stop' };
    const e = Math.abs(s[0] - r[0]);
    if (e < 0.01 && Math.abs(s[2]) < 0.02) return { level: 'ok', text: 'On target' };
    return { level: 'info', text: `Error ${(e * 100).toFixed(1)} cm` };
  },
};
