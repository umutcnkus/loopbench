// @name Manual tilt (keyboard)
// Tilt the plate yourself with the arrow keys / WASD, like a wooden
// labyrinth game.

function control(ctx) {
  const [ax, ay] = ctx.input.axes;
  return [0.08 * ax, 0.08 * ay];
}
