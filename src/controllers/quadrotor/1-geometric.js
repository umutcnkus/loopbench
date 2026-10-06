// @name Cascaded position + geometric attitude control
// @default
// Outer loop: PID on position -> desired acceleration.
// Middle: desired acceleration + yaw -> thrust and desired attitude R_d.
// Inner loop: attitude error on SO(3) (Lee, Leok & McClamroch) -> body torques.
// Mixer: [thrust, τx, τy, τz] -> four rotor thrusts.
// The main gains are live sliders under the editor.

const g = tunable({
  kpXY: [4.0, 0, 12],     // horizontal position  [1/s²]
  kdXY: [3.2, 0, 10],     // horizontal velocity  [1/s]
  kpZ: [6.0, 0, 16],      // altitude             [1/s²]
  kdZ: [4.2, 0, 10],      // climb rate           [1/s]
  kR: [2.2, 0, 8],        // roll/pitch attitude  [N·m/rad]
  kw: [0.24, 0, 1],       // roll/pitch rate      [N·m·s/rad]
});
const Ki = [0.6, 0.6, 1.2];     // integral gains
const maxTilt = 0.6;            // rad

let mixInv, iErr;

function init(ctx) {
  mixInv = inv(ctx.p.mixer);    // rotor thrusts from [T, τx, τy, τz]
  iErr = [0, 0, 0];
}

function control(ctx) {
  const y = ctx.y, p = ctx.p, r = ctx.r, dt = ctx.dt;
  const Kp = [g.kpXY, g.kpXY, g.kpZ], Kd = [g.kdXY, g.kdXY, g.kdZ];
  const KR = [g.kR, g.kR, 0.8], Kw = [g.kw, g.kw, 0.2];   // yaw gains fixed
  const pos = [y.x, y.y, y.z], vel = [y.vx, y.vy, y.vz];
  const q = [y.qw, y.qx, y.qy, y.qz];
  const w = [y.p, y.q, y.r];
  const R = quat.toMatrix(q);

  // --- position loop (with velocity / acceleration feedforward from ctx.rd, ctx.rdd)
  const e = sub([r.x, r.y, r.z], pos);
  const ev = sub([ctx.rd.x, ctx.rd.y, ctx.rd.z], vel);
  const aff = [ctx.rdd.x, ctx.rdd.y, ctx.rdd.z];
  for (let i = 0; i < 3; i++) {
    if (Math.abs(e[i]) < 0.5 && y.z > 0.15) iErr[i] = clamp(iErr[i] + e[i] * dt, -2, 2); // integrate near the target only
  }
  const a = [0, 1, 2].map(i => aff[i] + Kp[i] * e[i] + Kd[i] * ev[i] + Ki[i] * iErr[i]);
  a[2] += p.g;
  // limit tilt: horizontal acceleration at most tan(maxTilt)·vertical
  const ah = Math.hypot(a[0], a[1]), amax = Math.tan(maxTilt) * Math.max(a[2], 1);
  if (ah > amax) { a[0] *= amax / ah; a[1] *= amax / ah; }
  a[2] = Math.max(a[2], 0.5);

  // --- thrust along the current body z axis
  const zb = [R[0][2], R[1][2], R[2][2]];
  const T = p.m * dot(a, zb);

  // --- desired attitude from acceleration direction and yaw
  const zd = v3.normalize(a);
  const xc = [Math.cos(r.yaw), Math.sin(r.yaw), 0];
  const yd = v3.normalize(v3.cross(zd, xc));
  const xd = v3.cross(yd, zd);
  const Rd = [[xd[0], yd[0], zd[0]], [xd[1], yd[1], zd[1]], [xd[2], yd[2], zd[2]]];

  // --- attitude error  eR = ½ vee(Rdᵀ R − Rᵀ Rd)
  const E = sub(mul(transpose(Rd), R), mul(transpose(R), Rd));
  const eR = [0.5 * E[2][1], 0.5 * E[0][2], 0.5 * E[1][0]];
  const Jw = [p.Jxx * w[0], p.Jyy * w[1], p.Jzz * w[2]];
  const gyro = v3.cross(w, Jw);
  const tau = [0, 1, 2].map(i => -KR[i] * eR[i] - Kw[i] * w[i] + gyro[i]);

  // --- mixer, saturate each rotor
  const Ti = mul(mixInv, [T, tau[0], tau[1], tau[2]]);
  return Ti.map(t => clamp(t, 0, p.Tmax));
}
