import { execFileSync } from 'node:child_process';

// Only examine tracked files. Never remove unknown local files in a contributor's checkout.
const tracked = new Set(execFileSync('git', ['ls-files', '-z', '--', 'client/src'], { encoding: 'utf8' }).split('\0').filter(Boolean));
const generated = [...tracked].filter(file => {
  const stem = file.endsWith('.d.ts') ? file.slice(0, -5) : file.endsWith('.js') ? file.slice(0, -3) : '';
  return stem && (tracked.has(`${stem}.ts`) || tracked.has(`${stem}.vue`) || (stem.endsWith('.vue') && tracked.has(stem)));
});
if (generated.length) {
  console.error(`Client compilation counterparts must not be tracked:\n${generated.join('\n')}`);
  process.exitCode = 1;
} else {
  console.log('No tracked client compilation counterparts; authored declarations remain allowed.');
}
