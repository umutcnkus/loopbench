import { makeSim, run, fmt } from './harness.mjs';
import plant from '../src/plants/spacecraft.js';
function scenario(name, opts, T) {
  const sim = makeSim(plant, opts);
  let tOn = null, maxH = 0;
  const err = run(sim, T, 0.1, (s) => { const e = plant.trackError(s.s, s.lastRef) * 57.3; if (e < 0.5 && tOn === null) tOn = s.t; if (e > 1) tOn = null; maxH = Math.max(maxH, Math.abs(s.s[7]), Math.abs(s.s[8]), Math.abs(s.s[9])); });
  console.log(`${name.padEnd(26)} ${err?'ERR '+err.message:''} ${plant.status(sim.s, sim.p, sim.aux, sim.lastRef).text.padEnd(26)} settled@${fmt(tOn,1)}s max|h|=${fmt(maxH,2)} rate=${fmt(Math.hypot(sim.s[4],sim.s[5],sim.s[6])*57.3,3)}°/s impulse=${fmt(sim.aux.impulse,2)}`);
}
scenario('pd offset', { ctrl: 'quaternion-pd' }, 90);
scenario('pd tumble', { ctrl: 'quaternion-pd', settings: { ic: 'tumble' } }, 120);
scenario('pd loaded wheels', { ctrl: 'quaternion-pd', settings: { ic: 'aligned' } }, 120);
scenario('pd sequence', { ctrl: 'quaternion-pd', settings: { refMode: 'sequence' } }, 80);
scenario('pd scan', { ctrl: 'quaternion-pd', settings: { refMode: 'scan' } }, 60);
scenario('pd solar 3mNm 600s', { ctrl: 'quaternion-pd', settings: { distLevel: 3 } }, 600);
scenario('detumble', { ctrl: 'detumble', settings: { ic: 'tumble' } }, 60);
scenario('lqr offset', { ctrl: 'lqr' }, 90);
scenario('lqr tumble', { ctrl: 'lqr', settings: { ic: 'tumble' } }, 120);
