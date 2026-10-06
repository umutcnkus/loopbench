// Quadrotor free rigid-body test: energy and angular momentum conservation
import { makeSim, run, fmt } from './harness.mjs';
import plant from '../src/plants/quadrotor.js';
import { quat } from '../src/core/rotation.js';
const sim = makeSim(plant, { params: { cd: 0, cd2: 0, Jzz: 0.0186, Jxx: 0.0095 }, settings: { noiseScale: 0 } });
sim.p.cw = 0; sim.p.Jr = 0;
// high above ground, rotors stopped, tumbling
sim.s.set([0, 0, 500, 1, 2, 30, ...quat.normalize([0.9, 0.3, -0.2, 0.1]), 3, -7, 2, 0, 0, 0, 0]);
const L = () => { const s = sim.s, p = sim.p; const hb = [p.Jxx * s[10], p.Jyy * s[11], p.Jzz * s[12]]; return quat.rotate([s[6], s[7], s[8], s[9]], hb); };
const E0 = sim.energy(), L0 = L();
let dE = 0, dL = 0;
run(sim, 5, 0.01, (s) => { dE = Math.max(dE, Math.abs(s.energy() - E0)); const l = L(); dL = Math.max(dL, Math.hypot(l[0]-L0[0], l[1]-L0[1], l[2]-L0[2])); });
console.log(`quad rigid body: E0=${fmt(E0,4)} max|dE|=${dE.toExponential(2)} (rel ${(dE/Math.abs(E0)).toExponential(2)}), |L0|=${fmt(Math.hypot(...L0),4)} max|dL|=${dL.toExponential(2)}`);
const rigidOk = dE / Math.abs(E0) < 1e-9 && dL < 1e-9;
console.log(rigidOk ? 'PASS quad rigid body' : 'FAIL quad rigid body');
if (!rigidOk) process.exitCode = 1;
