#!/usr/bin/env node
// Facts about an existing repository for `/adopt` create mode (spec 5.2.1). Read-only.
//
//   node analyse.mjs [--root <dir>] [--json | --preflight | --gaps | --hook-config]
//
// Without flags: a short summary for people. --json: everything, for the `analyse` step.
// --preflight: JSON with the mode, what stops /adopt before it starts (audit, monorepo,
// unsupported toolchain, no project) and `route`, /start's route for the folder (spec 5.0). --gaps: the gaps still open, one per line (`gaps` re-checks
// with it). --hook-config: .claude/hooks/config.json from the project's own tools (`generate`).

import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { analyse, commitCount, hookConfig, preflight, summary } from './lib/analyse.mjs';
import * as S from './lib/state.mjs';

const args = process.argv.slice(2);
const flag = (name) => {
  const i = args.indexOf(name);
  return i === -1 ? null : args[i + 1];
};
const root = resolve(flag('--root') ?? process.cwd());
const pluginRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

try {
  const a = analyse(root, { pluginRoot });
  if (args.includes('--preflight')) {
    let pipeline = null;
    if (S.exists(root)) {
      const state = S.load(root);
      pipeline = { mode: S.modeOf(state), next: S.next(state) };
    }
    console.log(JSON.stringify(preflight(a, { pipeline, commits: a.git ? commitCount(root) : null }), null, 2));
  }
  else if (args.includes('--gaps')) console.log(a.gaps.map((g) => `${g.id}\t${g.issue}`).join('\n') || 'none');
  else if (args.includes('--hook-config')) console.log(JSON.stringify(hookConfig(a, root), null, 2));
  else console.log(args.includes('--json') ? JSON.stringify(a, null, 2) : summary(a));
} catch (err) {
  console.error(`analyse: ${err.message}`);
  process.exit(1);
}
