// @name LQR balance
// @ic tilt
// Linear state feedback around upright; starts from "Upright, tilted 10°".
// The weights are live sliders; onTune() redesigns K when one moves.

const w = tunable({
  qth: [6, 0.01, 200, 'log'],       // arm angle
  qal: [20, 0.1, 1000, 'log'],      // pendulum angle
  qthd: [0.2, 1e-3, 20, 'log'],     // arm rate
  qald: [0.4, 1e-3, 20, 'log'],     // pendulum rate
  r: [1, 0.01, 100, 'log'],         // voltage
});
let K;

function design(ctx) {
  const { A, B } = ctx.model.linearize();
  const d = lqr(A, B, diag([w.qth, w.qal, w.qthd, w.qald]), [[w.r]]);
  K = d.K[0];
  return d;
}

function onTune(ctx) {
  design(ctx);
}

function init(ctx) {
  const d = design(ctx);
  console.log('K =', K.map(k => k.toFixed(2)).join(', '));
  console.log('poles:', d.poles.map(z => z.re.toFixed(1) + (z.im ? '±' + Math.abs(z.im).toFixed(1) + 'j' : '')).join('  '));
}

function control(ctx) {
  const { theta, alpha, thetadot, alphadot } = ctx.y;
  return -dot(K, [angleDiff(theta, ctx.r.theta), wrapAngle(alpha), thetadot, alphadot]);
}
