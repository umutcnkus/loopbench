// @name Independent joint PID (no model)
// Each joint has its own PID loop that knows nothing about gravity or
// coupling. Watch the steady-state sag until the integrators catch up.
// Set ki to 0 with the sliders to see the sag stay.

const k = tunable({
  kp1: [220, 0, 600], ki1: [150, 0, 600], kd1: [24, 0, 80],   // shoulder
  kp2: [110, 0, 300], ki2: [80, 0, 300], kd2: [11, 0, 40],    // elbow
});
let pid1, pid2;

function init(ctx) {
  pid1 = new PID({ kp: k.kp1, ki: k.ki1, kd: k.kd1, tf: 0.005, dt: ctx.dt, limit: 60 });
  pid2 = new PID({ kp: k.kp2, ki: k.ki2, kd: k.kd2, tf: 0.005, dt: ctx.dt, limit: 30 });
}

function onTune() {
  Object.assign(pid1, { kp: k.kp1, ki: k.ki1, kd: k.kd1 });
  Object.assign(pid2, { kp: k.kp2, ki: k.ki2, kd: k.kd2 });
}

function control(ctx) {
  const y = ctx.y;
  const qr = ctx.model.ik(ctx.r.x, ctx.r.z, true);
  const q1r = y.q1 + angleDiff(qr[0], y.q1);   // unwrap the shoulder set-point
  return [pid1.update(q1r, y.q1), pid2.update(qr[1], y.q2)];
}
