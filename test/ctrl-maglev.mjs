import { makeSim, run, fmt } from './harness.mjs';
import plant from '../src/plants/maglev.js';
function scenario(name, opts, T, tail = 1) {
  const sim = makeSim(plant, opts);
  const tr = [];
  let maxV = 0, minX = 1, stuck = false;
  const err = run(sim, T, 0.005, (s) => { tr.push([s.t, s.s[0] - s.lastRef[0]]); maxV = Math.max(maxV, Math.abs(s.uCmd[0])); minX = Math.min(minX, s.s[0]); if (s.s[0] < 0.0006) stuck = true; });
  const tl = tr.filter(r => r[0] > T - tail);
  const rms = Math.sqrt(tl.reduce((q, r) => q + r[1]**2, 0)/tl.length);
  console.log(`${name.padEnd(28)} ${err?'ERR '+err.message:''} ${plant.status(sim.s).text.padEnd(20)} tail rms=${fmt(rms*1e6,0)}µm gap=${fmt(sim.s[0]*1000,2)}mm i=${fmt(sim.s[2],3)} max|V|=${fmt(maxV,1)} minGap=${fmt(minX*1000,2)} ${stuck?'STUCK':''}`);
}
for (const c of ['feedback-lin', 'cascade-pid', 'lqr']) {
  scenario(c + ' lift from post', { ctrl: c }, 3);
  scenario(c + ' float hold', { ctrl: c, settings: { ic: 'float' } }, 2);
  scenario(c + ' square', { ctrl: c, settings: { ic: 'float', refMode: 'square' } }, 6, 0.5);
  scenario(c + ' sine', { ctrl: c, settings: { ic: 'float', refMode: 'sine' } }, 5);
  scenario(c + ' noise 3', { ctrl: c, settings: { ic: 'float', noiseScale: 3 } }, 2);
  scenario(c + ' heavy m=0.1', { ctrl: c, settings: { ic: 'post', modelSync: false }, params: { m: 0.1 } }, 3);
  scenario(c + ' from stuck', { ctrl: c, settings: { ic: 'stuck' } }, 3);
}
scenario('off', { ctrl: 'off', settings: { ic: 'float' } }, 1);
