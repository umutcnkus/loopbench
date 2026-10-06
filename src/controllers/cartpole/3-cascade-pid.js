// @name Cascaded PID
// @ic tilt
// Inner loop: PD keeps the pole at an angle set-point by moving the cart.
// Outer loop: lean the pole slightly toward the target so the cart follows.
// Needs the pole to start near upright. All four gains are live sliders.

const g = tunable({
  kpIn: [60, 0, 200],      // angle loop  [N/rad]
  kdIn: [9, 0, 30],        //             [N·s/rad]
  kpOut: [0.12, 0, 0.5],   // position loop [rad/m]
  kdOut: [0.17, 0, 0.6],   //               [rad·s/m]
});
let inner, outer;

function init(ctx) {
  inner = new PID({ kp: g.kpIn, ki: 0, kd: g.kdIn, tf: 0.01, dt: ctx.dt, umin: -25, umax: 25 });
  outer = new PID({ kp: g.kpOut, ki: 0.0, kd: g.kdOut, tf: 0.05, dt: ctx.dt, umin: -0.12, umax: 0.12 });
}

// a slider moved: update the PID objects without resetting their state
function onTune() {
  Object.assign(inner, { kp: g.kpIn, kd: g.kdIn });
  Object.assign(outer, { kp: g.kpOut, kd: g.kdOut });
}

function control(ctx) {
  const { x, theta } = ctx.y;
  const th = wrapAngle(theta);
  // outer: position error -> desired lean angle (lean toward the target)
  const thRef = outer.update(ctx.r.x, x);
  ctx.log('lean set-point', thRef);
  // inner: if the pole leans toward +x, drive the cart +x to get under it
  return -inner.update(thRef, th);
}
