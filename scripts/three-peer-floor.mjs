import { readFileSync } from 'node:fs';

const { peerDependencies } = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const floor = /^>=\s*(\d+\.\d+\.\d+)/.exec(peerDependencies.three)?.[1];

if (!floor) {
  console.error(`peerDependencies.three has no ">=x.y.z" lower bound: ${peerDependencies.three}`);
  process.exit(1);
}

console.log(floor);
