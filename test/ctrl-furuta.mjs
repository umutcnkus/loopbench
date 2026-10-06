import { makeSim, run, fmt } from './harness.mjs';
import plant from '../src/plants/furuta.js';
const wrap = (a) => { a = (a + Math.PI) % (2*Math.PI); if (a < 0) a += 2*Math.PI; return a - Math.PI; };
function scenario(name, opts, T) {
  const sim = makeSim(plant, opts);
  let tBal = null, maxV = 0, maxTh = 0;
  const tr = [];
  const err = run(sim, T, 0.02, (s) => {
    const a = wrap(s.s[1]);
    if (Math.abs(a) < 0.05 && tBal === null) tBal = s.t;
    if (Math.abs(a) > 0.5) tBal = null;
    maxV = Math.max(maxV, Math.abs(s.uCmd[0]));
    maxTh = Math.max(maxTh, Math.abs(s.s[0]));
    tr.push([s.t, a, s.s[0], s.lastRef[0]]);
  });
  const tail = tr.slice(-50);
  const aRms = Math.sqrt(tail.reduce((q, r) => q + r[1]**2, 0)/tail.length);
  const thErr = Math.sqrt(tail.reduce((q, r) => q + (r[2]-r[3])**2, 0)/tail.length);
  console.log(`${name.padEnd(28)} ${err ? 'ERR '+err.message : ''} balancedAt=${fmt(tBal,2)} max|V|=${fmt(maxV,1)} max|θ|=${fmt(maxTh*57.3,0)}° αrms=${fmt(aRms*57.3,2)}° θerr=${fmt(thErr*57.3,1)}°`);
}
scenario('swingup (noise 1)', { ctrl: 'swingup-lqr', settings: { ic: 'down' } }, 15);
scenario('swingup (noise 0)', { ctrl: 'swingup-lqr', settings: { ic: 'down', noiseScale: 0, quantize: false } }, 15);
scenario('swingup noise 3', { ctrl: 'swingup-lqr', settings: { ic: 'down', noiseScale: 3 } }, 15);
scenario('swingup + square', { ctrl: 'swingup-lqr', settings: { ic: 'down', refMode: 'square' } }, 25);
scenario('swingup spin ic', { ctrl: 'swingup-lqr', settings: { ic: 'spin' } }, 15);
scenario('swingup 200Hz', { ctrl: 'swingup-lqr', settings: { ic: 'down', controlRate: 200 } }, 15);
scenario('swingup long pend 0.2', { ctrl: 'swingup-lqr', settings: { ic: 'down' }, params: { Lp: 0.2 } }, 15);
scenario('swingup heavy mp 0.04', { ctrl: 'swingup-lqr', settings: { ic: 'down' }, params: { mp: 0.04 } }, 15);
scenario('lqr tilt', { ctrl: 'lqr', settings: { ic: 'tilt' } }, 8);
scenario('lqr sine', { ctrl: 'lqr', settings: { ic: 'tilt', refMode: 'sine' } }, 15);
scenario('lqr disturbance 1mNm', { ctrl: 'lqr', settings: { ic: 'tilt', distLevel: 1 } }, 15);
scenario('arm pd square', { ctrl: 'arm-pd', settings: { ic: 'down', refMode: 'square' } }, 15);
