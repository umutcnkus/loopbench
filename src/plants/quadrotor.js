// Quadrotor (X configuration): 6-DOF rigid body with quaternion attitude,
// first-order rotor speed dynamics (T = kf Ω²), rotor gyroscopic and reaction
// torques, linear + quadratic drag relative to the wind, and compliant ground
// contact with Coulomb friction at the feet and motor pods.
//   m v̇ = R(q)·[0, 0, ΣTᵢ] − m g ẑ − (c_d + c_d2‖v_rel‖)·v_rel + F_contact
//   J ω̇ = τ − c_ω ω − ω × (J ω + h_rotors) + τ_contact,   q̇ = ½ q ⊗ [0, ω]
//   Ω̇ᵢ = (Ω_cmd,i − Ωᵢ)/τ_m,   Tᵢ = k_f Ωᵢ²,   τ_z = −Σ sᵢ (c_q Tᵢ + J_r Ω̇ᵢ)
import { qmul } from './common.js';

const KF = 1.0e-5; // thrust coefficient [N/(rad/s)^2]
const FEET = [
  [0.11, 0.11, -0.085], [-0.11, 0.11, -0.085], [-0.11, -0.11, -0.085], [0.11, -0.11, -0.085],
];
// spin direction of each rotor (+1 = CCW seen from above)
const SPIN = [1, 1, -1, -1];

function motorPos(L) {
  const d = L / Math.SQRT2;
  // 1 front-right, 2 back-left, 3 front-left, 4 back-right (x forward, y left)
  return [[d, -d, 0.02], [-d, d, 0.02], [d, d, 0.02], [-d, -d, 0.02]];
}

const rot = (q, v) => {
  const w = q[0], x = q[1], y = q[2], z = q[3];
  const tx = 2 * (y * v[2] - z * v[1]), ty = 2 * (z * v[0] - x * v[2]), tz = 2 * (x * v[1] - y * v[0]);
  return [v[0] + w * tx + (y * tz - z * ty), v[1] + w * ty + (z * tx - x * tz), v[2] + w * tz + (x * ty - y * tx)];
};
const rotInv = (q, v) => rot([q[0], -q[1], -q[2], -q[3]], v);
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

// smooth climb from the initial altitude to z over the first 3 s
function takeoff(t, z, s0) {
  const z0 = s0 ? s0[2] : 0.08;
  const s = Math.min(1, Math.max(0, t / 3));
  const e = s * s * s * (10 - 15 * s + 6 * s * s);
  return z0 + (z - z0) * e;
}
const xy0 = (s0, i) => (s0 ? s0[i] : 0);

