#!/usr/bin/env node
// Facts about an existing repository for `/adopt` create mode (spec 5.2.1). Read-only.
//
//   node analyse.mjs [--root <dir>] [--json | --preflight]
//
// Without flags: a short summary for people. --json: everything, for the `analyse` step.
// --preflight: JSON with the mode and what stops /adopt before it starts (audit, monorepo,
// unsupported toolchain, no project).

import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { analyse, preflight, summary } from './lib/analyse.mjs';

const args = process.argv.slice(2);
const flag = (name) => {
  const i = args.indexOf(name);
  return i === -1 ? null : args[i + 1];
};
const root = resolve(flag('--root') ?? process.cwd());
const pluginRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

try {
  const a = analyse(root, { pluginRoot });
  if (args.includes('--preflight')) console.log(JSON.stringify(preflight(a), null, 2));
  else console.log(args.includes('--json') ? JSON.stringify(a, null, 2) : summary(a));
} catch (err) {
  console.error(`analyse: ${err.message}`);
  process.exit(1);
}
