#!/usr/bin/env node
// Check a scaffolded web project (spec 5.5). Run in the project root.
//
//   node scaffoldcheck.mjs [--root <dir>] [--json]
//
// Uses the resolved versions from .keelwright/state.json when present. Exits 1 on any issue.

import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { checkScaffold } from './lib/scaffoldcheck.mjs';

const argv = process.argv.slice(2);
const rootIdx = argv.indexOf('--root');
const root = resolve(rootIdx >= 0 ? argv[rootIdx + 1] : process.cwd());
const statePath = join(root, '.keelwright/state.json');
const versions = existsSync(statePath) ? (JSON.parse(readFileSync(statePath, 'utf8')).stack?.versions ?? {}) : {};

const issues = checkScaffold(root, { versions });
if (argv.includes('--json')) console.log(JSON.stringify(issues, null, 2));
else if (!issues.length) console.log('ok   scaffold passes every check');
else {
  console.log(`FAIL ${issues.length} issue(s):`);
  for (const i of issues) console.log(`     - [${i.area}] ${i.issue}`);
}
process.exit(issues.length ? 1 : 0);
