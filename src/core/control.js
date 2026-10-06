// Control design library: Riccati solvers, LQR, pole placement, discretization,
// estimators and discrete-time building blocks (PID, filters, Kalman filter).
import {
  zeros, eye, diag, clone, transpose, add, sub, scale, mul, inv, solve, isMat,
  hstack, vstack, block, submat, symmetrize, norm1, logAbsDet, expm, eig, poly, polyvalm, rank,
} from './linalg.js';

const asMat = (M, n, m) => {
  if (typeof M === 'number') return scale(eye(n), M);
  if (!isMat(M)) {
    // a vector: interpret as diagonal when square expected, or as column when m===1
    if (m === 1 && M.length === n) return M.map((x) => [x]);
    return diag(M);
  }
  return M;
};

// Continuous algebraic Riccati equation  A'X + XA - XBR^-1B'X + Q = 0
// solved with the Newton iteration for the matrix sign function.
export function care(A, B, Q, R) {
  const n = A.length;
  B = asMat(B, n, 1);
  const m = B[0].length;
  Q = asMat(Q, n);
  R = asMat(R, m);
  const Ri = inv(R);
  const G = mul(mul(B, Ri), transpose(B));
  let Z = block([[A, scale(G, -1)], [scale(Q, -1), scale(transpose(A), -1)]]);
  const N = 2 * n;
  for (let it = 0; it < 200; it++) {
    const Zi = inv(Z);
    let c = 1;
    if (it < 30) {
      const la = logAbsDet(Z);
      if (Number.isFinite(la)) c = Math.exp(-la / N);
    }
    const Zn = scale(add(scale(Z, c), scale(Zi, 1 / c)), 0.5);
    const d = norm1(sub(Zn, Z));
    Z = Zn;
    if (d <= 1e-13 * Math.max(1, norm1(Zn))) break;
  }
  const W11 = submat(Z, 0, n, 0, n), W12 = submat(Z, 0, n, n, N);
  const W21 = submat(Z, n, N, 0, n), W22 = submat(Z, n, N, n, N);
  const M = vstack(W12, add(W22, eye(n)));
  const Nn = vstack(add(W11, eye(n)), W21);
  const Mt = transpose(M);
  const X = scale(solve(mul(Mt, M), mul(Mt, Nn)), -1);
  return symmetrize(X);
}

// Discrete algebraic Riccati equation  X = A'XA - A'XB(R+B'XB)^-1B'XA + Q
// solved with the structure-preserving doubling algorithm.
export function dare(A, B, Q, R) {
  const n = A.length;
  B = asMat(B, n, 1);
  const m = B[0].length;
  Q = asMat(Q, n);
  R = asMat(R, m);
  let Ak = clone(A);
  let G = mul(mul(B, inv(R)), transpose(B));
  let H = clone(Q);
  const I = eye(n);
  for (let it = 0; it < 100; it++) {
    const W = inv(add(I, mul(G, H)));
    const AW = mul(Ak, W);
    const Anext = mul(AW, Ak);
    const Gnext = add(G, mul(mul(AW, G), transpose(Ak)));
    const Hnext = add(H, mul(mul(mul(transpose(Ak), H), W), Ak));
    const d = norm1(sub(Hnext, H));
    Ak = Anext;
    G = symmetrize(Gnext);
    H = symmetrize(Hnext);
    if (d <= 1e-13 * Math.max(1, norm1(H))) break;
  }
  return H;
}

const polesOf = (Acl) => {
  try { return eig(Acl); } catch { return []; }
};

// Continuous LQR: u = -K x minimizing  ∫ x'Qx + u'Ru (+ 2x'Nu) dt
export function lqr(A, B, Q, R, N) {
  const n = A.length;
  B = asMat(B, n, 1);
  const m = B[0].length;
  Q = asMat(Q, n);
  R = asMat(R, m);
  let Ae = A, Qe = Q;
  const Ri = inv(R);
  if (N) {
    N = asMat(N, n, m);
    Ae = sub(A, mul(mul(B, Ri), transpose(N)));
    Qe = sub(Q, mul(mul(N, Ri), transpose(N)));
  }
  const P = care(Ae, B, Qe, R);
  let K = mul(Ri, transpose(B));
  K = mul(K, P);
  if (N) K = add(K, mul(Ri, transpose(N)));
  const poles = polesOf(sub(A, mul(B, K)));
  return { K, P, poles };
}

