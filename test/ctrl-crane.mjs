import { makeSim, run, fmt } from './harness.mjs';
import plant from '../src/plants/crane.js';
function scenario(name, opts, T) {
  const sim = makeSim(plant, opts);
  let maxSw = 0, maxSwEnd = 0;
  const tr = [];
  const err = run(sim, T, 0.02, (s) => {
    const sw = Math.acos(Math.min(1, Math.cos(s.s[3]) * Math.cos(s.s[4])));
    maxSw = Math.max(maxSw, sw);
    if (s.t > T - 3) maxSwEnd = Math.max(maxSwEnd, sw);
    tr.push([s.t, plant.trackError(s.s, s.lastRef)]);
  });
  const tail = tr.filter(r => r[0] > T - 3);
  const rms = Math.sqrt(tail.reduce((q, r) => q + r[1] ** 2, 0) / tail.length);
  console.log(`${name.padEnd(28)} ${err?'ERR '+err.message:''} ${plant.status(sim.s, sim.p).text.padEnd(18)} crate err rms=${fmt(rms*100,1)}cm maxSwing=${fmt(maxSw*57.3,1)}° lateSwing=${fmt(maxSwEnd*57.3,2)}° l=${fmt(sim.s[2],2)}`);
}
scenario('lqr pick (1 cycle)', { ctrl: 'lqr-scheduled' }, 30);
scenario('lqr point', { ctrl: 'lqr-scheduled', settings: { refMode: 'point' } }, 12);
scenario('lqr swing ic', { ctrl: 'lqr-scheduled', settings: { ic: 'swing', refMode: 'point' } }, 12);
scenario('lqr wind 8N', { ctrl: 'lqr-scheduled', settings: { refMode: 'point', distLevel: 8 } }, 15);
scenario('lqr heavy 30kg', { ctrl: 'lqr-scheduled', settings: { refMode: 'point' }, params: { m: 30 } }, 12);
scenario('lqr floor ic', { ctrl: 'lqr-scheduled', settings: { ic: 'floor', refMode: 'point' } }, 12);
scenario('pid point', { ctrl: 'pid-naive', settings: { refMode: 'point' } }, 12);
scenario('shaping point', { ctrl: 'input-shaping', settings: { refMode: 'point' } }, 12);
scenario('shaping pick', { ctrl: 'input-shaping' }, 30);
