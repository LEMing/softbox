/**
 * Consumer TYPE smoke test. Symlinks the package into its own node_modules so a
 * consumer can `import 'softbox'` through the real exports map, then type
 * checks that consumer under both `nodenext` and `bundler` module resolution.
 * Catches published-declaration regressions (extensionless relative imports →
 * TS2834, leaked node_modules paths → TS2307) that building alone does not show.
 */
import { execFileSync } from 'node:child_process';
import { lstatSync, unlinkSync, symlinkSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const link = resolve(root, 'node_modules', 'softbox');
const tsc = resolve(root, 'node_modules', 'typescript', 'bin', 'tsc');
const smokeDir = resolve(root, 'scripts', 'type-smoke');

function removeLink() {
  try {
    lstatSync(link);
    unlinkSync(link);
  } catch {
    // not present
  }
}

removeLink();
symlinkSync(root, link, 'junction');

try {
  for (const cfg of ['tsconfig.nodenext.json', 'tsconfig.bundler.json']) {
    execFileSync(process.execPath, [tsc, '-p', resolve(smokeDir, cfg)], {
      stdio: 'inherit',
      cwd: root,
    });
    console.log(`type-smoke ok: published types resolve under ${cfg.replace('tsconfig.', '').replace('.json', '')}`);
  }
} finally {
  removeLink();
}
