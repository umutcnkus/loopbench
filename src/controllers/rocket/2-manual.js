// @name Manual flight
// ↑/↓ throttle up/down, ←/→ tilt, with an automatic attitude hold.
// Land softly (below 4 m/s) and upright on the pad!

let thr = 0.6;

function control(ctx) {
  const { theta, thetadot, fuel } = ctx.y;
  const p = ctx.p, m = p.md + fuel, I = m * 14 * 14 / 12;
  thr = clamp(thr + ctx.input.axes[1] * 0.5 * ctx.dt, 0, 1);
  const thRef = 0.25 * ctx.input.axes[0];
  const thdd = 2.25 * (thRef - theta) - 2.4 * thetadot;
  const T = Math.max(p.tmin, thr) * p.Tmax;
  const gimbal = clamp(Math.asin(clamp(-I * thdd / (p.hcg * T), -1, 1)), -p.dlim, p.dlim);
  ctx.log('throttle', thr);
  return [thr, gimbal, clamp(I * thdd / p.rcs * 0.3, -1, 1)];
}
