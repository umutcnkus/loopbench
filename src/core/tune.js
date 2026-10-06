// Live-tunable controller constants.
//
// User code declares them once, usually at the top level:
//   const k = tunable({ kp: [6, 0, 20], kd: [2, 0, 5, 0.1], q: [10, 0.1, 1000, 'log'] });
// and reads k.kp inside control(). The page shows a slider per entry; moving it
// writes the new value into the same object, so the next control() call sees it
// without recompiling or resetting the plant. An optional onTune(ctx, name, value)
// hook lets a controller redo a design (e.g. recompute LQR gains).
//
// Entry forms:  name: default
//               name: [default, min, max]            linear slider
//               name: [default, min, max, step]
//               name: [default, min, max, 'log']     logarithmic slider (min > 0)
//               name: { value, min, max, step?, log? }

export const MAX_TUNABLES = 24;

export const tuneState = {
  saved: {}, // name -> { value, def } carried over from the page (survives recompiles)
  decls: [], // declarations made while the controller was being set up
  objects: [], // live objects handed to user code
  frozen: false, // after setup, calls to tunable() read values but do not register
};

export function beginTuneSetup(saved) {
  if (saved) tuneState.saved = { ...saved };
  tuneState.decls = [];
  tuneState.objects = [];
  tuneState.frozen = false;
}
export function endTuneSetup() {
  tuneState.frozen = true;
  return tuneState.decls.map((d) => ({ ...d }));
}

function niceStep(span) {
  const raw = span / 400;
  const e = Math.pow(10, Math.floor(Math.log10(raw)));
  const m = raw / e;
  return (m < 1.5 ? 1 : m < 3.5 ? 2 : m < 7.5 ? 5 : 10) * e;
}

function parseEntry(name, d) {
  let def, min, max, opt;
  if (typeof d === 'number') def = d;
  else if (Array.isArray(d)) [def, min, max, opt] = d;
  else if (d && typeof d === 'object') {
    def = d.value;
    min = d.min;
    max = d.max;
    opt = d.log ? 'log' : d.step;
  }
  if (typeof def !== 'number' || !Number.isFinite(def)) {
    throw new TypeError(`tunable '${name}': the default value must be a finite number`);
  }
  const log = opt === 'log';
  const haveRange = Number.isFinite(min) && Number.isFinite(max) && max > min;
  if (!haveRange) {
    if (log) {
      min = def > 0 ? def / 100 : 1e-3;
      max = def > 0 ? def * 100 : 1;
    } else if (def > 0) { min = 0; max = 3 * def; }
    else if (def < 0) { min = 3 * def; max = 0; }
    else { min = -1; max = 1; }
  }
  if (log && !(min > 0)) throw new RangeError(`tunable '${name}': a 'log' slider needs min > 0`);
  if (def < min) min = def;
  if (def > max) max = def;
  const step = log ? 0 : typeof opt === 'number' && opt > 0 ? opt : niceStep(max - min);
  return { name, def, min, max, step, log };
}

// A value typed outside the declared range widens the range instead of being clipped.
function admit(d, v) {
  if (!Number.isFinite(v) || (d.log && !(v > 0))) return false;
  if (v < d.min) d.min = v;
  if (v > d.max) d.max = v;
  return true;
}

export function tunable(spec) {
  if (!spec || typeof spec !== 'object' || Array.isArray(spec)) {
    throw new TypeError('tunable() expects an object, e.g. tunable({ kp: [6, 0, 20] })');
  }
  const obj = {};
  for (const [name, entry] of Object.entries(spec)) {
    const d = parseEntry(name, entry);
    const known = tuneState.decls.find((x) => x.name === name);
    if (tuneState.frozen) {
      // called outside setup (e.g. inside control): hand back current values only
      obj[name] = known ? known.value : d.def;
      continue;
    }
    const s = tuneState.saved[name];
    d.value = s && s.def === d.def && admit(d, s.value) ? s.value : d.def;
    if (known) Object.assign(known, d);
    else {
      if (tuneState.decls.length >= MAX_TUNABLES) throw new RangeError(`tunable(): at most ${MAX_TUNABLES} sliders`);
      tuneState.decls.push(d);
    }
    obj[name] = d.value;
  }
  if (!tuneState.frozen) tuneState.objects.push(obj);
  return obj;
}

// Called when the page moves a slider. Returns the declaration, or null.
export function setTune(name, value) {
  const d = tuneState.decls.find((x) => x.name === name);
  if (!d || !admit(d, value)) return null;
  d.value = value;
  tuneState.saved[name] = { value, def: d.def };
  for (const o of tuneState.objects) if (Object.prototype.hasOwnProperty.call(o, name)) o[name] = value;
  return d;
}
