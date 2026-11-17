#!/usr/bin/env node
// What a toolchain uses (reference/toolchains.md), for the scaffold and generate steps.
//
//   node toolchains.mjs hook-config <toolchain>   .claude/hooks/config.json for the toolchain
//   node toolchains.mjs tasks <toolchain> [<project type>]   required tasks and their commands
//   node toolchains.mjs detect [--root <dir>]     the project's toolchain (state, else manifest)

import { resolve } from 'node:path';
import { TOOLCHAIN, TOOLCHAINS, detectToolchain, requiredTasks, taskCommand } from './lib/toolchains.mjs';

const [cmd, arg, type] = process.argv.slice(2);
const rootIdx = process.argv.indexOf('--root');
const known = (t) => {
  if (!TOOLCHAINS.includes(t)) {
    console.error(`error: unknown toolchain "${t}" (toolchains: ${TOOLCHAINS.join(', ')})`);
    process.exit(1);
  }
  return TOOLCHAIN[t];
};

if (cmd === 'hook-config') {
  const t = known(arg);
  console.log(JSON.stringify({ onEdit: t.onEdit, check: t.check }, null, 2));
} else if (cmd === 'tasks') {
  known(arg);
  for (const task of requiredTasks(arg, type ?? null)) console.log(`${task.padEnd(14)} ${taskCommand(arg, task)}`);
} else if (cmd === 'detect') {
  console.log(detectToolchain(resolve(rootIdx >= 0 ? process.argv[rootIdx + 1] : process.cwd())) ?? '(unknown)');
} else {
  console.log('Usage: node toolchains.mjs hook-config <toolchain> | tasks <toolchain> [<project type>] | detect [--root <dir>]');
  process.exit(cmd ? 1 : 0);
}
