import { realpathSync } from 'node:fs';
// Container jobs mount the runner-owned checkout under another UID. Restrict
// this invocation to Actions' exact checkout; no global config is written.
export function gitArguments(root, args, env = process.env) {
  if (env.GITHUB_ACTIONS !== 'true') return args;
  const checkout = realpathSync(root);
  if (!env.GITHUB_WORKSPACE || realpathSync(env.GITHUB_WORKSPACE) !== checkout) {
    throw new Error('Git identity requires the exact Actions checkout workspace');
  }
  return ['-c', `safe.directory=${checkout}`, ...args];
}
