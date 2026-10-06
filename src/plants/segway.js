// Two-wheeled self-balancing robot. Nonholonomic model (Kane's method) with
// generalized speeds v (axle speed), ψ̇ (yaw rate), φ̇ (pitch rate):
//   [a11 a13; a13 a33] [v̇; φ̈] = [b1; b3]
//   a11 = M + 2m_w + 2I_a/r²,  a13 = M l cosφ,  a33 = M l² + I₂
//   b1 = (τ_L+τ_R)/r + M l sinφ (φ̇² + ψ̇²)
//   b3 = M g l sinφ − (τ_L+τ_R) + (M l² + I₁ − I₃) sinφ cosφ ψ̇²
//   I_ψ ψ̈ = d/r (τ_R − τ_L) − M l sinφ v ψ̇ − 2 (M l² + I₁ − I₃) sinφ cosφ φ̇ ψ̇
// Wheels are driven by geared DC motors: τ = k_t (V − k_e ω_rel)/R − b ω_rel.

const r_ = (p) => p.r;

export default {
  id: 'segway',
  name: 'Balancing Robot',
  category: 'Mobile robot',
  level: 'Intermediate',
  tagline: 'A two-wheeled inverted pendulum that balances and drives around the floor on two geared DC motors.',
  about:
    'The body is a rigid box on two wheels that roll without slipping. The equations include the coupling between turning and pitching (centrifugal terms), the wheel inertias, and back-EMF of both 12 V gearmotors. Drive it with the keyboard using the default controller, or write your own.',
  dt: 0.001,
  controlRate: 200,
  params: [
    { key: 'Mb', label: 'Body mass', unit: 'kg', value: 1.2, min: 0.3, max: 5, step: 0.05 },
    { key: 'l', label: 'COM height above axle', unit: 'm', value: 0.11, min: 0.03, max: 0.4, step: 0.005 },
    { key: 'I2', label: 'Body pitch inertia', unit: 'kg·m²', value: 0.0071, min: 0.001, max: 0.08, step: 0.0005 },
    { key: 'mw', label: 'Wheel mass', unit: 'kg', value: 0.06, min: 0.01, max: 0.5, step: 0.01 },
    { key: 'r', label: 'Wheel radius', unit: 'm', value: 0.045, min: 0.02, max: 0.12, step: 0.001 },
    { key: 'd', label: 'Half track width', unit: 'm', value: 0.11, min: 0.05, max: 0.25, step: 0.005 },
    { key: 'kt', label: 'Motor torque constant', unit: 'N·m/A', value: 0.25, min: 0.05, max: 1, step: 0.01 },
    { key: 'R', label: 'Motor resistance', unit: 'Ω', value: 4, min: 0.5, max: 15, step: 0.1 },
    { key: 'bm', label: 'Gearbox friction', unit: 'N·m·s', value: 0.002, min: 0, max: 0.05, step: 0.0005 },
    { key: 'g', label: 'Gravity', unit: 'm/s²', value: 9.81, min: 1, max: 25, step: 0.01 },
  ],
  geomParams: ['r', 'd', 'l'],
  derive(p) {
    p.ke = p.kt; // SI: back-EMF constant equals torque constant
    p.I1 = p.I2 * 1.52; // roll inertia of the box-shaped body
    p.I3 = p.I2 * 0.62; // yaw inertia
    p.Ia = 0.5 * p.mw * p.r * p.r;
    p.Id = 0.25 * p.mw * p.r * p.r;
    p.a11 = p.Mb + 2 * p.mw + (2 * p.Ia) / (p.r * p.r);
    return p;
  },
  derivedParams: ['ke', 'I1', 'I3', 'Ia', 'Id', 'a11'],
  states: [
    { key: 'x', label: 'Position x', unit: 'm' },
    { key: 'y', label: 'Position y', unit: 'm' },
    { key: 'psi', label: 'Heading ψ', unit: 'rad' },
    { key: 'phi', label: 'Body pitch φ', unit: 'rad' },
    { key: 'v', label: 'Forward speed', unit: 'm/s' },
    { key: 'psidot', label: 'Yaw rate', unit: 'rad/s' },
    { key: 'phidot', label: 'Pitch rate', unit: 'rad/s' },
    { key: 'thL', label: 'Left wheel angle', unit: 'rad' },
    { key: 'thR', label: 'Right wheel angle', unit: 'rad' },
  ],
  inputs: [
    { key: 'VL', label: 'Left motor voltage', unit: 'V', min: -12, max: 12 },
    { key: 'VR', label: 'Right motor voltage', unit: 'V', min: -12, max: 12 },
  ],
  refs: [
    { key: 'v', label: 'Speed command', unit: 'm/s' },
    { key: 'psidot', label: 'Turn-rate command', unit: 'rad/s' },
  ],
  noise: [0.002, 0.002, 0.003, 0.002, 0.01, 0.01, 0.015, 0, 0],
  quant: [0, 0, 0, 0, 0, 0, 0, (2 * Math.PI) / 1320, (2 * Math.PI) / 1320],
  nGen: 3,
  dragK: 20,
  dragMass: 1,
  dragFmax: 15,
  dist: { label: 'Ground slope noise', unit: 'N', max: 3, step: 0.05, dims: 1, tau: 1.2, gust: 1 },
  poke: { body: 'body', local: [0, 0, 0.26], f: [6, 0, 0], duration: 0.06 },
  motorTorques(s, u, p) {
    const v = s[4], pd = s[5], phd = s[6];
    const wL = (v - p.d * pd) / p.r - phd, wR = (v + p.d * pd) / p.r - phd;
    const tL = (p.kt * (u[0] - p.ke * wL)) / p.R - p.bm * wL;
    const tR = (p.kt * (u[1] - p.ke * wR)) / p.R - p.bm * wR;
    return [tL, tR];
  },
  deriv(t, s, u, p, ext, ds) {
    const psi = s[2], phi = s[3], v = s[4], pd = s[5], phd = s[6];
    const [tL, tR] = this.motorTorques(s, u, p);
    const sp = Math.sin(phi), cp = Math.cos(phi);
    const Mb = p.Mb, l = p.l, r = p.r, d = p.d;
    const K = Mb * l * l + p.I1 - p.I3;
    // body resting on the floor when fallen (soft stop on pitch)
    let stop = 0;
    const lim = 1.45;
    if (!p._model && Math.abs(phi) > lim) stop = -Math.sign(phi) * (60 * (Math.abs(phi) - lim)) - 1.5 * phd;
    const slope = p._d ? p._d[0] : 0; // slope-like horizontal force on the axle
    const a11 = p.a11, a13 = Mb * l * cp, a33 = Mb * l * l + p.I2;
    const b1 = (tL + tR) / r + Mb * l * sp * (phd * phd + pd * pd) + ext[0] + slope;
    const b3 = Mb * p.g * l * sp - (tL + tR) + K * sp * cp * pd * pd + ext[2] + stop;
    const det = a11 * a33 - a13 * a13;
    const vdot = (a33 * b1 - a13 * b3) / det;
    const phdd = (a11 * b3 - a13 * b1) / det;
    const Ipsi = p.I3 * cp * cp + (p.I1 + Mb * l * l) * sp * sp + 2 * p.mw * d * d + 2 * p.Id + (2 * p.Ia * d * d) / (r * r);
    const pdd = ((d / r) * (tR - tL) - Mb * l * sp * v * pd - 2 * K * sp * cp * phd * pd + ext[1]) / Ipsi;
    ds[0] = v * Math.cos(psi);
    ds[1] = v * Math.sin(psi);
    ds[2] = pd;
    ds[3] = phd;
    ds[4] = vdot;
    ds[5] = pdd;
    ds[6] = phdd;
    ds[7] = (v - d * pd) / r;
    ds[8] = (v + d * pd) / r;
  },
  energy(s, p) {
    const phi = s[3], v = s[4], pd = s[5], phd = s[6];
    const sp = Math.sin(phi), cp = Math.cos(phi);
    const Ipsi = p.I3 * cp * cp + (p.I1 + p.Mb * p.l * p.l) * sp * sp + 2 * p.mw * p.d * p.d + 2 * p.Id + (2 * p.Ia * p.d * p.d) / (p.r * p.r);
    const T = 0.5 * p.a11 * v * v + p.Mb * p.l * cp * v * phd + 0.5 * (p.Mb * p.l * p.l + p.I2) * phd * phd + 0.5 * Ipsi * pd * pd;
    return T + p.Mb * p.g * p.l * cp;
  },
  equilibrium: () => ({ x: [0, 0, 0, 0, 0, 0, 0, 0, 0], u: [0, 0] }),
  bodies: ['body'],
  pose(s, p, aux, body) {
    const psi = s[2], phi = s[3];
    // heading about z, then pitch about the lateral axis (y)
    const cz = Math.cos(psi / 2), sz = Math.sin(psi / 2), cy = Math.cos(phi / 2), sy = Math.sin(phi / 2);
    const q = [cz * cy, -sz * sy, cz * sy, sz * cy];
    return { p: [s[0], s[1], r_(p)], q };
  },
  // generalized speeds (v, ψ̇, φ̇): partial velocities of a body point
  pointJac(s, p, aux, body, local) {
    const pose = this.pose(s, p, aux, body);
    const q = pose.q;
    const w = q[0], x = q[1], y = q[2], z = q[3];
    const rot = (v) => {
      const tx = 2 * (y * v[2] - z * v[1]), ty = 2 * (z * v[0] - x * v[2]), tz = 2 * (x * v[1] - y * v[0]);
      return [v[0] + w * tx + (y * tz - z * ty), v[1] + w * ty + (z * tx - x * tz), v[2] + w * tz + (x * ty - y * tx)];
    };
    const rw = rot(local);
    const pos = [pose.p[0] + rw[0], pose.p[1] + rw[1], pose.p[2] + rw[2]];
    const ef = [Math.cos(s[2]), Math.sin(s[2]), 0];
    const el = [-Math.sin(s[2]), Math.cos(s[2]), 0];
    const cr = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
    const J = [ef, cr([0, 0, 1], rw), cr(el, rw)];
    const v = [0, 1, 2].map((i) => J[0][i] * s[4] + J[1][i] * s[5] + J[2][i] * s[6]);
    return { pos, v, J };
  },
  initialConditions: [
    { id: 'tilt', label: 'Standing, tilted 6°', fn: () => [0, 0, 0, 0.1, 0, 0, 0, 0, 0] },
    { id: 'upright', label: 'Standing upright', fn: () => [0, 0, 0, 0, 0, 0, 0, 0, 0] },
    { id: 'kicked', label: 'Kicked while rolling', fn: () => [0, 0, 0.6, -0.15, 0.6, 1.2, 1.2, 0, 0] },
    { id: 'lying', label: 'Lying on the floor', fn: () => [0, 0, 0, 1.45, 0, 0, 0, 0, 0] },
  ],
  refModes: [
    { id: 'stand', label: 'Stand still', params: [], fn: () => [0, 0] },
    {
      id: 'keys', label: 'Keyboard drive',
      note: '↑/↓ (or W/S) speed, ←/→ (or A/D) turn.',
      params: [
        { key: 'vmax', label: 'Top speed', unit: 'm/s', value: 0.8, min: 0.1, max: 1.8, step: 0.05 },
        { key: 'wmax', label: 'Turn rate', unit: 'rad/s', value: 2.2, min: 0.2, max: 5, step: 0.1 },
      ],
      fn: (t, o, st, input, dt) => {
        const tv = input.axes[1] * o.vmax, tw = -input.axes[0] * o.wmax;
        st.v = (st.v || 0) + Math.max(-1.5 * dt, Math.min(1.5 * dt, tv - (st.v || 0)));
        st.w = (st.w || 0) + Math.max(-6 * dt, Math.min(6 * dt, tw - (st.w || 0)));
        return [st.v, st.w];
      },
    },
    {
      id: 'eight', label: 'Figure-eight cruise',
      smooth: true,
      params: [
        { key: 'v', label: 'Speed', unit: 'm/s', value: 0.5, min: 0.1, max: 1.5, step: 0.05 },
        { key: 'T', label: 'Period', unit: 's', value: 12, min: 4, max: 40, step: 0.5 },
      ],
      fn: (t, o) => {
        const k = Math.min(1, t / 2);
        const e = k * k * (3 - 2 * k);
        return [o.v * e, e * ((4 * Math.PI) / o.T) * Math.sin((2 * Math.PI * t) / o.T) * 1.2];
      },
    },
    {
      id: 'stopgo', label: 'Stop and go',
      params: [
        { key: 'v', label: 'Speed', unit: 'm/s', value: 0.5, min: 0.1, max: 1.5, step: 0.05 },
        { key: 'T', label: 'Period', unit: 's', value: 6, min: 2, max: 20, step: 0.5 },
      ],
      fn: (t, o) => [Math.floor(t / (o.T / 2)) % 2 === 1 ? o.v : 0, 0],
    },
  ],
  keysHelp: ['↑ ↓', 'speed', '← →', 'turn'],
  trackError: (s, r) => s[4] - r[0],
  derived: [
    { key: 'phiDeg', label: 'Pitch', unit: '°', fn: (s) => (s[3] * 180) / Math.PI },
    { key: 'dist', label: 'Distance from start', unit: 'm', fn: (s) => Math.hypot(s[0], s[1]) },
  ],
  plots: [
    { title: 'Speed', unit: 'm/s', series: [{ key: 'x.v', label: 'v' }, { key: 'r.v', label: 'command', ref: true, of: 'x.v' }, { key: 'x.psidot', label: 'ψ̇ (rad/s)' }, { key: 'r.psidot', label: 'ψ̇ command', ref: true, of: 'x.psidot' }] },
    { title: 'Body pitch', unit: '°', series: [{ key: 'd.phiDeg', label: 'φ' }] },
    { title: 'Motor voltages', unit: 'V', series: [{ key: 'ua.VL', label: 'left' }, { key: 'ua.VR', label: 'right' }] },
  ],
  status(s) {
    if (Math.abs(s[3]) > 1.3) return { level: 'fail', text: 'Fallen over' };
    if (Math.abs(s[4]) < 0.03 && Math.abs(s[3]) < 0.1) return { level: 'ok', text: 'Balancing' };
    return { level: 'info', text: 'Driving' };
  },
};
