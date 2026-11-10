import { execFileSync } from 'node:child_process';
import { rmSync, symlinkSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const link = resolve(root, 'node_modules', 'softbox');
const tsc = resolve(root, 'node_modules', 'typescript', 'bin', 'tsc');
const smokeDir = resolve(root, 'scripts', 'type-smoke');

function removeLink() {
  rmSync(link, { force: true });
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
