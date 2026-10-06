// The library that user controllers see as globals.
import * as LA from './linalg.js';
import * as CT from './control.js';
import { v3, quat } from './rotation.js';
import { tunable } from './tune.js';

export const lib = {
  // linear algebra
  zeros: LA.zeros, eye: LA.eye, diag: LA.diag, clone: LA.clone, size: LA.size,
  transpose: LA.transpose, add: LA.add, sub: LA.sub, scale: LA.scale, mul: LA.mul,
  dot: LA.dot, norm: LA.norm, outer: LA.outer, inv: LA.inv, solve: LA.solve, det: LA.det,
  rank: LA.rank, expm: LA.expm, eig: LA.eig, hstack: LA.hstack, vstack: LA.vstack,
  block: LA.block, trace: LA.trace, poly: LA.poly,
  // control design
  lqr: CT.lqr, dlqr: CT.dlqr, care: CT.care, dare: CT.dare, lqe: CT.lqe, dlqe: CT.dlqe,
  place: CT.place, acker: CT.acker, c2d: CT.c2d, ctrb: CT.ctrb, obsv: CT.obsv,
  isControllable: CT.isControllable, isObservable: CT.isObservable, linearize: CT.linearize,
  // blocks
  PID: CT.PID, LowPass: CT.LowPass, Biquad: CT.Biquad, Derivative: CT.Derivative,
  RateLimiter: CT.RateLimiter, MovingAverage: CT.MovingAverage, Integrator: CT.Integrator,
  KalmanFilter: CT.KalmanFilter,
  // scalar helpers
  clamp: CT.clamp, sat: CT.sat, sign: CT.sign, lerp: CT.lerp, deadzone: CT.deadzone,
  deg: CT.deg, rad: CT.rad, wrapAngle: CT.wrapAngle, angleDiff: CT.angleDiff,
  smoothstep: CT.smoothstep, minJerk: CT.minJerk,
  // live sliders
  tunable,
  // 3D
  v3, quat,
  PI: Math.PI, TAU: 2 * Math.PI, g0: 9.81,
};

// Short reference used by the editor autocomplete and the docs panel.
export const libDocs = [
  ['tunable({ kp: [6, 0, 20], q: [10, 0.1, 1e3, \'log\'] })', 'Live sliders under the editor. Read k.kp in control(); optional onTune(ctx, name, value) hook'],
  ['lqr(A, B, Q, R)', 'Continuous LQR. Returns {K, P, poles}; use u = -K·x'],
  ['dlqr(Ad, Bd, Q, R)', 'Discrete LQR for x[k+1] = Ad x + Bd u'],
  ['c2d(A, B, dt)', 'Zero-order-hold discretization → {Ad, Bd}'],
  ['place(A, B, poles)', 'Ackermann pole placement (single input) → K'],
  ['lqe(A, G, C, Qn, Rn)', 'Continuous Kalman gain → {L, P}'],
  ['dlqe(Ad, G, C, Qn, Rn)', 'Discrete steady-state Kalman gain → {L, P}'],
  ['care / dare', 'Riccati equation solvers'],
  ['ctrb(A,B) · obsv(A,C) · rank(M)', 'Controllability / observability'],
  ['eig(A)', 'Eigenvalues → [{re, im}]'],
  ['linearize(f, x0, u0)', 'Numerical Jacobians of f(x,u) → {A, B}'],
  ['mul · add · sub · scale · transpose · inv · solve', 'Matrix algebra on nested arrays'],
  ['zeros(n,m) · eye(n) · diag(v) · expm(A)', 'Matrix constructors'],
  ['new PID({kp, ki, kd, tf, dt, umin, umax})', '.update(r, y) with derivative filter and anti-windup'],
  ['new LowPass(fc, dt) · new Biquad(fc, dt)', 'First / second-order low-pass filters'],
  ['new Derivative(tf, dt)', 'Filtered derivative'],
  ['new KalmanFilter({A, B, C, Q, R})', '.predict(u) · .update(y) · .x'],
  ['new RateLimiter(rate, dt)', 'Slew-rate limiter'],
  ['clamp · sat · wrapAngle · angleDiff · deg · rad', 'Scalar helpers'],
  ['minJerk(p0, p1, T, t)', 'Smooth point-to-point trajectory → {p, v, a}'],
  ['quat.* · v3.*', 'Quaternions [w,x,y,z] and 3-vectors'],
];
