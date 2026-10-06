// @name LQG: LQR + Kalman filter (encoders only)
// @ic tilt
// Real hardware measures only the three encoder angles/positions. A steady-state
// Kalman filter (dlqe) on the discretized model estimates the velocities, and
// the LQR acts on the estimate. Try raising the sensor noise in Scenario.

let K, L, Ad, Bd, C, xh, uPrev;

function init(ctx) {
  const { A, B } = ctx.model.linearize();
  K = lqr(A, B, diag([40, 400, 800, 10, 20, 20]), [[0.02]]).K[0];
  ({ Ad, Bd } = c2d(A, B, ctx.dt));
  C = [[1, 0, 0, 0, 0, 0], [0, 1, 0, 0, 0, 0], [0, 0, 1, 0, 0, 0]];
  const Qn = diag([1e-8, 1e-8, 1e-8, 1e-3, 1e-2, 1e-2]);   // process noise
  const Rn = diag([4e-8, 7e-7, 7e-7]);                      // encoder noise
  L = dlqe(Ad, null, C, Qn, Rn).L;
  xh = [ctx.y.x, ctx.y.th1, ctx.y.th2, 0, 0, 0];
  uPrev = 0;
}

function control(ctx) {
  const y = ctx.y;
  // predict with the previous input, then correct with the encoder readings
  xh = add(mul(Ad, xh), mul(Bd, [uPrev]));
  const meas = [y.x, xh[1] + angleDiff(y.th1, xh[1]), xh[2] + angleDiff(y.th2, xh[2])];
  xh = add(xh, mul(L, sub(meas, mul(C, xh))));
  ctx.log('θ̇1 estimate', xh[4]);
  ctx.log('θ̇1 true (sensor)', y.th1dot);
  const e = [clamp(xh[0] - ctx.r.x, -0.3, 0.3), wrapAngle(xh[1]), wrapAngle(xh[2]), xh[3], xh[4], xh[5]];
  uPrev = clamp(-dot(K, e), -60, 60);
  return uPrev;
}
