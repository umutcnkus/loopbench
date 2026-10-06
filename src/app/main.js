import { plants, plantById } from '../plants/index.js';
import controllers from '../generated/controllers.js';
import models from '../generated/models.js';
import { views } from './views/index.js';
import { icons } from './icons.js';
import { Viewport } from './viewport.js';
import { Scope } from './scope.js';
import { CodeEditor } from './editor.js';
import { SimClient } from './simclient.js';
import { libDocs } from '../core/lib.js';
import { DEFAULT_SETTINGS } from '../core/sim.js';

window.__booted = true;
clearTimeout(window.__bootTimer);

// ------------------------------------------------------------------ utilities
const $ = (id) => document.getElementById(id);
const el = (tag, attrs = {}, ...kids) => {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'class') e.className = v;
    else if (k === 'text') e.textContent = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else if (k === 'style') e.style.cssText = v;
    else e.setAttribute(k, v === true ? '' : v);
  }
  for (const k of kids.flat()) if (k != null) e.append(k.nodeType ? k : document.createTextNode(String(k)));
  return e;
};
const store = {
  get(k, d) {
    try { const v = localStorage.getItem('loopbench:' + k); return v == null ? d : JSON.parse(v); } catch { return d; }
  },
  set(k, v) {
    try { localStorage.setItem('loopbench:' + k, JSON.stringify(v)); } catch {}
  },
};
const fmt = (v, d = 3) => (Number.isFinite(v) ? v.toFixed(d) : '—');
const decimalsFor = (step) => (step >= 1 ? 0 : Math.min(5, Math.ceil(-Math.log10(step) - 1e-9)));

