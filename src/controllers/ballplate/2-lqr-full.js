// @name LQR on the full 8-state model
// ctx.model.linearize() returns the complete linear model including both servo
// loops (8 states, 2 inputs), so the LQR accounts for the actuator lag.
// Reference tracking uses the reference trajectory's velocity as feedforward.
// Weights (same for both axes) are live sliders; onTune() redesigns K.

const w = tunable({
  qPos: [200, 1, 5000, 'log'],      // ball position
  qVel: [15, 0.1, 1000, 'log'],     // ball velocity
  qTilt: [1, 0.01, 100, 'log'],     // plate angle
  r: [8, 0.1, 100, 'log'],          // servo command
});
let K;

function design(ctx) {
  const { A, B } = ctx.model.linearize();
  //                x       y       vx      vy      α        β        α̇     β̇
  const Q = diag([w.qPos, w.qPos, w.qVel, w.qVel, w.qTilt, w.qTilt, 0.01, 0.01]);
  const d = lqr(A, B, Q, diag([w.r, w.r]));
  K = d.K;
  return d;
}

function init(ctx) {
  const d = design(ctx);
  console.log('dominant pole:', Math.max(...d.poles.map(z => z.re)).toFixed(2), 'rad/s');
}

function onTune(ctx) {
  design(ctx);
}

function control(ctx) {
  const y = ctx.y;
  if (!Number.isFinite(y.x)) return [0, 0];
  const r = ctx.r, rd = ctx.rd, rdd = ctx.rdd, g = ctx.p.gain;
  // desired state along the trajectory (tilt that produces the reference acceleration)
  const xd = [r.x, r.y, rd.x, rd.y, rdd.x / g, rdd.y / g, 0, 0];
  const e = sub(Array.from(y), xd);
  const u = mul(K, e).map(v => -v);
  return [u[0] + rdd.x / g, u[1] + rdd.y / g];
}
