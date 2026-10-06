import { makeSim, run, fmt } from './harness.mjs';
import plant from '../src/plants/ballbeam.js';
function scenario(name, opts, T, tail = 2) {
  const sim = makeSim(plant, opts);
  const tr = []; let maxA = 0;
  const err = run(sim, T, 0.02, (s) => { tr.push([s.t, s.s[0] - s.lastRef[0]]); maxA = Math.max(maxA, Math.abs(s.s[1])); });
  const tl = tr.filter(r => r[0] > T - tail);
  const rms = Math.sqrt(tl.reduce((q, r) => q + r[1] ** 2, 0) / tl.length);
  console.log(`${name.padEnd(24)} ${err?'ERR '+err.message:''} ${plant.status(sim.s, sim.p, sim.aux, sim.lastRef).text.padEnd(22)} tail rms=${fmt(rms*1000,1)}mm max|α|=${fmt(maxA*57.3,1)}°`);
}
for (const c of ['cascade-pd', 'lqr']) {
  scenario(c + ' from end', { ctrl: c }, 8);
  scenario(c + ' square', { ctrl: c, settings: { refMode: 'square' } }, 20, 1);
  scenario(c + ' sine', { ctrl: c, settings: { refMode: 'sine' } }, 16);
  scenario(c + ' rolling', { ctrl: c, settings: { ic: 'rolling' } }, 8);
  scenario(c + ' noise 3', { ctrl: c, settings: { noiseScale: 3 } }, 8);
  scenario(c + ' heavy ball', { ctrl: c, params: { m: 0.4 } }, 8);
}
