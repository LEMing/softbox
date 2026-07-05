/**
 * Copies the bundled declaration file to a `.d.cts` twin so the `require`
 * condition in package.json#exports serves CJS-flavored types instead of the
 * ESM `.d.ts` — without this, `moduleResolution: node16/nodenext` consumers
 * calling `require('threedviewer')` get types resolved as if the package
 * were ESM (arethetypeswrong's "FalseESM"/"Masquerading as ESM").
 */
import { copyFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const source = resolve(root, 'dist', 'index.d.ts');
const target = resolve(root, 'dist', 'index.d.cts');

if (!existsSync(source)) {
  throw new Error(`Expected ${source} to exist after the build — did vite-plugin-dts run?`);
}

copyFileSync(source, target);
console.log('copied dist/index.d.ts -> dist/index.d.cts for the require() condition');
