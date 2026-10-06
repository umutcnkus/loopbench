// @name Manual flight (angle mode)
// You are the outer loop: the keys command tilt angles and climb rate,
// the controller only stabilizes attitude and altitude rate.
//   W/S pitch forward/back · A/D roll · R/F climb/descend · Q/E yaw rate

const KR = [2.2, 2.2, 0.8], Kw = [0.24, 0.24, 0.2];
let mixInv, yawRef = 0, climbI = 0;

function init(ctx) {
  mixInv = inv(ctx.p.mixer);
  yawRef = 0;
  climbI = 0;
}

function control(ctx) {
  const y = ctx.y, p = ctx.p, [ax, ay, az, aw] = ctx.input.axes;
  const q = [y.qw, y.qx, y.qy, y.qz];
  const [roll, pitch, yaw] = quat.toEuler(q);
  yawRef += aw * 1.5 * ctx.dt;
  const rollRef = ax * 0.35, pitchRef = ay * 0.35;
  // climb-rate loop (PI) on vertical speed
  const vzRef = az * 1.5;
  climbI = clamp(climbI + (vzRef - y.vz) * ctx.dt, -3, 3);
  const T = p.m * (p.g + 3 * (vzRef - y.vz) + 2 * climbI) / Math.max(0.5, Math.cos(roll) * Math.cos(pitch));
  const qd = quat.fromEuler(rollRef, pitchRef, yawRef);
  const e = quat.toRotVec(quat.error(q, qd));      // body-frame rotation to target
  const w = [y.p, y.q, y.r];
  const tau = [0, 1, 2].map(i => KR[i] * e[i] - Kw[i] * w[i]);
  const Ti = mul(mixInv, [T, ...tau]);
  return Ti.map(t => clamp(t, 0, p.Tmax));
}
