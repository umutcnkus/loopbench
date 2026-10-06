// Ball on a two-axis tilting plate. The plate is tilted by two position servos
// (P loop with velocity limit + first-order velocity response). The ball rolls
// without slipping (solid sphere, effective mass 7/5 m) and feels gravity along
// the plate, centrifugal/Coriolis terms from the plate motion and rolling
// resistance. Past the edge it drops off and falls to the floor.
//   (1 + J/(m r²)) ẍ = gₓ + x α̇² + y α̇ β̇ − F_rr/m
//   (1 + J/(m r²)) ÿ = g_y + y β̇² + x α̇ β̇ − F_rr/m
// with plate orientation R = R_y(α) R_x(−β): gₓ = g sin α, g_y = g sin β cos α.
import { qmul, qY, qX } from './common.js';

const HP = 0.3; // plate pivot height
const TH = 0.006; // plate thickness

function plateQ(al, be) {
  return qmul(qY(al), qX(-be));
}
function rotq(q, v) {
  const w = q[0], x = q[1], y = q[2], z = q[3];
  const tx = 2 * (y * v[2] - z * v[1]), ty = 2 * (z * v[0] - x * v[2]), tz = 2 * (x * v[1] - y * v[0]);
  return [v[0] + w * tx + (y * tz - z * ty), v[1] + w * ty + (z * tx - x * tz), v[2] + w * tz + (x * ty - y * tx)];
}
function ballWorld(s, p) {
  const q = plateQ(s[4], s[5]);
  const r = rotq(q, [s[0], s[1], TH / 2 + p.r]);
  return [r[0], r[1], HP + r[2]];
}

