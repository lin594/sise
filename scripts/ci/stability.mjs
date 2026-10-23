import { harnessOverrides } from './harness-overrides.mjs';
import { gitArguments } from './git.mjs';
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { dirname } from 'node:path';
import toolchain from '../../ci/toolchain.json' with { type: 'json' };
const project = process.argv[2];
if (!['chromium', 'webkit-responsive'].includes(project)) throw new Error('Specify chromium or webkit-responsive');
const git = (...args) => spawnSync('git', gitArguments(process.cwd(), args), { encoding: 'utf8' });
const files = git('ls-tree', '-r', '--name-only', toolchain.baseline, 'tests/e2e');
if (files.status !== 0) throw new Error(files.stderr);
if (existsSync('tests/ci-legacy') || existsSync('playwright.legacy-ci.config.ts')) throw new Error('Use a clean checkout; retained legacy evidence must not be overwritten');
for (const source of files.stdout.trim().split('\n')) {
  const target = source.replace('tests/e2e/', 'tests/ci-legacy/');
  const content = git('show', `${toolchain.baseline}:${source}`);
  if (content.status !== 0) throw new Error(content.stderr);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, content.stdout);
}
const overrides = harnessOverrides(process.cwd());
for (const entry of overrides) writeFileSync(entry.path.replace('tests/e2e/', 'tests/ci-legacy/'), entry.content);
const config = git('show', `${toolchain.baseline}:playwright.config.ts`);
if (config.status !== 0) throw new Error(config.stderr);
writeFileSync('playwright.legacy-ci.config.ts', config.stdout.replace('"./tests/e2e"', '"./tests/ci-legacy"'));
const groups = [
  { name: 'decision-publication', file: 'passive-collective.spec.ts', layer: 'experience', projects: ['chromium'] },
  { name: 'action-lifecycle', file: 'offline-action-presentation.spec.ts', layer: 'experience' },
  { name: 'flight-layout-handoff', file: 'mahjong-appearance.spec.ts', layer: 'contracts', grep: 'rotated river flights land on the exact face' },
  { name: 'short-hand-range', file: 'mahjong-appearance.spec.ts', layer: 'contracts', grep: 'keeps shorter hands and declaration marks' },
  { name: 'rotation-paging', file: 'mobile-table-appearance.spec.ts', layer: 'contracts', grep: 'SE single mode fits all cards' },
  { name: 'release-viewports', file: 'responsive-release.spec.ts', layer: 'experience' },
];
const evidenceRoot = 'output/ci-migration/stability';
mkdirSync(evidenceRoot, { recursive: true });
const harnessIdentity = {
  sourceSHA: git('rev-parse', 'HEAD').stdout.trim(), harnessSHA: toolchain.baseline,
  project, rounds: 2, retries: 0,
  overrides: overrides.map(({content, ...metadata}) => metadata),
};
// Persist identity before the first browser command, including on cancellation.
writeFileSync(`${evidenceRoot}/harness.json`, JSON.stringify(harnessIdentity, null, 2) + '\n', { flag: 'wx' });
const results = [];
for (const round of [1, 2]) {
  for (const group of groups.filter((group) => !group.projects || group.projects.includes(project))) for (const variant of round === 1 ? ['old', 'new'] : ['new', 'old']) {
    const label = `stability-${project}-${round}-${group.name}-${variant}`;
    const output = `output/ci-migration/${label}`;
    const args = ['scripts/ci/record.mjs', label, '--', process.execPath, 'node_modules/@playwright/test/cli.js', 'test',
      variant === 'old' ? `tests/ci-legacy/${group.file}` : `tests/e2e/${group.file}`,
      '--config', variant === 'old' ? 'playwright.legacy-ci.config.ts' : 'playwright.ci.config.ts',
      '--project', project, '--workers=1', '--retries=0', '--global-timeout=300000', '--reporter=line,json', '--output', `${output}/test-results`];
    if (group.grep) args.push('--grep', group.grep);
    const result = spawnSync(process.execPath, args, { stdio: 'inherit', env: {
      ...process.env, CI_BROWSER_LAYER: group.layer,
      PLAYWRIGHT_JSON_OUTPUT_FILE: `${output}/results.json`,
    } });
    results.push({ round, group: group.name, variant, exitCode: result.status, signal: result.signal });
    // Preserve every first failure and complete only this predeclared bounded plan.
  }
}
writeFileSync('output/ci-migration/stability/summary.json', JSON.stringify({
  ...harnessIdentity, groups, results,
  note: 'Same application artifact and browser image; A/B then B/A. This is a bounded sample, not a guarantee against flakes. Background clock tests are lifecycle logic, not real animation evidence.',
}, null, 2) + '\n');
if (results.some((r) => r.exitCode !== 0 || r.signal)) process.exitCode = 1;
