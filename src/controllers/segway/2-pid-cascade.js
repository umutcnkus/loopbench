// @name Cascaded PID
// Inner loop: PID keeps the body at a pitch set-point.
// Outer loop: PI on speed produces that pitch set-point (lean to accelerate).
// Yaw: proportional differential voltage.

let pitchPid, speedPid;

function init(ctx) {
  pitchPid = new PID({ kp: 60, ki: 180, kd: 3.2, tf: 0.004, dt: ctx.dt, umin: -12, umax: 12 });
  speedPid = new PID({ kp: 0.18, ki: 0.12, kd: 0, dt: ctx.dt, umin: -0.25, umax: 0.25 });
}

function control(ctx) {
  const y = ctx.y, r = ctx.r;
  // lean forward to speed up: pitch set-point from speed error
  const phiRef = speedPid.update(r.v, y.v);
  ctx.log('pitch set-point [deg]', deg(phiRef));
  // body falls forward -> drive wheels forward (positive voltage)
  const Vc = -pitchPid.update(phiRef, y.phi);
  const Vd = 1.8 * (r.psidot - y.psidot);
  if (Math.abs(y.phi) > 1.2) return [0, 0];
  return [Vc - Vd, Vc + Vd];
}
