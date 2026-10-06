import { makeSim, run, fmt, setQuiet } from './harness.mjs';
import plant from '../src/plants/cartpole.js';
const wrap = (a) => { a = (a + Math.PI) % (2*Math.PI); if (a < 0) a += 2*Math.PI; return a - Math.PI; };
function scenario(name, opts, T) {
  const sim = makeSim(plant, opts);
  let tBal = null, maxX = 0, maxF = 0, lastUp = null;
  const trace = [];
  const err = run(sim, T, 0.02, (s) => {
    const th = wrap(s.s[1]);
    maxX = Math.max(maxX, Math.abs(s.s[0]));
    maxF = Math.max(maxF, Math.abs(s.uCmd[0]));
    if (Math.abs(th) < 0.1 && tBal === null) tBal = s.t;
    if (Math.abs(th) > 0.5) tBal = null;
    trace.push([s.t, s.s[0], th, s.lastRef[0]]);
  });
  const last = trace.slice(-50);
  const thRms = Math.sqrt(last.reduce((a, r) => a + r[2]*r[2], 0) / last.length);
  const xErr = Math.sqrt(last.reduce((a, r) => a + (r[1]-r[3])**2, 0) / last.length);
  console.log(`${name.padEnd(34)} err=${err ? err.message : 'none'} balancedAt=${fmt(tBal,2)} max|x|=${fmt(maxX,2)} max|F|=${fmt(maxF,1)} final θrms=${fmt(thRms*180/Math.PI,2)}° xerr=${fmt(xErr,3)} IAE=${fmt(sim.metrics.iae,2)} exec=${fmt(sim.metrics.execSum/sim.metrics.execCount*1000,1)}µs`);
  return { sim, trace, tBal };
}
scenario('swingup from down (noise 1)', { ctrl: 'swingup-lqr', settings: { ic: 'down' } }, 20);
scenario('swingup from down (noise 0)', { ctrl: 'swingup-lqr', settings: { ic: 'down', noiseScale: 0 } }, 20);
scenario('swingup from down (noise 3)', { ctrl: 'swingup-lqr', settings: { ic: 'down', noiseScale: 3 } }, 20);
scenario('swingup + square ref', { ctrl: 'swingup-lqr', settings: { ic: 'down', refMode: 'square' } }, 30);
scenario('swingup random ic seed 3', { ctrl: 'swingup-lqr', settings: { ic: 'random' }, seed: 3 }, 20);
scenario('swingup random ic seed 11', { ctrl: 'swingup-lqr', settings: { ic: 'random' }, seed: 11 }, 20);
scenario('swingup heavy pole m=0.6', { ctrl: 'swingup-lqr', settings: { ic: 'down' }, params: { m: 0.6 } }, 25);
scenario('swingup long pole L=1.0', { ctrl: 'swingup-lqr', settings: { ic: 'down' }, params: { L: 1.0 } }, 25);
scenario('swingup 50Hz', { ctrl: 'swingup-lqr', settings: { ic: 'down', controlRate: 50 } }, 25);
scenario('lqr from tilt', { ctrl: 'lqr', settings: { ic: 'tilt' } }, 10);
scenario('lqr square ref', { ctrl: 'lqr', settings: { ic: 'tilt', refMode: 'square' } }, 30);
scenario('lqr with gusts 0.3N', { ctrl: 'lqr', settings: { ic: 'tilt', distLevel: 0.15 } }, 20);
scenario('swingup with gusts 0.3N', { ctrl: 'swingup-lqr', settings: { ic: 'down', distLevel: 0.15 } }, 20);
scenario('cascade pid from tilt', { ctrl: 'cascade-pid', settings: { ic: 'tilt' } }, 20);
scenario('cascade pid square ref', { ctrl: 'cascade-pid', settings: { ic: 'tilt', refMode: 'square' } }, 30);
