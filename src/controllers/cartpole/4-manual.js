// @name Manual (keyboard)
// @ic tilt
// Drive the cart yourself with ← / → (or A / D). Can you keep it up?
// It starts from "Upright, tilted 8°". Tip: set the speed to 0.5× first.

function control(ctx) {
  return 20 * ctx.input.axes[0];
}
