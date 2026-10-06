import * as L from '../src/core/linalg.js';
import * as C from '../src/core/control.js';
import { quat } from '../src/core/rotation.js';
const approx = (a, b, tol = 1e-6) => Math.abs(a - b) <= tol * Math.max(1, Math.abs(b));
let fails = 0;
const check = (name, ok, info='') => { console.log((ok ? 'PASS ' : 'FAIL ') + name + ' ' + info); if (!ok) fails++; };

// eig
let ev = L.eig([[0,1],[-2,-3]]);
check('eig 2x2 real', approx(ev[0].re,-1) && approx(ev[1].re,-2), JSON.stringify(ev));
ev = L.eig([[0,-1],[1,0]]);
check('eig rotation', approx(Math.abs(ev[0].im),1) && approx(ev[0].re,0,1e-9), JSON.stringify(ev));
// companion of (s+1)(s+2)(s+3)(s^2+2s+5)
const cp = L.poly([-1,-2,-3,[-1,2],[-1,-2]]);
const n = cp.length-1; const Acomp = L.zeros(n,n);
for (let j=0;j<n;j++) Acomp[0][j] = -cp[j+1]; for (let i=1;i<n;i++) Acomp[i][i-1]=1;
ev = L.eig(Acomp);
check('eig companion 5x5', ev.length===5 && ev.some(e=>approx(e.re,-3)) && ev.some(e=>approx(e.re,-1)&&approx(Math.abs(e.im),2)), JSON.stringify(ev.map(e=>[+e.re.toFixed(6),+e.im.toFixed(6)])));
// random 8x8 check: sum eig = trace, prod = det
let seed = 3; const rnd = () => (seed = (seed*16807)%2147483647)/2147483647 - 0.5;
const R8 = Array.from({length:8},()=>Array.from({length:8},rnd));
ev = L.eig(R8);
const sumRe = ev.reduce((s,e)=>s+e.re,0), sumIm = ev.reduce((s,e)=>s+e.im,0);
check('eig 8x8 trace', approx(sumRe, L.trace(R8), 1e-9) && Math.abs(sumIm)<1e-9, `${sumRe} vs ${L.trace(R8)}`);
// product of eigenvalues = det
let pr = {re:1, im:0}; for (const e of ev) pr = {re: pr.re*e.re - pr.im*e.im, im: pr.re*e.im + pr.im*e.re};
check('eig 8x8 det', approx(pr.re, L.det(R8), 1e-8), `${pr.re} vs ${L.det(R8)}`);

// expm
const E = L.expm([[0,-1],[1,0]]);
check('expm rotation', approx(E[0][0], Math.cos(1)) && approx(E[1][0], Math.sin(1)));
const E2 = L.expm([[-50, 20],[3, -80]]);
// compare with series via many small steps
let M = L.eye(2); const h = 1e-5; const Ah = [[1-50*h, 20*h],[3*h, 1-80*h]]; for(let i=0;i<1e5;i++) M = L.mul(Ah,M);
check('expm stiff', approx(E2[0][0], M[0][0], 1e-3) && approx(E2[1][1], M[1][1], 1e-3), `${E2[0][0]} vs ${M[0][0]}`);

// LQR double integrator
const A = [[0,1],[0,0]], B = [[0],[1]];
let r = C.lqr(A, B, L.eye(2), [[1]]);
check('lqr double integrator', approx(r.K[0][0],1) && approx(r.K[0][1],Math.sqrt(3)), JSON.stringify(r.K));
// residual check on an unstable 4-state system (cart-pole-like)
const A4 = [[0,0,1,0],[0,0,0,1],[0,-2,-0.5,0],[0,25,1,-0.1]], B4 = [[0],[0],[1],[-2]];
r = C.lqr(A4, B4, L.diag([10,100,1,1]), 0.1);
const P = r.P;
const res = L.add(L.add(L.mul(L.transpose(A4),P), L.mul(P,A4)), L.sub(L.diag([10,100,1,1]), L.scale(L.mul(L.mul(L.mul(P,B4), L.transpose(B4)), P), 10)));
check('care residual', L.norm(res) < 1e-6 * L.norm(P), 'res=' + L.norm(res).toExponential(2) + ' poles=' + JSON.stringify(r.poles.map(p=>+p.re.toFixed(3))));
check('lqr stable', r.poles.every(p => p.re < 0));
// MIMO LQR (2 inputs)
const Bm = [[0,0],[0,0],[1,0],[0,1]];
r = C.lqr(A4, Bm, L.eye(4), L.eye(2));
check('lqr mimo stable', r.poles.every(p => p.re < 0), JSON.stringify(r.K.map(row=>row.map(x=>+x.toFixed(3)))));

