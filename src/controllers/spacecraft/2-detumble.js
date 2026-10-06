// @name Detumble (rate damping)
// Kill the body rates only: τ_body = −K ω. The wheels soak up the tumbling
// momentum; the thrusters take over if a wheel saturates.

function control(ctx) {
  const y = ctx.y, p = ctx.p;
  const w = [y.wx, y.wy, y.wz], h = [y.hx, y.hy, y.hz];
  const tau = mul(p.J, w).map(v => -0.5 * v);
  const thr = [0, 1, 2].map(i => (Math.abs(h[i]) > 0.95 * p.hmax ? clamp(tau[i], -0.5, 0.5) : 0));
  return [...[0, 1, 2].map(i => -(tau[i] - thr[i])), ...thr];
}
