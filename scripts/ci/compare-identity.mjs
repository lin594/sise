import assert from 'node:assert/strict';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
const [newPath, oldPath] = process.argv.slice(2);
if (!newPath || !oldPath) throw new Error('Specify new artifact manifest and old build identity');
const current = JSON.parse(readFileSync(newPath, 'utf8'));
const legacy = JSON.parse(readFileSync(oldPath, 'utf8'));
for (const field of ['source', 'workflow', 'runtime', 'locks', 'toolchain', 'distTrees']) {
  assert.deepEqual(current[field], legacy[field], `Old/new ${field} identity differs`);
}
mkdirSync('output/ci-migration/comparison', { recursive: true });
writeFileSync('output/ci-migration/comparison/identity.json', JSON.stringify({
  source: current.source, workflow: current.workflow, runtime: current.runtime,
  locks: current.locks, distTrees: current.distTrees, matched: true,
}, null, 2) + '\n');
console.log('Old and new pipelines built the same application tree and exact dist bytes.');
