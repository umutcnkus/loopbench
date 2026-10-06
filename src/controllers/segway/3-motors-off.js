// @name Motors off
// No voltage on either motor (the back-EMF still brakes the wheels).

function control(ctx) {
  return [0, 0];
}
