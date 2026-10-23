import { pathToFileURL } from 'node:url';
export const required = ['configuration', 'dependency-audit', 'build', 'unit', 'integration', 'browser', 'container-build'];
export const comparison = ['legacy-comparison', 'migration-stability'];
export function evaluate(needs, requireComparison) {
  const expected = [...required, ...comparison];
  if (Object.keys(needs).some((name) => !expected.includes(name))) throw new Error('Unexpected job in gate contract');
  for (const name of expected) {
    const status = comparison.includes(name) && !requireComparison ? 'skipped' : 'success';
    if (needs[name]?.result !== status) throw new Error(`${name}: expected ${status}, received ${needs[name]?.result ?? 'missing'}`);
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (!['true', 'false'].includes(process.env.REQUIRE_LEGACY)) throw new Error('Explicit comparison mode required');
  evaluate(JSON.parse(process.env.RESULTS), process.env.REQUIRE_LEGACY === 'true');
  console.log('Every required layer passed; optional comparison status matches the selected execution mode.');
}