function theme() {
  const dt = document.documentElement.getAttribute('data-theme');
  if (dt === 'dark' || dt === 'light') return dt;
  return matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

// ------------------------------------------------------------------ state
const S = {
  plant: null,
  params: {},
  settings: {},
  refParams: {},
  modelSync: true,
  tplId: null,
  running: true,
  frame: null,
  schema: null,
  lastError: null,
  lin: null,
  tuneVals: {}, // tunable name -> { value, def }; survives recompiles of the same controller
  tunables: [],
};
const drafts = store.get('drafts', {});

// ------------------------------------------------------------------ components
const viewport = new Viewport($('viewport'), {
  onDrag: (d) => client.post({ type: 'drag', drag: d }),
  onTargetDrag: (target, entry, end) => onTargetDrag(target, entry, end),
});
const scope = new Scope($('scope'));
const editor = new CodeEditor($('editor'), {
  onRun: (o) => run(o || {}),
  onChange: () => onCodeChange(),
  completions: () => completions(),
});
const client = new SimClient({
  onReady: (m) => { S.schema = m.schema; buildTunables(m.tunables || []); },
  onFrame: (f) => onFrame(f),
  onError: (e) => showError(e),
  onConsole: (m) => logConsole(m.text, m.level, m.t),
  onLin: (lin) => { S.lin = lin; renderPoles(); },
});

// ------------------------------------------------------------------ plant switching
function selectPlant(id, { fromGallery = false } = {}) {
  const plant = plantById[id] || plants[0];
  if (S.plant) saveDraft();
  S.plant = plant;
  store.set('plant', plant.id);
  const saved = store.get('plantState:' + plant.id, null);
  S.params = {};
  for (const d of plant.params) S.params[d.key] = saved?.params?.[d.key] ?? d.value;
  S.settings = {
    ...DEFAULT_SETTINGS,
    controlRate: plant.controlRate || 200,
    refMode: plant.refModes?.[0]?.id ?? null,
    ic: plant.initialConditions?.[0]?.id ?? null,
    ...(saved?.settings || {}),
  };
  S.refParams = saved?.refParams || {};
  S.modelSync = true;
  S.tuneVals = {};
  scope.unpin(); // a pinned run from another system cannot be compared
  updatePin();
  $('pbName').textContent = plant.name;
  $('pbCat').textContent = plant.category;
  $('rateSel').value = String(S.settings.controlRate);
  if ($('rateSel').value !== String(S.settings.controlRate)) {
    $('rateSel').append(el('option', { value: String(S.settings.controlRate), text: S.settings.controlRate + ' Hz' }));
    $('rateSel').value = String(S.settings.controlRate);
  }
  buildTemplates();
  const d = drafts[plant.id];
  const tpls = controllers[plant.id] || [];
  const tpl = tpls.find((t) => t.id === d?.tpl) || tpls.find((t) => t.isDefault) || tpls[0];
  S.tplId = tpl?.id;
  $('tplSel').value = S.tplId;
  editor.setValue(d?.code ?? tpl?.code ?? '');
  updateDirty();
  mountView();
  configureScope();
  buildPlantPane();
  buildScenarioPane();
  buildDocs();
  clearConsole();
  hideError();
  run({ fresh: true });
  if (fromGallery) closeGallery();
}

function mountView() {
  const plant = S.plant;
  const factory = views[plant.id];
  const p = plant.derive ? plant.derive({ ...S.params }) : { ...S.params };
  const view = factory({ plant, p, theme: theme(), refParams: S.refParams });
  viewport.mount(view);
  S.view = view;
  viewport.follow = !!view.followDefault;
  $('btnFollow').setAttribute('aria-pressed', String(viewport.follow));
  $('viewHint').textContent = view.hint || 'Drag a part to push it · scroll to zoom · right-drag to pan';
  $('viewHint').style.opacity = '1';
  if (S.frame && S.frame.s.length === plant.states.length) viewport.update(S.frame, 0);
}

function configureScope() {
  const plant = S.plant;
  const label = (key) => {
    const [kind, k] = key.split('.');
    const find = (arr) => (arr || []).find((d) => d.key === k);
    if (kind === 'x') { const d = find(plant.states); return d ? d.label : k; }
    if (kind === 'y') { const d = find(plant.outputs || plant.states); return (d ? d.label : k) + ' (measured)'; }
    if (kind === 'r') { const d = find(plant.refs); return d ? d.label : k; }
    if (kind === 'u') { const d = find(plant.inputs); return (d ? d.label : k) + ' cmd'; }
    if (kind === 'ua') { const d = find(plant.inputs); return (d ? d.label : k) + ' applied'; }
    if (kind === 'd') { const d = find(plant.derived); return d ? d.label : k; }
    return k;
  };
  const inputLimit = (series) => {
    let lo = Infinity, hi = -Infinity;
    for (const s of series) {
      const key = typeof s === 'string' ? s : s.key;
      const [kind, k] = key.split('.');
      if (kind !== 'u' && kind !== 'ua') return undefined;
      const d = plant.inputs.find((i) => i.key === k);
      if (!d || !Number.isFinite(d.min) || !Number.isFinite(d.max)) return undefined;
      lo = Math.min(lo, d.min); hi = Math.max(hi, d.max);
    }
    const pad = 0.25 * (hi - lo);
    return [lo - pad, hi + pad];
  };
  const defs = (plant.plots || []).map((pl) => ({
    title: pl.title,
    unit: pl.unit,
    minSpan: pl.minSpan,
    limit: pl.limit || inputLimit(pl.series),
    series: pl.series.map((s) => (typeof s === 'string' ? { key: s, label: label(s), ref: s.startsWith('r.') } : { ...s, label: s.label || label(s.key), ref: s.ref ?? s.key.startsWith('r.') })),
  }));
  scope.configure(defs);
  scope.clear();
}

// ------------------------------------------------------------------ run / reset
async function run({ keepState = false, fresh = false } = {}) {
  hideError();
  editor.clearError();
  let state = null;
  if (keepState || (!fresh && $('keepState').checked)) state = await client.snapshot();
  const code = editor.getValue();
  saveDraft();
  if (!state) { configureScope(); S.view?.reset?.(); }
  client.start({
    plantId: S.plant.id,
    code,
    params: S.params,
    nominal: S.modelSync ? undefined : S.nominal,
    settings: { ...S.settings, modelSync: S.modelSync, refParams: S.refParams },
    state,
    seed: (Math.random() * 1e9) | 0,
    wantLin: true,
    tune: S.tuneVals,
  });
  setRunning(true);
  logConsole(state ? 'Controller hot-swapped; plant state kept.' : 'Controller compiled and started.', 'sys');
}
function resetSim() {
  hideError();
  scope.clear();
  S.view?.reset?.();
  if (!client.worker || S.lastError) { run({ fresh: true }); return; }
  client.reset({ ...S.settings, refParams: S.refParams });
  if (!S.running) setRunning(true);
}
function setRunning(on) {
  S.running = on;
  client.running = on;
  $('lblPlay').textContent = on ? 'Pause' : 'Run';
  $('icoPlay').innerHTML = on
    ? '<rect x="3.5" y="2.5" width="3" height="11" fill="currentColor"/><rect x="9.5" y="2.5" width="3" height="11" fill="currentColor"/>'
    : '<path d="M4 2.5v11l9-5.5z" fill="currentColor"/>';
}

// ------------------------------------------------------------------ frames
let lastHud = 0;
function onFrame(f) {
  S.frame = f;
  if (client.schema) scope.append(client.schema, f.rows, f.custom);
  if (f.error && !S.lastError) showError(f.error);
  if (f.warning) logConsole(f.warning, 'warn', f.t);
  const now = performance.now();
  if (now - lastHud > 90) {
    lastHud = now;
    $('simTime').textContent = f.t.toFixed(3);
    $('rtf').textContent = client.rt.toFixed(2);
    renderHud(f);
    renderStatus(f.status, f.error);
    renderMetrics(f.metrics);
  }
}
function renderHud(f) {
  const hud = $('hud');
  const list = S.view?.readouts ? S.view.readouts(f) : [];
  if (hud.childElementCount !== list.length) {
    hud.replaceChildren(...list.map(() => el('div', { class: 'readout' }, el('span', { class: 'rl' }), el('span', { class: 'rv' }), el('span', { class: 'ru' }))));
  }
  list.forEach(([label, val, unit, dec], i) => {
    const r = hud.children[i];
    r.children[0].textContent = label;
    r.children[1].textContent = Number.isFinite(val) ? val.toFixed(dec ?? 2) : '—';
    r.children[2].textContent = unit || '';
  });
}
function renderStatus(st, err) {
  const pill = $('statusPill');
  if (err) { pill.dataset.level = 'fail'; pill.textContent = 'Controller error'; return; }
  if (!st) { pill.dataset.level = 'idle'; pill.textContent = S.running ? 'Running' : 'Paused'; return; }
  pill.dataset.level = st.level;
  pill.textContent = st.text + (S.running ? '' : ' · paused');
}
function renderMetrics(m) {
  if (!m) return;
  const box = $('metrics');
  const T = Math.max(1e-6, m.time);
  const items = [
    ['IAE', fmt(m.iae, 3)],
    ['∫u²', fmt(m.effort, 2)],
    ['sat', ((100 * m.satTime) / T).toFixed(0) + '%'],
    ['ctrl', (m.execAvg * 1000).toFixed(0) + ' µs'],
  ];
  if (box.childElementCount !== items.length) box.replaceChildren(...items.map(() => el('span', {}, '', el('b'))));
  items.forEach(([k, v], i) => {
    const s = box.children[i];
    s.firstChild.textContent = k + ' ';
    s.lastChild.textContent = v;
  });
  box.title = 'IAE: integral of |tracking error|. ∫u²: control effort (inputs normalized by their limits). sat: time spent saturated. ctrl: mean compute time per control() call.';
}

// ------------------------------------------------------------------ errors & console
function showError(e) {
  S.lastError = e;
  const line = e.line || e.userLine;
  const where = line ? ` (line ${line})` : '';
  const phase = { compile: 'Compile error', init: 'Error in init()', control: 'Error in control()', onTune: 'Error in onTune()', physics: 'Simulation stopped', timeout: 'Controller timed out', engine: 'Engine error' }[e.phase] || 'Error';
  $('errText').replaceChildren(el('b', { text: phase + where + ': ' }), document.createTextNode(e.message));
  $('errBanner').hidden = false;
  if (line) editor.markError(line, e.message);
  logConsole(`${phase}${where}: ${e.message}`, 'error', S.frame?.t);
  renderStatus(null, e);
  if (e.phase === 'compile' || e.phase === 'timeout') activateTab('controller');
}
function hideError() {
  S.lastError = null;
  $('errBanner').hidden = true;
}
const consoleBody = $('consoleBody');
function logConsole(text, level = 'log', t) {
  const line = el('div', { class: 'cl ' + level }, el('span', { class: 'ct', text: t != null ? t.toFixed(2) + 's' : '' }), el('span', { class: 'cm', text }));
  consoleBody.append(line);
  while (consoleBody.childElementCount > 300) consoleBody.firstChild.remove();
  consoleBody.scrollTop = consoleBody.scrollHeight;
}
function clearConsole() { consoleBody.replaceChildren(); }

// ------------------------------------------------------------------ controller tab
function buildTemplates() {
  const sel = $('tplSel');
  sel.replaceChildren();
  for (const t of controllers[S.plant.id] || []) sel.append(el('option', { value: t.id, text: t.name }));
  const d = drafts[S.plant.id];
  if (d?.stash) sel.append(el('option', { value: '__stash', text: 'Your earlier edits' }));
}
function currentTemplate() {
  return (controllers[S.plant.id] || []).find((t) => t.id === S.tplId);
}
function updateDirty() {
  const tpl = currentTemplate();
  const dirty = tpl && editor.getValue() !== tpl.code;
  $('dirtyNote').textContent = dirty ? 'edited' : '';
  $('dirtyNote').className = dirty ? 'dirty' : '';
  $('btnRevert').hidden = !dirty;
  const usesInput = /ctx\.input/.test(editor.getValue()) || /keys/.test(S.settings.refMode || '');
  updateKeysHelp(usesInput);
}
let saveTimer = 0;
function onCodeChange() {
  updateDirty();
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveDraft, 600);
}
function saveDraft() {
  if (!S.plant) return;
  const d = drafts[S.plant.id] || {};
  d.tpl = S.tplId;
  const tpl = currentTemplate();
  const code = editor.getValue();
  d.code = tpl && code === tpl.code ? undefined : code;
  drafts[S.plant.id] = d;
  store.set('drafts', drafts);
}
$('tplSel').addEventListener('change', () => {
  const id = $('tplSel').value;
  const d = drafts[S.plant.id] || (drafts[S.plant.id] = {});
  const tplNow = currentTemplate();
  const code = editor.getValue();
  if (id === '__stash') {
    editor.setValue(d.stash || '');
    $('tplSel').value = S.tplId;
    updateDirty();
    return;
  }
  if (tplNow && code !== tplNow.code) d.stash = code;
  S.tplId = id;
  S.tuneVals = {};
  const tpl = currentTemplate();
  editor.setValue(tpl.code);
  applyTemplateScenario(tpl);
  buildTemplates();
  $('tplSel').value = id;
  updateDirty();
  saveDraft();
  run({ fresh: true });
});
// Some templates only make sense from a particular start (LQR needs the pole up).
function applyTemplateScenario(tpl) {
  if (!tpl?.ic || S.settings.ic === tpl.ic) return;
  const ic = S.plant.initialConditions?.find((c) => c.id === tpl.ic);
  if (!ic) return;
  S.settings.ic = tpl.ic;
  persistPlantState();
  buildScenarioPane();
  logConsole(`Start condition set to “${ic.label}” for this controller (change it in the Scenario tab).`, 'sys', 0);
}
$('btnRevert').addEventListener('click', () => {
  const tpl = currentTemplate();
  if (!tpl) return;
  const d = drafts[S.plant.id] || (drafts[S.plant.id] = {});
  d.stash = editor.getValue();
  editor.setValue(tpl.code);
  S.tuneVals = {};
  buildTemplates();
  $('tplSel').value = S.tplId;
  updateDirty();
  saveDraft();
});
$('btnRun').addEventListener('click', () => run({}));
$('rateSel').addEventListener('change', () => {
  S.settings.controlRate = +$('rateSel').value;
  persistPlantState();
  run({ keepState: $('keepState').checked });
});
$('btnClearLog').addEventListener('click', clearConsole);

