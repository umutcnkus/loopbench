// @name Energy swing-up + LQR
// @default
// @ic down
// Swing-up: Åström–Furuta energy pumping through a desired cart acceleration,
// applied with collocated partial feedback linearization. Near upright the
// controller hands over to an LQR designed on the linearized model.

let K;                 // LQR gain (1 x 4)
let mode = 'swing';    // 'swing' | 'balance'

function init(ctx) {
  const { A, B } = ctx.model.linearize();          // about the upright equilibrium
  const Q = diag([30, 80, 3, 4]);                  // x, θ, ẋ, θ̇
  const R = [[0.06]];
  K = lqr(A, B, Q, R).K[0];
  mode = 'swing';
}

function control(ctx) {
  const { x, theta, xdot, thetadot } = ctx.y;
  const p = ctx.p;
  const th = wrapAngle(theta);                     // 0 = upright

  if (mode === 'swing' && Math.abs(th) < 0.35 && Math.abs(thetadot) < 3.5) mode = 'balance';
  if (mode === 'balance' && Math.abs(th) > 0.75) mode = 'swing';
  ctx.log('balance mode', mode === 'balance' ? 1 : 0);

  if (mode === 'balance') {
    // limit the position error so large set-point jumps stay in the linear regime
    const e = [clamp(x - ctx.r.x, -0.25, 0.25), th, xdot, thetadot];
    return -dot(K, e);
  }

  // Pendulum energy, zero when resting upright.
  const E = 0.5 * p.Jp * thetadot ** 2 + p.m * p.g * p.l * (Math.cos(th) - 1);
  ctx.log('energy', E);
  let s = thetadot * Math.cos(th);
  if (Math.abs(s) < 0.05) s = 0.05;                 // kick off from rest
  let a = 4 * clamp(6 * (E - 0.02) * Math.sign(s) / (p.m * p.g * p.l), -1, 1);
  a += -3 * x - 2.5 * xdot;                         // keep the cart near the centre
  a = clamp(a, -9, 9);

  // Force that produces cart acceleration a (collocated feedback linearization)
  const thdd = (p.m * p.g * p.l * Math.sin(th) - p.m * p.l * Math.cos(th) * a - p.bp * thetadot) / p.Jp;
  return (p.M + p.m) * a + p.m * p.l * (Math.cos(th) * thdd - Math.sin(th) * thetadot ** 2) + p.bc * xdot;
}
