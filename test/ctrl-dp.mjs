import { makeSim, run, fmt } from './harness.mjs';
import plant from '../src/plants/doublependulum.js';
const wrap = (a) => { a = (a + Math.PI) % (2*Math.PI); if (a < 0) a += 2*Math.PI; return a - Math.PI; };
function scenario(name, opts, T) {
  const sim = makeSim(plant, opts);
  let maxX = 0, maxF = 0, up = true;
  const err = run(sim, T, 0.01, (s) => { maxX = Math.max(maxX, Math.abs(s.s[0])); maxF = Math.max(maxF, Math.abs(s.uCmd[0])); if (Math.abs(wrap(s.s[1])) > 0.5 || Math.abs(wrap(s.s[2])) > 0.5) up = false; });
  console.log(`${name.padEnd(26)} ${err?'ERR '+err.message:''} up=${up} max|x|=${fmt(maxX,2)} max|F|=${fmt(maxF,1)} final x=${fmt(sim.s[0],3)} θ=${fmt(wrap(sim.s[1])*57.3,2)},${fmt(wrap(sim.s[2])*57.3,2)}`);
}
scenario('lqr tilt', { ctrl: 'lqr' }, 8);
scenario('lqr noise 3', { ctrl: 'lqr', settings: { noiseScale: 3 } }, 8);
scenario('lqr sine', { ctrl: 'lqr', settings: { refMode: 'sine' } }, 16);
scenario('lqr 200Hz', { ctrl: 'lqr', settings: { controlRate: 200 } }, 8);
scenario('lqr 100Hz', { ctrl: 'lqr', settings: { controlRate: 100 } }, 8);
scenario('lqr delay 5ms', { ctrl: 'lqr', settings: { sensorDelay: 0.005 } }, 8);
scenario('lqg tilt', { ctrl: 'lqg' }, 8);
scenario('lqg noise 3', { ctrl: 'lqg', settings: { noiseScale: 3 } }, 8);
scenario('lqg sine', { ctrl: 'lqg', settings: { refMode: 'sine' } }, 16);
scenario('none chaos', { ctrl: 'no-control', settings: { ic: 'chaos' } }, 10);
