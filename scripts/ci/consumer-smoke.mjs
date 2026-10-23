import { createRequire } from 'node:module';
import { accessSync, constants } from 'node:fs';
import toolchain from '../../ci/toolchain.json' with { type: 'json' };
const client = createRequire(new URL('../../client/package.json', import.meta.url));
const root = createRequire(new URL('../../package.json', import.meta.url));
const esbuild = client('esbuild');
if (!esbuild.transformSync('const x: number = 1', { loader: 'ts' }).code.includes('1')) throw new Error('esbuild failed');
await client('rollup').rollup({ input: 'data:text/javascript,export default 1', plugins: [{ name: 'fixture', resolveId: id => id, load: () => 'export default 1' }] }).then(bundle => bundle.close());
if (root('@playwright/test/package.json').version !== toolchain.playwright) throw new Error('Playwright package/image mismatch');
for (const bin of ['node_modules/.bin/playwright', 'client/node_modules/.bin/vite', 'server/node_modules/.bin/tsc']) accessSync(bin, constants.X_OK);
if (process.argv.includes('--browsers')) {
  const { chromium, webkit } = root('playwright');
  for (const engine of [chromium, webkit]) accessSync(engine.executablePath(), constants.X_OK);
}
console.log('Consumed artifact: native Rollup, esbuild, executable symlinks and Playwright version verified.');
