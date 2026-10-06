// Scripted UI checks: gallery, tabs, error handling, theme, mobile.
import { createRequire } from 'node:module';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
let chromium;
try {
  ({ chromium } = await import('playwright'));
} catch {
  // fall back to a global install (npm i -g playwright)
  const globalRoot = process.env.PLAYWRIGHT_GLOBAL || '/home/claude/.npm-global/lib/node_modules/';
  ({ chromium } = createRequire(globalRoot)('playwright'));
}
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const outDir = path.join(root, 'scratch/shots');
const which = process.argv[2] || 'all';
const server = http.createServer((req, res) => {
  const f = path.join(root, process.env.SERVE_DIR || 'dist', decodeURIComponent(req.url.split('?')[0]));
  if (!fs.existsSync(f)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'content-type': 'text/html' });
  fs.createReadStream(f).pipe(res);
}).listen(0);
const port = server.address().port;
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
let lastCtx = null;
async function open({ w = 1440, h = 900, theme = 'light', plant = 'cartpole', tab = null } = {}) {
  if (lastCtx) await lastCtx.close();
  const ctx = lastCtx = await browser.newContext({ viewport: { width: w, height: h }, colorScheme: theme });
  const page = await ctx.newPage();
  page.logs = [];
  page.on('console', (m) => page.logs.push(`[${m.type()}] ${m.text()}`));
  page.on('pageerror', (e) => page.logs.push(`[pageerror] ${e.message}`));
  await page.route('https://cdn.jsdelivr.net/npm/**', async (route) => {
    const u = new URL(route.request().url());
    const m = u.pathname.match(/^\/npm\/([^@/]+(?:\/[^@/]+)?)@[^/]+\/(.*)$/);
    let fp = m && path.join(root, 'node_modules', m[1], m[2]);
    if (fp && !fs.existsSync(fp) && fp.endsWith('.min.js')) fp = fp.replace(/\.min\.js$/, '.js');
    if (!fp || !fs.existsSync(fp)) return route.fulfill({ status: 404 });
    route.fulfill({ status: 200, body: fs.readFileSync(fp), headers: { 'content-type': 'application/javascript', 'access-control-allow-origin': '*' } });
  });
  await page.route('https://fonts.googleapis.com/**', (r) => r.fulfill({ status: 200, body: '', headers: { 'content-type': 'text/css' } }));
  await page.route('https://fonts.gstatic.com/**', (r) => r.fulfill({ status: 404 }));
  await page.addInitScript(([p, t]) => { try { localStorage.setItem('loopbench:plant', JSON.stringify(p)); if (t) localStorage.setItem('loopbench:tab', JSON.stringify(t)); } catch {} }, [plant, tab]);
  await page.goto(`http://127.0.0.1:${port}/${process.env.PAGE || 'test.html'}`);
  await page.waitForTimeout(2500);
  return page;
}
const shot = (page, name) => page.screenshot({ path: path.join(outDir, name + '.png') });
if (which === 'all' || which === 'gallery') {
  const page = await open();
  await page.click('#plantBtn');
  await page.waitForTimeout(400);
  await shot(page, 'ui-gallery');
  await page.click('.card:has-text("Quadrotor")');
  await page.waitForTimeout(1500);
  console.log('after gallery pick:', await page.textContent('#pbName'));
  console.log(page.logs.join('\n'));
}
if (which === 'all' || which === 'tabs') {
  const page = await open({ plant: 'furuta' });
  for (const t of ['plant', 'scenario', 'docs']) {
    await page.click(`.tab[data-tab="${t}"]`);
    await page.waitForTimeout(500);
    await shot(page, 'ui-tab-' + t);
  }
  console.log(page.logs.join('\n'));
}
if (which === 'all' || which === 'errors') {
  const page = await open();
  // syntax error
  await page.evaluate(() => { const cm = document.querySelector('.CodeMirror').CodeMirror; cm.setValue('function control(ctx) {\n  const a = 1;\n  return a +;\n}\n'); });
  await page.click('#btnRun');
  await page.waitForTimeout(800);
  await shot(page, 'ui-err-syntax');
  console.log('syntax banner:', await page.textContent('#errText'));
  // runtime error on line 3
  await page.evaluate(() => { const cm = document.querySelector('.CodeMirror').CodeMirror; cm.setValue('function control(ctx) {\n  const v = ctx.y.x;\n  return undefinedThing * v;\n}\n'); });
  await page.click('#btnRun');
  await page.waitForTimeout(800);
  console.log('runtime banner:', await page.textContent('#errText'));
  // infinite loop -> watchdog
  await page.evaluate(() => { const cm = document.querySelector('.CodeMirror').CodeMirror; cm.setValue('function control(ctx) {\n  while (true) {}\n}\n'); });
  await page.click('#btnRun');
  await page.waitForTimeout(6000);
  console.log('loop banner:', await page.textContent('#errText'));
  // console.log forwarding + good code again
  await page.evaluate(() => { const cm = document.querySelector('.CodeMirror').CodeMirror; cm.setValue('function init(ctx) { console.log("hello", 42, [1,2]); }\nfunction control(ctx) { ctx.log("sig", Math.sin(ctx.t)); return 0; }\n'); });
  await page.click('#btnRun');
  await page.waitForTimeout(1500);
  console.log('console:', (await page.textContent('#consoleBody')).slice(-200));
  console.log('banner hidden:', await page.isHidden('#errBanner'));
  await shot(page, 'ui-err-ok');
  console.log(page.logs.join('\n'));
}
if (which === 'all' || which === 'dark') {
  const page = await open({ theme: 'dark', plant: 'ballplate' });
  await page.waitForTimeout(1500);
  await shot(page, 'ui-dark');
  console.log(page.logs.join('\n'));
}
if (which === 'all' || which === 'mobile') {
  const page = await open({ w: 400, h: 860, plant: 'segway' });
  await page.waitForTimeout(1000);
  await shot(page, 'ui-mobile');
  await page.screenshot({ path: path.join(outDir, 'ui-mobile-full.png'), fullPage: true });
  const sw = await page.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]);
  console.log('mobile scrollWidth vs innerWidth:', sw);
  console.log(page.logs.join('\n'));
}
if (which === 'all' || which === 'drag') {
  const page = await open({ plant: 'cartpole' });
  await page.selectOption('#tplSel', 'open-loop');
  await page.waitForTimeout(1500);
  const box = await page.locator('#viewport canvas').boundingBox();
  // find the pole tip on screen by projecting
  await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.62);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.62, box.y + box.height * 0.55, { steps: 10 });
  await page.waitForTimeout(600);
  await shot(page, 'ui-drag');
  await page.mouse.up();
  console.log(page.logs.join('\n'));
}
if (which === 'hotswap') {
  const page = await open({ plant: 'cartpole' });
  await page.waitForTimeout(6000);
  const t1 = await page.textContent('#simTime');
  await page.check('#keepState');
  await page.evaluate(() => { const cm = document.querySelector('.CodeMirror').CodeMirror; cm.setValue(cm.getValue().replace('diag([30, 80, 3, 4])', 'diag([60, 80, 3, 4])')); });
  await page.click('#btnRun');
  await page.waitForTimeout(1500);
  const t2 = await page.textContent('#simTime');
  console.log('sim time before/after hot-swap:', t1, t2, 'console:', (await page.textContent('#consoleBody')).slice(-120));
  await page.click('.tab[data-tab="plant"]');
  await page.waitForTimeout(600);
  console.log('poles:', (await page.textContent('#polesList')).slice(0, 200));
  await shot(page, 'ui-hotswap-plant');
  console.log(page.logs.join('\n'));
}
if (which === 'tune') {
  const page = await open({ plant: 'ballbeam' });
  await page.waitForTimeout(1500);
  console.log('tunables visible:', await page.isVisible('#tunables'), 'count:', await page.textContent('#tnCount'));
  console.log('names:', await page.$$eval('.tn code', (els) => els.map((e) => e.textContent).join(',')));
  // move kp to 12 via the number box, kda via the range
  await page.fill('.tn:has(code:text-is("kp")) .tn-num', '12');
  await page.press('.tn:has(code:text-is("kp")) .tn-num', 'Enter');
  await page.$eval('.tn:has(code:text-is("kda")) input[type=range]', (r) => { r.value = '6'; r.dispatchEvent(new Event('input', { bubbles: true })); });
  await page.waitForTimeout(3000);
  console.log('buttons disabled (reset, write):', await page.isDisabled('#btnTuneReset'), await page.isDisabled('#btnTuneWrite'));
  await shot(page, 'ui-tune');
  // write to code
  await page.click('#btnTuneWrite');
  await page.waitForTimeout(300);
  const code = await page.evaluate(() => document.querySelector('.CodeMirror').CodeMirror.getValue());
  console.log('code now:', code.split('\n').filter((l) => /kp:|kda:/.test(l)).join(' | '));
  console.log('buttons after write:', await page.isDisabled('#btnTuneReset'), await page.isDisabled('#btnTuneWrite'));
  // recompile: values must persist
  await page.click('#btnRun');
  await page.waitForTimeout(1500);
  console.log('after run kp=', await page.inputValue('.tn:has(code:text-is("kp")) .tn-num'), 'kda=', await page.inputValue('.tn:has(code:text-is("kda")) .tn-num'));
  // LQR template with onTune
  await page.selectOption('#tplSel', 'lqr');
  await page.waitForTimeout(1500);
  console.log('lqr tunables:', await page.textContent('#tnCount'));
  await page.selectOption('#tplSel', 'manual');
  await page.waitForTimeout(1200);
  console.log('manual: panel hidden =', await page.isHidden('#tunables'));
  console.log(page.logs.join('\n'));
}
if (which === 'tune2') {
  const page = await open({ plant: 'cartpole' });
  await page.selectOption('#tplSel', 'lqr');
  await page.waitForTimeout(2000);
  await page.$eval('.tn:has(code:text-is("qth")) input[type=range]', (r) => { r.value = '900'; r.dispatchEvent(new Event('input', { bubbles: true })); });
  await page.waitForTimeout(2500);
  console.log('qth=', await page.inputValue('.tn:has(code:text-is("qth")) .tn-num'), 'banner hidden:', await page.isHidden('#errBanner'));
  await shot(page, 'ui-tune-lqr');
  // onTune error path
  await page.evaluate(() => { const cm = document.querySelector('.CodeMirror').CodeMirror; cm.setValue('const k = tunable({ a: [1, 0, 2] });\nfunction onTune(ctx) {\n  throw new Error("boom");\n}\nfunction control(ctx) { return 0; }\n'); });
  await page.click('#btnRun');
  await page.waitForTimeout(1200);
  await page.$eval('.tn:has(code:text-is("a")) input[type=range]', (r) => { r.value = '1.5'; r.dispatchEvent(new Event('input', { bubbles: true })); });
  await page.waitForTimeout(1200);
  console.log('onTune error banner:', await page.textContent('#errText'));
  console.log(page.logs.join('\n'));
}
if (which === 'pin') {
  const page = await open({ plant: 'ballbeam' });
  await page.waitForTimeout(9000);
  await page.click('#btnPin');
  await page.waitForTimeout(200);
  console.log('pin note:', await page.textContent('#pinNote'), '| button:', await page.textContent('#btnPin'));
  // detune kp and reset to compare
  await page.fill('.tn:has(code:text-is("kd")) .tn-num', '1.5');
  await page.press('.tn:has(code:text-is("kd")) .tn-num', 'Enter');
  await page.click('#btnReset');
  await page.waitForTimeout(9000);
  const box = await page.locator('.scope-panel canvas').first().boundingBox();
  await page.mouse.move(box.x + 44 + (box.width - 52) * 0.1, box.y + box.height * 0.5);
  await page.waitForTimeout(400);
  console.log('tooltip:', (await page.textContent('.scope-tip')).slice(0, 200));
  await shot(page, 'ui-pin');
  await page.click('#btnPin');
  console.log('after unpin:', await page.isHidden('#pinNote'), await page.textContent('#btnPin'));
  console.log(page.logs.join('\n'));
}
await browser.close();
server.close();
