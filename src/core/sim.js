// Generic fixed-step simulation engine: RK4 plant integration, sampled controller
// with zero-order hold, sensor noise/quantization/delay, actuator saturation/lag/
// delay, disturbances, interactive forces, logging and metrics.
import { makeRng } from './rng.js';
import { linearize as numLinearize } from './control.js';
import { quat } from './rotation.js';

const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

export const DEFAULT_SETTINGS = {
  controlRate: 200, // Hz
  noiseScale: 1, // multiplier on the plant's nominal sensor noise
  quantize: true, // encoder / ADC quantization
  sensorDelay: 0, // s
  actuatorDelay: 0, // s
  actuatorLag: 0, // s (first-order)
  distLevel: 0, // plant-specific disturbance amplitude
  modelSync: true, // controller's ctx.p follows parameter edits
  refMode: null,
  refParams: {},
  ic: null,
  logRate: 250,
};

function paramDefaults(plant) {
  const p = {};
  for (const d of plant.params || []) p[d.key] = d.value;
  return p;
}

// Attach named accessors to a numeric array (y.theta === y[1]).
export function nameArray(arr, names) {
  for (let i = 0; i < names.length; i++) {
    const k = names[i];
    if (k in Array.prototype || k === 'length') continue;
    arr[k] = arr[i];
  }
  return arr;
}

export class Simulation {
  constructor(plant, opts = {}) {
    this.plant = plant;
    this.nx = plant.states.length;
    this.nu = plant.inputs.length;
    this.nr = (plant.refs || []).length;
    this.ny = (plant.outputs || plant.states).length;
    this.nGen = plant.qIdx ? plant.qIdx.length : plant.nGen || 0;
    this.dt = plant.dt || 0.001;
    this.rng = makeRng(opts.seed ?? 1234567);
    this.settings = { ...DEFAULT_SETTINGS, controlRate: plant.controlRate || 200, ...(opts.settings || {}) };
    if (!this.settings.refMode && plant.refModes?.length) this.settings.refMode = plant.refModes[0].id;
    if (!this.settings.ic && plant.initialConditions?.length) this.settings.ic = plant.initialConditions[0].id;
    this.dist = new Float64Array(plant.dist?.dims || 1);
    this._ou = new Float64Array(plant.dist?.dims || 1);
    this.rawTrue = { ...paramDefaults(plant), ...(opts.params || {}) };
    this.rawNominal = { ...this.rawTrue };
    this._deriveParams();

    const nx = this.nx;
    this.s = new Float64Array(nx);
    this._k1 = new Float64Array(nx);
    this._k2 = new Float64Array(nx);
    this._k3 = new Float64Array(nx);
    this._k4 = new Float64Array(nx);
    this._tmp = new Float64Array(nx);
    this.uCmd = new Float64Array(this.nu);
    this.uSat = new Float64Array(this.nu);
    this.uTarget = new Float64Array(this.nu);
    this.uEff = new Float64Array(this.nu);
    this.ext = new Float64Array(Math.max(1, this.nGen));
    this._zeroExt = new Float64Array(Math.max(1, this.nGen));
    this.uMin = plant.inputs.map((d) => d.min ?? -Infinity);
    this.uMax = plant.inputs.map((d) => d.max ?? Infinity);
    this.input = { axes: [0, 0, 0, 0], keys: {} };
    this.controller = null;
    this.drag = null;
    this.pokes = [];
    this.error = null;
    this.logListeners = [];
    this.reset();
  }

