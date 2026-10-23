import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir, devNull } from 'node:os';
import { dirname, join } from 'node:path';

test('legacy harness restores only tests and records the exact committed synchronization override', () => {
  const root = mkdtempSync(join(tmpdir(), 'sise-ci-harness-'));
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('GITHUB_') && !key.startsWith('GIT_')));
  Object.assign(env, { GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: devNull, CI: 'false' });
  const git = (...args) => execFileSync('git', args, { cwd: root, env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  const put = (path, value) => {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), value);
  };
  const commit = () => {
    git('add', '.');
    git('-c', 'user.name=CI fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-m', 'fixture');
    return git('rev-parse', 'HEAD');
  };
  try {
    git('init', '-q');
    put('.gitignore', 'output/\n');
    put('application.txt', 'old application');
    put('tests/e2e/passive-collective.spec.ts', 'old timer synchronization');
    put('tests/e2e/unchanged.spec.ts', 'old assertions');
    put('playwright.config.ts', 'old organization');
    const baseline = commit();
    put('application.txt', 'current application');
    put('tests/e2e/passive-collective.spec.ts', 'committed publication barrier; original duration assertion');
    put('tests/e2e/unchanged.spec.ts', 'current organization');
    put('playwright.config.ts', 'current organization');
    put('ci/toolchain.json', JSON.stringify({ baseline }));
    put('ci/legacy-overrides.json', JSON.stringify({ version: 1, files: [
      { path: 'tests/e2e/passive-collective.spec.ts', reason: 'observable publication barrier, retain original assertion' },
    ] }));
    for (const name of ['git.mjs', 'harness-overrides.mjs', 'legacy-harness.mjs']) {
      mkdirSync(join(root, 'scripts/ci'), { recursive: true });
      copyFileSync(new URL(`../../scripts/ci/${name}`, import.meta.url), join(root, 'scripts/ci', name));
    }
    const candidate = commit();
    // An uncommitted edit cannot become comparison evidence.
    put('tests/e2e/passive-collective.spec.ts', 'uncommitted and untrusted');
    const actionsEnv = { ...env, GITHUB_ACTIONS: 'true', GITHUB_WORKSPACE: root };
    execFileSync(process.execPath, ['scripts/ci/legacy-harness.mjs'], { cwd: root, env: actionsEnv, stdio: 'pipe' });
    const read = (path) => readFileSync(join(root, path), 'utf8');
    assert.equal(read('application.txt'), 'current application');
    assert.equal(read('tests/e2e/unchanged.spec.ts'), 'old assertions');
    assert.equal(read('playwright.config.ts'), 'old organization');
    const override = 'committed publication barrier; original duration assertion';
    assert.equal(read('tests/e2e/passive-collective.spec.ts'), override);
    const evidence = JSON.parse(read('output/ci-migration/legacy/harness.json'));
    assert.equal(evidence.applicationSha, candidate);
    assert.equal(evidence.harnessSha, baseline);
    assert.equal(evidence.overrides[0].sourceSHA, candidate);
    assert.equal(evidence.overrides[0].sha256, createHash('sha256').update(override).digest('hex'));
    put('ci/legacy-overrides.json', JSON.stringify({ version: 1, files: [{ path: 'application.txt', reason: 'forbidden' }] }));
    const rejected = spawnSync(process.execPath, ['scripts/ci/legacy-harness.mjs'], { cwd: root, env: actionsEnv, encoding: 'utf8' });
    assert.notEqual(rejected.status, 0);
    assert.match(rejected.stderr, /Invalid explicit legacy test override/);
    assert.equal(read('application.txt'), 'current application');
  } finally { rmSync(root, { recursive: true, force: true }); }
});
