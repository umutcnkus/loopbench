// @name LQR on the small-angle model
// Near the target the attitude error is small: θ = 2·q_e,vec and θ̈ ≈ J⁻¹τ.
// A 6-state LQR on [θ, ω] with the full inertia matrix (products included).
// Best for small corrections: large slews saturate the 0.2 N·m wheels.

let K;

function init(ctx) {
  const Ji = ctx.p.Jinv;
  const A = zeros(6, 6), B = zeros(6, 3);
  for (let i = 0; i < 3; i++) {
    A[i][3 + i] = 1;
    for (let j = 0; j < 3; j++) B[3 + i][j] = Ji[i][j];
  }
  const d = lqr(A, B, diag([40, 40, 40, 900, 900, 900]), diag([100, 100, 100]));
  K = d.K;
  console.log('closed-loop poles:', d.poles.map(z => z.re.toFixed(3)).join(' '));
}

function control(ctx) {
  const y = ctx.y, p = ctx.p;
  const q = [y.qw, y.qx, y.qy, y.qz], w = [y.wx, y.wy, y.wz], h = [y.hx, y.hy, y.hz];
  const qe = quat.error(q, [ctx.r.qw, ctx.r.qx, ctx.r.qy, ctx.r.qz]);
  // error state: attitude offset of the body relative to the target
  const x = [-2 * qe[1], -2 * qe[2], -2 * qe[3], ...w];
  const tauBody = add(mul(K, x).map(v => -v), v3.cross(w, add(mul(p.J, w), h)));
  return [...tauBody.map(t => -t), 0, 0, 0];
}