  // ---------------------------------------------------------------- parameters
  _deriveParams() {
    const pl = this.plant;
    this.p = pl.derive ? pl.derive({ ...this.rawTrue }) : { ...this.rawTrue };
    this.pNom = pl.derive ? pl.derive({ ...this.rawNominal }) : { ...this.rawNominal };
    this.p._d = this.dist;
    this.pNom._d = new Float64Array(pl.dist?.dims || 1);
    // Controller-side model: smooth dynamics (no stick-slip friction, no end stops)
    this.pNom._model = true;
  }
  setParam(key, value) {
    this.rawTrue[key] = value;
    if (this.settings.modelSync) this.rawNominal[key] = value;
    this._deriveParams();
    this._refreshModel();
  }
  setParams(obj) {
    Object.assign(this.rawTrue, obj);
    if (this.settings.modelSync) Object.assign(this.rawNominal, obj);
    this._deriveParams();
    this._refreshModel();
  }
  setSetting(key, value) {
    this.settings[key] = value;
    if (key === 'modelSync' && value) {
      this.rawNominal = { ...this.rawTrue };
      this._deriveParams();
      this._refreshModel();
    }
    if (key === 'controlRate' || key === 'sensorDelay' || key === 'actuatorDelay') this._setupTiming();
    if (key === 'refMode') this.refState = {};
  }

  // ------------------------------------------------------------------- timing
  _setupTiming() {
    const st = this.settings;
    const rate = Math.max(1, Math.min(1 / this.dt, st.controlRate));
    this.ctrlEvery = Math.max(1, Math.round(1 / (rate * this.dt)));
    this.Tc = this.ctrlEvery * this.dt;
    this.sensorDelaySteps = Math.max(0, Math.round((st.sensorDelay || 0) / this.Tc));
    this.actDelaySteps = Math.max(0, Math.round((st.actuatorDelay || 0) / this.Tc));
    const logRate = Math.min(st.logRate || 250, 1 / this.Tc);
    this.logEvery = Math.max(1, Math.round(1 / (logRate * this.Tc)));
    if (this.ctx) this.ctx.dt = this.Tc;
  }

  // -------------------------------------------------------------------- reset
  reset(state) {
    const pl = this.plant;
    this._setupTiming();
    this.t = 0;
    this.stepCount = 0;
    this.tick = 0;
    this.error = null;
    this.status = null;
    this.aux = pl.initAux ? pl.initAux(this.p) : {};
    if (state) {
      this.s.set(state.s);
      this.t = state.t || 0;
      if (state.aux) this.aux = JSON.parse(JSON.stringify(state.aux));
    } else {
      const icDef = (pl.initialConditions || []).find((d) => d.id === this.settings.ic) || pl.initialConditions?.[0];
      const s0 = icDef ? icDef.fn(this.p, this.rng, this.aux) : new Array(this.nx).fill(0);
      this.s.set(s0);
    }
    if (pl.post) pl.post(this.s, this.p, this.aux, 0, this.t);
    this.uCmd.fill(0);
    if (pl.u0) {
      const u0 = pl.u0(this.p);
      this.uCmd.set(u0);
    }
    this.uSat.set(this.uCmd);
    this.uTarget.set(this.uCmd);
    this.uEff.set(this.uCmd);
    this.sensorQueue = [];
    this.actQueue = [];
    this.refState = {};
    this._ou.fill(0);
    this.dist.fill(0);
    this.pokes = [];
    this.metrics = { iae: 0, ise: 0, effort: 0, satTime: 0, time: 0, execSum: 0, execMax: 0, execCount: 0, execFrameMax: 0 };
    this.customLog = new Map();
    this.pendingRows = [];
    this.pendingCustom = [];
    this.lastRef = new Float64Array(this.nr);
    this.lastRefD = new Float64Array(this.nr);
    this.lastRefDD = new Float64Array(this.nr);
    this.s0 = Array.from(this.s);
    this._computeRef();
    this._buildCtx();
    this.ctrlReady = true;
    if (this.controller?.init) {
      try {
        this.ctx.t = this.t;
        this.ctx.y = this._measureNow(true);
        this.controller.init(this.ctx);
      } catch (e) {
        this._fail('init', e);
      }
    }
  }

  setController(ctrl) {
    this.controller = ctrl;
  }

