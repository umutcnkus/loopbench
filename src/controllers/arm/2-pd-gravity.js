// @name Joint PD + gravity compensation
// τ = Kp (q_d − q) − Kd q̇ + G(q). Simple and provably stable for set-points;
// it lags on fast trajectories because it ignores the arm's inertia.
// The four gains are live sliders under the editor.

const k = tunable({
  kp1: [180, 0, 600],   // shoulder  [N·m/rad]
  kd1: [22, 0, 80],     //           [N·m·s/rad]
  kp2: [90, 0, 300],    // elbow
  kd2: [10, 0, 40],
});

function control(ctx) {
  const m = ctx.model, y = ctx.y;
  const q = [y.q1, y.q2];
  const qr = m.ik(ctx.r.x, ctx.r.z, true);
  const G = m.gravity(q);
  return [
    k.kp1 * angleDiff(qr[0], q[0]) - k.kd1 * y.q1dot + G[0],
    k.kp2 * (qr[1] - q[1]) - k.kd2 * y.q2dot + G[1],
  ];
}
