import { makeSim, run, fmt } from './harness.mjs';
import plant from '../src/plants/arm.js';
function scenario(name, opts, T, tail = 2) {
  const sim = makeSim(plant, opts);
  const tr = [];
  let maxTau = 0;
  const err = run(sim, T, 0.01, (s) => { tr.push([s.t, plant.trackError(s.s, s.lastRef, s.p)]); maxTau = Math.max(maxTau, Math.abs(s.uCmd[0])); });
  const tl = tr.filter(r => r[0] > T - tail);
  const rms = Math.sqrt(tl.reduce((q, r) => q + r[1]**2, 0)/tl.length);
  const mx = Math.max(...tl.map(r => r[1]));
  console.log(`${name.padEnd(28)} ${err?'ERR '+err.message:''} tail rms=${fmt(rms*1000,2)}mm max=${fmt(mx*1000,2)}mm max|τ1|=${fmt(maxTau,1)} ${plant.status(sim.s, sim.p, sim.aux, sim.lastRef).text}`);
}
scenario('ct point', { ctrl: 'computed-torque' }, 4);
scenario('ct circle', { ctrl: 'computed-torque', settings: { refMode: 'circle' } }, 8);
scenario('ct pick', { ctrl: 'computed-torque', settings: { refMode: 'pick' } }, 12, 6);
scenario('ct from hanging', { ctrl: 'computed-torque', settings: { ic: 'hanging' } }, 4);
scenario('ct from floor', { ctrl: 'computed-torque', settings: { ic: 'floor' } }, 4);
scenario('ct payload mismatch', { ctrl: 'computed-torque', settings: { refMode: 'circle', modelSync: false }, params: { mp: 1.5 } }, 8);
scenario('ct noise 3', { ctrl: 'computed-torque', settings: { refMode: 'circle', noiseScale: 3 } }, 8);
scenario('ct 200Hz', { ctrl: 'computed-torque', settings: { refMode: 'circle', controlRate: 200 } }, 8);
scenario('pdg point', { ctrl: 'pd-gravity' }, 4);
scenario('pdg circle', { ctrl: 'pd-gravity', settings: { refMode: 'circle' } }, 8);
scenario('imp point', { ctrl: 'impedance' }, 4);
scenario('imp circle', { ctrl: 'impedance', settings: { refMode: 'circle' } }, 8);
scenario('pid point', { ctrl: 'joint-pid' }, 5);
scenario('pid pick', { ctrl: 'joint-pid', settings: { refMode: 'pick' } }, 12, 6);
scenario('limp', { ctrl: 'limp' }, 4);
