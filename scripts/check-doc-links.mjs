import { readdir, readFile, access } from 'node:fs/promises';
import path from 'node:path';

// Validate repository-local Markdown links without depending on external sites.
// Historical archives are retained as evidence, not maintained contributor docs.
const root = process.cwd();
async function markdownFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const nested = await Promise.all(entries.filter(entry => entry.name !== 'archive' && entry.name !== 'node_modules')
    .map(entry => entry.isDirectory() ? markdownFiles(path.join(dir, entry.name))
      : entry.name.endsWith('.md') ? [path.join(dir, entry.name)] : []));
  return nested.flat();
}
const files = [...(await readdir(root)).filter(name => name.endsWith('.md')).map(name => path.join(root, name)),
  ...await markdownFiles(path.join(root, 'docs'))];
const failures = [];
for (const file of files) {
  const text = (await readFile(file, 'utf8')).replace(/```[\s\S]*?```/g, '');
  for (const match of text.matchAll(/!?\[[^\]\n]*\]\((<[^>]+>|[^\s)]+)(?:\s+"[^"]*")?\)/g)) {
    const target = match[1].replace(/^<|>$/g, '');
    if (/^(?:[a-z][a-z0-9+.-]*:|#|\/\/)/i.test(target)) continue;
    const local = decodeURIComponent(target.split(/[?#]/)[0]);
    if (!local) continue;
    const resolved = path.resolve(path.dirname(file), local);
    if (!resolved.startsWith(root + path.sep)) {
      failures.push(`${path.relative(root, file)}: outside repository: ${target}`);
      continue;
    }
    try { await access(resolved); }
    catch { failures.push(`${path.relative(root, file)}: missing ${target}`); }
  }
}
if (failures.length) {
  console.error(failures.join('\n'));
  process.exitCode = 1;
} else console.log(`Checked relative link targets in ${files.length} current Markdown files.`);