// Discrete LQR: u[k] = -K x[k]
export function dlqr(A, B, Q, R) {
  const n = A.length;
  B = asMat(B, n, 1);
  const m = B[0].length;
  Q = asMat(Q, n);
  R = asMat(R, m);
  const P = dare(A, B, Q, R);
  const Bt = transpose(B);
  const K = solve(add(R, mul(mul(Bt, P), B)), mul(mul(Bt, P), A));
  const poles = polesOf(sub(A, mul(B, K)));
  return { K, P, poles };
}

// Steady-state Kalman gains. Continuous: x' = Ax + Bu + Gw, y = Cx + v
export function lqe(A, G, C, Qn, Rn) {
  const n = A.length;
  G = G ? asMat(G, n, 1) : eye(n);
  C = isMat(C) ? C : [C];
  const p = C.length;
  Qn = asMat(Qn, G[0].length);
  Rn = asMat(Rn, p);
  const P = care(transpose(A), transpose(C), mul(mul(G, Qn), transpose(G)), Rn);
  const L = mul(mul(P, transpose(C)), inv(Rn));
  return { L, P, poles: polesOf(sub(A, mul(L, C))) };
}
// Discrete (current-estimate form): x̂ = x̂⁻ + L (y - C x̂⁻)
export function dlqe(A, G, C, Qn, Rn) {
  const n = A.length;
  G = G ? asMat(G, n, 1) : eye(n);
  C = isMat(C) ? C : [C];
  const p = C.length;
  Qn = asMat(Qn, G[0].length);
  Rn = asMat(Rn, p);
  const P = dare(transpose(A), transpose(C), mul(mul(G, Qn), transpose(G)), Rn);
  const S = add(mul(mul(C, P), transpose(C)), Rn);
  const L = mul(mul(P, transpose(C)), inv(S));
  return { L, P };
}

export function ctrb(A, B) {
  const n = A.length;
  B = asMat(B, n, 1);
  const blocks = [B];
  let AB = B;
  for (let i = 1; i < n; i++) { AB = mul(A, AB); blocks.push(AB); }
  return hstack(...blocks);
}
export function obsv(A, C) {
  C = isMat(C) ? C : [C];
  const blocks = [C];
  let CA = C;
  for (let i = 1; i < A.length; i++) { CA = mul(CA, A); blocks.push(CA); }
  return vstack(...blocks);
}
export const isControllable = (A, B) => rank(ctrb(A, B)) === A.length;
export const isObservable = (A, C) => rank(obsv(A, C)) === A.length;

// Pole placement for single-input systems (Ackermann). Returns K (1 x n).
export function place(A, B, poles) {
  const n = A.length;
  B = asMat(B, n, 1);
  if (B[0].length !== 1) throw new Error('place: only single-input systems are supported (use lqr for MIMO)');
  if (poles.length !== n) throw new Error(`place: need ${n} poles`);
  const Co = ctrb(A, B);
  const phi = polyvalm(poly(poles), A);
  const en = new Array(n).fill(0);
  en[n - 1] = 1;
  const row = solve(transpose(Co), en); // en' Co^-1  == (Co'^-1 en)'
  return [mul(row, phi)];
}
export const acker = place;

// Zero-order-hold discretization.
export function c2d(A, B, dt) {
  const n = A.length;
  B = asMat(B, n, 1);
  const m = B[0].length;
  const M = zeros(n + m, n + m);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) M[i][j] = A[i][j] * dt;
    for (let j = 0; j < m; j++) M[i][n + j] = B[i][j] * dt;
  }
  const E = expm(M);
  return { Ad: submat(E, 0, n, 0, n), Bd: submat(E, 0, n, n, n + m) };
}

// Numerical Jacobians of f(x, u) -> xdot around (x0, u0).
export function linearize(f, x0, u0, eps = 1e-6) {
  const n = x0.length, m = u0.length;
  const A = zeros(n, n), B = zeros(n, m);
  const xp = Array.from(x0), up = Array.from(u0);
  for (let j = 0; j < n; j++) {
    const h = eps * Math.max(1, Math.abs(x0[j]));
    xp[j] = x0[j] + h;
    const fp = f(xp, up);
    xp[j] = x0[j] - h;
    const fm = f(xp, up);
    xp[j] = x0[j];
    for (let i = 0; i < n; i++) A[i][j] = (fp[i] - fm[i]) / (2 * h);
  }
  for (let j = 0; j < m; j++) {
    const h = eps * Math.max(1, Math.abs(u0[j]));
    up[j] = u0[j] + h;
    const fp = f(xp, up);
    up[j] = u0[j] - h;
    const fm = f(xp, up);
    up[j] = u0[j];
    for (let i = 0; i < n; i++) B[i][j] = (fp[i] - fm[i]) / (2 * h);
  }
  return { A, B };
}

