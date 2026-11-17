#!/usr/bin/env node
// Check the generated agent setup of a project (spec 5.3). Run in the project root.
//
//   node generatecheck.mjs [--root <dir>] [--json]
//
// Exits 1 on any issue.

import { resolve } from 'node:path';
import { checkGenerated } from './lib/generatecheck.mjs';

const argv = process.argv.slice(2);
const rootIdx = argv.indexOf('--root');
const root = resolve(rootIdx >= 0 ? argv[rootIdx + 1] : process.cwd());
const issues = checkGenerated(root);
if (argv.includes('--json')) console.log(JSON.stringify(issues, null, 2));
else if (!issues.length) console.log('ok   agent setup passes every check');
else {
  console.log(`FAIL ${issues.length} issue(s):`);
  for (const i of issues) console.log(`     - [${i.area}] ${i.issue}`);
}
process.exit(issues.length ? 1 : 0);
