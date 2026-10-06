import { makeSim, run, fmt } from './harness.mjs';
import plant from '../src/plants/ballplate.js';
function scenario(name, opts, T, tail = 3) {
  const sim = makeSim(plant, opts);
  const tr = [];
  const err = run(sim, T, 0.02, (s) => tr.push([s.t, Math.hypot(s.s[0]-s.lastRef[0], s.s[1]-s.lastRef[1]), Math.abs(s.s[4]), Math.abs(s.s[5])]));
  const tl = tr.filter(r => r[0] > T - tail);
  const rms = Math.sqrt(tl.reduce((q, r) => q + r[1]**2, 0)/tl.length);
  const mt = Math.max(...tr.map(r => Math.max(r[2], r[3])));
  console.log(`${name.padEnd(26)} ${err?'ERR '+err.message:''} mode=${sim.aux.mode} tail rms=${fmt(rms*1000,1)}mm max tilt=${fmt(mt*57.3,1)}° IAE=${fmt(sim.metrics.iae,3)}`);
}
scenario('pid offset->0', { ctrl: 'pid' }, 8);
scenario('pid rolling', { ctrl: 'pid', settings: { ic: 'rolling' } }, 8);
scenario('pid tilted edge', { ctrl: 'pid', settings: { ic: 'tilted' } }, 8);
scenario('pid circle', { ctrl: 'pid', settings: { refMode: 'circle' } }, 15);
scenario('pid eight', { ctrl: 'pid', settings: { refMode: 'eight' } }, 20);
scenario('pid square', { ctrl: 'pid', settings: { refMode: 'square' } }, 20);
scenario('pid circle noise 3', { ctrl: 'pid', settings: { refMode: 'circle', noiseScale: 3 } }, 15);
scenario('pid hollow ball', { ctrl: 'pid', settings: { refMode: 'circle' }, params: { hollow: 1 } }, 15);
scenario('pid 50Hz', { ctrl: 'pid', settings: { refMode: 'circle', controlRate: 50 } }, 15);
scenario('lqr offset', { ctrl: 'lqr-full' }, 8);
scenario('lqr circle', { ctrl: 'lqr-full', settings: { refMode: 'circle' } }, 15);
scenario('lqr eight', { ctrl: 'lqr-full', settings: { refMode: 'eight' } }, 20);
scenario('lqr rolling', { ctrl: 'lqr-full', settings: { ic: 'rolling' } }, 8);
scenario('no ctrl tilted', { }, 3);
