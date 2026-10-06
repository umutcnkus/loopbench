// @name Manual (keyboard)
// ← / → drive the motor directly. Keep the ball away from the ends!

function control(ctx) {
  return 4 * ctx.input.axes[0] - 1.5 * ctx.y.alphadot;
}