export default {
  id: 'ballplate',
  name: 'Ball & Plate',
  category: 'Mechatronics',
  level: 'Beginner',
  tagline: 'Keep a steel ball on a servo-tilted plate and draw circles and figure eights with it.',
  about:
    'Two hobby-style position servos tilt the plate about x and y. Each servo is modelled as a proportional loop with a 6 rad/s speed limit and a 20 ms velocity lag, so there is real actuator dynamics between your command and the plate angle. The ball rolls without slipping; if it passes the edge it drops off and falls to the floor, and the touch panel reports NaN until you reset.',
  dt: 0.001,
  controlRate: 100,
  params: [
    { key: 'm', label: 'Ball mass', unit: 'kg', value: 0.26, min: 0.02, max: 1, step: 0.01 },
    { key: 'r', label: 'Ball radius', unit: 'm', value: 0.02, min: 0.008, max: 0.04, step: 0.001 },
    { key: 'hollow', label: 'Hollow ball (0 = solid, 1 = thin shell)', unit: '', value: 0, min: 0, max: 1, step: 1 },
    { key: 'a', label: 'Plate half-width', unit: 'm', value: 0.2, min: 0.1, max: 0.4, step: 0.005 },
    { key: 'Ks', label: 'Servo loop gain', unit: '1/s', value: 25, min: 5, max: 80, step: 1 },
    { key: 'vmax', label: 'Servo speed limit', unit: 'rad/s', value: 6, min: 1, max: 20, step: 0.1 },
    { key: 'ts', label: 'Servo velocity lag', unit: 's', value: 0.02, min: 0.002, max: 0.1, step: 0.001 },
    { key: 'crr', label: 'Rolling resistance', unit: '', value: 0.0015, min: 0, max: 0.03, step: 0.0005 },
    { key: 'g', label: 'Gravity', unit: 'm/s²', value: 9.81, min: 1, max: 25, step: 0.01 },
  ],
  geomParams: ['r', 'a'],
  derive(p) {
    p.J = (p.hollow >= 0.5 ? 2 / 3 : 2 / 5) * p.m * p.r * p.r;
    p.kappa = 1 + p.J / (p.m * p.r * p.r); // 7/5 for a solid sphere
    p.gain = p.g / p.kappa; // ẍ per radian of tilt (small angles)
    return p;
  },
  derivedParams: ['J', 'kappa', 'gain'],
  states: [
    { key: 'x', label: 'Ball x', unit: 'm' },
    { key: 'y', label: 'Ball y', unit: 'm' },
    { key: 'vx', label: 'Ball vx', unit: 'm/s' },
    { key: 'vy', label: 'Ball vy', unit: 'm/s' },
    { key: 'alpha', label: 'Plate tilt α (about y)', unit: 'rad' },
    { key: 'beta', label: 'Plate tilt β (about x)', unit: 'rad' },
    { key: 'alphadot', label: 'Tilt rate α̇', unit: 'rad/s' },
    { key: 'betadot', label: 'Tilt rate β̇', unit: 'rad/s' },
  ],
  inputs: [
    { key: 'alpha', label: 'Servo α command', unit: 'rad', min: -0.26, max: 0.26 },
    { key: 'beta', label: 'Servo β command', unit: 'rad', min: -0.26, max: 0.26 },
  ],
  refs: [
    { key: 'x', label: 'Target x', unit: 'm' },
    { key: 'y', label: 'Target y', unit: 'm' },
  ],
  noise: [0.0008, 0.0008, 0.01, 0.01, 0.0005, 0.0005, 0.01, 0.01],
  quant: [0.0002, 0.0002, 0, 0, 0.0015, 0.0015, 0, 0],
  measure(s, p, aux) {
    const y = Array.from(s);
    if (aux.mode !== 'plate') { y[0] = y[1] = y[2] = y[3] = NaN; }
    return y;
  },
  nGen: 2,
  dragK: 3,
  dragMass: 0.3,
  dragFmax: 2,
  dist: { label: 'Random push on ball', unit: 'N', max: 0.3, step: 0.005, dims: 2, tau: 0.4, gust: 1 },
  poke: (s, p, aux, rng) => {
    const a = rng.uniform() * Math.PI * 2;
    return { body: 'ball', local: [0, 0, 0], f: [0.9 * Math.cos(a), 0.9 * Math.sin(a), 0], duration: 0.08 };
  },
  initAux: () => ({ mode: 'plate', pw: null, vw: null, spin: [0, 0] }),
  deriv(t, s, u, p, ext, ds, aux) {
    const al = s[4], be = s[5], ald = s[6], bed = s[7];
    // servos
    for (let i = 0; i < 2; i++) {
      const vc = Math.max(-p.vmax, Math.min(p.vmax, p.Ks * (u[i] - s[4 + i])));
      ds[4 + i] = s[6 + i];
      ds[6 + i] = (vc - s[6 + i]) / p.ts;
    }
    if (aux && aux.mode !== 'plate') { ds[0] = ds[1] = ds[2] = ds[3] = 0; return; }
    const x = s[0], y = s[1], vx = s[2], vy = s[3];
    const gx = p.g * Math.sin(al), gy = p.g * Math.sin(be) * Math.cos(al);
    const v = Math.hypot(vx, vy);
    const rr = p._model ? 0 : p.crr * p.g * Math.tanh(v / 0.002);
    const rx = v > 1e-9 ? (rr * vx) / v : 0, ry = v > 1e-9 ? (rr * vy) / v : 0;
    const fd = p._d || [0, 0];
    ds[0] = vx;
    ds[1] = vy;
    ds[2] = (gx + x * ald * ald + y * ald * bed + (ext[0] + (fd[0] || 0)) / p.m) / p.kappa - rx;
    ds[3] = (gy + y * bed * bed + x * ald * bed + (ext[1] + (fd[1] || 0)) / p.m) / p.kappa - ry;
  },
  post(s, p, aux, dt) {
    if (!dt) return;
    if (aux.mode === 'plate') {
      aux.spin[0] += (s[2] / p.r) * dt;
      aux.spin[1] += (s[3] / p.r) * dt;
      if (Math.abs(s[0]) > p.a || Math.abs(s[1]) > p.a) {
        // leave the plate: switch to free flight in world coordinates
        const pw = ballWorld(s, p);
        const h = 1e-4;
        const s2 = Array.from(s);
        s2[0] += s[2] * h; s2[1] += s[3] * h; s2[4] += s[6] * h; s2[5] += s[7] * h;
        const pw2 = ballWorld(s2, p);
        aux.mode = 'air';
        aux.pw = pw;
        aux.vw = [(pw2[0] - pw[0]) / h, (pw2[1] - pw[1]) / h, (pw2[2] - pw[2]) / h];
      }
      return;
    }
    // free flight + floor contact (restitution, rolling friction)
    const pw = aux.pw, vw = aux.vw;
    vw[2] -= p.g * dt;
    for (let i = 0; i < 3; i++) pw[i] += vw[i] * dt;
    if (pw[2] < p.r) {
      pw[2] = p.r;
      if (vw[2] < -0.3) vw[2] = -0.45 * vw[2];
      else vw[2] = 0;
      aux.mode = Math.abs(vw[2]) < 1e-9 ? 'floor' : 'air';
      const f = Math.exp(-dt * 0.6);
      vw[0] *= f; vw[1] *= f;
    }
    aux.spin[0] += (vw[0] / p.r) * dt;
    aux.spin[1] += (vw[1] / p.r) * dt;
  },
  energy(s, p) {
    // plate held fixed: kinetic + potential along the plate
    const gx = p.g * Math.sin(s[4]), gy = p.g * Math.sin(s[5]) * Math.cos(s[4]);
    return 0.5 * p.m * p.kappa * (s[2] ** 2 + s[3] ** 2) - p.m * (gx * s[0] + gy * s[1]);
  },
  equilibrium: () => ({ x: [0, 0, 0, 0, 0, 0, 0, 0], u: [0, 0] }),
  bodies: ['plate', 'ball'],
  pose(s, p, aux, body) {
    if (body === 'plate') return { p: [0, 0, HP], q: plateQ(s[4], s[5]) };
    if (aux && aux.mode !== 'plate' && aux.pw) return { p: aux.pw.slice(), q: [1, 0, 0, 0] };
    return { p: ballWorld(s, p), q: plateQ(s[4], s[5]) };
  },
  pointJac(s, p, aux, body, local) {
    const pos = this.pose(s, p, aux, 'ball').p;
    if (aux.mode !== 'plate') return { pos, v: [0, 0, 0], J: [[0, 0, 0], [0, 0, 0]] };
    const q = plateQ(s[4], s[5]);
    const ex = rotq(q, [1, 0, 0]), ey = rotq(q, [0, 1, 0]);
    const v = [ex[0] * s[2] + ey[0] * s[3], ex[1] * s[2] + ey[1] * s[3], ex[2] * s[2] + ey[2] * s[3]];
    return { pos, v, J: [ex, ey] };
  },
  initialConditions: [
    { id: 'offset', label: 'Ball resting off-centre', fn: () => [0.12, -0.09, 0, 0, 0, 0, 0, 0] },
    { id: 'center', label: 'Ball at the centre', fn: () => [0, 0, 0, 0, 0, 0, 0, 0] },
    { id: 'rolling', label: 'Ball rolling fast', fn: () => [-0.15, 0.12, 0.35, -0.12, 0, 0, 0, 0] },
    { id: 'tilted', label: 'Plate tilted, ball at edge', fn: () => [0.17, 0.0, 0, 0, 0.12, 0, 0, 0] },
  ],
  refModes: [
    {
      id: 'point', label: 'Hold a point',
      note: 'Click and drag the ring on the plate to move the target.',
      params: [
        { key: 'x', label: 'x', unit: 'm', value: 0, min: -0.18, max: 0.18, step: 0.005 },
        { key: 'y', label: 'y', unit: 'm', value: 0, min: -0.18, max: 0.18, step: 0.005 },
      ],
      fn: (t, o) => [o.x, o.y],
    },
    {
      id: 'circle', label: 'Circle',
      smooth: true,
      params: [
        { key: 'R', label: 'Radius', unit: 'm', value: 0.1, min: 0.02, max: 0.17, step: 0.005 },
        { key: 'T', label: 'Period', unit: 's', value: 5, min: 2, max: 20, step: 0.5 },
      ],
      fn: (t, o) => {
        const k = Math.min(1, t / 2);
        const ramp = k * k * (3 - 2 * k);
        const ph = (2 * Math.PI * t) / o.T;
        return [o.R * ramp * Math.cos(ph), o.R * ramp * Math.sin(ph)];
      },
    },
    {
      id: 'eight', label: 'Figure eight',
      smooth: true,
      params: [
        { key: 'A', label: 'Size', unit: 'm', value: 0.13, min: 0.03, max: 0.17, step: 0.005 },
        { key: 'T', label: 'Period', unit: 's', value: 8, min: 3, max: 25, step: 0.5 },
      ],
      fn: (t, o) => {
        const k = Math.min(1, t / 2);
        const ramp = k * k * (3 - 2 * k);
        const ph = (2 * Math.PI * t) / o.T;
        return [o.A * ramp * Math.sin(ph), 0.6 * o.A * ramp * Math.sin(2 * ph)];
      },
    },
    {
      id: 'square', label: 'Square (smooth corners)',
      smooth: true,
      params: [
        { key: 'S', label: 'Half side', unit: 'm', value: 0.11, min: 0.03, max: 0.17, step: 0.005 },
        { key: 'leg', label: 'Time per side', unit: 's', value: 2.5, min: 0.8, max: 8, step: 0.1 },
      ],
      fn: (t, o) => {
        const c = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
        const k = Math.floor(t / o.leg);
        const f = t / o.leg - k;
        const a = c[k % 4], b = c[(k + 1) % 4];
        const e = f * f * f * (10 - 15 * f + 6 * f * f);
        const ramp = Math.min(1, t / 1.5);
        const sm = ramp * ramp * (3 - 2 * ramp);
        return [o.S * sm * (a[0] + (b[0] - a[0]) * e), o.S * sm * (a[1] + (b[1] - a[1]) * e)];
      },
    },
    {
      id: 'keys', label: 'Keyboard',
      params: [{ key: 'speed', label: 'Speed', unit: 'm/s', value: 0.12, min: 0.02, max: 0.4, step: 0.01 }],
      fn: (t, o, st, input, dt) => {
        st.x = Math.max(-0.17, Math.min(0.17, (st.x || 0) + input.axes[0] * o.speed * dt));
        st.y = Math.max(-0.17, Math.min(0.17, (st.y || 0) + input.axes[1] * o.speed * dt));
        return [st.x, st.y];
      },
    },
  ],
  keysHelp: ['← →', 'target x', '↑ ↓', 'target y'],
  trackError: (s, r, p, aux) => (aux.mode === 'plate' ? Math.hypot(s[0] - r[0], s[1] - r[1]) : NaN),
  derived: [
    { key: 'xmm', label: 'x', unit: 'mm', fn: (s, p, a) => (a.mode === 'plate' ? s[0] * 1000 : NaN) },
    { key: 'ymm', label: 'y', unit: 'mm', fn: (s, p, a) => (a.mode === 'plate' ? s[1] * 1000 : NaN) },
    { key: 'rxmm', label: 'x target', unit: 'mm', fn: (s, p, a, r) => r[0] * 1000 },
    { key: 'rymm', label: 'y target', unit: 'mm', fn: (s, p, a, r) => r[1] * 1000 },
    { key: 'aDeg', label: 'α', unit: '°', fn: (s) => (s[4] * 180) / Math.PI },
    { key: 'bDeg', label: 'β', unit: '°', fn: (s) => (s[5] * 180) / Math.PI },
  ],
  plots: [
    { title: 'Ball position', unit: 'mm', series: [{ key: 'd.xmm', label: 'x' }, { key: 'd.ymm', label: 'y' }, { key: 'd.rxmm', label: 'x target', ref: true, of: 'd.xmm' }, { key: 'd.rymm', label: 'y target', ref: true, of: 'd.ymm' }] },
    { title: 'Plate tilt', unit: '°', series: [{ key: 'd.aDeg', label: 'α' }, { key: 'd.bDeg', label: 'β' }] },
    { title: 'Servo commands', unit: 'rad', series: [{ key: 'u.alpha', label: 'α cmd' }, { key: 'u.beta', label: 'β cmd' }] },
  ],
  status(s, p, aux, r) {
    if (aux.mode !== 'plate') return { level: 'fail', text: 'Ball fell off — press Reset' };
    const e = Math.hypot(s[0] - r[0], s[1] - r[1]);
    if (e < 0.01) return { level: 'ok', text: 'On target' };
    return { level: 'info', text: `Error ${(e * 1000).toFixed(0)} mm` };
  },
};
