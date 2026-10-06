// Energy / momentum conservation checks with dissipation switched off.
import { makeSim, run, fmt } from './harness.mjs';
const plantIds = process.argv.slice(2);
const specs = {
  cartpole: { zero: { bc: 0, Fc: 0, bp: 0, track: 100 }, ic: [0, 2.0, 0.3, -1.0], T: 10 },
  furuta: { zero: { Dr: 0, Dp: 0, km: 0 }, ic: [0, 2.5, 3.0, -2.0], T: 10, tol: 1e-6 },
  doublependulum: { zero: { bc: 0, bj: 0, track: 100 }, ic: [0, 2.3, 2.9, 0.2, 0, 0], T: 10, model: true },
  crane: { zero: { bx: 0, cp: 0 }, ic: [0, 0, 1.5, 0.5, -0.3, 0.2, -0.1, 0.1, 0.5, 0.8], T: 6, model: true, u3: true },
  ballbeam: { zero: { bg: 0, crr: 0, kt: 0 }, ic: [0.1, 0.1, 0.3, -0.2], T: 1.5, model: true },
  maglev: { zero: { R: 0, c: 0 }, ic: [0.01, 0, 0.9], T: 0.25, model: true },
  arm: { zero: { b: 0, fc: 0 }, ic: [1.2, 0.5, 2.0, -3.0], T: 8, model: true },
  segway: { zero: { kt: 0, bm: 0 }, ic: [0, 0, 0, 0.3, 0.4, 2.5, -1.5, 0, 0], T: 5, model: true },
};
let fails = 0;
for (const id of plantIds.length ? plantIds : Object.keys(specs)) {
  const plant = (await import(`../src/plants/${id}.js`)).default;
  const spec = specs[id];
  const sim = makeSim({ ...plant, u0: undefined }, { params: spec.zero, settings: { noiseScale: 0 } });
  if (spec.model) sim.p._model = true;
  sim.s.set(spec.ic);
  if (spec.aux) Object.assign(sim.aux, spec.aux);
  const E0 = sim.energy();
  let maxDev = 0;
  const err = run(sim, spec.T, 0.01, (s) => { maxDev = Math.max(maxDev, Math.abs(s.energy() - E0)); });
  const rel = maxDev / Math.max(1e-9, Math.abs(spec.scale ?? E0) || 1);
  const ok = !err && rel < (spec.tol ?? 1e-6);
  if (!ok) fails++;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${id}: E0=${fmt(E0, 6)} max|ΔE|=${maxDev.toExponential(3)} rel=${rel.toExponential(2)} ${err ? JSON.stringify(err) : ''}`);
}
process.exit(fails ? 1 : 0);
