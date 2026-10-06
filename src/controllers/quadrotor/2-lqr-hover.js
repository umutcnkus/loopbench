// @name LQR (small-angle hover model)
// A 12-state linear model around hover, written out by hand:
//   x = [px py pz vx vy vz φ θ ψ p q r],  u = [δT, τx, τy, τz]
// Small angles: v̇x = g·θ, v̇y = −g·φ, v̇z = δT/m, Euler rates ≈ body rates.
// The LQR gain acts on the error to the target; thrusts come from the mixer.

let K, mixInv;

function init(ctx) {
  const p = ctx.p, g = p.g;
  const A = zeros(12, 12), B = zeros(12, 4);
  for (let i = 0; i < 3; i++) { A[i][3 + i] = 1; A[6 + i][9 + i] = 1; }
  A[3][7] = g;       // ẍ from pitch
  A[4][6] = -g;      // ÿ from roll
  B[5][0] = 1 / p.m;
  B[9][1] = 1 / p.Jxx; B[10][2] = 1 / p.Jyy; B[11][3] = 1 / p.Jzz;
  const Q = diag([6, 6, 10, 2, 2, 3, 2, 2, 4, 0.2, 0.2, 0.2]);
  const R = diag([0.05, 20, 20, 5]);
  const d = lqr(A, B, Q, R);
  K = d.K;
  mixInv = inv(p.mixer);
  console.log('slowest closed-loop pole:', Math.max(...d.poles.map(z => z.re)).toFixed(3));
}

function control(ctx) {
  const y = ctx.y, p = ctx.p, r = ctx.r;
  const [roll, pitch, yaw] = quat.toEuler([y.qw, y.qx, y.qy, y.qz]);
  const rd = ctx.rd, rdd = ctx.rdd;               // reference velocity / acceleration
  const x = [y.x - r.x, y.y - r.y, y.z - r.z, y.vx - rd.x, y.vy - rd.y, y.vz - rd.z,
             roll, pitch, angleDiff(yaw, r.yaw), y.p, y.q, y.r];
  // rotate the horizontal position/velocity error into the heading frame
  const c = Math.cos(yaw), s = Math.sin(yaw);
  [x[0], x[1]] = [c * x[0] + s * x[1], -s * x[0] + c * x[1]];
  [x[3], x[4]] = [c * x[3] + s * x[4], -s * x[3] + c * x[4]];
  // feedforward attitude for the reference acceleration (heading frame)
  const axh = c * rdd.x + s * rdd.y, ayh = -s * rdd.x + c * rdd.y;
  x[6] -= -ayh / p.g;        // φ_ff
  x[7] -= axh / p.g;         // θ_ff
  const v = mul(K, x).map(k => -k);
  const T = p.m * (p.g + rdd.z) / (Math.cos(roll) * Math.cos(pitch)) + v[0];
  const Ti = mul(mixInv, [T, v[1], v[2], v[3]]);
  return Ti.map(t => clamp(t, 0, p.Tmax));
}
