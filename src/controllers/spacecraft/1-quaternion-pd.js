// @name Quaternion feedback + momentum management
// @default
// Attitude law (Wie's rate-limited eigen-axis slew):
//   ω_cmd = ω_ref + sat( 2k·q_e,vec , ω_max )
//   τ_des = J·Kr·(ω_cmd − ω) + ω × (Jω + h)
// Actuator allocation: the wheels deliver −τ_des within their torque limit.
// The thrusters step in only when a wheel is momentum-saturated, and they
// unload the wheels when the stored momentum grows (the wheels absorb that
// thruster torque so pointing is not disturbed).
// k, the slew-rate limit and Kr are live sliders under the editor.

const g = tunable({
  k: [0.12, 0.01, 0.5],     // attitude gain              [1/s]
  wMaxDeg: [3, 0.5, 10],    // slew-rate limit            [°/s]
  Kr: [0.4, 0.05, 2],       // rate-loop bandwidth        [1/s]
});
let unloading = false;

function control(ctx) {
  const y = ctx.y, p = ctx.p;
  const q = [y.qw, y.qx, y.qy, y.qz], w = [y.wx, y.wy, y.wz], h = [y.hx, y.hy, y.hz];
  const qr = [ctx.r.qw, ctx.r.qx, ctx.r.qy, ctx.r.qz];
  const qe = quat.error(q, qr);                          // rotation body → target, in body axes
  // reference rate (from the reference quaternion derivative), expressed in body axes
  const qrd = [ctx.rd.qw, ctx.rd.qx, ctx.rd.qy, ctx.rd.qz];
  const wr = quat.mul(quat.conj(qr), qrd).slice(1).map(v => 2 * v);
  const wff = quat.rotateInv(qe, wr);
  const wMax = g.wMaxDeg * PI / 180;
  let wc = [qe[1], qe[2], qe[3]].map(v => 2 * g.k * v);
  const n = v3.norm(wc);
  if (n > wMax) wc = v3.scale(wc, wMax / n);
  wc = add(wc, wff);
  const tauDes = add(mul(p.J, v3.scale(sub(wc, w), g.Kr)), v3.cross(w, add(mul(p.J, w), h)));

  // momentum unloading with hysteresis
  const hn = v3.norm(h);
  if (hn > 0.6 * p.hmax) unloading = true;
  if (hn < 0.1 * p.hmax) unloading = false;
  const dump = unloading ? v3.scale(h, -0.12 / Math.max(hn, 1e-6)) : [0, 0, 0];

  const wheel = [0, 0, 0], thr = [0, 0, 0];
  for (let i = 0; i < 3; i++) {
    let wi = dump[i] - tauDes[i];                        // wheel torque wanted
    const stuck = (h[i] >= 0.97 * p.hmax && wi > 0) || (h[i] <= -0.97 * p.hmax && wi < 0);
    if (stuck) wi = 0;
    wheel[i] = clamp(wi, -0.2, 0.2);
    // a wheel that is momentum-saturated cannot help: the thrusters take over
    const missing = tauDes[i] - (dump[i] - wheel[i]);
    thr[i] = clamp(dump[i] + (stuck && Math.abs(missing) > 0.01 ? missing : 0), -0.5, 0.5);
  }
  return [...wheel, ...thr];
}
