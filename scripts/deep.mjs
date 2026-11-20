#!/usr/bin/env node
// The security audit's judgement review (spec 7.7): `/keelwright:doctor security --deep`. COSTS
// MONEY: every area is a headless, read-only Claude call, and every finding is checked by a
// second one. Writes .keelwright/security/deep.json (git-ignored); the next doctor run carries
// its findings.
//
//   node deep.mjs --plan [--root <dir>]                         the areas, free
//   node deep.mjs --max-cost <usd> [--model <m>] [--area <name>] [--max-areas <n>] [--json] [--root <dir>]
//
// --max-cost is required: a hard limit across all calls (each call gets what's left as its
// --max-budget-usd). Areas it doesn't reach are listed as not reviewed. Exit 1 on an open
// critical or high finding.

import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { claudeInvoke } from './lib/claude.mjs';
import * as D from './lib/deep.mjs';

const argv = process.argv.slice(2);
const opt = (n) => {
  const i = argv.indexOf(n);
  return i === -1 ? null : argv[i + 1];
};
const root = resolve(opt('--root') ?? process.cwd());
const pluginRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const maxAreas = opt('--max-areas') ? Number(opt('--max-areas')) : D.MAX_AREAS;

// Read-only: reading and searching the code, and read-only git. No writes, no network.
const TOOLS = ['Read', 'Grep', 'Glob', 'Bash(git log:*)', 'Bash(git show:*)', 'Bash(ls:*)'];
const DISALLOWED = ['Write', 'Edit', 'MultiEdit', 'NotebookEdit', 'WebFetch', 'WebSearch'];

try {
  if (argv.includes('--plan')) {
    const plan = D.areas(root, { maxAreas });
    const who = D.reviewer(root, pluginRoot);
    if (argv.includes('--json')) console.log(JSON.stringify({ reviewer: who.agent, ...plan }, null, 2));
    else {
      console.log(`Reviewer: ${who.agent} (${who.file})`);
      console.log(`${plan.review.length} areas to review, about 2 calls each:`);
      for (const a of plan.review) console.log(`  ${a.sensitive ? '*' : ' '} ${a.name} (${a.files.length} file${a.files.length === 1 ? '' : 's'})`);
      if (plan.skipped.length) console.log(`Not reviewed (beyond ${maxAreas} areas): ${plan.skipped.map((s) => s.name).join(', ')}`);
      if (plan.review.some((a) => a.sensitive)) console.log('* = a sensitive path or entry point in the threat model');
      else console.log('No threat model to put the sensitive areas first. A project with something to attack gets one from `/keelwright:kickoff architecture` or `/keelwright:adopt document`; one without (a static site) has little for a deep review to find.');
    }
  } else {
    const maxCost = Number(opt('--max-cost'));
    const invoke = ({ prompt, system, schema, maxBudgetUsd }) => claudeInvoke({ cwd: root, prompt, system, schema, maxBudgetUsd, model: opt('--model'), tools: TOOLS, disallowedTools: DISALLOWED, maxTurns: 60, timeoutMs: 20 * 60_000 });
    const result = await D.run(root, { pluginRoot, maxCost, invoke, maxAreas, only: opt('--area'), log: (m) => console.error(m) });
    D.save(root, result);
    if (argv.includes('--json')) console.log(JSON.stringify(result, null, 2));
    else {
      const n = (st) => result.areas.filter((a) => a.status === st).length;
      console.log(`Deep review: ${n('reviewed')} areas reviewed, ${n('not-reviewed')} not reviewed, ${n('failed')} failed · $${result.cost} of $${maxCost}`);
      console.log(`${result.findings.length} findings held up; ${result.dropped.length} dropped (disproved, unverified or citing code that doesn't exist).`);
      console.log(`Recorded in ${D.DEEP_FILE} (not committed). Run the doctor to see them with the rest of the audit.`);
    }
    process.exitCode = result.findings.some((f) => ['critical', 'high'].includes(f.severity)) ? 1 : 0;
  }
} catch (e) {
  console.error(`error: ${e.message}`);
  process.exit(2);
}
