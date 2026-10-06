// @name Input shaping (ZV) + PD
// A zero-vibration shaper splits each reference change into two half steps
// separated by half a swing period T = π·sqrt(ℓ/g). The second half cancels
// the swing started by the first. The drives are plain PD position loops.

const hist = [];
let px, py, rlx, rly;

function init(ctx) {
  // the starting position counts as the previous reference
  hist.length = 0;
  hist.push([-1e9, ctx.y.x, ctx.y.y]);
  px = new PID({ kp: 2500, kd: 900, tf: 0.01, dt: ctx.dt, limit: 250 });
  py = new PID({ kp: 1500, kd: 550, tf: 0.01, dt: ctx.dt, limit: 150 });
  rlx = new RateLimiter(0.5, ctx.dt, ctx.y.x);   // m/s
  rly = new RateLimiter(0.5, ctx.dt, ctx.y.y);
}

function control(ctx) {
  const y = ctx.y, r = ctx.r, p = ctx.p, t = ctx.t;
  // speed-limited reference, then the two-impulse ZV shaper
  const rx = rlx.update(r.x), ry = rly.update(r.y);
  hist.push([t, rx, ry]);
  const halfT = Math.PI * Math.sqrt(y.l / p.g);
  while (hist.length > 2 && hist[1][0] <= t - halfT) hist.shift();
  const old = hist[0];
  const sx = 0.5 * rx + 0.5 * old[1], sy = 0.5 * ry + 0.5 * old[2];
  ctx.log('shaped x ref', sx);
  const Fh = p.m * p.g + (p.m + p.mh) * (9 * (y.l - r.l) + 5.4 * y.ldot);
  return [px.update(sx, y.x), py.update(sy, y.y), Fh];
}
