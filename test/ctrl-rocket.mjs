import { makeSim, run, fmt } from './harness.mjs';
import plant from '../src/plants/rocket.js';
function scenario(name, opts, T) {
  const sim = makeSim(plant, opts);
  let maxTilt = 0;
  const err = run(sim, T, 0.05, (s) => { maxTilt = Math.max(maxTilt, Math.abs(s.s[2])); });
  const st = plant.status(sim.s, sim.p, sim.aux, sim.lastRef);
  const tc = sim.aux.touch;
  console.log(`${name.padEnd(26)} ${err?'ERR '+err.message:''} ${st.text.padEnd(42)} touch=${tc ? `vz ${fmt(tc.vz,2)} vx ${fmt(tc.vx,2)} tilt ${fmt(tc.tilt*57.3,1)}° x ${fmt(tc.x,1)} t ${fmt(tc.t,1)}` : 'none'} fuel=${fmt(sim.s[6],0)} maxTilt=${fmt(maxTilt*57.3,1)}°`);
}
scenario('descent', { ctrl: 'guidance' }, 45);
scenario('descent noise 3', { ctrl: 'guidance', settings: { noiseScale: 3 } }, 45);
scenario('descent wind 8', { ctrl: 'guidance', settings: { distLevel: 8 } }, 45);
scenario('high', { ctrl: 'guidance', settings: { ic: 'high' } }, 60);
scenario('hover ic land', { ctrl: 'guidance', settings: { ic: 'hover' } }, 40);
scenario('hover mode', { ctrl: 'guidance', settings: { ic: 'hover', refMode: 'hover' } }, 30);
scenario('ship', { ctrl: 'guidance', settings: { refMode: 'ship' } }, 45);
scenario('pad offset 30', { ctrl: 'guidance', settings: { refParams: { land: { x: 30 } } } }, 45);
scenario('pad offset -30', { ctrl: 'guidance', settings: { refParams: { land: { x: -30 } } } }, 45);
scenario('high pad 40', { ctrl: 'guidance', settings: { ic: 'high', refParams: { land: { x: 40 } } } }, 60);
scenario('heavy dry 2500', { ctrl: 'guidance', params: { md: 2500 } }, 45);
scenario('min throttle 0.6', { ctrl: 'guidance', params: { tmin: 0.6 } }, 45);
scenario('freefall', { ctrl: 'freefall' }, 20);
scenario('on pad', { ctrl: 'guidance', settings: { ic: 'pad' } }, 5);
