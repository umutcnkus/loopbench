import { makeSim, run, fmt } from './harness.mjs';
import plant from '../src/plants/quadrotor.js';
function scenario(name, opts, T, tailT = 4) {
  const sim = makeSim(plant, opts);
  const errs = [];
  let maxTilt = 0, minZ = 99;
  const err = run(sim, T, 0.02, (s) => {
    const e = Math.hypot(s.s[0]-s.lastRef[0], s.s[1]-s.lastRef[1], s.s[2]-s.lastRef[2]);
    errs.push([s.t, e]);
    const tilt = Math.acos(Math.max(-1, Math.min(1, 1 - 2*(s.s[7]**2 + s.s[8]**2))));
    if (s.t > 1) maxTilt = Math.max(maxTilt, tilt);
    minZ = Math.min(minZ, s.s[2]);
  });
  const tail = errs.filter(([t]) => t > T - tailT);
  const rms = Math.sqrt(tail.reduce((a, [, e]) => a + e*e, 0) / Math.max(1, tail.length));
  const mx = Math.max(...tail.map(([, e]) => e));
  console.log(`${name.padEnd(30)} ${err ? 'ERR ' + err.message : ''} broken=${sim.aux.broken} tail rms=${fmt(rms,3)} max=${fmt(mx,3)} maxTilt=${fmt(maxTilt*57.3,1)}° z=${fmt(sim.s[2],2)} pos=[${fmt(sim.s[0],2)},${fmt(sim.s[1],2)}] exec=${fmt(sim.metrics.execSum/sim.metrics.execCount*1000,1)}µs`);
  return sim;
}
scenario('geom hover from ground', { ctrl: 'geometric' }, 10);
scenario('geom hover noise 0', { ctrl: 'geometric', settings: { noiseScale: 0 } }, 10);
scenario('geom circle', { ctrl: 'geometric', settings: { refMode: 'circle' } }, 24);
scenario('geom eight', { ctrl: 'geometric', settings: { refMode: 'eight' } }, 24);
scenario('geom waypoints', { ctrl: 'geometric', settings: { refMode: 'waypoints' } }, 24, 1);
scenario('geom wind 5', { ctrl: 'geometric', settings: { distLevel: 5 } }, 15);
scenario('geom tumble', { ctrl: 'geometric', settings: { ic: 'tumble' } }, 8);
scenario('geom heavy m=2', { ctrl: 'geometric', params: { m: 2 } }, 10);
scenario('geom 100Hz', { ctrl: 'geometric', settings: { controlRate: 100 } }, 10);
scenario('lqr hover from ground', { ctrl: 'lqr-hover' }, 10);
scenario('lqr circle', { ctrl: 'lqr-hover', settings: { refMode: 'circle' } }, 24);
scenario('lqr from hover IC', { ctrl: 'lqr-hover', settings: { ic: 'hover' } }, 6);
scenario('motors off from hover', { ctrl: 'motors-off', settings: { ic: 'hover' } }, 4);
scenario('motors off on ground', { ctrl: 'motors-off' }, 3);
