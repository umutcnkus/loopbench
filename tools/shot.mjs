// Headless browser check: serve dist/, map CDN URLs to node_modules, capture console + screenshots.
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
const args = Object.fromEntries(process.argv.slice(2).map((a) => a.split('=')));
const outDir = path.join(root, 'scratch/shots');
fs.mkdirSync(outDir, { recursive: true });

const server = http.createServer((req, res) => {
  const f = path.join(root, process.env.SERVE_DIR || 'dist', decodeURIComponent(req.url.split('?')[0]));
  if (!fs.existsSync(f)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'content-type': f.endsWith('.html') ? 'text/html' : 'application/octet-stream' });
  fs.createReadStream(f).pipe(res);
}).listen(0);
const port = server.address().port;

const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const ctx = await browser.newContext({ viewport: { width: +(args.w || 1440), height: +(args.h || 900) }, deviceScaleFactor: +(args.dpr || 1), colorScheme: args.theme || 'light' });
const page = await ctx.newPage();
const logs = [];
page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`));
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}\n${e.stack}`));
page.on('requestfailed', (r) => logs.push(`[reqfail] ${r.url()} ${r.failure()?.errorText}`));
await page.route('https://cdn.jsdelivr.net/npm/**', async (route) => {
  const u = new URL(route.request().url());
  let m = u.pathname.match(/^\/npm\/([^@/]+(?:\/[^@/]+)?)@[^/]+\/(.*)$/);
  if (!m) return route.fulfill({ status: 404 });
  let [, pkg, file] = m;
  let fp = path.join(root, 'node_modules', pkg, file);
  if (!fs.existsSync(fp) && fp.endsWith('.min.js')) fp = fp.replace(/\.min\.js$/, '.js');
  if (!fs.existsSync(fp)) { logs.push('[cdn-missing] ' + u.href); return route.fulfill({ status: 404 }); }
  route.fulfill({ status: 200, body: fs.readFileSync(fp), headers: { 'content-type': 'application/javascript', 'access-control-allow-origin': '*' } });
});
await page.route('https://fonts.googleapis.com/**', (r) => r.fulfill({ status: 200, body: '', headers: { 'content-type': 'text/css' } }));
await page.route('https://fonts.gstatic.com/**', (r) => r.fulfill({ status: 404 }));
if (args.plant) await page.addInitScript((p) => { try { localStorage.setItem('loopbench:plant', JSON.stringify(p)); } catch {} }, args.plant);
if (args.tpl) await page.addInitScript(([p, t]) => { try { localStorage.setItem('loopbench:drafts', JSON.stringify({ [p]: { tpl: t } })); } catch {} }, [args.plant, args.tpl]);
await page.goto(`http://127.0.0.1:${port}/${process.env.PAGE || 'test.html'}`);
const waits = (args.at || '3').split(',').map(Number);
let tPrev = 0;
for (const t of waits) {
  await page.waitForTimeout((t - tPrev) * 1000);
  tPrev = t;
  const name = `${args.name || args.plant || 'page'}-${t}s.png`;
  await page.screenshot({ path: path.join(outDir, name) });
  console.log('shot', name);
}
if (args.eval) console.log('eval:', await page.evaluate(args.eval));
console.log(logs.join('\n') || '(no console output)');
await browser.close();
server.close();
