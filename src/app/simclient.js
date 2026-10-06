// Runs the simulation in a Web Worker built from ENGINE + user controller code.
import ENGINE_SRC from 'virtual:engine';
import { WRAP_HEAD, WRAP_TAIL, userLineFromStack } from '../core/runtime.js';

const countNL = (s) => {
  let n = 0;
  for (let i = 0; i < s.length; i++) if (s.charCodeAt(i) === 10) n++;
  return n;
};
const HEAD = ENGINE_SRC + '\n' + WRAP_HEAD;
const USER_START = countNL(HEAD) + 1;

export class SimClient {
  constructor(h) {
    this.h = h; // {onReady, onFrame, onError, onConsole, onLin}
    this.worker = null;
    this.running = true;
    this.speed = 1;
    this.inflight = false;
    this.rt = 1;
    this.frame = null;
  }

  start({ plantId, code, params, nominal, settings, state, seed, wantLin, tune }) {
    this.stop();
    this.userLines = countNL(code) + 1;
    const src = HEAD + code + WRAP_TAIL;
    let w;
    try {
      const url = URL.createObjectURL(new Blob([src], { type: 'text/javascript' }));
      w = new Worker(url);
      this.url = url;
    } catch (e) {
      this.h.onError?.({ phase: 'engine', message: 'Could not start the simulation worker: ' + e.message });
      return;
    }
    this.worker = w;
    this.ready = false;
    this.inflight = true; // waiting for init
    this.sentAt = performance.now();
    this.pendingTimeout = 8000;
    this.plantId = plantId;
    w.onmessage = (ev) => this._onMessage(ev.data);
    w.onerror = (ev) => {
      ev.preventDefault?.();
      const lineno = ev.lineno || 0;
      const line = lineno >= USER_START ? lineno - USER_START + 1 : null;
      const msg = String(ev.message || 'Script error').replace(/^Uncaught\s+/, '');
      this.h.onError?.({ phase: 'compile', message: msg, line, col: ev.colno });
      this._kill();
    };
    w.postMessage({ type: 'init', plantId, params, nominal, settings, state, seed, wantLin, tune });
  }

  _kill() {
    if (this.worker) this.worker.terminate();
    this.worker = null;
    this.ready = false;
    this.inflight = false;
    if (this.url) URL.revokeObjectURL(this.url);
    this.url = null;
  }
  stop() { this._kill(); }

  _onMessage(m) {
    switch (m.type) {
      case 'ready':
        this.ready = true;
        this.schema = m.schema;
        this.Tc = m.Tc;
        this.h.onReady?.(m);
        break;
      case 'frame': {
        this.inflight = false;
        const now = performance.now();
        if (this._rtT0 == null || !this.frame || m.t < this.frame.t) { this._rtT0 = now; this._rtS0 = m.t; }
        else if (now - this._rtT0 > 500) {
          this.rt = (m.t - this._rtS0) / ((now - this._rtT0) / 1000);
          this._rtT0 = now;
          this._rtS0 = m.t;
        }
        this.frame = m;
        if (m.error) m.error.userLine = this.mapStack(m.error.stack);
        this.h.onFrame?.(m);
        if (m.lin) this.h.onLin?.(m.lin);
        break;
      }
      case 'console':
        this.h.onConsole?.(m);
        break;
      case 'fatal':
        m.error.userLine = this.mapStack(m.error.stack);
        this.h.onError?.(m.error);
        break;
      case 'lin':
        this.h.onLin?.(m.lin);
        break;
      case 'snapshot':
        this._snapResolve?.(m.state);
        this._snapResolve = null;
        break;
    }
  }
  mapStack(stack) {
    const r = userLineFromStack(stack, USER_START, this.userLines || 1);
    return r ? r.line : null;
  }

  post(msg) {
    this.worker?.postMessage(msg);
  }
  // Called every animation frame.
  tick(dtReal) {
    if (!this.worker) return;
    const now = performance.now();
    if (this.inflight) {
      if (now - this.sentAt > this.pendingTimeout) {
        this.h.onError?.({ phase: 'timeout', message: 'The controller did not return within ' + (this.pendingTimeout / 1000) + ' s — it may contain an infinite loop. The simulation was stopped.' });
        this._kill();
      }
      return;
    }
    if (!this.ready || !this.running) return;
    const dt = Math.min(dtReal, 0.1) * this.speed;
    this.lastRequestDt = dt;
    this.post({ type: 'advance', dt, budget: 22 });
    this.inflight = true;
    this.sentAt = now;
    this.pendingTimeout = 4000;
  }
  step() {
    if (!this.worker || this.inflight || !this.ready) return;
    this.post({ type: 'advance', dt: this.Tc || 0.005, budget: 100 });
    this.inflight = true;
    this.sentAt = performance.now();
  }
  reset(settings, state) {
    if (!this.worker) return false;
    this.post({ type: 'reset', settings, state });
    return true;
  }
  snapshot() {
    return new Promise((res) => {
      if (!this.worker) return res(null);
      this._snapResolve = res;
      this.post({ type: 'snapshot' });
      setTimeout(() => { if (this._snapResolve === res) { this._snapResolve = null; res(null); } }, 500);
    });
  }
}
