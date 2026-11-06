// Builds the Figma plugin: dist/code.js (sandbox) and dist/ui.html (UI iframe, script and CSS inlined).
// PINSAY_SERVER=http://localhost:5174 npm run build → a dev build against a local API (must be in devAllowedDomains).
import { build, context } from 'esbuild';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(here, 'dist');
const watch = process.argv.includes('--watch');
const server = (process.env.PINSAY_SERVER || 'https://app.pinsay.dev').replace(/\/+$/, '');
const define = { __PINSAY_SERVER__: JSON.stringify(server) };

const codeOptions = {
  entryPoints: [resolve(here, 'src/code.ts')],
  outfile: resolve(OUT, 'code.js'),
  bundle: true,
  format: 'iife',
  target: 'es2017',
  define,
  logLevel: 'info',
};

async function buildUi() {
  const r = await build({
    entryPoints: [resolve(here, 'src/ui/main.ts')],
    bundle: true,
    format: 'iife',
    target: 'es2017',
    write: false,
    minify: !watch,
    define,
  });
  const js = r.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
  const css = readFileSync(resolve(here, 'src/ui/ui.css'), 'utf8');
  const html = readFileSync(resolve(here, 'src/ui/ui.html'), 'utf8')
    .replace('/*__CSS__*/', () => css)
    .replace('/*__JS__*/', () => js);
  writeFileSync(resolve(OUT, 'ui.html'), html);
  console.log('ui.html written');
}

mkdirSync(OUT, { recursive: true });
if (watch) {
  const ctx = await context(codeOptions);
  await ctx.watch();
  const uiCtx = await context({
    entryPoints: [resolve(here, 'src/ui/main.ts')],
    bundle: true,
    write: false,
    plugins: [{ name: 'ui-html', setup(b) { b.onEnd(() => buildUi()); } }],
  });
  await uiCtx.watch();
} else {
  await build(codeOptions);
  await buildUi();
}
