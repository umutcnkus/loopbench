// Multi-panel strip-chart "scope" for live signals.
const CAP = 24000;

class Ring {
  constructor(cap = CAP) {
    this.cap = cap;
    this.t = new Float64Array(cap);
    this.cols = new Map();
    this.start = 0;
    this.len = 0;
  }
  clear() { this.start = 0; this.len = 0; }
  ensure(name) {
    if (!this.cols.has(name)) {
      const a = new Float32Array(this.cap);
      a.fill(NaN);
      this.cols.set(name, a);
    }
    return this.cols.get(name);
  }
  idx(i) { return (this.start + i) % this.cap; }
  push(t, values) {
    let k;
    if (this.len < this.cap) { k = (this.start + this.len) % this.cap; this.len++; }
    else { k = this.start; this.start = (this.start + 1) % this.cap; }
    this.t[k] = t;
    for (const [name, arr] of this.cols) arr[k] = name in values ? values[name] : NaN;
    return k;
  }
  // first logical index with t >= t0 (binary search)
  lower(t0) {
    let lo = 0, hi = this.len;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (this.t[this.idx(mid)] < t0) lo = mid + 1; else hi = mid;
    }
    return lo;
  }
  lastT() { return this.len ? this.t[this.idx(this.len - 1)] : 0; }
}

const nice = (span, n = 4) => {
  const raw = span / n;
  const p = Math.pow(10, Math.floor(Math.log10(raw)));
  const m = raw / p;
  return (m < 1.5 ? 1 : m < 3.5 ? 2 : m < 7.5 ? 5 : 10) * p;
};
const fmtNum = (v, step) => {
  if (!Number.isFinite(v)) return '—';
  const d = step >= 1 ? 0 : Math.min(4, Math.ceil(-Math.log10(step)));
  return v.toFixed(d).replace(/^-0(\.0+)?$/, '0');
};
const fmtVal = (v) => {
  if (!Number.isFinite(v)) return '—';
  const a = Math.abs(v);
  if (a >= 1000) return v.toFixed(0);
  if (a >= 100) return v.toFixed(1);
  if (a >= 10) return v.toFixed(2);
  if (a >= 0.01 || a === 0) return v.toFixed(3);
  return v.toExponential(2);
};

// Stroke one signal with min/max decimation per pixel column.
// at(i) maps a logical sample index to the storage index of tArr / vArr.
function traceSeries(ctx, tArr, vArr, at, i0, n, X, Y, wrap) {
  ctx.beginPath();
  let pen = false;
  let colX = -1, cMin = 0, cMax = 0, cFirst = 0, cLast = 0;
  const flush = () => {
    if (colX < 0) return;
    const yF = Y(cFirst), yMn = Y(cMin), yMx = Y(cMax), yL = Y(cLast);
    if (!pen) { ctx.moveTo(colX, yF); pen = true; } else ctx.lineTo(colX, yF);
    if (cMax !== cMin) { ctx.lineTo(colX, yMx); ctx.lineTo(colX, yMn); }
    ctx.lineTo(colX, yL);
  };
  // wrapped angles: lift the pen instead of drawing a vertical jump
  const jump = wrap ? wrap / 2 : Infinity;
  let prev = NaN;
  for (let i = i0; i < n; i++) {
    const k = at(i);
    const v = vArr[k];
    if (!Number.isFinite(v)) { flush(); colX = -1; pen = false; prev = NaN; continue; }
    if (Math.abs(v - prev) > jump) { flush(); colX = -1; pen = false; }
    prev = v;
    const x = Math.round(X(tArr[k]));
    if (x !== colX) {
      flush();
      colX = x; cMin = cMax = cFirst = cLast = v;
    } else {
      if (v < cMin) cMin = v;
      if (v > cMax) cMax = v;
      cLast = v;
    }
  }
  flush();
  ctx.stroke();
}
const lowerIn = (tArr, len, t0) => {
  let lo = 0, hi = len;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (tArr[mid] < t0) lo = mid + 1; else hi = mid;
  }
  return lo;
};
const ident = (i) => i;

