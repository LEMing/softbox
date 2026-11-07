/**
 * Consumer smoke test for the built package. Symlinks the package into its own
 * node_modules and loads it BY NAME — `import 'softbox'` (ESM, exports.import)
 * and a child-process `require('softbox')` (CJS, exports.require) — so the
 * real exports map is what's under test, not raw file paths. Catches packaging
 * regressions (bad externals, wrong conditions, SSR-unsafe top-level code).
 */
import { execFileSync } from 'node:child_process';
import { lstatSync, unlinkSync, symlinkSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const link = resolve(root, 'node_modules', 'softbox');

function removeLink() {
  try {
    lstatSync(link);
    unlinkSync(link);
  } catch {
    // not present
  }
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

removeLink();
symlinkSync(root, link, 'junction');

try {
  // ESM consumer — resolves via the `import` condition of the exports map.
  const esm = await import('softbox');
  assert(esm.SimpleViewer, 'ESM: SimpleViewer export missing');
  assert(typeof esm.TypedEventEmitter === 'function', 'ESM: TypedEventEmitter export missing');
  assert(esm.defaultOptions && typeof esm.defaultOptions === 'object', 'ESM: defaultOptions export missing');
  assert(typeof esm.ThreeViewerError === 'function', 'ESM: ThreeViewerError export missing');

  // CJS consumer — resolves via the `require` condition, in a real CJS process.
  const cjsCheck = [
    "const m = require('softbox');",
    "if (!m.SimpleViewer) throw new Error('CJS: SimpleViewer export missing');",
    "if (typeof m.TypedEventEmitter !== 'function') throw new Error('CJS: TypedEventEmitter export missing');",
    "if (!m.defaultOptions || typeof m.defaultOptions !== 'object') throw new Error('CJS: defaultOptions export missing');",
  ].join('');
  execFileSync(process.execPath, ['-e', cjsCheck], { cwd: root, stdio: 'inherit' });

  console.log('smoke ok: softbox resolves via the exports map for ESM (import) and CJS (require)');
} finally {
  removeLink();
}