  // ------------------------------------------------------------ controller ctx
  _refreshModel() {
    if (!this.ctx) return;
    this.ctx.p = this.pNom;
    this.ctx.model = this._makeModel();
  }
  _makeModel() {
    const pl = this.plant, pN = this.pNom, nx = this.nx, nGen = this.nGen;
    const zeroExt = new Float64Array(Math.max(1, nGen));
    const out = new Float64Array(nx);
    const sBuf = new Float64Array(nx);
    const auxNom = pl.initAux ? pl.initAux(pN) : {};
    const f = (x, u) => {
      sBuf.set(x);
      pl.deriv(0, sBuf, u, pN, zeroExt, out, auxNom);
      return Array.from(out);
    };
    const eq = pl.equilibrium ? pl.equilibrium(pN) : { x: new Array(nx).fill(0), u: new Array(this.nu).fill(0) };
    const model = {
      f,
      eq,
      x0: eq.x,
      u0: eq.u,
      linearize: (x0 = eq.x, u0 = eq.u, eps) => numLinearize(f, x0, u0, eps),
    };
    if (pl.modelExtras) Object.assign(model, pl.modelExtras(pN));
    return model;
  }
  _buildCtx() {
    const pl = this.plant;
    const sim = this;
    const stateNames = pl.states.map((d) => d.key);
    this.ctx = {
      t: 0,
      dt: this.Tc,
      y: null,
      r: null,
      u: null,
      p: this.pNom,
      plant: {
        id: pl.id,
        name: pl.name,
        states: stateNames,
        outputs: (pl.outputs || pl.states).map((d) => d.key),
        inputs: pl.inputs.map((d) => d.key),
        refs: (pl.refs || []).map((d) => d.key),
        uMin: this.uMin.slice(),
        uMax: this.uMax.slice(),
        dtPhysics: this.dt,
      },
      model: null,
      input: this.input,
      state: {},
      log(name, value) {
        if (typeof value !== 'number' || !Number.isFinite(value)) return;
        sim._logCustom(String(name), value);
      },
    };
    this.ctx.model = this._makeModel();
  }

  _logCustom(name, value) {
    this.customLog.set(name, value);
  }

  // ------------------------------------------------------------------ sensors
  _measureNow(noiseless = false) {
    const pl = this.plant, ny = this.ny;
    let y;
    if (pl.measure) y = pl.measure(this.s, this.p, this.aux);
    else y = Array.from(this.s);
    const noise = pl.noise;
    const scale = noiseless ? 0 : this.settings.noiseScale;
    if (noise && scale > 0) {
      for (let i = 0; i < ny; i++) if (noise[i]) y[i] += noise[i] * scale * this.rng.gauss();
    }
    if (!noiseless && this.settings.quantize && pl.quant) {
      for (let i = 0; i < ny; i++) {
        const q = pl.quant[i];
        if (q) y[i] = Math.round(y[i] / q) * q;
      }
    }
    if (pl.postMeasure) pl.postMeasure(y, this.p, this.aux);
    return nameArray(y, (pl.outputs || pl.states).map((d) => d.key));
  }

  _computeRef() {
    const pl = this.plant;
    if (!pl.refModes || !pl.refModes.length) return this.lastRef;
    const mode = pl.refModes.find((m) => m.id === this.settings.refMode) || pl.refModes[0];
    const opts = {};
    for (const d of mode.params || []) opts[d.key] = this.settings.refParams?.[mode.id]?.[d.key] ?? d.value;
    const dt = this.Tc || 0.005;
    const r = mode.fn(this.t, opts, this.refState, this.input, dt, this.p, this.s0);
    for (let i = 0; i < this.nr; i++) this.lastRef[i] = r[i];
    // analytic-quality derivatives for smooth (time-only) reference modes
    if (mode.smooth) {
      const h = 1e-3, t = this.t;
      const rp = mode.fn(t + h, opts, {}, this.input, dt, this.p, this.s0);
      const rm = mode.fn(Math.max(0, t - h), opts, {}, this.input, dt, this.p, this.s0);
      const hm = t - Math.max(0, t - h);
      for (let i = 0; i < this.nr; i++) {
        this.lastRefD[i] = (rp[i] - rm[i]) / (h + hm);
        this.lastRefDD[i] = hm > 0 ? (rp[i] - 2 * r[i] + rm[i]) / (h * h) : 0;
      }
    } else {
      this.lastRefD.fill(0);
      this.lastRefDD.fill(0);
    }
    return this.lastRef;
  }

