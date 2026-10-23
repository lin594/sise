import { test } from 'node:test';
import assert from 'node:assert/strict';
import { realpathSync } from 'node:fs';
import { gitArguments } from '../../scripts/ci/git.mjs';
const root = realpathSync(process.cwd());
test('local Git retains the caller configuration', () => {
  assert.deepEqual(gitArguments(root, ['rev-parse', 'HEAD'], {}), ['rev-parse', 'HEAD']);
});
test('Actions Git is scoped to the exact mounted checkout for one invocation', () => {
  assert.deepEqual(gitArguments(root, ['rev-parse', 'HEAD'], {
    GITHUB_ACTIONS: 'true', GITHUB_WORKSPACE: root,
  }), ['-c', `safe.directory=${root}`, 'rev-parse', 'HEAD']);
});
test('an absent or different workspace cannot acquire a trust exception', () => {
  for (const workspace of [undefined, '/tmp/another-repository']) {
    assert.throws(() => gitArguments(root, ['rev-parse', 'HEAD'], { GITHUB_ACTIONS: 'true', GITHUB_WORKSPACE: workspace }));
  }
});