// DARE vs value iteration
const dt = 0.01; const { Ad, Bd } = C.c2d(A4, B4, dt);
const d = C.dlqr(Ad, Bd, L.diag([10,100,1,1]), 0.1);
let Pv = L.diag([10,100,1,1]);
for (let i=0;i<20000;i++){ const BtP = L.mul(L.transpose(Bd), Pv); const S = L.add([[0.1]], L.mul(BtP, Bd)); const K = L.solve(S, L.mul(BtP, Ad)); Pv = L.add(L.diag([10,100,1,1]), L.sub(L.mul(L.mul(L.transpose(Ad),Pv),Ad), L.mul(L.mul(L.transpose(Ad), L.mul(Pv,Bd)), K))); }
check('dare vs iteration', L.norm(L.sub(Pv, d.P)) < 1e-6*L.norm(Pv), `${L.norm(L.sub(Pv,d.P)).toExponential(2)} dK=${JSON.stringify(d.K[0].map(x=>+x.toFixed(3)))}`);
check('dlqr stable', d.poles.every(p => Math.hypot(p.re,p.im) < 1));
// continuous vs discrete gains close for small dt
const rc = C.lqr(A4, B4, L.diag([10,100,1,1]), 0.1);
check('dlqr ~ lqr', d.K[0].every((k,i)=>Math.abs(k-rc.K[0][i]) < 0.12*Math.abs(rc.K[0][i])+0.05), JSON.stringify(rc.K[0].map(x=>+x.toFixed(3))));

// c2d double integrator
const dd = C.c2d(A, B, 0.1);
check('c2d', approx(dd.Ad[0][1],0.1) && approx(dd.Bd[0][0],0.005) && approx(dd.Bd[1][0],0.1));
// place
const K = C.place(A, B, [-1,-2]);
check('place', approx(K[0][0],2) && approx(K[0][1],3), JSON.stringify(K));
const K4 = C.place(A4, B4, [-2,-3,[-4,1],[-4,-1]]);
ev = L.eig(L.sub(A4, L.mul(B4, K4)));
check('place 4x4', ev.some(e=>approx(e.re,-2)) && ev.some(e=>approx(e.re,-3)) && ev.some(e=>approx(e.re,-4)&&approx(Math.abs(e.im),1)), JSON.stringify(ev.map(e=>[+e.re.toFixed(4),+e.im.toFixed(4)])));
// rank / ctrb
check('ctrb rank', L.rank(C.ctrb(A4,B4))===4 && L.rank([[1,2],[2,4]])===1);
// lqe
const kf = C.dlqe(Ad, null, [[1,0,0,0],[0,1,0,0]], L.diag([1e-6,1e-6,1e-4,1e-4]), L.diag([1e-6,1e-6]));
check('dlqe', kf.L.length===4 && kf.L[0].length===2, JSON.stringify(kf.L.map(r=>r.map(x=>+x.toFixed(3)))));
// PID step on first order plant
const pid = new C.PID({kp:2, ki:5, kd:0.0, dt:0.01, umin:-10, umax:10});
let y=0; for (let i=0;i<1000;i++){ const u = pid.update(1, y); y += 0.01*(-y + u); }
check('pid first-order', approx(y,1,1e-3), 'y=' + y);
// quaternion checks
const q = quat.fromEuler(0.3, -0.2, 1.1); const e = quat.toEuler(q);
check('euler roundtrip', approx(e[0],0.3)&&approx(e[1],-0.2)&&approx(e[2],1.1));
const Rm = quat.toMatrix(q); const v = [0.3,-1,2]; const v1 = quat.rotate(q,v), v2 = L.mul(Rm, v);
check('quat rotate vs matrix', v1.every((x,i)=>approx(x,v2[i])));
const q2 = quat.fromMatrix(Rm); check('fromMatrix', Math.abs(Math.abs(q2[0]*q[0]+q2[1]*q[1]+q2[2]*q[2]+q2[3]*q[3])-1)<1e-12);
// Biquad DC gain
const bq = new C.Biquad(5, 0.001); let yb=0; for (let i=0;i<5000;i++) yb = bq.update(2); check('biquad dc', approx(yb,2,1e-6), yb);
console.log(fails ? `${fails} FAILED` : 'ALL PASS');
if (fails) process.exitCode = 1;
// singular matrix must still be detected
let threw = false; try { L.inv([[1,2],[2,4]]); } catch { threw = true; }
console.log(threw ? 'PASS singular detection' : 'FAIL singular detection');
if (!threw) process.exitCode = 1;
// badly scaled but regular
const Bad = [[1e-9, 0],[0, 1e9]]; const Bi = L.inv(Bad); const scaledOk = Math.abs(Bi[0][0]-1e9) < 1 && Math.abs(Bi[1][1]-1e-9) < 1e-18;
console.log(scaledOk ? 'PASS scaled inverse' : 'FAIL scaled inverse');
if (!scaledOk) process.exitCode = 1;
