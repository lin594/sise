import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { gitArguments } from './git.mjs';
import overrides from '../../ci/legacy-overrides.json' with { type: 'json' };
export function harnessOverrides(root) {
  if (overrides.version !== 1) throw new Error('Unknown legacy override contract');
  const git = (...args) => execFileSync('git', gitArguments(root, args), { cwd: root });
  const sourceSHA = git('rev-parse', 'HEAD').toString().trim();
  const seen = new Set();
  return overrides.files.map(({ path, reason }) => {
    if (!/^tests\/e2e\/[^/]+\.spec\.ts$/.test(path) || seen.has(path) || !reason) throw new Error('Invalid explicit legacy test override');
    seen.add(path);
    const content = git('show', `${sourceSHA}:${path}`);
    return { path, reason, sourceSHA, sha256: createHash('sha256').update(content).digest('hex'), content };
  });
}
