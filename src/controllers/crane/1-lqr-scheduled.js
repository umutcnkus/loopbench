// @name Anti-sway LQR, gain-scheduled on rope length
// @default
// Each horizontal axis is a cart with a pendulum whose length ℓ changes as you
// hoist. The LQR gains are recomputed from ctx.model.linearize() whenever ℓ has
// changed by more than 5 cm. Reference acceleration is fed forward, including
// the steady lag angle θ = −a/g the rope takes while accelerating.
// The hoist is a PD loop with payload-weight feedforward.

let Kx, Ky, lDesign = -1, ix = 0, iy = 0;

function design(ctx, l) {
  const x0 = [0, 0, l, 0, 0, 0, 0, 0, 0, 0];
  const { A, B } = ctx.model.linearize(x0, ctx.model.u0);
  const sub4 = (idx, col) => ({
    A: idx.map(i => idx.map(j => A[i][j])),
    B: idx.map(i => [B[i][col]]),
  });
  const Q = diag([200, 400, 40, 30]), R = [[3e-4]];
  const sx = sub4([0, 3, 5, 8], 0), sy = sub4([1, 4, 6, 9], 1);
  Kx = lqr(sx.A, sx.B, Q, R).K[0];
  Ky = lqr(sy.A, sy.B, Q, R).K[0];
  lDesign = l;
}

function init(ctx) {
  design(ctx, ctx.y.l);
  ix = iy = 0;
}

function control(ctx) {
  const y = ctx.y, r = ctx.r, rd = ctx.rd, rdd = ctx.rdd, p = ctx.p;
  if (Math.abs(y.l - lDesign) > 0.05) design(ctx, y.l);
  const g = p.g, Mtot = p.Mb + p.Mt + p.m;
  // lateral axes: error to the moving reference, with swing-angle feedforward
  const ex = [clamp(y.x - r.x, -0.6, 0.6), y.thx + rdd.x / g, y.xdot - rd.x, y.thxdot];
  const ey = [clamp(y.y - r.y, -0.6, 0.6), y.thy + rdd.y / g, y.ydot - rd.y, y.thydot];
  // slow integral on the crate's own position error (rejects steady wind),
  // only while the reference is at rest
  const cx = y.x + y.l * Math.sin(y.thx), cy = y.y + y.l * Math.sin(y.thy);
  if (Math.hypot(rd.x, rd.y) < 0.01) {
    ix = clamp(ix + (cx - r.x) * ctx.dt, -0.5, 0.5);
    iy = clamp(iy + (cy - r.y) * ctx.dt, -0.5, 0.5);
  }
  const Fx = Mtot * rdd.x + p.bx * rd.x - dot(Kx, ex) - 60 * ix;
  const Fy = (p.Mt + p.m) * rdd.y + p.bx * rd.y - dot(Ky, ey) - 60 * iy;
  // hoist: support the payload weight, PD on rope length (positive force lifts)
  const mEff = p.m + p.mh;
  const Fh = p.m * g * Math.cos(y.thx) * Math.cos(y.thy) + mEff * (9 * (y.l - r.l) + 5.4 * (y.ldot - rd.l)) - p.m * rdd.l;
  return [Fx, Fy, Fh];
}