export class Scope {
  constructor(el, { onHover } = {}) {
    this.el = el;
    this.ring = new Ring();
    this.window = 10;
    this.panels = [];
    this.hoverX = null;
    this.onHover = onHover;
    this.tooltip = document.createElement('div');
    this.tooltip.className = 'scope-tip';
    this.tooltip.hidden = true;
    el.appendChild(this.tooltip);
    this.panelWrap = document.createElement('div');
    this.panelWrap.className = 'scope-panels';
    el.appendChild(this.panelWrap);
    this.readColors();
    this.ro = new ResizeObserver(() => this._resize());
    this.ro.observe(this.panelWrap);
  }

  readColors() {
    const css = getComputedStyle(document.documentElement);
    const v = (k, d) => css.getPropertyValue(k).trim() || d;
    this.colors = {
      series: [1, 2, 3, 4, 5, 6].map((i) => v(`--ch${i}`, '#888')),
      ref: v('--ref', '#667'),
      grid: v('--scope-grid', '#dde3e9'),
      axis: v('--scope-axis', '#b9c2cb'),
      text: v('--muted', '#6b7784'),
      ink: v('--ink', '#111'),
      bg: v('--scope-bg', '#fff'),
      cross: v('--ink-2', '#444'),
    };
    for (const p of this.panels) this._styleLegend(p);
  }

  // defs: [{title, unit, series: [{key, label, unit, ref?}]}]
  configure(defs) {
    this.panelWrap.innerHTML = '';
    this.panels = [];
    for (const def of defs) this._addPanel(def);
    this._resize();
  }
  _addPanel(def) {
    const box = document.createElement('div');
    box.className = 'scope-panel';
    const head = document.createElement('div');
    head.className = 'scope-head';
    const title = document.createElement('div');
    title.className = 'scope-title';
    title.textContent = def.title;
    if (def.unit) {
      const u = document.createElement('span');
      u.className = 'scope-unit';
      u.textContent = def.unit;
      title.appendChild(u);
    }
    const legend = document.createElement('div');
    legend.className = 'scope-legend';
    head.append(title, legend);
    const canvas = document.createElement('canvas');
    box.append(head, canvas);
    this.panelWrap.appendChild(box);
    const panel = { def, box, canvas, legend, series: [], yMin: -1, yMax: 1, custom: !!def.custom };
    let slot = 0;
    const slotOf = {};
    for (const s of def.series) if (!s.ref) slotOf[s.key.split('.').slice(1).join('.')] = slot++;
    slot = 0;
    for (const s of def.series) {
      const isRef = s.ref;
      const base = s.key.split('.').slice(1).join('.');
      const refSlot = isRef ? (s.of ? slotOf[s.of.split('.').slice(1).join('.')] : slotOf[base]) : undefined;
      const item = document.createElement('button');
      item.type = 'button';
      item.className = 'lg-item';
      item.setAttribute('aria-pressed', 'true');
      const key = document.createElement('i');
      key.className = 'lg-key' + (isRef ? ' dashed' : '');
      const name = document.createElement('span');
      name.className = 'lg-name';
      name.textContent = s.label;
      const val = document.createElement('span');
      val.className = 'lg-val';
      val.textContent = '—';
      item.append(key, name, val);
      legend.appendChild(item);
      const ser = { ...s, slot: isRef ? (refSlot ?? -1) : slot++, dashed: !!isRef, visible: true, item, keyEl: key, valEl: val };
      item.addEventListener('click', () => {
        ser.visible = !ser.visible;
        item.setAttribute('aria-pressed', String(ser.visible));
        item.classList.toggle('off', !ser.visible);
      });
      panel.series.push(ser);
      this.ring.ensure(s.key);
    }
    this._styleLegend(panel);
    canvas.addEventListener('pointermove', (ev) => {
      const r = canvas.getBoundingClientRect();
      this.hoverX = (ev.clientX - r.left) / r.width;
      this.hoverPanel = panel;
      this.hoverClientY = ev.clientY;
    });
    canvas.addEventListener('pointerleave', () => {
      this.hoverX = null;
      this.hoverPanel = null;
      this.tooltip.hidden = true;
    });
    this.panels.push(panel);
    return panel;
  }
  _styleLegend(panel) {
    for (const s of panel.series) s.keyEl.style.setProperty('--c', s.slot < 0 ? this.colors.ref : this.colors.series[s.slot % 6]);
  }
  ensureCustomPanel(names) {
    let panel = this.panels.find((p) => p.custom);
    const missing = names.filter((n) => !panel || !panel.series.some((s) => s.key === 'log.' + n));
    if (!missing.length) return;
    const series = (panel ? panel.def.series : []).concat(missing.map((n) => ({ key: 'log.' + n, label: n })));
    if (panel) {
      panel.box.remove();
      this.panels = this.panels.filter((p) => p !== panel);
    }
    this._addPanel({ title: 'Controller logs', unit: 'ctx.log', series: series.slice(0, 6), custom: true });
    this._resize();
  }

