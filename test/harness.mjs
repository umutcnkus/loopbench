// Headless harness: run a plant with a controller template, report metrics.
import { Simulation } from '../src/core/sim.js';
import { lib } from '../src/core/lib.js';
import { compileFactory } from '../src/core/runtime.js';
import controllers from '../src/generated/controllers.js';
import { beginTuneSetup } from '../src/core/tune.js';
Object.assign(globalThis, lib);
let quiet = true;
const realLog = console.log;
export function setQuiet(q) { quiet = q; }
export function makeSim(plant, { ctrl, settings = {}, params = {}, seed = 7 } = {}) {
  const sim = new Simulation(plant, { settings, params, seed });
  if (ctrl) {
    const tpl = controllers[plant.id].find((c) => c.id === ctrl);
    if (!tpl) throw new Error('no controller ' + ctrl);
    const factory = compileFactory(tpl.code);
    beginTuneSetup({});
    sim.setController(factory());
  }
  const saved = console.log;
  if (quiet) console.log = () => {};
  sim.reset();
  console.log = saved;
  return sim;
}
export function run(sim, T, every = 0.5, onSample) {
  const saved = console.log;
  if (quiet) console.log = () => {};
  const n = Math.round(T / every);
  for (let i = 0; i < n; i++) {
    sim.advance(every, 1e9);
    if (sim.error) { console.log = saved; return sim.error; }
    onSample && onSample(sim);
  }
  console.log = saved;
  return null;
}
export const fmt = (x, d = 3) => (Number.isFinite(x) ? x.toFixed(d) : String(x));
