// @name PID + trajectory feedforward
// @default
// Small-angle model per axis:  ẍ ≈ (g / κ) · α   (κ = 7/5 for a solid ball)
// so the tilt command is a desired ball acceleration divided by ctx.p.gain.
// The servo loop sits inside and is ~8× faster than this outer loop.
// kp, kd, ki are live sliders under the editor.

const k = tunable({
  kp: [9, 0, 30],      // [1/s²]
  kd: [5.4, 0, 15],    // [1/s]
  ki: [4, 0, 15],      // [1/s³]
});
let ix, iy;

function init(ctx) {
  ix = 0;
  iy = 0;
}

function control(ctx) {
  const { x, y, vx, vy } = ctx.y;
  if (!Number.isFinite(x)) return [0, 0];          // ball lost: level the plate
  const r = ctx.r, rd = ctx.rd, rdd = ctx.rdd, dt = ctx.dt;
  const ex = r.x - x, ey = r.y - y;
  // integrate only near the target (avoids wind-up during large moves)
  if (Math.hypot(ex, ey) < 0.03) {
    ix = clamp(ix + ex * dt, -0.02, 0.02);
    iy = clamp(iy + ey * dt, -0.02, 0.02);
  }
  const ax = rdd.x + k.kp * ex + k.kd * (rd.x - vx) + k.ki * ix;
  const ay = rdd.y + k.kp * ey + k.kd * (rd.y - vy) + k.ki * iy;
  return [ax / ctx.p.gain, ay / ctx.p.gain];
}
