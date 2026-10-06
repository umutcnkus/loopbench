// Rotary inverted (Furuta) pendulum driven by a DC motor, parameters close to
// the Quanser QUBE-Servo 2. θ: arm angle, α: pendulum angle (0 = upright).
//   M(α) [θ̈ α̈]ᵀ = [τ − D_r θ̇ − 2J_p sα cα α̇ θ̇ + m_p L_r l_p sα α̇² ;
//                   −D_p α̇ + J_p sα cα θ̇² + m_p g l_p sα]
//   M = [[J_r + m_p L_r² + J_p sin²α, m_p L_r l_p cosα], [m_p L_r l_p cosα, J_p]]
//   τ = k_t (V − k_m θ̇) / R_m
import { wrap, qZ, qmul, qX } from './common.js';

const H = 0.128; // arm height above the floor (top of the QUBE body)

export default {
  id: 'furuta',
  name: 'Rotary Pendulum',
  category: 'Underactuated',
  level: 'Intermediate',
  tagline: 'A Furuta pendulum on a DC-motor arm (QUBE-Servo class): swing it up with ±10 V and balance it.',
  about:
    'The motor turns a horizontal arm; the pendulum swings freely in the plane perpendicular to the arm tip. The input is the motor voltage, so back-EMF damping and the 0.05 N·m stall torque are part of the physics. Coupling terms (centrifugal, Coriolis, gyroscopic) come from the full Lagrangian model.',
  dt: 0.0005,
  controlRate: 500,
  params: [
    { key: 'Rm', label: 'Motor resistance', unit: 'Ω', value: 8.4, min: 2, max: 20, step: 0.1 },
    { key: 'kt', label: 'Torque constant', unit: 'N·m/A', value: 0.042, min: 0.01, max: 0.1, step: 0.001 },
    { key: 'km', label: 'Back-EMF constant', unit: 'V·s/rad', value: 0.042, min: 0, max: 0.1, step: 0.001 },
    { key: 'Jr', label: 'Arm + rotor inertia', unit: 'kg·m²', value: 6.2e-5, min: 1e-5, max: 5e-4, step: 1e-6 },
    { key: 'Lr', label: 'Arm length', unit: 'm', value: 0.085, min: 0.04, max: 0.2, step: 0.001 },
    { key: 'mp', label: 'Pendulum mass', unit: 'kg', value: 0.024, min: 0.005, max: 0.1, step: 0.001 },
    { key: 'Lp', label: 'Pendulum length', unit: 'm', value: 0.129, min: 0.05, max: 0.4, step: 0.001 },
    { key: 'Dr', label: 'Arm damping', unit: 'N·m·s', value: 5e-4, min: 0, max: 0.005, step: 1e-5 },
    { key: 'Dp', label: 'Pendulum damping', unit: 'N·m·s', value: 3e-5, min: 0, max: 5e-4, step: 1e-6 },
    { key: 'g', label: 'Gravity', unit: 'm/s²', value: 9.81, min: 1, max: 25, step: 0.01 },
  ],
  geomParams: ['Lr', 'Lp'],
  derive(p) {
    p.lp = p.Lp / 2;
    p.Jp = (p.mp * p.Lp * p.Lp) / 3; // about the pivot
    return p;
  },
  derivedParams: ['lp', 'Jp'],
  states: [
    { key: 'theta', label: 'Arm angle', unit: 'rad' },
    { key: 'alpha', label: 'Pendulum angle', unit: 'rad' },
    { key: 'thetadot', label: 'Arm rate', unit: 'rad/s' },
    { key: 'alphadot', label: 'Pendulum rate', unit: 'rad/s' },
  ],
  inputs: [{ key: 'V', label: 'Motor voltage', unit: 'V', min: -10, max: 10 }],
  refs: [{ key: 'theta', label: 'Arm angle set-point', unit: 'rad' }],
  noise: [0, 0, 0.02, 0.05],
  quant: [(2 * Math.PI) / 2048, (2 * Math.PI) / 2048, 0, 0],
  qIdx: [0, 1],
  qdIdx: [2, 3],
  dragK: 4,
  dragMass: 0.01,
  dragFmax: 1.2,
  dist: { label: 'Torque noise on pendulum', unit: 'mN·m', max: 3, step: 0.05, dims: 1, tau: 0.3, gust: 1 },
  poke: { body: 'pend', local: [0, 0, 0.129], f: [0, 0.25, 0], duration: 0.03 },
  deriv(t, s, u, p, ext, ds) {
    const al = s[1], thd = s[2], ald = s[3];
    const sa = Math.sin(al), ca = Math.cos(al);
    const tau = (p.kt * (u[0] - p.km * thd)) / p.Rm;
    const c = p.mp * p.Lr * p.lp;
    const m11 = p.Jr + p.mp * p.Lr * p.Lr + p.Jp * sa * sa;
    const m12 = c * ca;
    const m22 = p.Jp;
    const td = p._d ? p._d[0] * 1e-3 : 0;
    const f1 = tau - p.Dr * thd - 2 * p.Jp * sa * ca * ald * thd + c * sa * ald * ald + ext[0];
    const f2 = -p.Dp * ald + p.Jp * sa * ca * thd * thd + p.mp * p.g * p.lp * sa + ext[1] + td;
    const det = m11 * m22 - m12 * m12;
    ds[0] = thd;
    ds[1] = ald;
    ds[2] = (m22 * f1 - m12 * f2) / det;
    ds[3] = (m11 * f2 - m12 * f1) / det;
  },
  energy(s, p) {
    const sa = Math.sin(s[1]), ca = Math.cos(s[1]);
    const T = 0.5 * (p.Jr + p.mp * p.Lr * p.Lr + p.Jp * sa * sa) * s[2] ** 2 + p.mp * p.Lr * p.lp * ca * s[2] * s[3] + 0.5 * p.Jp * s[3] ** 2;
    return T + p.mp * p.g * p.lp * ca;
  },
  equilibrium: () => ({ x: [0, 0, 0, 0], u: [0] }),
  bodies: ['arm', 'pend'],
  pose(s, p, aux, body) {
    const qa = qZ(s[0]);
    if (body === 'arm') return { p: [0, 0, H], q: qa };
    // pendulum frame: at the arm tip; local z along the rod, rotates about the arm (local x) by -α
    const c = Math.cos(s[0]), sn = Math.sin(s[0]);
    return { p: [p.Lr * c, p.Lr * sn, H], q: qmul(qa, qX(-s[1])) };
  },
  initialConditions: [
    { id: 'down', label: 'Hanging down', fn: () => [0, Math.PI, 0, 0] },
    { id: 'tilt', label: 'Upright, tilted 10°', fn: () => [0, 0.17, 0, 0] },
    { id: 'upright', label: 'Exactly upright', fn: () => [0, 0, 0, 0] },
    { id: 'spin', label: 'Arm spinning, pendulum down', fn: () => [0, Math.PI - 0.05, 6, 0] },
  ],
  refModes: [
    { id: 'hold', label: 'Hold arm angle', params: [{ key: 'deg', label: 'Arm set-point', unit: '°', value: 0, min: -180, max: 180, step: 1 }], fn: (t, o) => [(o.deg * Math.PI) / 180] },
    {
      id: 'square', label: 'Arm steps ±A',
      params: [{ key: 'A', label: 'Amplitude', unit: '°', value: 45, min: 0, max: 120, step: 1 }, { key: 'T', label: 'Period', unit: 's', value: 8, min: 2, max: 30, step: 0.5 }],
      fn: (t, o) => [t < 4 ? 0 : ((o.A * Math.PI) / 180) * (Math.floor((2 * (t - 4)) / o.T) % 2 === 0 ? 1 : -1)],
    },
    {
      id: 'sine', label: 'Arm sine',
      smooth: true,
      params: [{ key: 'A', label: 'Amplitude', unit: '°', value: 40, min: 0, max: 120, step: 1 }, { key: 'T', label: 'Period', unit: 's', value: 5, min: 1, max: 30, step: 0.5 }],
      fn: (t, o) => [((o.A * Math.PI) / 180) * Math.sin((2 * Math.PI * t) / o.T)],
    },
    {
      id: 'keys', label: 'Keyboard (← →)',
      params: [{ key: 'rate', label: 'Rate', unit: '°/s', value: 90, min: 10, max: 360, step: 5 }],
      fn: (t, o, st, input, dt) => {
        st.th = (st.th || 0) + ((input.axes[0] * o.rate * Math.PI) / 180) * dt;
        return [st.th];
      },
    },
  ],
  keysHelp: ['← →', 'turn the arm set-point'],
  trackError: (s, r) => s[0] - r[0],
  derived: [
    { key: 'alphaDeg', label: 'Pendulum angle (wrapped)', unit: '°', fn: (s) => (wrap(s[1]) * 180) / Math.PI },
    { key: 'thetaDeg', label: 'Arm angle', unit: '°', fn: (s) => (s[0] * 180) / Math.PI },
    { key: 'refDeg', label: 'Arm set-point', unit: '°', fn: (s, p, a, r) => (r[0] * 180) / Math.PI },
    { key: 'current', label: 'Motor current', unit: 'A', fn: (s, p, a, r, u) => (u[0] - p.km * s[2]) / p.Rm },
  ],
  plots: [
    { title: 'Arm angle', unit: '°', series: [{ key: 'd.thetaDeg', label: 'θ' }, { key: 'd.refDeg', label: 'set-point', ref: true, of: 'd.thetaDeg' }] },
    { title: 'Pendulum angle', unit: '°', series: [{ key: 'd.alphaDeg', label: 'α (wrapped)', wrap: 360 }] },
    { title: 'Motor', unit: 'V', series: [{ key: 'u.V', label: 'voltage cmd' }, { key: 'ua.V', label: 'applied' }] },
  ],
  status(s) {
    const a = Math.abs(wrap(s[1]));
    if (a < 0.25 && Math.abs(s[3]) < 3) return { level: 'ok', text: 'Balancing' };
    if (a > 2.9 && Math.abs(s[3]) < 0.4) return { level: 'idle', text: 'Hanging' };
    return { level: 'info', text: 'Swinging' };
  },
};
