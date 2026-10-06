// @name Feedback linearization + current loop
// @default
// Outer loop: choose a ball acceleration a_d with PID + feedforward, then invert
// the force law  F = K_m i² / (2x²)  to get the current that produces it:
//   i_ref = x · sqrt( 2 m (g − a_d) / K_m )
// Inner loop: PI current controller on the 0.4 H coil (plus back-EMF/resistance
// feedforward) turns i_ref into a voltage.

const wn = 70, zeta = 0.9;                  // outer loop [rad/s]
const Kp = wn * wn, Kd = 2 * zeta * wn, Ki = 0.25 * wn * wn * wn / 10;
const wc = 500;                             // current loop bandwidth [rad/s]
let ie, ii, dFilt;

function init(ctx) {
  ie = 0;
  ii = 0;
  dFilt = new LowPass(150, ctx.dt);         // smooth the velocity measurement
}

function control(ctx) {
  const p = ctx.p, dt = ctx.dt;
  const x = Math.max(ctx.y.x, 0.001), v = dFilt.update(ctx.y.xdot), i = ctx.y.i;
  const e = ctx.r.x - x, ed = ctx.rd.x - v;
  if (x < 0.0135) ie = clamp(ie + e * dt, -2e-4, 2e-4);   // no integration while on the post
  // desired downward acceleration of the ball (limited: the coil cannot
  // pull hard or let go instantly)
  const a = clamp(ctx.rdd.x + Kp * clamp(e, -0.0015, 0.0015) + Kd * ed + Ki * ie, -8, 6);
  const Fup = Math.max(0, p.m * (p.g - a));                // required magnetic force
  const iRef = clamp(x * Math.sqrt(2 * Fup / p.Km), 0, 3);
  // current loop: L(x) di/dt = V − R i + (K_m/x²) ẋ i
  const Lx = p.L + p.Km / x;
  const ei = iRef - i;
  ii = clamp(ii + ei * dt, -0.05, 0.05);
  const V = p.R * iRef - (p.Km / (x * x)) * v * i + Lx * wc * (ei + 60 * ii);
  return V;
}
