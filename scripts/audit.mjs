#!/usr/bin/env node
// `/adopt` audit mode (spec 7.4): the doctor's findings as fixes, approved one by one. This script
// runs the doctor, plans the fixes and records the decisions; the command drafts each diff and
// applies it only on approval.
//
//   node audit.mjs plan [--all] [--offline] [--json]       run the doctor (recorded) and list the fixes
//   node audit.mjs check <FIX-NN|key>… [--offline]         which of them the doctor still finds
//   node audit.mjs decide <FIX-NN|key>… <applied|declined|deferred> [--note "…"] [--unverified] [--offline]
//   node audit.mjs accept <FIX-NN|fingerprint> --reason "…" [--days N] [--by "…"]
//   node audit.mjs status
//
// `--root <dir>` on any of them. `applied` is checked first: the doctor must no longer find it
// (`--unverified` records it anyway, e.g. when the checking tool isn't installed). `declined` needs
// a reason. The last plan is kept in .keelwright/security/ (git-ignored), since it names security
// findings; FIX-NN refers to it.

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as A from './lib/audit.mjs';
import { diagnose, record as recordDoctor } from './lib/doctor.mjs';
import * as Sec from './lib/security.mjs';

const argv = process.argv.slice(2);
const opt = (name) => {
  const i = argv.indexOf(name);
  return i === -1 ? null : argv[i + 1];
};
const has = (name) => argv.includes(name);
const VALUE_FLAGS = new Set(['--root', '--note', '--reason', '--days', '--by']);
const positional = argv.filter((a, i) => !a.startsWith('--') && !VALUE_FLAGS.has(argv[i - 1]));
const [cmd, ...rest] = positional;
const root = resolve(opt('--root') ?? process.cwd());
const pluginRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const PLAN_FILE = `${Sec.RECORD_DIR}/audit-plan.json`;

async function doctor({ write, offline }) {
  const now = new Date().toISOString();
  const security = await Sec.audit(root, { now, offline });
  if (write) Sec.record(root, security);
  const result = diagnose(root, { pluginRoot, now, security });
  if (write) recordDoctor(root, result);
  return result;
}

function lastPlan() {
  try {
    return JSON.parse(readFileSync(join(root, PLAN_FILE), 'utf8'));
  } catch {
    return [];
  }
}

// FIX-NN (from the last plan) or a finding key → the plan items, or bare keys.
function resolveRefs(refs) {
  const items = lastPlan();
  return refs.map((r) => items.find((x) => x.id === r) ?? items.find((x) => x.keys.includes(r)) ?? (/^FIX-\d+$/.test(r) ? null : { keys: [r], issues: [], secure: /^(osv|secret|rls|rls-policy|threat-model|semgrep|hygiene):/.test(r) })).map((x, i) => {
    if (!x) throw new Error(`${refs[i]} is not in the last plan — run \`plan\` again`);
    return x;
  });
}

function line(x) {
  const n = x.issues.length > 1 ? ` (+${x.issues.length - 1} more)` : '';
  return `${x.id}  ${x.level.padEnd(4)}  ${x.kind.padEnd(7)}  ${x.issues[0]}${n}\n        → ${x.how}${x.previously ? `  [previously ${x.previously}]` : ''}`;
}

try {
  switch (cmd) {
    case 'plan': {
      const result = await doctor({ write: true, offline: has('--offline') });
      const items = A.plan(result, A.loadRecord(root), { all: has('--all') });
      mkdirSync(join(root, Sec.RECORD_DIR), { recursive: true });
      writeFileSync(join(root, Sec.RECORD_DIR, '.gitignore'), '*\n');
      writeFileSync(join(root, PLAN_FILE), `${JSON.stringify(items, null, 2)}\n`);
      if (has('--json')) console.log(JSON.stringify({ at: result.at, areas: result.areas, counts: result.counts, kinds: A.KINDS, fixes: items }, null, 2));
      else {
        console.log(`Doctor: ${result.counts.fail} to fix, ${result.counts.warn} to look at (.keelwright/doctor.md)`);
        console.log(items.length ? `\n${items.map(line).join('\n')}` : '\nNo fixes to offer.');
      }
      break;
    }
    case 'check': {
      const items = resolveRefs(rest);
      const keys = items.flatMap((x) => x.keys);
      const still = A.stillFound(await doctor({ write: false, offline: has('--offline') }), keys);
      const out = items.map((x) => ({ id: x.id ?? x.keys[0], found: x.keys.filter((k) => still.includes(k)) }));
      console.log(has('--json') ? JSON.stringify(out, null, 2) : out.map((o) => `${o.id}: ${o.found.length ? `still found (${o.found.length})` : 'fixed'}`).join('\n'));
      process.exitCode = out.some((o) => o.found.length) ? 1 : 0;
      break;
    }
    case 'decide': {
      const decision = rest.at(-1);
      const items = resolveRefs(rest.slice(0, -1));
      if (!items.length) throw new Error('name at least one fix');
      if (decision === 'applied' && !has('--unverified')) {
        const keys = items.flatMap((x) => x.keys);
        const online = keys.some((k) => k.startsWith('osv:')) && !has('--offline');
        const still = A.stillFound(await doctor({ write: false, offline: !online }), keys);
        if (still.length) throw new Error(`the doctor still finds ${still.length} of them (${still.slice(0, 3).join(', ')}) — finish the fix, or record it as deferred`);
      }
      for (const secure of [false, true]) {
        const group = items.filter((x) => Boolean(x.secure) === secure);
        if (!group.length) continue;
        const issues = Object.fromEntries(group.flatMap((x) => x.keys.map((k, i) => [k, x.issues[i] ?? x.issues[0]])));
        A.decide(root, group.flatMap((x) => x.keys), decision, { note: opt('--note') ?? '', issues, secure });
      }
      console.log(`${items.map((x) => x.id ?? x.keys[0]).join(', ')}: ${decision}`);
      break;
    }
    case 'accept': {
      const [x] = resolveRefs(rest);
      if (!x.secure) throw new Error('only security findings are accepted; record others as declined with a reason');
      const days = opt('--days') ? Number(opt('--days')) : undefined;
      for (const k of x.keys) {
        const r = A.accept(root, k, { reason: opt('--reason'), days, by: opt('--by') });
        console.log(`${r.fingerprint}: accepted until ${r.until} (${Sec.ACCEPTED_FILE})`);
      }
      break;
    }
    case 'status': {
      const rec = A.loadRecord(root);
      const all = [...Object.values(rec.decisions), ...Object.values(rec.secure)];
      const n = (d) => all.filter((x) => x.decision === d).length;
      console.log(`Decisions: ${n('applied')} applied, ${n('declined')} declined, ${n('deferred')} deferred, ${n('accepted')} accepted (${A.RECORD_MD})`);
      break;
    }
    default:
      console.log('usage: audit.mjs plan|check|decide|accept|status — see the header of scripts/audit.mjs');
      process.exitCode = cmd ? 1 : 0;
  }
} catch (e) {
  console.error(`error: ${e.message}`);
  process.exit(1);
}
