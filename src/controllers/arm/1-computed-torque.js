// @name Computed torque + inverse kinematics
// @default
// 1. Inverse kinematics turns the tool target (and its velocity/acceleration
//    from ctx.rd, ctx.rdd) into a joint trajectory q_d, q̇_d, q̈_d.
// 2. Computed torque cancels the arm dynamics with the model:
//      τ = M(q) (q̈_d + Kd ė + Kp e + Ki ∫e) + C(q,q̇)q̇ + G(q) + τ_friction
//    leaving two decoupled critically damped error loops.

const wn = 18, Kp = wn * wn, Kd = 2 * wn, Ki = 120;
let ie;

function init(ctx) {
  ie = [0, 0];
}

function control(ctx) {
  const m = ctx.model, y = ctx.y, dt = ctx.dt;
  const q = [y.q1, y.q2], qd = [y.q1dot, y.q2dot];
  // joint-space reference from the tool reference (elbow-up solution)
  const qr = m.ik(ctx.r.x, ctx.r.z, true);
  const J = m.jacobian(qr);
  let qrd = [0, 0], qrdd = [0, 0];
  if (Math.abs(det(J)) > 0.02) {                 // away from the stretched-out singularity
    qrd = solve(J, [ctx.rd.x, ctx.rd.z]);
    qrdd = solve(J, sub([ctx.rdd.x, ctx.rdd.z], mul(m.jacobianDot(qr, qrd), qrd)));
  }
  const e = [angleDiff(qr[0], q[0]), qr[1] - q[1]];
  const ed = sub(qrd, qd);
  for (let i = 0; i < 2; i++) ie[i] = clamp(ie[i] + e[i] * dt, -0.02, 0.02);
  const v = [0, 1].map(i => qrdd[i] + Kd * ed[i] + Kp * e[i] + Ki * ie[i]);
  // viscous + Coulomb friction feedforward from the model parameters
  const fr = qrd.map((w, i) => ctx.p.b * w + ctx.p.fc * Math.tanh(w / 0.02));
  const tau = add(add(mul(m.M(q), v), m.bias(q, qd)), fr);
  return tau;
}
