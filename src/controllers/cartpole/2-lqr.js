// @name LQR balance
// @ic tilt
// Full-state feedback designed on the linearized upright model.
// Picking this template starts from "Upright, tilted 8°". The Q and R weights are live sliders
// (log scale): onTune() redesigns the gain the moment one moves.

const w = tunable({
  qx: [30, 0.1, 1000, 'log'],     // cart position
  qth: [80, 0.1, 1000, 'log'],    // pole angle
  qv: [3, 0.01, 100, 'log'],      // cart velocity
  qw: [4, 0.01, 100, 'log'],      // pole rate
  r: [0.06, 0.001, 10, 'log'],    // force
});
let K;

function design(ctx) {
  const { A, B } = ctx.model.linearize();   // A, B at x = [0,0,0,0], u = 0
  const d = lqr(A, B, diag([w.qx, w.qth, w.qv, w.qw]), [[w.r]]);
  K = d.K[0];
  return d;
}

function init(ctx) {
  const d = design(ctx);
  console.log('K =', K.map(k => k.toFixed(2)).join(', '));
  console.log('closed-loop poles:', d.poles.map(p => p.re.toFixed(2) + (p.im ? (p.im > 0 ? '+' : '') + p.im.toFixed(2) + 'j' : '')).join('  '));
}

// runs whenever a slider moves
function onTune(ctx) {
  design(ctx);
}

function control(ctx) {
  const { x, theta, xdot, thetadot } = ctx.y;
  const e = [x - ctx.r.x, wrapAngle(theta), xdot, thetadot];
  return -dot(K, e);
}
