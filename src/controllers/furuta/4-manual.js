// @name Manual voltage (keyboard)
// ← / → apply ±6 V to the motor. Try to swing the pendulum up by hand.

function control(ctx) {
  return 6 * ctx.input.axes[0];
}