  // --------------------------------------------------------- controller tick
  _controlTick() {
    const pl = this.plant, nu = this.nu;
    // sensor with delay
    const yNow = this._measureNow();
    let y = yNow;
    if (this.sensorDelaySteps > 0) {
      this.sensorQueue.push(yNow);
      if (this.sensorQueue.length > this.sensorDelaySteps) y = this.sensorQueue.shift();
      else y = this.sensorQueue[0];
    }
    const refKeys = (pl.refs || []).map((d) => d.key);
    const r = nameArray(Array.from(this._computeRef()), refKeys);
    const ctx = this.ctx;
    ctx.t = this.t;
    ctx.y = y;
    ctx.r = r;
    ctx.rd = nameArray(Array.from(this.lastRefD), refKeys);
    ctx.rdd = nameArray(Array.from(this.lastRefDD), refKeys);
    ctx.u = nameArray(Array.from(this.uCmd), pl.inputs.map((d) => d.key));
    let u = null;
    if (this.controller?.control && !this.error) {
      const t0 = now();
      try {
        u = this.controller.control(ctx);
      } catch (e) {
        this._fail('control', e);
        u = null;
      }
      const ex = now() - t0;
      const m = this.metrics;
      m.execSum += ex;
      m.execCount++;
      if (ex > m.execMax) m.execMax = ex;
      if (ex > m.execFrameMax) m.execFrameMax = ex;
    }
    if (u != null && !this.error) {
      if (typeof u === 'number') u = [u];
      if (!(Array.isArray(u) || ArrayBuffer.isView(u))) {
        this._fail('control', new Error(`control() must return a number or an array of ${nu} numbers`));
      } else {
        for (let i = 0; i < nu; i++) {
          const v = Number(u[i]);
          this.uCmd[i] = Number.isFinite(v) ? v : 0;
          if (!Number.isFinite(v) && !this._warnedNaN) {
            this._warnedNaN = true;
            this.warning = `control() returned ${u[i]} for input ${i}; using 0`;
          }
        }
      }
    } else if (!this.controller || this.error) {
      this.uCmd.fill(0);
      if (pl.u0 && !this.controller) this.uCmd.set(pl.u0(this.p));
    }
    for (let i = 0; i < nu; i++) {
      const v = this.uCmd[i];
      this.uSat[i] = v < this.uMin[i] ? this.uMin[i] : v > this.uMax[i] ? this.uMax[i] : v;
    }
    if (this.actDelaySteps > 0) {
      this.actQueue.push(Float64Array.from(this.uSat));
      if (this.actQueue.length > this.actDelaySteps) this.uTarget.set(this.actQueue.shift());
    } else {
      this.uTarget.set(this.uSat);
    }
    if (this.tick % this.logEvery === 0) this._logRow(y);
    this.tick++;
  }

  _logRow(y) {
    const pl = this.plant;
    const row = [this.t];
    for (let i = 0; i < this.nx; i++) row.push(this.s[i]);
    for (let i = 0; i < this.ny; i++) row.push(y[i]);
    for (let i = 0; i < this.nr; i++) row.push(this.lastRef[i]);
    for (let i = 0; i < this.nu; i++) row.push(this.uCmd[i]);
    const ua = this.settings.actuatorLag > 0 ? this.uEff : this.uTarget;
    for (let i = 0; i < this.nu; i++) row.push(ua[i]);
    if (pl.derived) for (const d of pl.derived) row.push(d.fn(this.s, this.p, this.aux, this.lastRef, this.uEff));
    this.pendingRows.push(row);
    if (this.customLog.size) {
      const obj = {};
      for (const [k, v] of this.customLog) obj[k] = v;
      this.pendingCustom.push([this.t, obj]);
      this.customLog.clear();
    }
  }

  logSchema() {
    const pl = this.plant;
    const cols = ['t'];
    for (const d of pl.states) cols.push('x.' + d.key);
    for (const d of pl.outputs || pl.states) cols.push('y.' + d.key);
    for (const d of pl.refs || []) cols.push('r.' + d.key);
    for (const d of pl.inputs) cols.push('u.' + d.key);
    for (const d of pl.inputs) cols.push('ua.' + d.key);
    for (const d of pl.derived || []) cols.push('d.' + d.key);
    return cols;
  }

