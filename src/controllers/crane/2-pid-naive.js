// @name Position PID only (no sway damping)
// Each drive is a PID on its own position; the rope angle is ignored.
// The crate arrives, then keeps swinging. Compare with the anti-sway LQR.

let px, py;

function init(ctx) {
  px = new PID({ kp: 400, ki: 40, kd: 260, tf: 0.02, dt: ctx.dt, limit: 250 });
  py = new PID({ kp: 250, ki: 25, kd: 160, tf: 0.02, dt: ctx.dt, limit: 150 });
}

function control(ctx) {
  const y = ctx.y, r = ctx.r, p = ctx.p;
  const Fh = p.m * p.g + (p.m + p.mh) * (9 * (y.l - r.l) + 5.4 * y.ldot);
  return [px.update(r.x, y.x), py.update(r.y, y.y), Fh];
}
