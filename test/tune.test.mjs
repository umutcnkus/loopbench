// tunable(): declaration parsing, carry-over rules, live updates.
import assert from 'node:assert/strict';
import { tunable, beginTuneSetup, endTuneSetup, setTune, tuneState } from '../src/core/tune.js';

let n = 0;
const ok = (name, fn) => { fn(); n++; console.log('ok  ', name); };

ok('defaults and ranges', () => {
  beginTuneSetup({});
  const k = tunable({ a: [2, 0, 10], b: 3, c: -1, d: 0, e: [0.5, 0.01, 50, 'log'], f: { value: 4, min: 1, max: 9, step: 0.5 } });
  assert.deepEqual({ ...k }, { a: 2, b: 3, c: -1, d: 0, e: 0.5, f: 4 });
  const decls = endTuneSetup();
  const by = Object.fromEntries(decls.map((d) => [d.name, d]));
  assert.equal(by.b.min, 0); assert.equal(by.b.max, 9);
  assert.equal(by.c.min, -3); assert.equal(by.c.max, 0);
  assert.equal(by.d.min, -1); assert.equal(by.d.max, 1);
  assert.equal(by.e.log, true); assert.equal(by.e.step, 0);
  assert.equal(by.f.step, 0.5);
  assert.ok(by.a.step > 0 && by.a.step <= 0.05);
});

ok('live update reaches every object holding the name', () => {
  beginTuneSetup({});
  const k1 = tunable({ kp: [1, 0, 5] });
  const k2 = tunable({ kp: [1, 0, 5], kd: [2, 0, 5] });
  endTuneSetup();
  setTune('kp', 3.5);
  assert.equal(k1.kp, 3.5);
  assert.equal(k2.kp, 3.5);
  assert.equal(k2.kd, 2);
  assert.equal(setTune('nope', 1), null);
});

ok('slider value survives a recompile when the code default is unchanged', () => {
  beginTuneSetup({ kp: { value: 4, def: 1 } });
  const k = tunable({ kp: [1, 0, 5] });
  endTuneSetup();
  assert.equal(k.kp, 4);
});

ok('an edited code default wins over the old slider value', () => {
  beginTuneSetup({ kp: { value: 4, def: 1 } });
  const k = tunable({ kp: [2, 0, 5] });
  endTuneSetup();
  assert.equal(k.kp, 2);
});

ok('values outside the range widen it', () => {
  beginTuneSetup({});
  tunable({ kp: [1, 0, 5] });
  const [d] = endTuneSetup();
  assert.equal(d.max, 5);
  setTune('kp', 12);
  assert.equal(tuneState.decls[0].max, 12);
  beginTuneSetup({ kp: { value: 12, def: 1 } });
  const k = tunable({ kp: [1, 0, 5] });
  const [d2] = endTuneSetup();
  assert.equal(k.kp, 12);
  assert.equal(d2.max, 12);
});

ok('log sliders need a positive range and positive values', () => {
  beginTuneSetup({});
  assert.throws(() => tunable({ q: [1, 0, 10, 'log'] }), /min > 0/);
  tunable({ q: [1, 0.1, 10, 'log'] });
  endTuneSetup();
  assert.equal(setTune('q', -1), null);
  assert.equal(setTune('q', 0.5).value, 0.5);
});

ok('after setup, tunable() reads current values without registering', () => {
  beginTuneSetup({});
  tunable({ kp: [1, 0, 5] });
  endTuneSetup();
  setTune('kp', 2.5);
  const before = tuneState.objects.length;
  const k = tunable({ kp: [1, 0, 5], other: [7, 0, 9] });
  assert.equal(k.kp, 2.5);
  assert.equal(k.other, 7);
  assert.equal(tuneState.objects.length, before);
  assert.equal(tuneState.decls.length, 1);
});

ok('bad input is reported', () => {
  beginTuneSetup({});
  assert.throws(() => tunable([1, 2]), /expects an object/);
  assert.throws(() => tunable({ a: 'x' }), /finite number/);
  assert.throws(() => tunable({ a: [NaN, 0, 1] }), /finite number/);
});

console.log(`${n} tunable tests passed`);
