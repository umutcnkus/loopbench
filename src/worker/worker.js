// Simulation worker. The page builds this script as: ENGINE + user factory.
import { Simulation } from '../core/sim.js';
import { lib } from '../core/lib.js';
import { plantById } from '../plants/index.js';
import { eig, rank } from '../core/linalg.js';
import { ctrb } from '../core/control.js';
import { beginTuneSetup, endTuneSetup, setTune } from '../core/tune.js';

Object.assign(self, lib);

// Forward console output from user code to the page (rate-limited).
let consoleBudget = 60;
let consoleDropped = 0;
const fmtArg = (a) => {
  if (typeof a === 'string') return a;
  if (typeof a === 'number') return Number.isInteger(a) ? String(a) : String(+a.toPrecision(6));
  try {
    return JSON.stringify(a, (k, v) => (typeof v === 'number' && !Number.isInteger(v) ? +v.toPrecision(5) : v));
  } catch {
    return String(a);
  }
};
for (const level of ['log', 'info', 'warn', 'error']) {
  console[level] = (...args) => {
    if (consoleBudget <= 0) { consoleDropped++; return; }
    consoleBudget--;
    postMessage({ type: 'console', level, text: args.map(fmtArg).join(' '), t: sim ? sim.t : 0 });
  };
}

let sim = null;

function serializeError(e) {
  return e ? { phase: e.phase, message: e.message, stack: e.stack } : null;
}

function frame(extra = {}) {
  const { rows, custom } = sim.drainLog();
  const m = sim.metrics;
  const msg = {
    type: 'frame',
    t: sim.t,
    s: Array.from(sim.s),
    aux: sim.aux,
    u: Array.from(sim.uEff),
    uCmd: Array.from(sim.uCmd),
    r: Array.from(sim.lastRef),
    status: sim.status,
    rows,
    custom,
    metrics: {
      iae: m.iae, ise: m.ise, effort: m.effort, satTime: m.satTime, time: m.time,
      execAvg: m.execCount ? m.execSum / m.execCount : 0, execMax: m.execMax, execFrameMax: m.execFrameMax,
    },
    error: serializeError(sim.error),
    warning: sim.warning || null,
    drag: sim.dragForce,
    poke: sim.lastPoke || null,
    dist: Array.from(sim.dist),
    ...extra,
  };
  m.execFrameMax = 0;
  sim.warning = null;
  if (consoleDropped) {
    postMessage({ type: 'console', level: 'warn', text: `… ${consoleDropped} more console messages suppressed`, t: sim.t });
    consoleDropped = 0;
  }
  consoleBudget = 60;
  postMessage(msg);
}

function linearization() {
  try {
    const { A, B } = sim.ctx.model.linearize();
    let poles = [];
    try { poles = eig(A); } catch {}
    let ctrbRank = null;
    try { ctrbRank = rank(ctrb(A, B)); } catch {}
    return { A, B, poles, ctrbRank, n: A.length };
  } catch (e) {
    return { error: String(e.message || e) };
  }
}

self.onmessage = (ev) => {
  const msg = ev.data;
  try {
    switch (msg.type) {
      case 'init': {
        const plant = plantById[msg.plantId];
        sim = new Simulation(plant, { params: msg.params, settings: msg.settings, seed: msg.seed });
        if (msg.nominal) { Object.assign(sim.rawNominal, msg.nominal); sim._deriveParams(); }
        let compileError = null;
        beginTuneSetup(msg.tune || {});
        if (typeof self.__userFactory === 'function') {
          try {
            const inst = self.__userFactory();
            if (!inst.control) compileError = { phase: 'compile', message: 'No control(ctx) function found. Define function control(ctx) { … } and return the actuator command.' };
            else sim.setController(inst);
          } catch (e) {
            compileError = { phase: 'compile', message: String(e.message || e), stack: String(e.stack || '') };
          }
        }
        sim.reset(msg.state || undefined);
        const tunables = endTuneSetup();
        postMessage({ type: 'ready', schema: sim.logSchema(), Tc: sim.Tc, dt: sim.dt, tunables });
        if (compileError) postMessage({ type: 'fatal', error: compileError });
        frame({ lin: msg.wantLin ? linearization() : undefined });
        break;
      }
      case 'advance': {
        if (!sim) return;
        sim.advance(msg.dt, msg.budget ?? 25);
        frame();
        break;
      }
      case 'reset': {
        if (!sim) return;
        if (msg.settings) for (const [k, v] of Object.entries(msg.settings)) sim.setSetting(k, v);
        beginTuneSetup();
        if (typeof self.__userFactory === 'function' && sim.controller) {
          try { sim.setController(self.__userFactory()); } catch {}
        }
        sim.reset(msg.state || undefined);
        endTuneSetup();
        frame();
        break;
      }
      case 'param':
        sim.setParam(msg.key, msg.value);
        break;
      case 'params':
        sim.setParams(msg.values);
        break;
      case 'setting':
        sim.setSetting(msg.key, msg.value);
        break;
      case 'refParams':
        sim.settings.refParams = msg.value;
        break;
      case 'input':
        sim.input.axes = msg.axes;
        sim.input.keys = msg.keys || {};
        sim.input.buttons = msg.buttons || {};
        break;
      case 'drag':
        sim.setDrag(msg.drag);
        break;
      case 'poke':
        sim.poke(msg.opts);
        break;
      case 'tune': {
        const d = setTune(msg.name, msg.value);
        const hook = sim && sim.controller && sim.controller.onTune;
        if (d && hook && !sim.error) {
          try {
            hook(sim.ctx, d.name, d.value);
          } catch (e) {
            sim._fail('onTune', e);
          }
        }
        break;
      }
      case 'linearize':
        postMessage({ type: 'lin', lin: linearization() });
        break;
      case 'snapshot':
        postMessage({ type: 'snapshot', id: msg.id, state: { s: Array.from(sim.s), aux: sim.aux, t: sim.t } });
        break;
    }
  } catch (e) {
    postMessage({ type: 'fatal', error: { phase: 'engine', message: String(e.message || e), stack: String(e.stack || '') } });
  }
};
