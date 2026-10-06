// @name Energy swing-up + LQR
// @default
// @ic down
// Swing-up pumps pendulum energy with the arm acceleration
//   θ̈_d = μ·(E − E_r)·sign(α̇ cos α)
// and converts it to a voltage with the full nonlinear model. Near upright an
// LQR (designed on ctx.model.linearize()) takes over.

let K, mode;

function init(ctx) {
  const { A, B } = ctx.model.linearize();
  K = lqr(A, B, diag([6, 20, 0.2, 0.4]), [[1]]).K[0];
  mode = 'swing';
  console.log('LQR gain K =', K.map(k => k.toFixed(2)).join(', '));
}

function control(ctx) {
  const { theta, alpha, thetadot, alphadot } = ctx.y;
  const p = ctx.p;
  const a = wrapAngle(alpha);

  if (mode === 'swing' && Math.abs(a) < 0.45 && Math.abs(alphadot) < 8) mode = 'balance';
  if (mode === 'balance' && Math.abs(a) > 0.8) mode = 'swing';

  if (mode === 'balance') {
    const e = [angleDiff(theta, ctx.r.theta), a, thetadot, alphadot];
    return -dot(K, e);
  }

  // pendulum energy (0 = resting upright)
  const E = 0.5 * p.Jp * alphadot ** 2 + p.mp * p.g * p.lp * (Math.cos(a) - 1);
  let s = alphadot * Math.cos(a);
  if (Math.abs(s) < 0.1) s = 0.1;                         // start from rest
  let acc = 50 * clamp(4 * (E - 0.003) / (p.mp * p.g * p.lp), -1, 1) * Math.sign(s);
  acc += -20 * angleDiff(theta, 0) - 4 * thetadot;        // keep the arm near θ = 0
  acc = clamp(acc, -60, 60);

  // voltage that produces arm acceleration `acc` (model inversion)
  const sa = Math.sin(a), ca = Math.cos(a), c = p.mp * p.Lr * p.lp;
  const m11 = p.Jr + p.mp * p.Lr ** 2 + p.Jp * sa * sa, m12 = c * ca, m22 = p.Jp;
  const f2 = -p.Dp * alphadot + p.Jp * sa * ca * thetadot ** 2 + p.mp * p.g * p.lp * sa;
  const add = (f2 - m12 * acc) / m22;                     // resulting α̈
  const tau = m11 * acc + m12 * add + p.Dr * thetadot + 2 * p.Jp * sa * ca * alphadot * thetadot - c * sa * alphadot ** 2;
  return tau * p.Rm / p.kt + p.km * thetadot;
}
