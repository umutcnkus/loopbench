// Shared helpers for plant models.
export const G = 9.81;
export const qAxis = (ax, ay, az, ang) => {
  const s = Math.sin(ang / 2);
  return [Math.cos(ang / 2), ax * s, ay * s, az * s];
};
export const qY = (a) => [Math.cos(a / 2), 0, Math.sin(a / 2), 0];
export const qX = (a) => [Math.cos(a / 2), Math.sin(a / 2), 0, 0];
export const qZ = (a) => [Math.cos(a / 2), 0, 0, Math.sin(a / 2)];
export const qI = [1, 0, 0, 0];
export const qmul = (a, b) => [
  a[0] * b[0] - a[1] * b[1] - a[2] * b[2] - a[3] * b[3],
  a[0] * b[1] + a[1] * b[0] + a[2] * b[3] - a[3] * b[2],
  a[0] * b[2] - a[1] * b[3] + a[2] * b[0] + a[3] * b[1],
  a[0] * b[3] + a[1] * b[2] - a[2] * b[1] + a[3] * b[0],
];

// Smooth Coulomb friction force opposing velocity v.
export const coulomb = (Fc, v, vs = 0.004) => Fc * Math.tanh(v / vs);

// One-sided soft stop: returns restoring force when x leaves [lo, hi].
// Never pulls (unilateral contact).
export function softStop(x, v, lo, hi, k, c) {
  if (x > hi) return Math.min(0, -k * (x - hi) - c * v);
  if (x < lo) return Math.max(0, -k * (x - lo) - c * v);
  return 0;
}

export const wrap = (a) => {
  a = (a + Math.PI) % (2 * Math.PI);
  if (a < 0) a += 2 * Math.PI;
  return a - Math.PI;
};

// Solve a small dense linear system in place (Gaussian elimination, partial
// pivoting). M is an array of rows (n x n), b is an array; result written to b.
export function solveInPlace(M, b, n) {
  for (let k = 0; k < n; k++) {
    let p = k, big = Math.abs(M[k][k]);
    for (let i = k + 1; i < n; i++) {
      const v = Math.abs(M[i][k]);
      if (v > big) { big = v; p = i; }
    }
    if (p !== k) {
      const tr = M[p]; M[p] = M[k]; M[k] = tr;
      const tb = b[p]; b[p] = b[k]; b[k] = tb;
    }
    const piv = M[k][k];
    for (let i = k + 1; i < n; i++) {
      const f = M[i][k] / piv;
      if (f === 0) continue;
      for (let j = k; j < n; j++) M[i][j] -= f * M[k][j];
      b[i] -= f * b[k];
    }
  }
  for (let i = n - 1; i >= 0; i--) {
    let s = b[i];
    for (let j = i + 1; j < n; j++) s -= M[i][j] * b[j];
    b[i] = s / M[i][i];
  }
  return b;
}

// Common reference-mode builders -------------------------------------------
export const refHold = (label, params, fn) => ({ id: 'hold', label, params, fn });
export function squareWave(t, T) {
  return Math.floor((2 * t) / T) % 2 === 0 ? 1 : -1;
}
// smoothed square wave (tanh edges) for friendlier set-point changes
export function smoothSquare(t, T, edge = 0.15) {
  return Math.tanh(Math.sin((2 * Math.PI * t) / T) / edge) / Math.tanh(1 / edge);
}
