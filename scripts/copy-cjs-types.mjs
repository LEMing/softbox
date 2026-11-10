import { copyFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const source = resolve(root, 'dist', 'index.d.ts');
const target = resolve(root, 'dist', 'index.d.cts');

if (!existsSync(source)) {
  throw new Error(`Expected ${source} to exist after the build — did unplugin-dts run?`);
}

copyFileSync(source, target);
console.log('copied dist/index.d.ts -> dist/index.d.cts for the require() condition');
