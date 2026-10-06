// Build: controllers -> engine worker bundle -> app bundle -> single HTML page.
import * as esbuild from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const minify = !process.argv.includes('--dev');
execFileSync('node', [path.join(root, 'tools/gen-controllers.mjs')], { stdio: 'inherit' });
execFileSync('node', [path.join(root, 'tools/gen-models.mjs')], { stdio: 'inherit' });

const eng = await esbuild.build({
  entryPoints: [path.join(root, 'src/worker/worker.js')],
  bundle: true, format: 'iife', minify, write: false, target: 'es2020', legalComments: 'none',
});
const engineText = eng.outputFiles[0].text;

const virtualEngine = {
  name: 'virtual-engine',
  setup(b) {
    b.onResolve({ filter: /^virtual:engine$/ }, () => ({ path: 'engine', namespace: 'virt' }));
    b.onLoad({ filter: /.*/, namespace: 'virt' }, () => ({ contents: 'export default ' + JSON.stringify(engineText) + ';', loader: 'js' }));
  },
};
const app = await esbuild.build({
  entryPoints: [path.join(root, 'src/app/main.js')],
  bundle: true, format: 'esm', minify, write: false, target: 'es2020', legalComments: 'none',
  external: ['three', 'three/addons/*'],
  plugins: [virtualEngine],
});
const appText = app.outputFiles[0].text;
const cmCss = fs.readFileSync(path.join(root, 'node_modules/codemirror/lib/codemirror.css'), 'utf8')
  + '\n' + fs.readFileSync(path.join(root, 'node_modules/codemirror/addon/hint/show-hint.css'), 'utf8');
const css = cmCss + '\n' + fs.readFileSync(path.join(root, 'src/app/styles.css'), 'utf8');
const minCss = minify ? (await esbuild.transform(css, { loader: 'css', minify: true })).code : css;
let html = fs.readFileSync(path.join(root, 'src/app/index.html'), 'utf8');
html = html.replace('/*__CSS__*/', () => minCss);
html = html.replace('/*__APP__*/', () => appText.replace(/<\/script/gi, '<\\/script'));
fs.mkdirSync(path.join(root, 'dist'), { recursive: true });
fs.writeFileSync(path.join(root, 'dist/loopbench.html'), html);
// test wrapper imitating the artifact skeleton
const wrapped = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"><style>:root{color-scheme:light;padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}body{margin:0;font:14px system-ui;background:#fafaf8}img{max-width:100%}[hidden]{display:none!important}</style></head><body>${html}</body></html>`;
fs.writeFileSync(path.join(root, 'dist/test.html'), wrapped);
// standalone page for static hosting (GitHub Pages): a full document around the same app
const cut = html.indexOf('<div id="app">');
const icon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#d9480f" stroke-width="2.2" stroke-linecap="round"><circle cx="7" cy="12" r="4"/><path d="M11 12h9M17 8l3 4-3 4"/><path d="M7 16v3h10v-3" opacity=".55"/></svg>`;
const site = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<link rel="icon" href="data:image/svg+xml,${encodeURIComponent(icon)}">
<meta property="og:title" content="Loopbench — 3D control systems lab">
<meta property="og:description" content="Twelve physically modeled systems — cart-pole, maglev, quadrotor, rocket landing and more — driven by controllers you write in JavaScript.">
<meta property="og:type" content="website">
${html.slice(0, cut).trim()}
</head>
<body>
${html.slice(cut).trim()}
</body>
</html>
`;
fs.mkdirSync(path.join(root, 'site'), { recursive: true });
fs.writeFileSync(path.join(root, 'site/index.html'), site);
fs.writeFileSync(path.join(root, 'site/.nojekyll'), '');
console.log(`built dist/loopbench.html  ${(html.length / 1024).toFixed(0)} KB (engine ${(engineText.length / 1024).toFixed(0)} KB, app ${(appText.length / 1024).toFixed(0)} KB)`);
