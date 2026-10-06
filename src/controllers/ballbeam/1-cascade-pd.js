// @name Cascade: ball PD → beam angle PD
// @default
// Outer loop: the ball accelerates at about −(g/κ)·α (κ = 7/5), so a desired
// ball acceleration becomes a beam-angle set-point.
// Inner loop: PD on the beam angle through the motor voltage, with feedforward
// for the ball's weight torque. The inner loop is ~4× faster than the outer.
// The gains are live sliders under the editor: drag them while it runs.

const k = tunable({
  kp: [6.25, 0, 20],    // outer loop (ball)  [1/s²]
  kd: [4.0, 0, 12],     //                    [1/s]
  ki: [0.8, 0, 5],      //                    [1/s³]
  kpa: [30, 0, 80],     // inner loop (beam)  [V/rad]
  kda: [4.2, 0, 12],    //                    [V·s/rad]
});
let ie;

function init(ctx) {
  ie = 0;
}

function control(ctx) {
  const { x, alpha, xdot, alphadot } = ctx.y;
  const p = ctx.p, r = ctx.r, dt = ctx.dt;
  const kappa = 1 + p.Jb / (p.m * p.r * p.r);
  const e = r.x - x;
  if (Math.abs(e) < 0.05) ie = clamp(ie + e * dt, -0.05, 0.05);
  const acc = ctx.rdd.x + k.kp * e + k.kd * (ctx.rd.x - xdot) + k.ki * ie;
  const aRef = clamp(-acc * kappa / p.g, -0.25, 0.25);
  // voltage per N·m of motor torque
  const vPerNm = p.Rm / (p.Kg * p.kt);
  const vGrav = p.m * p.g * x * Math.cos(alpha) * vPerNm;
  return k.kpa * (aRef - alpha) - k.kda * alphadot + vGrav;
}
