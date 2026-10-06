// spacecraft: inertial angular momentum conservation with wheels driven
import { Simulation } from '../src/core/sim.js';
import { quat } from '../src/core/rotation.js';
import plant from '../src/plants/spacecraft.js';
const sim = new Simulation(plant, { params: { cw: 0 }, settings: { noiseScale: 0 } });
sim.setController({ control: (ctx) => [0.1 * Math.sin(ctx.t), -0.05, 0.08 * Math.cos(2 * ctx.t), 0, 0, 0] });
sim.reset();
sim.s.set([...quat.normalize([0.8, 0.2, -0.4, 0.3]), 0.05, -0.08, 0.1, 0.3, -0.2, 0.1]);
const L = () => { const s = sim.s, p = sim.p; const Jw = [0,1,2].map(i => p.J[i][0]*s[4] + p.J[i][1]*s[5] + p.J[i][2]*s[6]); return quat.rotate([s[0],s[1],s[2],s[3]], [Jw[0]+s[7], Jw[1]+s[8], Jw[2]+s[9]]); };
const L0 = L(); let dmax = 0;
for (let i = 0; i < 1000; i++) { sim.advance(0.02, 1e9); const l = L(); dmax = Math.max(dmax, Math.hypot(l[0]-L0[0], l[1]-L0[1], l[2]-L0[2])); }
console.log(`spacecraft |L0|=${Math.hypot(...L0).toFixed(4)} max|ΔL|=${dmax.toExponential(2)} after 20 s with wheels driven`, dmax < 1e-6 ? 'PASS' : 'FAIL');
if (!(dmax < 1e-6)) process.exitCode = 1;
