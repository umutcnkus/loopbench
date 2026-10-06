// @name LQR balance + speed/turn tracking
// @default
// Pitch/speed subsystem (common-mode voltage, both wheels equal):
//   z = [ξ, φ, v − v_ref, φ̇],  ξ = ∫(v − v_ref) dt   (returns to its spot after a push)
// The matrices come from ctx.model.linearize() at the upright equilibrium.
// Yaw subsystem (differential voltage): PI on the turn rate.
// The LQR weights are live sliders; onTune() redesigns K when one moves.

const w = tunable({
  qXi: [30, 0.1, 1000, 'log'],    // ∫ speed error (position hold)
  qPhi: [40, 0.1, 1000, 'log'],   // pitch
  qV: [6, 0.01, 100, 'log'],      // speed error
  qRate: [0.3, 0.001, 10, 'log'], // pitch rate
  r: [0.12, 0.001, 10, 'log'],    // voltage
});
let K, xi, yawI;

function design(ctx) {
  const { A, B } = ctx.model.linearize();
  const idx = [3, 4, 6];                      // φ, v, φ̇ in the state vector
  const As = zeros(4, 4), Bs = zeros(4, 1);
  As[0][2] = 1;                               // ξ̇ = v
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) As[1 + i][1 + j] = A[idx[i]][idx[j]];
    Bs[1 + i][0] = B[idx[i]][0] + B[idx[i]][1];
  }
  K = lqr(As, Bs, diag([w.qXi, w.qPhi, w.qV, w.qRate]), [[w.r]]).K[0];
}

function init(ctx) {
  design(ctx);
  xi = 0;
  yawI = 0;
  console.log('K =', K.map(k => k.toFixed(2)).join(', '));
}

function onTune(ctx) {
  design(ctx);
}

function control(ctx) {
  const y = ctx.y, r = ctx.r, dt = ctx.dt;
  xi = clamp(xi + (y.v - r.v) * dt, -0.4, 0.4);
  const Vc = -dot(K, [xi, y.phi, y.v - r.v, y.phidot]);
  const ew = r.psidot - y.psidot;
  yawI = clamp(yawI + ew * dt, -1, 1);
  const Vd = 1.6 * ew + 6 * yawI;
  if (Math.abs(y.phi) > 1.2) return [0, 0];   // fallen: cut the motors
  return [Vc - Vd, Vc + Vd];
}