  clear() {
    this.ring.clear();
    for (const p of this.panels) { p.yMin = -1; p.yMax = 1; p.init = false; }
  }
  // Keep a copy of the current traces as a faded overlay for comparison.
  pin(label = '') {
    const ring = this.ring;
    if (!ring.len) return false;
    const len = ring.len;
    const t = new Float64Array(len);
    for (let i = 0; i < len; i++) t[i] = ring.t[ring.idx(i)];
    const cols = new Map();
    for (const [name, arr] of ring.cols) {
      const a = new Float32Array(len);
      for (let i = 0; i < len; i++) a[i] = arr[ring.idx(i)];
      cols.set(name, a);
    }
    this.pinned = { t, cols, len, label, tEnd: t[len - 1] };
    return true;
  }
  unpin() { this.pinned = null; }
  // rows: arrays aligned with schema; custom: [[t, {name: v}]]
  append(schema, rows, custom) {
    if (!this.colIndex || this.schema !== schema) {
      this.schema = schema;
      this.colIndex = new Map(schema.map((k, i) => [k, i]));
      for (let i = 1; i < schema.length; i++) this.ring.ensure(schema[i]);
    }
    const ring = this.ring;
    const schemaLen = schema.length;
    let ci = 0;
    const customNames = new Set();
    for (const row of rows) {
      const vals = {};
      for (let i = 1; i < schemaLen; i++) vals[schema[i]] = row[i];
      while (ci < custom.length && custom[ci][0] <= row[0] + 1e-9) {
        if (Math.abs(custom[ci][0] - row[0]) < 1e-9) {
          for (const [k, v] of Object.entries(custom[ci][1])) { vals['log.' + k] = v; customNames.add(k); }
        }
        ci++;
      }
      ring.push(row[0], vals);
    }
    if (customNames.size) this.ensureCustomPanel([...customNames]);
    this.latest = rows.length ? rows[rows.length - 1] : this.latest;
  }