// ---------------------------------------------------------------------------
// Scalar helpers
export const clamp = (x, lo, hi) => (x < lo ? lo : x > hi ? hi : x);
export const sat = (x, lim) => (x > lim ? lim : x < -lim ? -lim : x);
export const sign = (x) => (x > 0 ? 1 : x < 0 ? -1 : 0);
export const lerp = (a, b, t) => a + (b - a) * t;
export const deadzone = (x, w) => (Math.abs(x) <= w ? 0 : x - Math.sign(x) * w);
export const deg = (rad) => (rad * 180) / Math.PI;
export const rad = (d) => (d * Math.PI) / 180;
export function wrapAngle(a) {
  a = (a + Math.PI) % (2 * Math.PI);
  if (a < 0) a += 2 * Math.PI;
  return a - Math.PI;
}
export const angleDiff = (a, b) => wrapAngle(a - b);
export function smoothstep(e0, e1, x) {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
}
// Minimum-jerk interpolation from p0 to p1 over duration T, evaluated at t.
export function minJerk(p0, p1, T, t) {
  const tau = clamp(t / T, 0, 1);
  const s = 10 * tau ** 3 - 15 * tau ** 4 + 6 * tau ** 5;
  const ds = (30 * tau ** 2 - 60 * tau ** 3 + 30 * tau ** 4) / T;
  const dds = (60 * tau - 180 * tau ** 2 + 120 * tau ** 3) / (T * T);
  if (Array.isArray(p0)) {
    return {
      p: p0.map((a, i) => a + (p1[i] - a) * s),
      v: p0.map((a, i) => (p1[i] - a) * ds),
      a: p0.map((a, i) => (p1[i] - a) * dds),
    };
  }
  return { p: p0 + (p1 - p0) * s, v: (p1 - p0) * ds, a: (p1 - p0) * dds };
}

// ---------------------------------------------------------------------------
// Discrete-time building blocks

// PID with derivative filter, setpoint weighting and anti-windup.
// u = kp*(b*r - y) + ki*∫(r - y) + kd*d/dt(c*r - y) (filtered by first-order tf)
export class PID {
  constructor(opts = {}) {
    this.kp = opts.kp ?? 1;
    this.ki = opts.ki ?? 0;
    this.kd = opts.kd ?? 0;
    this.tf = opts.tf ?? 0.01; // derivative filter time constant [s]
    this.dt = opts.dt ?? 0.01;
    this.umin = opts.umin ?? (opts.limit != null ? -opts.limit : -Infinity);
    this.umax = opts.umax ?? (opts.limit != null ? opts.limit : Infinity);
    this.b = opts.b ?? 1;
    this.c = opts.c ?? 0;
    this.kaw = opts.kaw ?? null; // back-calculation gain; null -> conditional integration
    this.imax = opts.imax ?? Infinity; // clamp on integral contribution
    this.reset();
  }
  reset(i0 = 0) {
    this.I = i0;
    this.D = 0;
    this.prev = null;
    this.u = 0;
    this.P = 0;
  }
  update(r, y, dt = this.dt, ff = 0) {
    const e = r - y;
    const dsig = this.c * r - y;
    if (this.prev === null) this.prev = dsig;
    this.P = this.kp * (this.b * r - y);
    const tf = this.tf;
    this.D = (tf * this.D + this.kd * (dsig - this.prev)) / (tf + dt);
    this.prev = dsig;
    const v = this.P + this.I + this.D + ff;
    const u = clamp(v, this.umin, this.umax);
    if (this.kaw != null) {
      this.I += this.ki * e * dt + this.kaw * (u - v) * dt;
    } else {
      const saturatedHigh = v > this.umax && e > 0;
      const saturatedLow = v < this.umin && e < 0;
      if (!saturatedHigh && !saturatedLow) this.I += this.ki * e * dt;
    }
    this.I = clamp(this.I, -this.imax, this.imax);
    this.u = u;
    return u;
  }
}

export class LowPass {
  // First-order low-pass with cutoff fc [Hz]
  constructor(fc, dt = 0.01, x0 = null) {
    this.fc = fc;
    this.dt = dt;
    this.y = x0;
  }
  update(x, dt = this.dt) {
    if (this.y === null || this.y === undefined) { this.y = x; return x; }
    const a = dt / (dt + 1 / (2 * Math.PI * this.fc));
    this.y += a * (x - this.y);
    return this.y;
  }
  reset(x0 = null) { this.y = x0; }
}