export default {
  id: 'quadrotor',
  name: 'Quadrotor',
  category: 'Aerial robot',
  level: 'Advanced',
  tagline: 'Fly a 1 kg X-frame drone with four thrust commands: hover, track paths and fight the wind.',
  about:
    'Full 6-DOF rigid body with quaternion attitude. Each rotor follows its command with a 30 ms lag (thrust ∝ Ω²), produces a yaw reaction torque and gyroscopic coupling. Drag acts on the velocity relative to the wind. The frame rests on four compliant feet; if a motor pod touches the ground the props break and the motors stop.',
  dt: 0.001,
  controlRate: 250,
  params: [
    { key: 'm', label: 'Mass', unit: 'kg', value: 1.0, min: 0.4, max: 2.5, step: 0.01 },
    { key: 'L', label: 'Arm length', unit: 'm', value: 0.225, min: 0.12, max: 0.4, step: 0.005 },
    { key: 'Jxx', label: 'Inertia Jxx = Jyy', unit: 'kg·m²', value: 0.0095, min: 0.003, max: 0.04, step: 0.0005 },
    { key: 'Jzz', label: 'Inertia Jzz', unit: 'kg·m²', value: 0.0186, min: 0.005, max: 0.08, step: 0.0005 },
    { key: 'Tmax', label: 'Max thrust per motor', unit: 'N', value: 8, min: 3, max: 15, step: 0.1 },
    { key: 'tau', label: 'Motor time constant', unit: 's', value: 0.03, min: 0.005, max: 0.15, step: 0.005 },
    { key: 'cq', label: 'Yaw torque / thrust', unit: 'm', value: 0.016, min: 0.005, max: 0.04, step: 0.001 },
    { key: 'cd', label: 'Linear drag', unit: 'N·s/m', value: 0.12, min: 0, max: 1, step: 0.01 },
    { key: 'cd2', label: 'Quadratic drag', unit: 'N·s²/m²', value: 0.05, min: 0, max: 0.5, step: 0.01 },
    { key: 'g', label: 'Gravity', unit: 'm/s²', value: 9.81, min: 1, max: 25, step: 0.01 },
  ],
  derive(p) {
    p.Jyy = p.Jxx;
    p.kf = KF;
    p.Jr = 3e-5;
    p.cw = 0.002;
    p.motors = motorPos(p.L);
    p.spin = SPIN;
    p.Omax = Math.sqrt(p.Tmax / KF);
    const d = p.L / Math.SQRT2;
    // [T, τx, τy, τz] = mixer · [T1..T4]
    p.mixer = [
      [1, 1, 1, 1],
      [-d, d, d, -d],
      [-d, d, -d, d],
      [-p.cq, -p.cq, p.cq, p.cq],
    ];
    p.hoverThrust = (p.m * p.g) / 4;
    return p;
  },
  derivedParams: ['mixer', 'hoverThrust', 'Omax', 'motors', 'spin', 'kf', 'Jr'],
  states: [
    { key: 'x', label: 'Position x', unit: 'm' },
    { key: 'y', label: 'Position y', unit: 'm' },
    { key: 'z', label: 'Altitude z', unit: 'm' },
    { key: 'vx', label: 'Velocity x', unit: 'm/s' },
    { key: 'vy', label: 'Velocity y', unit: 'm/s' },
    { key: 'vz', label: 'Velocity z', unit: 'm/s' },
    { key: 'qw', label: 'Attitude qw', unit: '' },
    { key: 'qx', label: 'Attitude qx', unit: '' },
    { key: 'qy', label: 'Attitude qy', unit: '' },
    { key: 'qz', label: 'Attitude qz', unit: '' },
    { key: 'p', label: 'Roll rate', unit: 'rad/s' },
    { key: 'q', label: 'Pitch rate', unit: 'rad/s' },
    { key: 'r', label: 'Yaw rate', unit: 'rad/s' },
    { key: 'w1', label: 'Rotor 1 speed', unit: 'rad/s' },
    { key: 'w2', label: 'Rotor 2 speed', unit: 'rad/s' },
    { key: 'w3', label: 'Rotor 3 speed', unit: 'rad/s' },
    { key: 'w4', label: 'Rotor 4 speed', unit: 'rad/s' },
  ],
  inputs: [
    { key: 'T1', label: 'Thrust 1 (front-right)', unit: 'N', min: 0, max: 8 },
    { key: 'T2', label: 'Thrust 2 (back-left)', unit: 'N', min: 0, max: 8 },
    { key: 'T3', label: 'Thrust 3 (front-left)', unit: 'N', min: 0, max: 8 },
    { key: 'T4', label: 'Thrust 4 (back-right)', unit: 'N', min: 0, max: 8 },
  ],
  refs: [
    { key: 'x', label: 'Target x', unit: 'm' },
    { key: 'y', label: 'Target y', unit: 'm' },
    { key: 'z', label: 'Target altitude', unit: 'm' },
    { key: 'yaw', label: 'Target yaw', unit: 'rad' },
  ],
  noise: [0.003, 0.003, 0.003, 0.01, 0.01, 0.01, 0.0008, 0.0008, 0.0008, 0.0008, 0.01, 0.01, 0.01, 1, 1, 1, 1],
  postMeasure(y) {
    const n = Math.hypot(y[6], y[7], y[8], y[9]) || 1;
    for (let i = 6; i < 10; i++) y[i] /= n;
  },
  nGen: 6, // generalized speeds for external forces: world force (3) + body torque (3)
  dragK: 12,
  dragMass: 1,
  dragFmax: 12,
  dist: { label: 'Wind', unit: 'm/s', max: 8, step: 0.1, dims: 3, bias: [0.85, 0.45, 0], gust: 0.35, tau: 1.5 },
  poke: { body: 'frame', local: [0.1, 0.1, 0.03], f: [0, 0, -14], duration: 0.06 },
  initAux: () => ({ broken: false, crashT: null, contact: false }),

  deriv(t, s, u, p, ext, ds, aux) {
    const q = [s[6], s[7], s[8], s[9]];
    const wx = s[10], wy = s[11], wz = s[12];
    const broken = aux && aux.broken;
    // rotors
    let T = 0, tx = 0, ty = 0, tz = 0, hz = 0, hzDot = 0;
    for (let i = 0; i < 4; i++) {
      const Om = s[13 + i];
      const Tc = broken ? 0 : Math.min(p.Tmax, Math.max(0, u[i]));
      const Oc = Math.sqrt(Tc / p.kf);
      const Od = (Oc - Om) / p.tau;
      ds[13 + i] = Od;
      const Ti = broken ? 0 : p.kf * Om * Om;
      const Qi = p.cq * Ti;
      const r = p.motors[i];
      T += Ti;
      tx += r[1] * Ti;
      ty += -r[0] * Ti;
      tz += -p.spin[i] * (Qi + p.Jr * Od);
      hz += p.spin[i] * p.Jr * Om;
    }
    // forces (world)
    const fb = rot(q, [0, 0, T]);
    const wind = p._d || [0, 0, 0];
    const vrx = s[3] - (wind[0] || 0), vry = s[4] - (wind[1] || 0), vrz = s[5] - (wind[2] || 0);
    const vr = Math.hypot(vrx, vry, vrz);
    const cdq = p.cd + p.cd2 * vr;
    let Fx = fb[0] - cdq * vrx + ext[0];
    let Fy = fb[1] - cdq * vry + ext[1];
    let Fz = fb[2] - cdq * vrz + ext[2] - p.m * p.g;
    // torques (body)
    let Mx = tx - p.cw * wx + ext[3];
    let My = ty - p.cw * wy + ext[4];
    let Mz = tz - p.cw * wz + ext[5];
    // ground contact at feet and motor pods
    if (!p._model && s[2] < 0.6) {
      const pts = FEET.concat(p.motors.map((m) => [m[0] * 1.1, m[1] * 1.1, m[2]]));
      const w = [wx, wy, wz];
      for (let k = 0; k < pts.length; k++) {
        const rb = pts[k];
        const rw = rot(q, rb);
        const pz = s[2] + rw[2];
        if (pz >= 0) continue;
        const vb = cross(w, rb);
        const vw = rot(q, vb);
        const vcx = s[3] + vw[0], vcy = s[4] + vw[1], vcz = s[5] + vw[2];
        const N = Math.max(0, -3000 * pz - 45 * vcz);
        const vt = Math.hypot(vcx, vcy);
        const fr = vt > 1e-9 ? (0.8 * N * Math.tanh(vt / 0.01)) / vt : 0;
        const f = [-fr * vcx, -fr * vcy, N];
        Fx += f[0]; Fy += f[1]; Fz += f[2];
        const fbody = rotInv(q, f);
        const m = cross(rb, fbody);
        Mx += m[0]; My += m[1]; Mz += m[2];
      }
    }
    ds[0] = s[3];
    ds[1] = s[4];
    ds[2] = s[5];
    ds[3] = Fx / p.m;
    ds[4] = Fy / p.m;
    ds[5] = Fz / p.m;
    const qd = qmul(q, [0, wx, wy, wz]);
    ds[6] = 0.5 * qd[0];
    ds[7] = 0.5 * qd[1];
    ds[8] = 0.5 * qd[2];
    ds[9] = 0.5 * qd[3];
    // J ω̇ = M − ω × (Jω + h_rotor)
    const Hx = p.Jxx * wx, Hy = p.Jyy * wy, Hz = p.Jzz * wz + hz;
    ds[10] = (Mx - (wy * Hz - wz * Hy)) / p.Jxx;
    ds[11] = (My - (wz * Hx - wx * Hz)) / p.Jyy;
    ds[12] = (Mz - (wx * Hy - wy * Hx)) / p.Jzz;
  },
  post(s, p, aux, dt, t) {
    const n = Math.hypot(s[6], s[7], s[8], s[9]) || 1;
    for (let i = 6; i < 10; i++) s[i] /= n;
    if (!aux.broken && dt > 0) {
      // prop strike: a motor pod below 1 cm while the rotor spins
      const q = [s[6], s[7], s[8], s[9]];
      for (let i = 0; i < 4; i++) {
        const rw = rot(q, p.motors[i]);
        if (s[2] + rw[2] < 0.012 && s[13 + i] > 150) {
          aux.broken = true;
          aux.crashT = t;
          break;
        }
      }
      const vz = s[5];
      if (s[2] < 0.1 && vz < -4.5) { aux.broken = true; aux.crashT = t; }
    }
  },
  energy(s, p) {
    const T = 0.5 * p.m * (s[3] ** 2 + s[4] ** 2 + s[5] ** 2) + 0.5 * (p.Jxx * s[10] ** 2 + p.Jyy * s[11] ** 2 + p.Jzz * s[12] ** 2);
    return T + p.m * p.g * s[2];
  },
  equilibrium: (p) => {
    const Oh = Math.sqrt(p.m * p.g / 4 / p.kf);
    return { x: [0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, Oh, Oh, Oh, Oh], u: [p.hoverThrust, p.hoverThrust, p.hoverThrust, p.hoverThrust] };
  },
  bodies: ['frame'],
  pose(s) {
    return { p: [s[0], s[1], s[2]], q: [s[6], s[7], s[8], s[9]] };
  },
  pointJac(s, p, aux, body, local) {
    const q = [s[6], s[7], s[8], s[9]];
    const rw = rot(q, local);
    const w = rot(q, [s[10], s[11], s[12]]);
    const pos = [s[0] + rw[0], s[1] + rw[1], s[2] + rw[2]];
    const v = [s[3] + w[1] * rw[2] - w[2] * rw[1], s[4] + w[2] * rw[0] - w[0] * rw[2], s[5] + w[0] * rw[1] - w[1] * rw[0]];
    // generalized force = [f_world ; local × (R^T f)] -> columns: J_i · f
    const R = [rot(q, [1, 0, 0]), rot(q, [0, 1, 0]), rot(q, [0, 0, 1])]; // body axes in world
    const J = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
    // torque_b = local × (R^T f) = (local × e_k) · (R^T f) ... build rows so that J_k · f = torque_k
    for (let k = 0; k < 3; k++) {
      const ek = [0, 0, 0];
      ek[k] = 1;
      const c = cross(ek, local); // torque_k = (e_k × local)... sign handled below
      // τ = local × fb ; τ_k = e_k · (local × fb) = fb · (e_k × local) = f · R (e_k × local)
      J.push(rot(q, c));
    }
    void R;
    return { pos, v, J };
  },
  initialConditions: [
    { id: 'ground', label: 'On the ground', fn: () => [0, 0, 0.087, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0] },
    {
      id: 'hover', label: 'Hovering at 1.5 m',
      fn: (p) => { const Oh = Math.sqrt((p.m * p.g) / 4 / KF); return [0, 0, 1.5, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, Oh, Oh, Oh, Oh]; },
    },
    {
      id: 'tumble', label: 'Thrown, tumbling at 2 m',
      fn: (p, rng) => {
        const Oh = Math.sqrt((p.m * p.g) / 4 / KF);
        const a = 0.9 + rng.uniform() * 0.5;
        const c = Math.cos(a / 2), sn = Math.sin(a / 2);
        return [0, 0, 2.2, 1.5, -0.5, 1.0, c, sn * 0.8, sn * 0.6, 0, 3 * (rng.uniform() - 0.5), 6, 2, Oh, Oh, Oh, Oh];
      },
    },
  ],
  refModes: [
    {
      id: 'hover', label: 'Hover at a point',
      note: 'Drag the ring in the 3D view to move the target.',
      params: [
        { key: 'x', label: 'x', unit: 'm', value: 0, min: -3, max: 3, step: 0.05 },
        { key: 'y', label: 'y', unit: 'm', value: 0, min: -3, max: 3, step: 0.05 },
        { key: 'z', label: 'Altitude', unit: 'm', value: 1.5, min: 0.3, max: 4, step: 0.05 },
        { key: 'yaw', label: 'Yaw', unit: '°', value: 0, min: -180, max: 180, step: 1 },
      ],
      smooth: true,
      fn: (t, o, st, input, dt, p, s0) => [o.x, o.y, takeoff(t, o.z, s0), (o.yaw * Math.PI) / 180],
    },
    {
      id: 'circle', label: 'Circle',
      params: [
        { key: 'R', label: 'Radius', unit: 'm', value: 1.5, min: 0.2, max: 3, step: 0.05 },
        { key: 'z', label: 'Altitude', unit: 'm', value: 1.5, min: 0.3, max: 4, step: 0.05 },
        { key: 'T', label: 'Period', unit: 's', value: 8, min: 3, max: 30, step: 0.5 },
      ],
      smooth: true,
      fn: (t, o, st, input, dt, p, s0) => {
        // spiral out from the centre, then a steady circle (C¹-smooth start)
        const tt = Math.max(0, t - 3);
        const k = Math.min(1, tt / 4);
        const ramp = k * k * (3 - 2 * k);
        const ph = (2 * Math.PI * tt * tt) / (o.T * (tt + 2));
        return [o.R * ramp * Math.sin(ph), -o.R * ramp * Math.cos(ph) + o.R * ramp * 0, takeoff(t, o.z, s0), 0];
      },
    },
    {
      id: 'eight', label: 'Figure eight',
      params: [
        { key: 'A', label: 'Size', unit: 'm', value: 1.6, min: 0.3, max: 3, step: 0.05 },
        { key: 'z', label: 'Altitude', unit: 'm', value: 1.6, min: 0.3, max: 4, step: 0.05 },
        { key: 'T', label: 'Period', unit: 's', value: 10, min: 4, max: 30, step: 0.5 },
      ],
      smooth: true,
      fn: (t, o, st, input, dt, p, s0) => {
        const tt = Math.max(0, t - 3);
        const k = Math.min(1, tt / 4);
        const ramp = k * k * (3 - 2 * k);
        const ph = (2 * Math.PI * tt * tt) / (o.T * (tt + 2));
        return [o.A * ramp * Math.sin(ph), 0.5 * o.A * ramp * Math.sin(2 * ph), takeoff(t, o.z, s0) + 0.25 * ramp * Math.sin(ph), 0];
      },
    },
    {
      id: 'waypoints', label: 'Waypoint square',
      params: [
        { key: 'S', label: 'Side', unit: 'm', value: 2.4, min: 0.5, max: 5, step: 0.1 },
        { key: 'z', label: 'Altitude', unit: 'm', value: 1.4, min: 0.3, max: 4, step: 0.05 },
        { key: 'dwell', label: 'Leg time', unit: 's', value: 3.5, min: 1, max: 10, step: 0.5 },
      ],
      smooth: true,
      fn: (t, o, st, input, dt, p, s0) => {
        const h = o.S / 2;
        const pts = [[0, 0], [h, -h], [h, h], [-h, h], [-h, -h], [h, -h]];
        const tt = Math.max(0, t - 3.5);
        let k = Math.floor(tt / o.dwell);
        const f = (tt - k * o.dwell) / o.dwell;
        if (k === 0) k = 0;
        const a = k === 0 ? pts[0] : pts[1 + ((k - 1) % 4)];
        const b = pts[1 + (k % 4)];
        const s = Math.min(1, f / 0.75);
        const e = s * s * s * (10 - 15 * s + 6 * s * s);
        const yaw = Math.atan2(b[1] - a[1], b[0] - a[0]);
        void yaw;
        return [a[0] + (b[0] - a[0]) * e, a[1] + (b[1] - a[1]) * e, takeoff(t, o.z, s0), 0];
      },
    },
    {
      id: 'keys', label: 'Keyboard flight',
      note: 'W/S or ↑/↓ forward/back, A/D or ←/→ sideways, R/F up/down, Q/E yaw. Move relative to the drone heading.',
      params: [{ key: 'speed', label: 'Speed', unit: 'm/s', value: 1.5, min: 0.2, max: 4, step: 0.1 }],
      fn: (t, o, st, input, dt, p, s0) => {
        if (st.x === undefined) Object.assign(st, { x: xy0(s0, 0), y: xy0(s0, 1), z: 1.2, yaw: 0 });
        const a = input.axes;
        const c = Math.cos(st.yaw), sn = Math.sin(st.yaw);
        const fwd = a[1] * o.speed * dt, side = -a[0] * o.speed * dt;
        st.x = Math.max(-6, Math.min(6, st.x + fwd * c - side * sn));
        st.y = Math.max(-6, Math.min(6, st.y + fwd * sn + side * c));
        st.z = Math.max(0.2, Math.min(5, st.z + a[2] * o.speed * 0.7 * dt));
        st.yaw += a[3] * 1.4 * dt;
        return [st.x, st.y, takeoff(t, st.z, s0), st.yaw];
      },
    },
  ],
  keysHelp: ['W S', 'forward / back', 'A D', 'left / right', 'R F', 'up / down', 'Q E', 'yaw'],
  trackError: (s, r) => Math.hypot(s[0] - r[0], s[1] - r[1], s[2] - r[2]),
  derived: [
    { key: 'roll', label: 'Roll', unit: '°', fn: (s) => (Math.atan2(2 * (s[6] * s[7] + s[8] * s[9]), 1 - 2 * (s[7] ** 2 + s[8] ** 2)) * 180) / Math.PI },
    { key: 'pitch', label: 'Pitch', unit: '°', fn: (s) => (Math.asin(Math.max(-1, Math.min(1, 2 * (s[6] * s[8] - s[9] * s[7])))) * 180) / Math.PI },
    { key: 'yaw', label: 'Yaw', unit: '°', fn: (s) => (Math.atan2(2 * (s[6] * s[9] + s[7] * s[8]), 1 - 2 * (s[8] ** 2 + s[9] ** 2)) * 180) / Math.PI },
    { key: 'err', label: 'Position error', unit: 'm', fn: (s, p, a, r) => Math.hypot(s[0] - r[0], s[1] - r[1], s[2] - r[2]) },
    { key: 'Tsum', label: 'Total thrust', unit: 'N', fn: (s, p) => p.kf * (s[13] ** 2 + s[14] ** 2 + s[15] ** 2 + s[16] ** 2) },
  ],
  plots: [
    { title: 'Position', unit: 'm', series: [{ key: 'x.x', label: 'x' }, { key: 'x.y', label: 'y' }, { key: 'x.z', label: 'z' }, { key: 'r.x', label: 'x ref' }, { key: 'r.y', label: 'y ref' }, { key: 'r.z', label: 'z ref' }] },
    { title: 'Attitude', unit: '°', series: [{ key: 'd.roll', label: 'roll' }, { key: 'd.pitch', label: 'pitch' }, { key: 'd.yaw', label: 'yaw' }] },
    { title: 'Rotor thrust', unit: 'N', series: [{ key: 'ua.T1', label: 'T1 FR' }, { key: 'ua.T2', label: 'T2 BL' }, { key: 'ua.T3', label: 'T3 FL' }, { key: 'ua.T4', label: 'T4 BR' }] },
  ],
  status(s, p, aux) {
    if (aux.broken) return { level: 'fail', text: 'Crashed — props broken' };
    if (s[2] < 0.1 && Math.hypot(s[3], s[4], s[5]) < 0.05) return { level: 'idle', text: 'Landed' };
    return { level: 'ok', text: 'Flying' };
  },
};
