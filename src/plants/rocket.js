// Rocket landing: planar rigid body (x, z, pitch θ) with a gimballed engine,
// minimum-throttle limit, propellant burn-off (mass and inertia change),
// cold-gas RCS, aerodynamic drag relative to the wind and four landing legs.
//   m ẍ = T sin(θ+δ) + D_x,   m z̈ = T cos(θ+δ) − m g + D_z + F_legs
//   I θ̈ = −h T sin δ + τ_rcs,   ṁ = −T / (I_sp g₀)
// θ is the tilt of the body axis from vertical (positive toward +x).

const G0 = 9.80665;
const LEG = 3.1; // leg footprint half-width
const H = 14; // vehicle length

function thrustOf(u0, p, fuel, dead) {
  if (dead || fuel <= 0) return 0;
  const c = Math.max(0, Math.min(1, u0));
  if (c < 0.05) return 0;
  return Math.max(p.tmin, c) * p.Tmax;
}

export default {
  id: 'rocket',
  name: 'Rocket Landing',
  category: 'Aerospace',
  level: 'Advanced',
  tagline: 'Land a 2-tonne rocket on its pad with a gimballed engine that cannot throttle below 40 %.',
  about:
    'A planar model of a vertical-landing rocket: the engine gimbals ±8° and throttles between 40 % and 100 % (or shuts down), propellant burns off so mass and inertia fall during the flight, cold-gas thrusters add small torques, drag acts on the velocity relative to the wind, and four sprung legs take the touchdown. Touch down faster than 4 m/s or tilted more than 12° and the vehicle is lost.',
  dt: 0.002,
  controlRate: 50,
  params: [
    { key: 'md', label: 'Dry mass', unit: 'kg', value: 1500, min: 500, max: 5000, step: 10 },
    { key: 'mf0', label: 'Propellant at start', unit: 'kg', value: 600, min: 50, max: 3000, step: 10 },
    { key: 'Tmax', label: 'Max thrust', unit: 'kN', value: 40, min: 10, max: 120, step: 0.5 },
    { key: 'tmin', label: 'Minimum throttle', unit: '', value: 0.4, min: 0, max: 0.9, step: 0.01 },
    { key: 'isp', label: 'Specific impulse', unit: 's', value: 280, min: 150, max: 450, step: 1 },
    { key: 'hcg', label: 'Engine to centre of mass', unit: 'm', value: 4.5, min: 1, max: 8, step: 0.1 },
    { key: 'dmax', label: 'Gimbal limit', unit: '°', value: 8, min: 1, max: 20, step: 0.5 },
    { key: 'g', label: 'Gravity', unit: 'm/s²', value: 9.81, min: 1.6, max: 25, step: 0.01 },
  ],
  derive(p) {
    if (p.Tmax < 1000) p.Tmax *= 1000; // slider is in kN
    p.dlim = (p.dmax * Math.PI) / 180;
    p.rcs = 2500; // N·m
    return p;
  },
  derivedParams: ['dlim', 'rcs'],
  states: [
    { key: 'x', label: 'Downrange x', unit: 'm' },
    { key: 'z', label: 'Altitude', unit: 'm' },
    { key: 'theta', label: 'Tilt θ', unit: 'rad' },
    { key: 'vx', label: 'Horizontal speed', unit: 'm/s' },
    { key: 'vz', label: 'Vertical speed', unit: 'm/s' },
    { key: 'thetadot', label: 'Tilt rate', unit: 'rad/s' },
    { key: 'fuel', label: 'Propellant', unit: 'kg' },
  ],
  inputs: [
    { key: 'throttle', label: 'Throttle (0 = off)', unit: '', min: 0, max: 1 },
    { key: 'gimbal', label: 'Gimbal angle', unit: 'rad', min: -0.35, max: 0.35 },
    { key: 'rcs', label: 'RCS torque command', unit: '', min: -1, max: 1 },
  ],
  refs: [
    { key: 'x', label: 'Target x', unit: 'm' },
    { key: 'z', label: 'Target altitude', unit: 'm' },
  ],
  noise: [0.3, 0.2, 0.002, 0.1, 0.1, 0.003, 0],
  u0: () => [0, 0, 0],
  nGen: 3,
  dragK: 2e4,
  dragMass: 1500,
  dragFmax: 3e4,
  dist: { label: 'Crosswind', unit: 'm/s', max: 15, step: 0.1, dims: 1, bias: [0.8], gust: 0.4, tau: 3 },
  poke: { body: 'body', local: [0, 0, 12], f: [6000, 0, 0], duration: 0.3 },
  initAux: () => ({ dead: false, landed: false, reason: '', touch: null }),
  deriv(t, s, u, p, ext, ds, aux) {
    const th = s[2], fuel = Math.max(0, s[6]);
    const m = p.md + fuel;
    const I = (m * H * H) / 12;
    const dead = aux && aux.dead;
    const T = thrustOf(u[0], p, fuel, dead);
    const d = Math.max(-p.dlim, Math.min(p.dlim, u[1]));
    const rcs = dead ? 0 : Math.max(-1, Math.min(1, u[2])) * p.rcs;
    // aerodynamics: axial + normal drag on the air-relative velocity
    const wind = p._d ? p._d[0] : 0;
    const vx = s[3] - wind, vz = s[4];
    const ax = [Math.sin(th), Math.cos(th)], nx = [Math.cos(th), -Math.sin(th)];
    const va = vx * ax[0] + vz * ax[1], vn = vx * nx[0] + vz * nx[1];
    const rho = 1.2;
    const Da = -0.5 * rho * 0.5 * 1.8 * Math.abs(va) * va;
    const Dn = -0.5 * rho * 0.9 * 18 * Math.abs(vn) * vn;
    let Fx = T * Math.sin(th + d) + Da * ax[0] + Dn * nx[0] + ext[0];
    let Fz = T * Math.cos(th + d) - m * p.g + Da * ax[1] + Dn * nx[1] + ext[1];
    let M = -p.hcg * T * Math.sin(d) + rcs + ext[2] - 4000 * s[5]; // small aerodynamic pitch damping
    // legs: feet at ±LEG across, hcg below the CG along the body axis
    if (!p._model && s[1] < 12) {
      for (const sgn of [-1, 1]) {
        const rx = -p.hcg * ax[0] + sgn * LEG * nx[0], rz = -p.hcg * ax[1] + sgn * LEG * nx[1];
        const pz = s[1] + rz;
        if (pz >= 0) continue;
        const vfx = s[3] + s[5] * rz, vfz = s[4] - s[5] * rx;
        const N = Math.max(0, -3e5 * pz - 4e4 * vfz);
        const Ff = -0.8 * N * Math.tanh(vfx / 0.05);
        Fx += Ff; Fz += N;
        M += rz * Ff - rx * N;
      }
    }
    ds[0] = s[3];
    ds[1] = s[4];
    ds[2] = s[5];
    ds[3] = Fx / m;
    ds[4] = Fz / m;
    ds[5] = M / I;
    ds[6] = fuel > 0 ? -T / (p.isp * G0) : 0;
  },
  post(s, p, aux, dt, t) {
    if (s[6] < 0) s[6] = 0;
    if (!dt || aux.dead) return;
    const ax = [Math.sin(s[2]), Math.cos(s[2])], nx = [Math.cos(s[2]), -Math.sin(s[2])];
    const footZ = Math.min(s[1] - p.hcg * ax[1] - LEG * nx[1], s[1] - p.hcg * ax[1] + LEG * nx[1]);
    if (footZ < 0.05 && !aux.touch) aux.touch = { vz: s[4], vx: s[3], tilt: s[2], x: s[0], t };
    if (aux.touch && !aux.landed && !aux.dead) {
      const tc = aux.touch;
      if (tc.vz < -4 || Math.abs(tc.tilt) > 0.21 || Math.abs(tc.vx) > 3) {
        aux.dead = true;
        aux.reason = tc.vz < -4 ? `hit the ground at ${(-tc.vz).toFixed(1)} m/s` : Math.abs(tc.tilt) > 0.21 ? `touched down tilted ${((Math.abs(tc.tilt) * 180) / Math.PI).toFixed(0)}°` : `slid in at ${Math.abs(tc.vx).toFixed(1)} m/s sideways`;
      } else if (Math.abs(s[4]) < 0.2 && Math.abs(s[3]) < 0.2) aux.landed = true;
    }
    if (Math.abs(s[2]) > 1.2 && s[1] < H) { aux.dead = true; aux.reason = aux.reason || 'tipped over'; }
  },
  energy(s, p) {
    const m = p.md + s[6];
    return 0.5 * m * (s[3] ** 2 + s[4] ** 2) + 0.5 * ((m * H * H) / 12) * s[5] ** 2 + m * p.g * s[1];
  },
  equilibrium: (p) => ({ x: [0, 50, 0, 0, 0, 0, p.mf0], u: [((p.md + p.mf0) * p.g) / p.Tmax, 0, 0] }),
  bodies: ['body'],
  // body frame: origin at the CG, +z along the vehicle axis
  pose(s) {
    return { p: [s[0], 0, s[1]], q: [Math.cos(s[2] / 2), 0, Math.sin(s[2] / 2), 0] };
  },
  pointJac(s, p, aux, body, local) {
    const th = s[2];
    const c = Math.cos(th), sn = Math.sin(th);
    // local (x, z) in body frame -> world (x, z)
    const rx = local[0] * c + local[2] * sn, rz = -local[0] * sn + local[2] * c;
    const pos = [s[0] + rx, local[1], s[1] + rz];
    const v = [s[3] + s[5] * rz, 0, s[4] - s[5] * rx];
    return { pos, v, J: [[1, 0, 0], [0, 0, 1], [rz, 0, -rx]] };
  },
  initialConditions: [
    { id: 'descent', label: 'Coming in from 300 m', fn: (p) => [-70, 300, -0.12, 9, -38, 0, p.mf0] },
    { id: 'hover', label: 'Hovering at 60 m', fn: (p) => [0, 60, 0, 0, 0, 0, p.mf0] },
    { id: 'high', label: 'Fast from 700 m', fn: (p) => [180, 700, 0.18, -22, -70, 0.02, p.mf0] },
    { id: 'pad', label: 'On the pad', fn: (p) => [0, p.hcg + 0.02, 0, 0, 0, 0, p.mf0] },
  ],
  refModes: [
    { id: 'land', label: 'Land on the pad', params: [{ key: 'x', label: 'Pad position', unit: 'm', value: 0, min: -30, max: 30, step: 1 }], fn: (t, o) => [o.x, 0] },
    {
      id: 'hover', label: 'Hover at a point',
      params: [{ key: 'x', label: 'x', unit: 'm', value: 0, min: -150, max: 150, step: 1 }, { key: 'z', label: 'Altitude', unit: 'm', value: 60, min: 10, max: 400, step: 1 }],
      fn: (t, o) => [o.x, o.z],
    },
    {
      id: 'ship', label: 'Moving barge',
      smooth: true,
      params: [{ key: 'A', label: 'Drift amplitude', unit: 'm', value: 15, min: 0, max: 60, step: 1 }, { key: 'T', label: 'Period', unit: 's', value: 60, min: 20, max: 180, step: 1 }],
      fn: (t, o) => [o.A * Math.sin((2 * Math.PI * t) / o.T), 0],
    },
  ],
  trackError: (s, r) => s[0] - r[0],
  derived: [
    { key: 'tiltDeg', label: 'Tilt', unit: '°', fn: (s) => (s[2] * 180) / Math.PI },
    { key: 'gimbalDeg', label: 'Gimbal', unit: '°', fn: (s, p, a, r, u) => ((u ? Math.max(-p.dlim, Math.min(p.dlim, u[1])) : 0) * 180) / Math.PI },
    { key: 'thrust', label: 'Thrust', unit: 'kN', fn: (s, p, a, r, u) => (u ? thrustOf(u[0], p, s[6], a.dead) : 0) / 1000 },
    { key: 'weight', label: 'Weight', unit: 'kN', fn: (s, p) => ((p.md + s[6]) * p.g) / 1000 },
  ],
  plots: [
    { title: 'Position', unit: 'm', series: [{ key: 'x.z', label: 'CG altitude' }, { key: 'x.x', label: 'x' }, { key: 'r.x', label: 'pad x', ref: true, of: 'x.x' }] },
    { title: 'Velocity', unit: 'm/s', series: [{ key: 'x.vz', label: 'vertical' }, { key: 'x.vx', label: 'horizontal' }] },
    { title: 'Attitude', unit: '°', series: [{ key: 'd.tiltDeg', label: 'tilt' }, { key: 'd.gimbalDeg', label: 'gimbal' }] },
    { title: 'Engine', unit: 'kN', series: [{ key: 'd.thrust', label: 'thrust' }, { key: 'd.weight', label: 'weight', ref: true, of: 'd.thrust' }] },
  ],
  status(s, p, aux, r) {
    if (aux.dead) return { level: 'fail', text: 'Lost — ' + aux.reason };
    if (aux.landed) {
      if (aux.landOff == null) aux.landOff = Math.abs(s[0] - r[0]);
      const off = aux.landOff;
      return off < 6 ? { level: 'ok', text: `Landed ${off.toFixed(1)} m from the target` } : { level: 'warn', text: `Landed off the pad (${off.toFixed(0)} m)` };
    }
    if (s[6] <= 0) return { level: 'warn', text: 'Out of propellant' };
    return { level: 'info', text: `${s[1].toFixed(0)} m · ${(-s[4]).toFixed(1)} m/s down · ${s[6].toFixed(0)} kg left` };
  },
};