// Second-order Butterworth low-pass (bilinear transform with prewarping)
export class Biquad {
  constructor(fc, dt = 0.01, q = Math.SQRT1_2) {
    const K = Math.tan(Math.PI * fc * dt);
    const norm = 1 / (1 + K / q + K * K);
    this.b0 = K * K * norm;
    this.b1 = 2 * this.b0;
    this.b2 = this.b0;
    this.a1 = 2 * (K * K - 1) * norm;
    this.a2 = (1 - K / q + K * K) * norm;
    this.reset();
  }
  reset(x0 = null) { this.z1 = this.z2 = 0; this.init = x0 === null ? false : (this._prime(x0), true); }
  _prime(x) {
    // steady-state for constant input x (DC gain 1)
    this.z1 = x * (1 - this.b0);
    this.z2 = x * (this.b2 - this.a2);
  }
  update(x) {
    if (!this.init) { this._prime(x); this.init = true; }
    const y = this.b0 * x + this.z1;
    this.z1 = this.b1 * x - this.a1 * y + this.z2;
    this.z2 = this.b2 * x - this.a2 * y;
    return y;
  }
}

// Filtered ("dirty") derivative: D(s) = s / (tf s + 1)
export class Derivative {
  constructor(tf = 0.01, dt = 0.01) {
    this.tf = tf;
    this.dt = dt;
    this.reset();
  }
  reset() { this.prev = null; this.y = 0; }
  update(x, dt = this.dt) {
    if (this.prev === null) { this.prev = x; return 0; }
    this.y = (this.tf * this.y + (x - this.prev)) / (this.tf + dt);
    this.prev = x;
    return this.y;
  }
}

export class RateLimiter {
  constructor(rate, dt = 0.01, x0 = null) {
    this.rate = rate;
    this.dt = dt;
    this.y = x0;
  }
  update(x, dt = this.dt) {
    if (this.y === null) { this.y = x; return x; }
    const step = this.rate * dt;
    this.y += clamp(x - this.y, -step, step);
    return this.y;
  }
  reset(x0 = null) { this.y = x0; }
}

export class MovingAverage {
  constructor(n = 5) { this.n = n; this.buf = []; this.sum = 0; }
  update(x) {
    this.buf.push(x);
    this.sum += x;
    if (this.buf.length > this.n) this.sum -= this.buf.shift();
    return this.sum / this.buf.length;
  }
  reset() { this.buf = []; this.sum = 0; }
}

export class Integrator {
  constructor(dt = 0.01, lo = -Infinity, hi = Infinity, x0 = 0) {
    this.dt = dt; this.lo = lo; this.hi = hi; this.y = x0;
  }
  update(x, dt = this.dt) { this.y = clamp(this.y + x * dt, this.lo, this.hi); return this.y; }
  reset(x0 = 0) { this.y = x0; }
}

// Linear discrete Kalman filter  x+ = A x + B u + w,  y = C x + v
export class KalmanFilter {
  constructor({ A, B, C, Q, R, x0, P0 }) {
    this.A = A;
    const n = A.length;
    this.B = B ? asMat(B, n, 1) : null;
    this.C = isMat(C) ? C : [C];
    this.Q = asMat(Q, n);
    this.R = asMat(R, this.C.length);
    this.x = x0 ? Array.from(x0) : new Array(n).fill(0);
    this.P = P0 ? asMat(P0, n) : eye(n);
  }
  predict(u) {
    let x = mul(this.A, this.x);
    if (this.B && u != null) x = add(x, mul(this.B, Array.isArray(u) ? u : [u]));
    this.x = x;
    this.P = symmetrize(add(mul(mul(this.A, this.P), transpose(this.A)), this.Q));
    return this.x;
  }
  update(y) {
    y = Array.isArray(y) ? y : [y];
    const C = this.C, P = this.P;
    const PCt = mul(P, transpose(C));
    const S = add(mul(C, PCt), this.R);
    const K = mul(PCt, inv(S));
    const innov = sub(y, mul(C, this.x));
    this.x = add(this.x, mul(K, innov));
    const I = eye(P.length);
    const IKC = sub(I, mul(K, C));
    this.P = symmetrize(add(mul(mul(IKC, P), transpose(IKC)), mul(mul(K, this.R), transpose(K))));
    this.K = K;
    return this.x;
  }
  step(u, y) {
    this.predict(u);
    return this.update(y);
  }
}
