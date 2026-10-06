// @name Arm position PD (pendulum hanging)
// A plain servo loop on the arm angle; the pendulum is left to swing.
// Watch how arm steps excite pendulum oscillations.

const kp = 12, kd = 0.6;   // V/rad, V·s/rad

function control(ctx) {
  const { theta, thetadot } = ctx.y;
  return kp * angleDiff(ctx.r.theta, theta) - kd * thetadot;
}