  drainLog() {
    const rows = this.pendingRows;
    const custom = this.pendingCustom;
    this.pendingRows = [];
    this.pendingCustom = [];
    return { rows, custom };
  }

  // ------------------------------------------------------------ external forces
  pointWorld(body, local, s = this.s) {
    const pose = this.plant.pose(s, this.p, this.aux, body);
    const r = quat.rotate(pose.q, local);
    return [pose.p[0] + r[0], pose.p[1] + r[1], pose.p[2] + r[2]];
  }
  // Returns {pos, v, J} with J = array (per generalized speed) of 3-vectors.
  pointJacobian(body, local) {
    const pl = this.plant;
    if (pl.pointJac) return pl.pointJac(this.s, this.p, this.aux, body, local);
    const s = this.s, qIdx = pl.qIdx, qdIdx = pl.qdIdx;
    const pos = this.pointWorld(body, local);
    const J = [];
    const v = [0, 0, 0];
    for (let i = 0; i < qIdx.length; i++) {
      const k = qIdx[i];
      const save = s[k];
      const h = 1e-6 * Math.max(1, Math.abs(save));
      s[k] = save + h;
      const pp = this.pointWorld(body, local, s);
      s[k] = save - h;
      const pm = this.pointWorld(body, local, s);
      s[k] = save;
      const Ji = [(pp[0] - pm[0]) / (2 * h), (pp[1] - pm[1]) / (2 * h), (pp[2] - pm[2]) / (2 * h)];
      J.push(Ji);
      const qd = s[qdIdx[i]];
      v[0] += Ji[0] * qd;
      v[1] += Ji[1] * qd;
      v[2] += Ji[2] * qd;
    }
    return { pos, v, J };
  }
  _applyPointForce(body, local, f) {
    if (!this.nGen) return;
    const { J } = this.pointJacobian(body, local);
    for (let i = 0; i < J.length; i++) this.ext[i] += J[i][0] * f[0] + J[i][1] * f[1] + J[i][2] * f[2];
  }
  setDrag(d) {
    this.drag = d && d.active ? { ...d } : null;
  }
  poke(opts) {
    const pk = this.plant.poke;
    if (!pk) return;
    const def = typeof pk === 'function' ? pk(this.s, this.p, this.aux, this.rng) : pk;
    const sgn = opts?.sign ?? (this.rng.uniform() < 0.5 ? -1 : 1);
    const f = def.f.map((x) => x * sgn * (opts?.scale ?? 1));
    this.pokes.push({ body: def.body, local: def.local, f, until: this.t + (def.duration || 0.05) });
    this.lastPoke = { body: def.body, local: def.local, f, t: this.t };
  }

  _computeExt() {
    this.ext.fill(0);
    this.dragForce = null;
    if (this.drag) {
      const d = this.drag;
      const { pos, v } = this.pointJacobian(d.body, d.local);
      const k = d.k ?? this.plant.dragK ?? 50;
      const c = d.c ?? 2 * Math.sqrt(k * (this.plant.dragMass ?? 1));
      const f = [0, 1, 2].map((i) => k * (d.target[i] - pos[i]) - c * v[i]);
      const fmax = this.plant.dragFmax ?? 100;
      const fn = Math.hypot(f[0], f[1], f[2]);
      if (fn > fmax) for (let i = 0; i < 3; i++) f[i] *= fmax / fn;
      this.dragForce = { pos, f };
      this._applyPointForce(d.body, d.local, f);
    }
    if (this.pokes.length) {
      this.pokes = this.pokes.filter((pk) => pk.until > this.t);
      for (const pk of this.pokes) this._applyPointForce(pk.body, pk.local, pk.f);
    }
  }

