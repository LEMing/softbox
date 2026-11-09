import { execFileSync } from 'node:child_process';
import { rmSync, symlinkSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const link = resolve(root, 'node_modules', 'softbox');

function removeLink() {
  rmSync(link, { force: true });
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

removeLink();
symlinkSync(root, link, 'junction');

try {
  const esm = await import('softbox');
  assert(esm.SimpleViewer, 'ESM: SimpleViewer export missing');
  assert(typeof esm.TypedEventEmitter === 'function', 'ESM: TypedEventEmitter export missing');
  assert(esm.defaultOptions && typeof esm.defaultOptions === 'object', 'ESM: defaultOptions export missing');
  assert(typeof esm.ThreeViewerError === 'function', 'ESM: ThreeViewerError export missing');

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
