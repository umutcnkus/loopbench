// @name Cartesian impedance (Jᵀ control)
// The tool behaves like a spring-damper pulled toward the target:
//   F = K (x_d − x) + D (ẋ_d − ẋ),   τ = Jᵀ F + G(q)
// Drag the arm with the mouse to feel the stiffness. No inverse kinematics needed.

const K = [900, 900], D = [45, 45];   // N/m, N·s/m

function control(ctx) {
  const m = ctx.model, y = ctx.y;
  const q = [y.q1, y.q2], qd = [y.q1dot, y.q2dot];
  const x = m.fk(q);
  const J = m.jacobian(q);
  const xd = mul(J, qd);
  const F = [0, 1].map(i => K[i] * ([ctx.r.x, ctx.r.z][i] - x[i]) + D[i] * ([ctx.rd.x, ctx.rd.z][i] - xd[i]));
  return add(mul(transpose(J), F), m.gravity(q));
}
