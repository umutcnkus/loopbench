// @name Linear cascade PID (tuned at 7 mm)
// The classic lab design: a PID position loop linearized around 7 mm produces
// a current set-point around the equilibrium current i0, and a PI loop drives
// the coil voltage. Works near 7 mm; gets sluggish or unstable far from it.
// The position-loop bandwidth and damping are live sliders.

const k = tunable({
  wn: [60, 15, 150],     // position-loop natural frequency [rad/s]
  zeta: [0.8, 0.2, 2],   // damping ratio
});
const x0 = 0.007;        // design gap [m]
let pos, cur, i0, kI;

// pole placement on  m·ẍ̃ = (2mg/x0)·x̃ − kI·ĩ  with  ĩ = −(Kp e + Kd ė + Ki∫e)
function gains(p) {
  return {
    kp: (p.m * k.wn * k.wn + 2 * p.m * p.g / x0) / kI,
    kd: p.m * 2 * k.zeta * k.wn / kI,
    ki: p.m * k.wn * k.wn * 8 / kI,
  };
}

function init(ctx) {
  const p = ctx.p;
  i0 = x0 * Math.sqrt(2 * p.m * p.g / p.Km);
  kI = 2 * p.m * p.g / i0;           // linearized force sensitivity dF/di [N/A]
  pos = new PID({ ...gains(p), tf: 0.002, dt: ctx.dt, umin: -i0, umax: 3 - i0 });
  cur = new PID({ kp: 180, ki: 3000, kd: 0, dt: ctx.dt, umin: -24, umax: 24 });
}

function onTune(ctx) {
  Object.assign(pos, gains(ctx.p));
}

function control(ctx) {
  // a positive gap error (ball too low) needs MORE current
  const iRef = i0 - pos.update(ctx.r.x, ctx.y.x);
  return ctx.p.R * iRef + cur.update(iRef, ctx.y.i);
}