// ------------------------------------------------------------------ live gains
// Sliders for values the controller declares with tunable({...}).
function fmtTune(v, d) {
  if (d.log || (v !== 0 && Math.abs(v) < 1e-3)) return String(+v.toPrecision(3));
  return String(+v.toFixed(decimalsFor(d.step || 0.01)));
}
const tuneFields = new Map();
function buildTunables(list) {
  S.tunables = list;
  tuneFields.clear();
  const grid = $('tnGrid');
  grid.replaceChildren();
  for (const d of list) {
    S.tuneVals[d.name] = { value: d.value, def: d.def };
    const f = tuneField(d);
    tuneFields.set(d.name, f);
    grid.append(f);
  }
  const box = $('tunables');
  const wasHidden = box.hidden;
  box.hidden = !list.length;
  $('tnCount').textContent = list.length ? String(list.length) : '';
  updateTuneButtons();
  if (wasHidden !== box.hidden) editor.refresh();
}
function tuneField(d) {
  const id = 'tn_' + d.name.replace(/[^\w-]/g, '_');
  const toPos = (v) => (d.log ? (1000 * Math.log(v / d.min)) / Math.log(d.max / d.min) : v);
  const fromPos = (x) => (d.log ? d.min * Math.pow(d.max / d.min, x / 1000) : x);
  const range = el('input', {
    type: 'range', id,
    min: d.log ? 0 : d.min, max: d.log ? 1000 : d.max, step: d.log ? 1 : d.step || 'any',
    value: toPos(d.value), 'aria-label': d.name,
  });
  const num = el('input', { type: 'number', class: 'tn-num', step: 'any', value: fmtTune(d.value, d), 'aria-label': d.name + ' value' });
  const f = el('div', { class: 'tn' }, el('label', { for: id }, el('code', { text: d.name }), d.log ? el('span', { class: 'tn-log', text: 'log' }) : null), num, range);
  const mark = () => f.classList.toggle('changed', Math.abs(d.value - d.def) > 1e-12 * Math.max(1, Math.abs(d.def)));
  const apply = (v, { fromNum = false, send = true } = {}) => {
    d.value = v;
    S.tuneVals[d.name] = { value: v, def: d.def };
    if (!fromNum) num.value = fmtTune(v, d);
    mark();
    if (send) client.post({ type: 'tune', name: d.name, value: v });
    updateTuneButtons();
  };
  range.addEventListener('input', () => {
    let v = fromPos(+range.value);
    if (d.log) v = +v.toPrecision(4);
    apply(v);
  });
  num.addEventListener('change', () => {
    const v = +num.value;
    if (num.value.trim() === '' || !Number.isFinite(v) || (d.log && !(v > 0))) { num.value = fmtTune(d.value, d); return; }
    if (v < d.min) { d.min = v; if (!d.log) range.min = v; }
    if (v > d.max) { d.max = v; if (!d.log) range.max = v; }
    range.value = toPos(v);
    apply(v, { fromNum: true });
  });
  f.set = (v) => { range.value = toPos(v); num.value = fmtTune(v, d); apply(v, { fromNum: true }); };
  f.title = `${fmtTune(d.min, d)} … ${fmtTune(d.max, d)}${d.log ? ' (logarithmic)' : ''}`;
  mark();
  return f;
}
function updateTuneButtons() {
  const changed = S.tunables.some((d) => Math.abs(d.value - d.def) > 1e-12 * Math.max(1, Math.abs(d.def)));
  $('btnTuneReset').disabled = !changed;
  $('btnTuneWrite').disabled = !changed;
}
$('btnTuneReset').addEventListener('click', () => {
  for (const d of S.tunables) tuneFields.get(d.name)?.set(d.def);
});
// Spans of the object literals passed to tunable( { … } ), skipping strings and comments.
function tunableSpans(code) {
  const spans = [];
  const re = /\btunable\s*\(\s*\{/g;
  let m;
  while ((m = re.exec(code))) {
    let i = m.index + m[0].length, depth = 1;
    const start = i;
    while (i < code.length && depth > 0) {
      const c = code[i];
      if (c === '/' && code[i + 1] === '/') { const j = code.indexOf('\n', i); i = j < 0 ? code.length : j; continue; }
      if (c === '/' && code[i + 1] === '*') { const j = code.indexOf('*/', i + 2); i = j < 0 ? code.length : j + 2; continue; }
      if (c === '"' || c === "'" || c === '`') {
        i++;
        while (i < code.length && code[i] !== c) i += code[i] === '\\' ? 2 : 1;
        i++;
        continue;
      }
      if (c === '{') depth++;
      else if (c === '}') depth--;
      i++;
    }
    if (depth === 0) spans.push({ start, end: i - 1 });
    re.lastIndex = i;
  }
  return spans;
}
const esc = (x) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
$('btnTuneWrite').addEventListener('click', () => {
  const code = editor.getValue();
  const spans = tunableSpans(code);
  const edits = [];
  const missing = [];
  const NUM = '[-+]?(?:\\d+\\.?\\d*|\\.\\d+)(?:[eE][-+]?\\d+)?';
  for (const d of S.tunables) {
    if (Math.abs(d.value - d.def) <= 1e-12 * Math.max(1, Math.abs(d.def))) continue;
    const text = fmtTune(d.value, d);
    const re = new RegExp(`(^|[\\s,{])(?:${esc(d.name)}|'${esc(d.name)}'|"${esc(d.name)}")(\\s*:\\s*(?:\\[\\s*|\\{\\s*value\\s*:\\s*)?)(${NUM})`);
    let done = false;
    for (const sp of spans) {
      // blank out comments (same length) so a name mentioned in a comment is not matched
      const body = code.slice(sp.start, sp.end).replace(/\/\/[^\n]*|\/\*[\s\S]*?\*\//g, (c) => c.replace(/[^\n]/g, ' '));
      const mm = re.exec(body);
      if (!mm) continue;
      const numStart = sp.start + mm.index + mm[0].length - mm[3].length;
      edits.push({ start: numStart, end: numStart + mm[3].length, text });
      done = true;
      break;
    }
    if (!done) { missing.push(d.name); continue; }
    const v = +text;
    d.def = v;
    tuneFields.get(d.name)?.set(v);
  }
  if (edits.length) editor.replaceSpans(edits);
  updateTuneButtons();
  logConsole(edits.length ? `Wrote ${edits.length} tuned value${edits.length > 1 ? 's' : ''} into the tunable() declaration.` : 'Nothing to write.', 'sys', S.frame?.t);
  if (missing.length) logConsole(`Could not find the literal default for: ${missing.join(', ')} — edit those by hand.`, 'warn', S.frame?.t);
});

// ------------------------------------------------------------------ plant tab
function fieldFor(def, value, onInput, { onCommit } = {}) {
  const id = 'f_' + Math.random().toString(36).slice(2, 8);
  const dec = decimalsFor(def.step || 0.01);
  const show = (v) => (v !== 0 && Math.abs(v) < 0.001 ? (+v).toExponential(2) : (+v).toFixed(dec));
  const num = el('input', { type: 'number', id: id + 'n', step: 'any', min: def.min, max: def.max, value: show(+value), 'aria-label': def.label });
  const range = el('input', { type: 'range', id, min: def.min, max: def.max, step: def.step || 'any', value, 'aria-label': def.label });
  const f = el('div', { class: 'field' }, el('label', { for: id }, def.label, def.unit ? el('span', { class: 'unit', text: def.unit }) : null), num, range);
  const mark = (v) => f.classList.toggle('changed', def.value != null && Math.abs(v - def.value) > 1e-12);
  mark(+value);
  range.addEventListener('input', () => { num.value = show(+range.value); mark(+range.value); onInput(+range.value); });
  range.addEventListener('change', () => onCommit?.(+range.value));
  num.addEventListener('change', () => {
    let v = +num.value;
    if (!Number.isFinite(v)) return;
    range.value = v;
    mark(v);
    onInput(v);
    onCommit?.(v);
  });
  f.setValue = (v) => { range.value = v; num.value = show(+v); mark(v); };
  return f;
}
// The derivation comment of a plant file: prose lines become paragraphs,
// indented lines stay as preformatted equations.
function modelNotes(text) {
  const box = el('div', { class: 'model-notes' });
  let prose = [], eq = [];
  const flush = () => {
    if (prose.length) box.append(el('p', { text: prose.join(' ') }));
    if (eq.length) box.append(el('pre', { text: eq.join('\n') }));
    prose = [];
    eq = [];
  };
  for (const line of text.split('\n')) {
    if (/^\s{2,}\S/.test(line)) {
      if (prose.length) flush();
      eq.push(line.replace(/^\s{2}/, ''));
    } else if (line.trim()) {
      if (eq.length) flush();
      prose.push(line.trim());
    } else flush();
  }
  flush();
  return box;
}
let linTimer = 0;
function buildPlantPane() {
  const plant = S.plant;
  const pane = $('plantPane');
  pane.replaceChildren();
  pane.append(
    el('section', {},
      el('h2', { class: 'plant-title', text: plant.name }),
      el('div', { class: 'plant-meta' }, el('span', { class: 'tag', text: plant.category }), el('span', { class: 'tag', text: plant.level })),
      el('p', { text: plant.about || plant.tagline }),
      models[plant.id]
        ? el('details', { class: 'model', open: store.get('eqOpen', true) || null, ontoggle: (e) => store.set('eqOpen', e.target.open) },
          el('summary', { text: 'Equations of motion' }),
          modelNotes(models[plant.id]))
        : null,
    ),
  );
  // parameters
  const params = el('section', {}, el('h3', { text: 'Physical parameters' }));
  for (const d of plant.params) {
    params.append(fieldFor(d, S.params[d.key], (v) => {
      S.params[d.key] = v;
      client.post({ type: 'param', key: d.key, value: v });
      if (!S.modelSync) {} // nominal stays
      persistPlantState();
    }, {
      onCommit: () => {
        if (plant.geomParams?.includes(d.key)) mountView();
        clearTimeout(linTimer);
        linTimer = setTimeout(() => client.post({ type: 'linearize' }), 200);
      },
    }));
  }
  const sync = el('input', { type: 'checkbox', id: 'modelSync', checked: S.modelSync });
  sync.addEventListener('change', () => {
    S.modelSync = sync.checked;
    if (!S.modelSync) S.nominal = { ...S.params };
    client.post({ type: 'setting', key: 'modelSync', value: S.modelSync });
  });
  const reset = el('button', { class: 'btn', type: 'button', text: 'Restore defaults' });
  reset.addEventListener('click', () => {
    for (const d of plant.params) S.params[d.key] = d.value;
    persistPlantState();
    buildPlantPane();
    mountView();
    run({ fresh: true });
  });
  params.append(
    el('div', { class: 'row', style: 'margin-top:14px' }, el('label', { class: 'check' }, sync, 'Controller model (ctx.p) follows these edits')),
    el('p', { class: 'note', style: 'margin-top:6px', text: 'Untick, then change a parameter, to test robustness: the plant changes but ctx.p and ctx.model keep the old values.' }),
    el('div', { class: 'row', style: 'margin-top:10px' }, reset),
  );
  pane.append(params);
  // linearization
  pane.append(el('section', {}, el('h3', { text: 'Linearized model at the operating point' }), el('div', { class: 'poles', id: 'polesBox' }, el('canvas', { id: 'polesCanvas', width: 340, height: 280 }), el('div', { id: 'polesList' })), el('p', { class: 'note', style: 'margin-top:8px' }, 'Computed from ', el('code', { text: 'ctx.model.linearize()' }), ' on the controller’s model. Crosses right of the axis are unstable open-loop poles.')));
  // signals
  const tbl = (title, rows, cols) => {
    const [t, code] = title.split('|');
    return el('section', {}, el('h3', {}, t, code ? el('code', { text: code }) : null), el('table', { class: 'sig-table' }, el('thead', {}, el('tr', {}, cols.map((c) => el('th', { text: c })))), el('tbody', {}, rows)));
  };
  pane.append(tbl('Measurements |ctx.y', (plant.outputs || plant.states).map((d, i) => el('tr', {}, el('td', { text: `y[${i}] .${d.key}` }), el('td', { text: d.label }), el('td', { class: 'num', text: d.unit || '' }))), ['Signal', 'Meaning', 'Unit']));
  pane.append(tbl('Actuators |return value', plant.inputs.map((d, i) => el('tr', {}, el('td', { text: `u[${i}] ${d.key}` }), el('td', { text: d.label }), el('td', { class: 'num', text: `${d.min} … ${d.max} ${d.unit || ''}` }))), ['Input', 'Meaning', 'Range']));
  if (plant.refs?.length) pane.append(tbl('References |ctx.r', plant.refs.map((d, i) => el('tr', {}, el('td', { text: `r[${i}] .${d.key}` }), el('td', { text: d.label }), el('td', { class: 'num', text: d.unit || '' }))), ['Signal', 'Meaning', 'Unit']));
  renderPoles();
}
function renderPoles() {
  const cv = $('polesCanvas');
  const list = $('polesList');
  if (!cv || !list) return;
  const lin = S.lin;
  list.replaceChildren();
  const ctx = cv.getContext('2d');
  const W = cv.width, H = cv.height;
  ctx.clearRect(0, 0, W, H);
  if (!lin || lin.error || !lin.poles) {
    list.append(el('p', { class: 'note', text: lin?.error || 'Waiting for the model…' }));
    return;
  }
  const css = getComputedStyle(document.documentElement);
  const c = (k) => css.getPropertyValue(k).trim();
  const poles = lin.poles.filter((p) => Number.isFinite(p.re));
  let R = 1;
  for (const p of poles) R = Math.max(R, Math.abs(p.re), Math.abs(p.im));
  R = Math.min(R * 1.2, 1e4);
  const X = (re) => W / 2 + (re / R) * (W / 2 - 14);
  const Y = (im) => H / 2 - (im / R) * (H / 2 - 14);
  ctx.fillStyle = c('--scope-bg');
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = c('--bad');
  ctx.globalAlpha = 0.07;
  ctx.fillRect(W / 2, 0, W / 2, H);
  ctx.globalAlpha = 1;
  ctx.strokeStyle = c('--scope-axis');
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, H / 2); ctx.lineTo(W, H / 2);
  ctx.moveTo(W / 2, 0); ctx.lineTo(W / 2, H);
  ctx.stroke();
  ctx.font = '500 20px "JetBrains Mono", monospace';
  ctx.fillStyle = c('--muted');
  ctx.fillText('Re', W - 40, H / 2 - 10);
  ctx.fillText('Im', W / 2 + 8, 22);
  ctx.fillText('±' + (R < 10 ? R.toFixed(1) : R.toFixed(0)), 8, H - 10);
  for (const p of poles) {
    const x = X(p.re), y = Y(p.im);
    ctx.strokeStyle = p.re > 1e-9 ? c('--bad') : c('--ink');
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(x - 9, y - 9); ctx.lineTo(x + 9, y + 9);
    ctx.moveTo(x + 9, y - 9); ctx.lineTo(x - 9, y + 9);
    ctx.stroke();
  }
  const ul = el('ul');
  const shown = poles.slice(0, 14);
  for (const p of shown) {
    const im = Math.abs(p.im) > 1e-9 ? ` ${p.im >= 0 ? '+' : '−'} ${Math.abs(p.im).toFixed(3)}j` : '';
    ul.append(el('li', { class: p.re > 1e-9 ? 'unstable' : '', text: `${p.re >= 0 ? ' ' : '−'}${Math.abs(p.re).toFixed(3)}${im}` }));
  }
  if (poles.length > shown.length) ul.append(el('li', { text: `… ${poles.length - shown.length} more` }));
  list.append(ul);
  if (lin.ctrbRank != null) list.append(el('p', { class: 'note', style: 'margin-top:6px', text: `Controllability rank ${lin.ctrbRank} of ${lin.n}` + (lin.ctrbRank < lin.n ? ' (some states are uncontrollable at this point)' : '') }));
}

// ------------------------------------------------------------------ scenario tab
function persistPlantState() {
  store.set('plantState:' + S.plant.id, { params: S.params, settings: pick(S.settings, ['controlRate', 'noiseScale', 'quantize', 'sensorDelay', 'actuatorDelay', 'actuatorLag', 'distLevel', 'refMode', 'ic']), refParams: S.refParams });
}
const pick = (o, keys) => Object.fromEntries(keys.filter((k) => k in o).map((k) => [k, o[k]]));
function setSetting(key, value, { restart = false } = {}) {
  S.settings[key] = value;
  client.post({ type: 'setting', key, value });
  persistPlantState();
  if (restart) resetSim();
}
function buildScenarioPane() {
  const plant = S.plant;
  const pane = $('scenarioPane');
  pane.replaceChildren();
  // initial condition
  if (plant.initialConditions?.length) {
    const sel = el('select', { class: 'sel', id: 'icSel', 'aria-label': 'Initial condition' }, plant.initialConditions.map((d) => el('option', { value: d.id, text: d.label })));
    sel.value = S.settings.ic;
    sel.addEventListener('change', () => setSetting('ic', sel.value, { restart: true }));
    pane.append(el('section', {}, el('h3', { text: 'Initial condition' }), el('div', { class: 'row' }, sel, el('button', { class: 'btn', type: 'button', text: 'Reset', onclick: () => resetSim() }))));
  }
  // reference
  if (plant.refModes?.length) {
    const sec = el('section', {}, el('h3', {}, 'Reference ', el('code', { text: 'ctx.r' })));
    const sel = el('select', { class: 'sel', id: 'refSel', 'aria-label': 'Reference mode' }, plant.refModes.map((m) => el('option', { value: m.id, text: m.label })));
    sel.value = S.settings.refMode;
    const box = el('div', { style: 'margin-top:10px' });
    const renderParams = () => {
      box.replaceChildren();
      const mode = plant.refModes.find((m) => m.id === S.settings.refMode);
      if (!mode) return;
      if (mode.note) box.append(el('p', { class: 'note', style: 'margin-bottom:8px', text: mode.note }));
      const rp = (S.refParams[mode.id] = S.refParams[mode.id] || {});
      for (const d of mode.params || []) {
        const f = fieldFor(d, rp[d.key] ?? d.value, (v) => {
          rp[d.key] = v;
          client.post({ type: 'refParams', value: S.refParams });
          persistPlantState();
        });
        f.dataset.key = d.key;
        box.append(f);
      }
    };
    sel.addEventListener('change', () => {
      setSetting('refMode', sel.value);
      renderParams();
      updateDirty();
    });
    renderParams();
    sec.append(el('div', { class: 'row' }, sel), box);
    S.refBox = box;
    pane.append(sec);
  }
  // disturbances
  const dsec = el('section', {}, el('h3', { text: 'Disturbances' }));
  if (plant.dist) {
    dsec.append(fieldFor({ label: plant.dist.label, unit: plant.dist.unit, min: 0, max: plant.dist.max, step: plant.dist.step || plant.dist.max / 100, value: 0 }, S.settings.distLevel || 0, (v) => setSetting('distLevel', v)));
  }
  dsec.append(el('div', { class: 'row', style: 'margin-top:10px' }, el('button', { class: 'btn', type: 'button', onclick: () => poke() }, 'Push ', el('kbd', { text: 'P' })), el('span', { class: 'note', text: 'or drag any part in the 3D view.' })));
  pane.append(dsec);
  // sensors
  const ssec = el('section', {}, el('h3', { text: 'Sensors' }));
  ssec.append(fieldFor({ label: 'Noise level', unit: '× nominal', min: 0, max: 5, step: 0.1, value: 1 }, S.settings.noiseScale, (v) => setSetting('noiseScale', v)));
  ssec.append(fieldFor({ label: 'Measurement delay', unit: 'ms', min: 0, max: 100, step: 1, value: 0 }, (S.settings.sensorDelay || 0) * 1000, (v) => setSetting('sensorDelay', v / 1000)));
  const q = el('input', { type: 'checkbox', id: 'quantChk', checked: S.settings.quantize });
  q.addEventListener('change', () => setSetting('quantize', q.checked));
  ssec.append(el('label', { class: 'check', style: 'margin-top:10px' }, q, 'Encoder / ADC quantization'));
  if (plant.noise) {
    ssec.append(el('p', { class: 'note', style: 'margin-top:8px', text: 'Nominal noise (1σ): ' + (plant.outputs || plant.states).map((d, i) => (plant.noise[i] ? `${d.key} ${fmtSig(plant.noise[i])}` : null)).filter(Boolean).join(', ') }));
  }
  pane.append(ssec);
  // actuators
  const asec = el('section', {}, el('h3', { text: 'Actuators' }));
  asec.append(fieldFor({ label: 'Extra actuator lag', unit: 'ms', min: 0, max: 200, step: 1, value: 0 }, (S.settings.actuatorLag || 0) * 1000, (v) => setSetting('actuatorLag', v / 1000)));
  asec.append(fieldFor({ label: 'Actuator delay', unit: 'ms', min: 0, max: 100, step: 1, value: 0 }, (S.settings.actuatorDelay || 0) * 1000, (v) => setSetting('actuatorDelay', v / 1000)));
  asec.append(el('p', { class: 'note', style: 'margin-top:8px', text: 'Inputs are always clipped to their limits: ' + plant.inputs.map((d) => `${d.key} ∈ [${d.min}, ${d.max}] ${d.unit}`).join(', ') }));
  pane.append(asec);
}
const fmtSig = (v) => (v >= 0.1 ? v.toFixed(2) : v >= 0.001 ? v.toFixed(4) : v.toExponential(1));

function onTargetDrag(target, entry, end) {
  if (!target) return;
  const res = S.view?.targetToRef?.(target, entry, S.settings.refMode);
  if (!res) return;
  if (res.mode && res.mode !== S.settings.refMode) {
    setSetting('refMode', res.mode);
    const sel = $('refSel');
    if (sel) sel.value = res.mode;
  }
  const rp = (S.refParams[res.mode] = { ...(S.refParams[res.mode] || {}), ...res.params });
  client.post({ type: 'refParams', value: S.refParams });
  if (S.refBox) {
    for (const f of S.refBox.querySelectorAll('.field')) if (f.dataset.key in rp) f.setValue(rp[f.dataset.key]);
  }
  if (end) { persistPlantState(); buildScenarioPane(); }
}

// ------------------------------------------------------------------ docs / completions
function buildDocs() {
  const plant = S.plant;
  const pane = $('docsPane');
  pane.replaceChildren();
  const dl = (rows) => el('dl', {}, rows.flatMap(([k, v]) => [el('dt', { text: k }), el('dd', { text: v })]));
  const step = (...kids) => el('li', {}, ...kids);
  pane.append(
    el('section', {}, el('h3', { text: 'Quick start' }),
      el('ol', { class: 'steps' },
        step('Pick a system with the button at the top left, or start from one of its controller templates.'),
        step('Edit ', el('code', { text: 'control(ctx)' }), ' in the Controller tab and press ', el('kbd', { text: '⌘/Ctrl ↵' }), '. Errors point at the line.'),
        step('Disturb it: drag a part in the 3D view, press ', el('kbd', { text: 'P' }), ', or add noise, delay and gusts in the Scenario tab.'),
        step('Tune while it runs with the ', el('code', { text: 'tunable()' }), ' sliders; ', el('b', { text: 'Pin run' }), ' keeps the old traces to compare.'),
        step('Change physical parameters in the Plant tab; untick “Controller model follows” to test robustness.'),
      )),
    el('section', {}, el('h3', { text: 'Controller structure' }),
      el('pre', { class: 'snippet', text: `// runs once after every reset\nfunction init(ctx) {\n  const { A, B } = ctx.model.linearize();\n  K = lqr(A, B, Q, R).K;\n}\n\n// runs every ctx.dt seconds (zero-order hold)\nfunction control(ctx) {\n  return [ /* one number per actuator */ ];\n}` }),
      el('p', { class: 'note', style: 'margin-top:8px', text: 'Variables declared at the top level persist between calls and are recreated on reset. The code runs in a sandboxed worker; console.log output appears in the console under the editor.' })),
    el('section', {}, el('h3', { text: 'Live gains' }),
      el('pre', { class: 'snippet', text: `const k = tunable({\n  kp: [6, 0, 20],              // default, min, max\n  kd: [2, 0, 5, 0.1],          // …, step\n  q:  [10, 0.1, 1000, 'log'],  // logarithmic slider\n});\n\nfunction control(ctx) {\n  return k.kp * (ctx.r.x - ctx.y.x) - k.kd * ctx.y.xdot;\n}\n\n// optional: runs right after a slider moves\nfunction onTune(ctx, name, value) {\n  // e.g. redo an LQR design with the new weight k.q\n}` }),
      el('p', { class: 'note', style: 'margin-top:8px', text: 'Every entry becomes a slider under the editor. Moving it changes the value in place while the simulation keeps running. Slider positions survive Run and Reset until you edit that default in the code; “Write to code” copies the tuned values into the declaration.' })),
    el('section', {}, el('h3', {}, el('code', { text: 'ctx' })), dl([
      ['ctx.t', 'simulation time [s]'],
      ['ctx.dt', 'controller sample period [s]'],
      ['ctx.y', `measured signals, array with names: ${(plant.outputs || plant.states).map((d) => d.key).join(', ')}`],
      ['ctx.r', `reference: ${(plant.refs || []).map((d) => d.key).join(', ') || '—'}`],
      ['ctx.u', 'previous command (array)'],
      ['ctx.p', `model parameters: ${plant.params.map((d) => d.key).join(', ')} + derived`],
      ['ctx.model.f(x, u)', 'nominal dynamics ẋ = f(x, u)'],
      ['ctx.model.linearize(x0?, u0?)', 'numerical {A, B} (defaults to the operating point)'],
      ['ctx.model.x0 / u0', 'operating point used for linearization'],
      ['ctx.plant', 'names, input limits uMin / uMax'],
      ['ctx.input.axes', '[x, y, z, w] from keyboard or gamepad, each −1…1'],
      ['ctx.log(name, v)', 'plot any signal in the scope'],
    ])),
    el('section', {}, el('h3', { text: 'Library (global functions)' }), dl(libDocs)),
    el('section', {}, el('h3', { text: 'Keyboard' }), el('div', { class: 'kbd-grid' },
      el('kbd', { text: 'Space' }), 'Run / pause',
      el('kbd', { text: '⌫' }), 'Reset',
      el('kbd', { text: '.' }), 'Step one control period',
      el('kbd', { text: 'P' }), 'Push the system',
      el('kbd', { text: '⌘/Ctrl ↵' }), 'Compile and run the controller',
      el('kbd', { text: '⇧ ↵' }), 'Run, keeping the current plant state',
      el('kbd', { text: '← → / A D' }), 'ctx.input.axes[0]',
      el('kbd', { text: '↑ ↓ / W S' }), 'ctx.input.axes[1]',
      el('kbd', { text: 'R F' }), 'ctx.input.axes[2]',
      el('kbd', { text: 'Q E' }), 'ctx.input.axes[3]',
    )),
  );
}
function completions() {
  const plant = S.plant;
  const globals = libDocs.flatMap(([sig, doc]) => sig.split(' · ').map((s) => ({ text: s.replace(/\(.*$/, '').replace(/^new /, '').trim(), hint: doc }))).filter((e) => /^[\w.]+$/.test(e.text));
  globals.push({ text: 'ctx', hint: 'controller context' });
  const members = {
    ctx: ['t', 'dt', 'y', 'r', 'u', 'p', 'model', 'plant', 'input', 'log', 'state'].map((k) => ({ text: k, hint: '' })),
    'ctx.y': (plant.outputs || plant.states).map((d) => ({ text: d.key, hint: `${d.label} [${d.unit || '-'}]` })),
    'ctx.r': (plant.refs || []).map((d) => ({ text: d.key, hint: `${d.label} [${d.unit || '-'}]` })),
    'ctx.u': plant.inputs.map((d) => ({ text: d.key, hint: d.label })),
    'ctx.p': plant.params.map((d) => ({ text: d.key, hint: `${d.label} [${d.unit || '-'}]` })).concat((plant.derivedParams || []).map((k) => ({ text: k, hint: 'derived' }))),
    'ctx.model': ['f', 'linearize', 'x0', 'u0', 'eq', ...(plant.modelDocs || []).map((d) => d[0])].map((k) => ({ text: k, hint: '' })),
    'ctx.input': [{ text: 'axes', hint: '[x, y, z, w] −1…1' }, { text: 'keys', hint: 'pressed keys' }],
    'ctx.plant': ['states', 'outputs', 'inputs', 'refs', 'uMin', 'uMax', 'name'].map((k) => ({ text: k, hint: '' })),
    quat: ['mul', 'conj', 'rotate', 'rotateInv', 'fromEuler', 'toEuler', 'fromAxisAngle', 'toMatrix', 'error', 'toRotVec', 'slerp', 'normalize', 'angle'].map((k) => ({ text: k, hint: 'quaternion' })),
    v3: ['add', 'sub', 'scale', 'dot', 'cross', 'norm', 'normalize', 'hat'].map((k) => ({ text: k, hint: 'vector' })),
    Math: Object.getOwnPropertyNames(Math).map((k) => ({ text: k, hint: '' })),
  };
  return { globals, members };
}

// ------------------------------------------------------------------ gallery
function openGallery() {
  const cards = $('cards');
  cards.replaceChildren();
  for (const p of plants) {
    const b = el('button', { class: 'card', type: 'button', 'aria-current': S.plant?.id === p.id ? 'true' : 'false' });
    b.innerHTML = icons[p.id] || icons.default;
    b.append(
      el('span', { class: 'c-name', text: p.name }),
      el('span', { class: 'c-meta', text: `${p.category} · ${p.level}` }),
      el('span', { class: 'c-tag', text: p.tagline }),
      el('span', { class: 'c-dims', text: `${p.states.length} states · ${p.inputs.length} input${p.inputs.length > 1 ? 's' : ''} · ${(controllers[p.id] || []).length} controllers` }),
    );
    b.addEventListener('click', () => selectPlant(p.id, { fromGallery: true }));
    cards.append(b);
  }
  $('gallery').hidden = false;
  cards.querySelector('[aria-current="true"]')?.focus();
}
function closeGallery() { $('gallery').hidden = true; }
$('plantBtn').addEventListener('click', openGallery);
$('galClose').addEventListener('click', closeGallery);
$('gallery').addEventListener('click', (e) => { if (e.target === $('gallery')) closeGallery(); });

// ------------------------------------------------------------------ tabs, transport, tools
function activateTab(name) {
  for (const t of document.querySelectorAll('.tab')) t.setAttribute('aria-selected', String(t.dataset.tab === name));
  for (const p of document.querySelectorAll('.tab-body')) p.hidden = p.dataset.pane !== name;
  if (name === 'controller') editor.refresh();
  store.set('tab', name);
}
for (const t of document.querySelectorAll('.tab')) t.addEventListener('click', () => activateTab(t.dataset.tab));
$('btnPlay').addEventListener('click', () => {
  if (!client.worker) { run({ fresh: true }); return; }
  setRunning(!S.running);
});
$('btnStep').addEventListener('click', () => { setRunning(false); client.step(); });
$('btnReset').addEventListener('click', resetSim);
$('speed').addEventListener('change', () => { client.speed = +$('speed').value; });
$('btnCam').addEventListener('click', () => viewport.resetCamera(true));
$('btnFollow').addEventListener('click', () => {
  viewport.follow = !viewport.follow;
  $('btnFollow').setAttribute('aria-pressed', String(viewport.follow));
});
$('btnFull').addEventListener('click', () => {
  const v = $('viewport');
  if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
  else v.requestFullscreen?.().catch(() => logConsole('Full screen is not available in this view.', 'warn'));
});
$('btnPoke').addEventListener('click', () => poke());
$('errClose').addEventListener('click', hideError);
// ------------------------------------------------------------------ pinned run
function pinLabel() {
  const tpl = currentTemplate();
  const edited = tpl && editor.getValue() !== tpl.code;
  const tuned = S.tunables.filter((d) => Math.abs(d.value - d.def) > 1e-12 * Math.max(1, Math.abs(d.def)));
  let label = tpl ? tpl.name : 'your controller';
  if (edited) label += ' (edited)';
  if (tuned.length) label += ', ' + tuned.slice(0, 2).map((d) => `${d.name}=${fmtTune(d.value, d)}`).join(', ') + (tuned.length > 2 ? ', …' : '');
  return label;
}
function updatePin() {
  const p = scope.pinned;
  $('btnPin').textContent = p ? 'Unpin' : 'Pin run';
  $('btnPin').setAttribute('aria-pressed', String(!!p));
  $('pinNote').hidden = !p;
  if (p) {
    $('pinNote').textContent = `faded: ${p.label}`;
    $('pinNote').title = `Pinned run: ${p.label} (${p.tEnd.toFixed(1)} s). Faded lines show it under the live traces.`;
  }
}
$('btnPin').addEventListener('click', () => {
  if (scope.pinned) scope.unpin();
  else if (!scope.pin(pinLabel())) logConsole('Nothing to pin yet: let the simulation run first.', 'warn', S.frame?.t);
  else logConsole('Run pinned. Reset (⌫) or change the controller: the pinned traces stay as a faded overlay.', 'sys', S.frame?.t);
  updatePin();
});

$('winSel').addEventListener('change', () => { scope.window = +$('winSel').value; store.set('win', scope.window); });
$('btnCsv').addEventListener('click', () => {
  const csv = scope.toCSV();
  const done = () => logConsole(`Copied ${csv.split('\n').length - 1} rows of CSV to the clipboard.`, 'ok');
  const fallback = () => {
    const ta = el('textarea', { style: 'position:fixed;left:-9999px;top:0' });
    ta.value = csv;
    document.body.append(ta);
    ta.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch {}
    ta.remove();
    if (ok) done(); else logConsole('The clipboard is not available here.', 'warn');
  };
  if (navigator.clipboard?.writeText) navigator.clipboard.writeText(csv).then(done, fallback);
  else fallback();
});
function poke() {
  client.post({ type: 'poke' });
  S.view?.onPoke?.();
}

// ------------------------------------------------------------------ keyboard & gamepad
const keys = new Set();
const isTyping = (t) => t && (t.closest?.('.CodeMirror') || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || t.isContentEditable);
const AXES = {
  0: [['ArrowRight', 'KeyD'], ['ArrowLeft', 'KeyA']],
  1: [['ArrowUp', 'KeyW'], ['ArrowDown', 'KeyS']],
  2: [['KeyR'], ['KeyF']],
  3: [['KeyQ'], ['KeyE']],
};
let lastAxes = '';
function sendInput() {
  const axes = [0, 1, 2, 3].map((i) => {
    const [pos, neg] = AXES[i];
    return (pos.some((k) => keys.has(k)) ? 1 : 0) - (neg.some((k) => keys.has(k)) ? 1 : 0);
  });
  const gp = navigator.getGamepads ? [...navigator.getGamepads()].find((g) => g && g.connected) : null;
  if (gp) {
    const dz = (v) => (Math.abs(v) < 0.12 ? 0 : v);
    const a = gp.axes;
    if (a.length >= 4) {
      axes[0] = axes[0] || dz(a[0]);
      axes[1] = axes[1] || -dz(a[1]);
      axes[3] = axes[3] || -dz(a[2]);
      axes[2] = axes[2] || -dz(a[3]);
    }
  }
  const sig = axes.map((v) => v.toFixed(2)).join(',');
  if (sig !== lastAxes) {
    lastAxes = sig;
    client.post({ type: 'input', axes, keys: Object.fromEntries([...keys].map((k) => [k, true])) });
  }
}
window.addEventListener('keydown', (e) => {
  if (isTyping(e.target) || e.metaKey || e.ctrlKey || e.altKey) return;
  if (!$('gallery').hidden) { if (e.key === 'Escape') closeGallery(); return; }
  const code = e.code;
  if (code === 'Space') { e.preventDefault(); $('btnPlay').click(); return; }
  if (code === 'Backspace') { e.preventDefault(); resetSim(); return; }
  if (code === 'Period') { e.preventDefault(); $('btnStep').click(); return; }
  if (code === 'KeyP') { poke(); return; }
  if (Object.values(AXES).some(([a, b]) => a.includes(code) || b.includes(code))) {
    if (code.startsWith('Arrow')) e.preventDefault();
    keys.add(code);
    sendInput();
  }
});
window.addEventListener('keyup', (e) => {
  if (keys.delete(e.code)) sendInput();
});
window.addEventListener('blur', () => { keys.clear(); sendInput(); });
function updateKeysHelp(show) {
  const box = $('keysHelp');
  if (!show) { box.hidden = true; return; }
  const txt = S.plant?.keysHelp || ['←→', 'axis 0', '↑↓', 'axis 1'];
  box.replaceChildren();
  for (let i = 0; i < txt.length; i += 2) {
    box.append(el('div', {}, ...txt[i].split(' ').map((k) => el('kbd', { text: k })), ' ' + txt[i + 1]));
  }
  box.hidden = false;
}

// ------------------------------------------------------------------ splitters
function splitter(handle, onMove) {
  handle.addEventListener('pointerdown', (e) => {
    handle.setPointerCapture(e.pointerId);
    handle.classList.add('drag');
    const move = (ev) => onMove(ev);
    const up = () => {
      handle.classList.remove('drag');
      handle.removeEventListener('pointermove', move);
      handle.removeEventListener('pointerup', up);
      editor.refresh();
    };
    handle.addEventListener('pointermove', move);
    handle.addEventListener('pointerup', up);
  });
}
splitter($('splitH'), (ev) => {
  const w = Math.max(320, Math.min(window.innerWidth * 0.62, window.innerWidth - ev.clientX));
  document.documentElement.style.setProperty('--side-w', w + 'px');
  store.set('sideW', w);
});
splitter($('splitV'), (ev) => {
  const r = $('stage').getBoundingClientRect();
  const h = Math.max(140, Math.min(r.height - 140, ev.clientY - r.top));
  document.documentElement.style.setProperty('--view-h', h + 'px');
  store.set('viewH', h);
});
{
  const sw = store.get('sideW', null);
  if (sw) document.documentElement.style.setProperty('--side-w', Math.min(sw, window.innerWidth * 0.62) + 'px');
  const vh = store.get('viewH', null);
  if (vh) document.documentElement.style.setProperty('--view-h', vh + 'px');
  scope.window = store.get('win', 10);
  $('winSel').value = String(scope.window);
}

// ------------------------------------------------------------------ theme
function applyTheme() {
  const t = theme();
  viewport.setTheme(t);
  scope.readColors();
  if (S.plant) mountView();
  renderPoles();
}
matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', applyTheme);
new MutationObserver(applyTheme).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

// ------------------------------------------------------------------ main loop
let lastT = performance.now();
let hintTimer = 0;
function loop(now) {
  const dt = Math.min(0.1, (now - lastT) / 1000);
  lastT = now;
  sendInput();
  client.tick(dt);
  if (S.frame && S.frame.s.length === S.plant.states.length) viewport.update(S.frame, dt);
  viewport.render(dt);
  scope.draw();
  hintTimer += dt;
  if (hintTimer > 9) $('viewHint').style.opacity = '0';
  requestAnimationFrame(loop);
}

// ------------------------------------------------------------------ boot
viewport.setTheme(theme());
activateTab(store.get('tab', 'controller'));
selectPlant(store.get('plant', 'cartpole'));
requestAnimationFrame(loop);
