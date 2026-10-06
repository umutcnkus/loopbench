import { makeSim, run, fmt } from './harness.mjs';
import plant from '../src/plants/segway.js';
function scenario(name, opts, T, inputFn) {
  const sim = makeSim(plant, opts);
  let maxPhi = 0, maxV = 0;
  const tr = [];
  const err = run(sim, T, 0.02, (s) => {
    if (inputFn) s.input.axes = inputFn(s.t);
    if (s.t > 0.5) maxPhi = Math.max(maxPhi, Math.abs(s.s[3]));
    maxV = Math.max(maxV, Math.abs(s.uCmd[0]), Math.abs(s.uCmd[1]));
    tr.push([s.t, s.s[4] - s.lastRef[0], s.s[5] - s.lastRef[1]]);
  });
  const tail = tr.filter(r => r[0] > T - 3);
  const ve = Math.sqrt(tail.reduce((q, r) => q + r[1]**2, 0)/tail.length);
  const we = Math.sqrt(tail.reduce((q, r) => q + r[2]**2, 0)/tail.length);
  console.log(`${name.padEnd(24)} ${err?'ERR '+err.message:''} status=${plant.status(sim.s).text} max|φ|=${fmt(maxPhi*57.3,1)}° max|V|=${fmt(maxV,1)} v err=${fmt(ve,3)} ψ̇ err=${fmt(we,3)} pos=[${fmt(sim.s[0],2)},${fmt(sim.s[1],2)}]`);
}
scenario('lqr stand tilt', { ctrl: 'lqr' }, 6);
scenario('lqr kicked', { ctrl: 'lqr', settings: { ic: 'kicked' } }, 8);
scenario('lqr eight', { ctrl: 'lqr', settings: { refMode: 'eight' } }, 20);
scenario('lqr stopgo', { ctrl: 'lqr', settings: { refMode: 'stopgo' } }, 12);
scenario('lqr keys fwd+turn', { ctrl: 'lqr', settings: { refMode: 'keys' } }, 10, (t) => [t > 5 ? 1 : 0, t < 8 ? 1 : 0, 0, 0]);
scenario('lqr noise 3', { ctrl: 'lqr', settings: { noiseScale: 3 } }, 6);
scenario('lqr slope noise 1N', { ctrl: 'lqr', settings: { distLevel: 1 } }, 10);
scenario('lqr heavy 3kg', { ctrl: 'lqr', params: { Mb: 3 } }, 6);
scenario('lqr tall l=0.3', { ctrl: 'lqr', params: { l: 0.3, I2: 0.03 } }, 6);
scenario('lqr 100Hz', { ctrl: 'lqr', settings: { controlRate: 100 } }, 6);
scenario('pid stand', { ctrl: 'pid-cascade' }, 6);
scenario('pid stopgo', { ctrl: 'pid-cascade', settings: { refMode: 'stopgo' } }, 12);
scenario('pid eight', { ctrl: 'pid-cascade', settings: { refMode: 'eight' } }, 20);
scenario('off', { ctrl: 'motors-off' }, 3);
