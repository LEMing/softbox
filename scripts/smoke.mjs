/**
 * Consumer smoke test for the built package. Loads each entrypoint exactly the
 * way real consumers do — ESM `import` and a child-process CJS `require` — and
 * asserts the public surface resolves. Catches packaging regressions (bad
 * externals, unresolved subpaths, SSR-unsafe top-level code) that `vite build`
 * alone does not surface.
 */
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const distDir = resolve(root, 'dist');

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

// ESM entrypoint (exports.import / `module`)
const esm = await import(resolve(distDir, 'simple-viewer.es.js'));
assert(esm.SimpleViewer, 'ESM: SimpleViewer export missing');
assert(typeof esm.TypedEventEmitter === 'function', 'ESM: TypedEventEmitter export missing');
assert(esm.defaultOptions && typeof esm.defaultOptions === 'object', 'ESM: defaultOptions export missing');
assert(typeof esm.ThreeViewerError === 'function', 'ESM: ThreeViewerError export missing');

// CJS entrypoint (exports.require / `main`) — run in a real CJS process, the way
// a `require('threedviewer')` consumer loads it.
const cjsCheck = [
  "const m = require('./dist/simple-viewer.cjs');",
  "if (!m.SimpleViewer) throw new Error('CJS: SimpleViewer export missing');",
  "if (typeof m.TypedEventEmitter !== 'function') throw new Error('CJS: TypedEventEmitter export missing');",
  "if (!m.defaultOptions || typeof m.defaultOptions !== 'object') throw new Error('CJS: defaultOptions export missing');",
].join('');
execFileSync(process.execPath, ['-e', cjsCheck], { cwd: root, stdio: 'inherit' });

console.log('smoke ok: ESM + CJS entrypoints load and export the public API');