  _updateDisturbance() {
    const pl = this.plant;
    if (!pl.dist) return;
    const D = pl.dist, lvl = this.settings.distLevel || 0;
    const tau = D.tau ?? 1.0;
    const a = Math.exp(-this.dt / tau);
    const b = Math.sqrt(1 - a * a);
    for (let i = 0; i < this._ou.length; i++) {
      this._ou[i] = a * this._ou[i] + b * this.rng.gauss();
      const bias = D.bias ? D.bias[i] : 0;
      const gust = D.gust ?? 1;
      this.dist[i] = lvl * (bias + gust * this._ou[i]);
    }
  }

  // --------------------------------------------------------------- integration
  _rk4(u) {
    const pl = this.plant, s = this.s, n = this.nx, dt = this.dt, t = this.t;
    const k1 = this._k1, k2 = this._k2, k3 = this._k3, k4 = this._k4, tmp = this._tmp;
    const p = this.p, ext = this.ext, aux = this.aux;
    pl.deriv(t, s, u, p, ext, k1, aux);
    for (let i = 0; i < n; i++) tmp[i] = s[i] + 0.5 * dt * k1[i];
    pl.deriv(t + 0.5 * dt, tmp, u, p, ext, k2, aux);
    for (let i = 0; i < n; i++) tmp[i] = s[i] + 0.5 * dt * k2[i];
    pl.deriv(t + 0.5 * dt, tmp, u, p, ext, k3, aux);
    for (let i = 0; i < n; i++) tmp[i] = s[i] + dt * k3[i];
    pl.deriv(t + dt, tmp, u, p, ext, k4, aux);
    for (let i = 0; i < n; i++) s[i] += (dt / 6) * (k1[i] + 2 * k2[i] + 2 * k3[i] + k4[i]);
  }

  stepOnce() {
    const pl = this.plant;
    if (this.stepCount % this.ctrlEvery === 0) this._controlTick();
    this._computeExt();
    this._updateDisturbance();
    const tau = this.settings.actuatorLag || 0;
    if (tau > 0) {
      const a = 1 - Math.exp(-this.dt / tau);
      for (let i = 0; i < this.nu; i++) this.uEff[i] += (this.uTarget[i] - this.uEff[i]) * a;
    } else this.uEff.set(this.uTarget);
    this._rk4(this.uEff);
    if (pl.post) pl.post(this.s, this.p, this.aux, this.dt, this.t + this.dt, this.uEff);
    this.t += this.dt;
    this.stepCount++;
    // metrics
    const m = this.metrics, dt = this.dt;
    m.time += dt;
    if (pl.trackError) {
      const e = pl.trackError(this.s, this.lastRef, this.p, this.aux);
      if (Number.isFinite(e)) {
        m.iae += Math.abs(e) * dt;
        m.ise += e * e * dt;
      }
    }
    let eff = 0, satd = false;
    for (let i = 0; i < this.nu; i++) {
      const span = Math.max(Math.abs(this.uMin[i]), Math.abs(this.uMax[i]));
      const un = Number.isFinite(span) && span > 0 ? this.uEff[i] / span : this.uEff[i];
      eff += un * un;
      if (Math.abs(this.uCmd[i] - this.uSat[i]) > 1e-12) satd = true;
    }
    m.effort += eff * dt;
    if (satd) m.satTime += dt;
    // guard against numerical blow-up
    for (let i = 0; i < this.nx; i++) {
      if (!Number.isFinite(this.s[i])) {
        this._fail('physics', new Error('Simulation diverged (state became NaN/Infinity). Reset to continue.'));
        break;
      }
    }
  }

  // Advance by simDt seconds of simulated time, respecting a wall-clock budget.
  advance(simDt, budgetMs = 30) {
    const target = this.t + simDt;
    const start = now();
    let steps = 0;
    while (this.t + this.dt * 0.5 < target && !this.error) {
      this.stepOnce();
      steps++;
      if ((steps & 15) === 0 && now() - start > budgetMs) break;
    }
    if (this.plant.status) this.status = this.plant.status(this.s, this.p, this.aux, this.lastRef);
    return steps;
  }

  _fail(phase, e) {
    this.error = { phase, message: String(e?.message || e), stack: String(e?.stack || '') };
    this.uCmd.fill(0);
  }

  energy() {
    return this.plant.energy ? this.plant.energy(this.s, this.p, this.aux) : NaN;
  }
}
