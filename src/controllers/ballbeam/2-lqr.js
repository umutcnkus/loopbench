// @name LQR (full 4-state model)
// ctx.model.linearize() at the level beam gives the complete linear model,
// including the ball's rolling inertia coupling and the motor back-EMF.
// Feedforward supplies the motor voltage that holds the beam level with the
// ball resting at the set-point (its weight torque m·g·x).
// The weights are live sliders; onTune() redesigns K when one moves.

const w = tunable({
  qx: [60, 0.1, 1000, 'log'],       // ball position
  qa: [5, 0.01, 500, 'log'],        // beam angle
  qv: [4, 0.01, 100, 'log'],        // ball velocity
  qw: [0.05, 1e-4, 10, 'log'],      // beam rate
  r: [0.02, 1e-4, 10, 'log'],       // voltage
});
let K;

function design(ctx) {
  const { A, B } = ctx.model.linearize();
  //                         x     α     ẋ     α̇
  K = lqr(A, B, diag([w.qx, w.qa, w.qv, w.qw]), [[w.r]]).K[0];
}

function init(ctx) {
  design(ctx);
  console.log('K =', K.map(k => k.toFixed(2)).join(', '));
}

function onTune(ctx) {
  design(ctx);
}

function control(ctx) {
  const y = ctx.y, p = ctx.p;
  const e = [clamp(y.x - ctx.r.x, -0.2, 0.2), y.alpha, y.xdot - ctx.rd.x, y.alphadot];
  const uff = p.m * p.g * ctx.r.x * p.Rm / (p.Kg * p.kt);
  return uff - dot(K, e);
}
