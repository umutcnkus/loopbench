// @name LQR with integral action (voltage input)
// Linear model at 7 mm from ctx.model.linearize(): states [x, ẋ, i], input V.
// An integrator on the gap error removes steady-state error.

let K, ie, x0, u0;

function init(ctx) {
  const { A, B } = ctx.model.linearize();
  x0 = ctx.model.x0;
  u0 = ctx.model.u0[0];
  // augment with ∫(x − r); design in scaled units (mm, mm/s, A, mm·s)
  const Aa = zeros(4, 4), Ba = zeros(4, 1);
  for (let i = 0; i < 3; i++) { for (let j = 0; j < 3; j++) Aa[i][j] = A[i][j]; Ba[i][0] = B[i][0]; }
  Aa[3][0] = 1;
  const T = diag([1000, 1000, 1, 1000]), Ti = inv(T);
  const d = lqr(mul(mul(T, Aa), Ti), mul(T, Ba), diag([60, 0.004, 2, 4000]), [[0.02]]);
  K = mul(d.K, T)[0];                       // back to SI units
  ie = 0;
  console.log('poles:', d.poles.map(z => z.re.toFixed(0) + (z.im ? '±' + Math.abs(z.im).toFixed(0) + 'j' : '')).join('  '));
}

function control(ctx) {
  const y = ctx.y;
  ie = clamp(ie + (y.x - ctx.r.x) * ctx.dt, -5e-5, 5e-5);
  // regulate around the operating point, shifted to the set-point
  const i0 = ctx.r.x * Math.sqrt(2 * ctx.p.m * ctx.p.g / ctx.p.Km);
  const e = [y.x - ctx.r.x, y.xdot, y.i - i0, ie];
  return ctx.p.R * i0 - dot(K, e);
}