  _resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    for (const p of this.panels) {
      const r = p.canvas.getBoundingClientRect();
      p.w = Math.max(10, r.width);
      p.h = Math.max(10, r.height);
      p.canvas.width = Math.round(p.w * dpr);
      p.canvas.height = Math.round(p.h * dpr);
      p.dpr = dpr;
    }
    this.dirty = true;
  }

  draw() {
    const ring = this.ring;
    const tEnd = Math.max(this.window, ring.lastT());
    const t0 = tEnd - this.window;
    const i0 = Math.max(0, ring.lower(t0) - 1);
    const n = ring.len;
    const C = this.colors;
    const last = this.panels.length - 1;
    let hoverT = null;
    this.panels.forEach((p, pi) => {
      if (n) {
        const kLast = ring.idx(n - 1);
        for (const s of p.series) {
          const arr = ring.cols.get(s.key);
          s.valEl.textContent = arr ? fmtVal(arr[kLast]) : '—';
        }
      }
      const ctx = p.canvas.getContext('2d');
      const { w, h, dpr } = p;
      if (!w) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      const padL = 44, padR = 8, padT = 4, padB = pi === last ? 18 : 4;
      const pw = w - padL - padR, ph = h - padT - padB;
      if (pw < 10 || ph < 8) return;
      // autoscale over visible window
      let lo = Infinity, hi = -Infinity;
      for (const s of p.series) {
        if (!s.visible) continue;
        const arr = ring.cols.get(s.key);
        if (!arr) continue;
        for (let i = i0; i < n; i++) {
          const v = arr[ring.idx(i)];
          if (v < lo) lo = v;
          if (v > hi) hi = v;
        }
      }
      const pin = this.pinned;
      let pi0 = 0, pn = 0;
      if (pin) {
        pi0 = Math.max(0, lowerIn(pin.t, pin.len, t0) - 1);
        pn = Math.min(pin.len, lowerIn(pin.t, pin.len, tEnd) + 1);
        for (const s of p.series) {
          if (!s.visible || s.dashed) continue;
          const arr = pin.cols.get(s.key);
          if (!arr) continue;
          for (let i = pi0; i < pn; i++) {
            const v = arr[i];
            if (v < lo) lo = v;
            if (v > hi) hi = v;
          }
        }
      }
      if (!Number.isFinite(lo) || !Number.isFinite(hi)) { lo = -1; hi = 1; }
      if (p.def.limit) { lo = Math.max(lo, p.def.limit[0]); hi = Math.min(hi, p.def.limit[1]); if (hi <= lo) { lo = p.def.limit[0]; hi = p.def.limit[1]; } }
      const minSpan = p.def.minSpan ?? 1e-3;
      if (hi - lo < minSpan) { const c = (hi + lo) / 2; lo = c - minSpan / 2; hi = c + minSpan / 2; }
      const pad = (hi - lo) * 0.1;
      lo -= pad; hi += pad;
      if (!p.init) { p.yMin = lo; p.yMax = hi; p.init = true; }
      // expand fast, shrink slowly
      p.yMin = lo < p.yMin ? lo : p.yMin + (lo - p.yMin) * 0.04;
      p.yMax = hi > p.yMax ? hi : p.yMax + (hi - p.yMax) * 0.04;
      const yMin = p.yMin, yMax = p.yMax;
      const X = (t) => padL + ((t - t0) / this.window) * pw;
      const Y = (v) => padT + (1 - (v - yMin) / (yMax - yMin)) * ph;
      // grid
      const step = nice(yMax - yMin, Math.max(2, Math.round(ph / 34)));
      ctx.lineWidth = 1;
      ctx.font = '500 10.5px "JetBrains Mono", ui-monospace, monospace';
      ctx.textBaseline = 'middle';
      ctx.textAlign = 'right';
      ctx.fillStyle = C.text;
      ctx.strokeStyle = C.grid;
      ctx.beginPath();
      for (let v = Math.ceil(yMin / step) * step; v <= yMax; v += step) {
        const y = Math.round(Y(v)) + 0.5;
        ctx.moveTo(padL, y);
        ctx.lineTo(padL + pw, y);
        ctx.fillText(fmtNum(v, step), padL - 6, y);
      }
      ctx.stroke();
      const tStep = nice(this.window, Math.max(2, Math.round(pw / 90)));
      ctx.beginPath();
      for (let t = Math.ceil(t0 / tStep) * tStep; t <= tEnd; t += tStep) {
        const x = Math.round(X(t)) + 0.5;
        ctx.moveTo(x, padT);
        ctx.lineTo(x, padT + ph);
      }
      ctx.stroke();
      if (yMin < 0 && yMax > 0) {
        ctx.strokeStyle = C.axis;
        ctx.beginPath();
        const y0 = Math.round(Y(0)) + 0.5;
        ctx.moveTo(padL, y0);
        ctx.lineTo(padL + pw, y0);
        ctx.stroke();
      }
      if (pi === last) {
        ctx.textAlign = 'center';
        ctx.textBaseline = 'alphabetic';
        for (let t = Math.ceil(t0 / tStep) * tStep; t <= tEnd; t += tStep) {
          if (t < 0) continue;
          ctx.fillText(fmtNum(t, tStep) + ' s', X(t), h - 4);
        }
      }
      // series
      ctx.save();
      ctx.beginPath();
      ctx.rect(padL, padT, pw, ph);
      ctx.clip();
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      // pinned run first, faded, underneath the live traces (references skipped)
      if (pin) {
        ctx.globalAlpha = 0.34;
        ctx.lineWidth = 2;
        ctx.setLineDash([]);
        for (const s of p.series) {
          if (!s.visible || s.dashed) continue;
          const arr = pin.cols.get(s.key);
          if (!arr) continue;
          ctx.strokeStyle = s.slot < 0 ? C.ref : C.series[s.slot % 6];
          traceSeries(ctx, pin.t, arr, ident, pi0, pn, X, Y, s.wrap);
        }
        ctx.globalAlpha = 1;
      }
      const at = (i) => ring.idx(i);
      for (const s of p.series) {
        if (!s.visible) continue;
        const arr = ring.cols.get(s.key);
        if (!arr) continue;
        ctx.strokeStyle = s.slot < 0 ? C.ref : C.series[s.slot % 6];
        ctx.lineWidth = s.dashed ? 1.5 : 2;
        ctx.setLineDash(s.dashed ? [5, 4] : []);
        traceSeries(ctx, ring.t, arr, at, i0, n, X, Y, s.wrap);
      }
      ctx.restore();
      ctx.setLineDash([]);
      // crosshair
      if (this.hoverX !== null) {
        const x = padL + (this.hoverX * w - padL);
        if (x >= padL && x <= padL + pw) {
          const t = t0 + ((x - padL) / pw) * this.window;
          hoverT = t;
          let j = ring.lower(t);
          if (j >= n) j = n - 1;
          if (j > 0 && Math.abs(ring.t[ring.idx(j - 1)] - t) < Math.abs(ring.t[ring.idx(j)] - t)) j--;
          if (j >= 0 && n) {
            const k = ring.idx(j);
            const xs = X(ring.t[k]);
            ctx.strokeStyle = C.cross;
            ctx.globalAlpha = 0.5;
            ctx.beginPath();
            ctx.moveTo(Math.round(xs) + 0.5, padT);
            ctx.lineTo(Math.round(xs) + 0.5, padT + ph);
            ctx.stroke();
            ctx.globalAlpha = 1;
            const rows = [];
            for (const s of p.series) {
              if (!s.visible) continue;
              const arr = ring.cols.get(s.key);
              const v = arr ? arr[k] : NaN;
              if (!Number.isFinite(v)) continue;
              const col = s.slot < 0 ? C.ref : C.series[s.slot % 6];
              ctx.fillStyle = col;
              ctx.strokeStyle = C.bg;
              ctx.lineWidth = 2;
              ctx.beginPath();
              ctx.arc(xs, Y(v), 4, 0, Math.PI * 2);
              ctx.fill();
              ctx.stroke();
              rows.push({ col, label: s.label, v, dashed: s.dashed });
            }
            if (pin && pin.len) {
              const tk = ring.t[k];
              let jp = lowerIn(pin.t, pin.len, tk);
              if (jp >= pin.len) jp = pin.len - 1;
              if (jp > 0 && Math.abs(pin.t[jp - 1] - tk) < Math.abs(pin.t[jp] - tk)) jp--;
              if (Math.abs(pin.t[jp] - tk) < 0.05) {
                for (const s of p.series) {
                  if (!s.visible || s.dashed) continue;
                  const arr = pin.cols.get(s.key);
                  const v = arr ? arr[jp] : NaN;
                  if (!Number.isFinite(v)) continue;
                  rows.push({ col: s.slot < 0 ? C.ref : C.series[s.slot % 6], label: s.label + ' · pinned', v, ghost: true });
                }
              }
            }
            if (p === this.hoverPanel) this._showTip(p, xs, ring.t[k], rows);
          }
        }
      }
    });
    if (hoverT === null) this.tooltip.hidden = true;
  }
  _showTip(p, xs, t, rows) {
    const tip = this.tooltip;
    tip.replaceChildren();
    const head = document.createElement('div');
    head.className = 'tip-t';
    head.textContent = `t = ${t.toFixed(3)} s`;
    tip.appendChild(head);
    for (const r of rows) {
      const row = document.createElement('div');
      row.className = 'tip-row' + (r.ghost ? ' ghost' : '');
      const k = document.createElement('i');
      k.className = 'lg-key' + (r.dashed ? ' dashed' : '');
      k.style.setProperty('--c', r.col);
      const v = document.createElement('b');
      v.textContent = fmtVal(r.v);
      const l = document.createElement('span');
      l.textContent = r.label;
      row.append(k, v, l);
      tip.appendChild(row);
    }
    tip.hidden = false;
    const host = this.el.getBoundingClientRect();
    const cr = p.canvas.getBoundingClientRect();
    let left = cr.left - host.left + xs + 12;
    const tw = tip.offsetWidth || 160;
    if (left + tw > host.width - 6) left = cr.left - host.left + xs - tw - 12;
    tip.style.left = `${Math.max(4, left)}px`;
    tip.style.top = `${Math.max(4, cr.top - host.top + 6)}px`;
  }

  toCSV() {
    const ring = this.ring;
    const names = [...ring.cols.keys()];
    const lines = ['t,' + names.join(',')];
    for (let i = 0; i < ring.len; i++) {
      const k = ring.idx(i);
      lines.push([ring.t[k].toFixed(4), ...names.map((nm) => {
        const v = ring.cols.get(nm)[k];
        return Number.isFinite(v) ? +v.toPrecision(7) : '';
      })].join(','));
    }
    return lines.join('\n');
  }
}
