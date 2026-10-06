// @name LQR (full state)
// @default
// @ic tilt
// Six states, one force. The LQR is designed on ctx.model.linearize() at the
// upright equilibrium; the position error is clipped so large set-point jumps
// stay inside the linear region. The weights are live sliders (log scale).

const w = tunable({
  qx: [40, 0.1, 2000, 'log'],      // cart position
  qth1: [400, 1, 1e4, 'log'],      // lower rod angle
  qth2: [800, 1, 1e4, 'log'],      // upper rod angle
  qv: [10, 0.01, 1000, 'log'],     // cart velocity
  qw: [20, 0.01, 1000, 'log'],     // rod rates
  r: [0.02, 1e-4, 1, 'log'],       // force
});
let K;

function design(ctx) {
  const { A, B } = ctx.model.linearize();
  //              x     θ1      θ2     ẋ     θ̇1    θ̇2
  const Q = diag([w.qx, w.qth1, w.qth2, w.qv, w.qw, w.qw]);
  K = lqr(A, B, Q, [[w.r]]).K[0];
}

function init(ctx) {
  design(ctx);
  console.log('K =', K.map(k => k.toFixed(1)).join(', '));
}

function onTune(ctx) {
  design(ctx);
}

function control(ctx) {
  const y = ctx.y;
  const e = [clamp(y.x - ctx.r.x, -0.3, 0.3), wrapAngle(y.th1), wrapAngle(y.th2), y.xdot, y.th1dot, y.th2dot];
  return -dot(K, e);
}
