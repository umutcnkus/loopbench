// @name Powered-descent guidance + gimbal attitude control
// @default
// Vertical: a constant-deceleration braking profile that ends at 1.2 m/s,
//     v_ref = −sqrt(v_f² + 2·a·h)        (h = height of the CG above touchdown)
// tracked with the profile deceleration a fed forward.
// Horizontal: ZEM/ZEV guidance using the time-to-go of that profile,
//     a_x = 6·ZEM/t_go² − 2·ZEV/t_go
// turned into a tilt set-point; in the last 12 m only sideways speed is nulled.
// Attitude: invert  I·θ̈ = −h_cg·T·sin δ  for the gimbal angle δ.

const vf = 1.2;

function control(ctx) {
  const { x, z, theta, vx, vz, thetadot, fuel } = ctx.y;
  const p = ctx.p, g = p.g;
  const m = p.md + fuel, I = m * 14 * 14 / 12;
  const zTouch = ctx.r.z + p.hcg;                  // CG height when the legs touch
  const h = Math.max(0, z - zTouch);
  const hover = ctx.r.z > 0.5;

  // --- vertical guidance (descend more gently when far from the target, to buy time)
  const far = Math.abs(ctx.r.x - x);
  const aB = 0.5 * (p.Tmax / m - g) * clamp(1 - far / 180, 0.4, 1);
  const vzRef = hover ? clamp(0.6 * (zTouch - z), -15, 8) : -Math.sqrt(vf * vf + 2 * aB * h);
  const onProfile = !hover && vz < vzRef + 3;
  const az = clamp((onProfile ? aB : 0) + 1.8 * (vzRef - vz), -g, 12);

  // --- horizontal guidance (zero-effort miss / velocity), aiming to be over the
  //     pad and at rest sideways by the time the vehicle is 12 m up
  const vAt = (hh) => Math.sqrt(vf * vf + 2 * aB * Math.max(0, hh));
  const tgo = hover ? 4 : Math.max(3, (vAt(h) - vAt(12)) / aB);
  const xT = ctx.r.x + ctx.rd.x * tgo;              // where the target will be
  const zem = xT - x - vx * tgo, zev = ctx.rd.x - vx;
  let ax = clamp(6 * zem / (tgo * tgo) - 2 * zev / tgo, -3.5, 3.5);
  let tiltMax = 0.26;
  if (!hover && h < 12) {                     // final metres: kill sideways speed, stay nearly upright
    ax = clamp(-1.5 * (vx - ctx.rd.x), -1, 1);
    tiltMax = 0.07;
  }
  const thRef = clamp(Math.atan2(ax, Math.max(g + az, 0.5 * g)), -tiltMax, tiltMax);

  // --- throttle (min-throttle limited; shut down after touchdown)
  const T = m * (g + az) / Math.max(0.6, Math.cos(theta));
  let throttle = clamp(T / p.Tmax, p.tmin, 1);
  if (fuel <= 0 || (!hover && h < 0.15 && Math.abs(vz) < 0.8)) throttle = 0;

  // --- attitude through the gimbal (RCS helps)
  const thdd = 2.25 * (thRef - theta) - 2.4 * thetadot;
  const Tact = throttle * p.Tmax;
  const gimbal = Tact > 1 ? clamp(Math.asin(clamp(-I * thdd / (p.hcg * Tact), -1, 1)), -p.dlim, p.dlim) : 0;
  const rcs = clamp(I * thdd / p.rcs * 0.3, -1, 1);
  return [throttle, gimbal, rcs];
}
