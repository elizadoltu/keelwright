#!/usr/bin/env node
// The doctor (spec 7.0): the project's health, area by area. Mechanical checks only — no model
// calls. Writes its record to .keelwright/doctor.md and .keelwright/doctor.json (with the history)
// and the security audit's to .keelwright/security/ (git-ignored, spec 7.7); changes nothing else.
// The network is used only to look up the locked dependencies on OSV.dev (and by Semgrep, when
// installed); --offline skips both.
//
//   node doctor.mjs [security] [--json] [--no-write] [--offline] [--root <dir>]
//
// `security` runs only the application-security area and records only the security audit.
// Exits 1 when an area fails.

import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { AREAS, diagnose, loadHistory, record, render } from './lib/doctor.mjs';
import * as Sec from './lib/security.mjs';

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const rootAt = args.indexOf('--root');
const root = resolve(rootAt >= 0 ? args[rootAt + 1] : process.cwd());
const pluginRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const only = args.includes('security') ? 'security' : null;
const write = !flag('--no-write');

const now = new Date().toISOString();
const security = await Sec.audit(root, { now, offline: flag('--offline') });
const secHistory = write ? Sec.record(root, security) : [...Sec.loadHistory(root), security];
const result = diagnose(root, { pluginRoot, now, security, only });

if (only) {
  if (flag('--json')) console.log(JSON.stringify({ ...result, securityAudit: security, history: secHistory.length }, null, 2));
  else {
    console.log(Sec.render(security, secHistory).trimEnd());
    if (write) console.log('\nRecorded in .keelwright/security/audit.md (not committed)');
  }
} else {
  const history = write ? record(root, result) : [...loadHistory(root), result];
  if (flag('--json')) console.log(JSON.stringify({ ...result, securityAudit: security, history: history.length }, null, 2));
  else {
    console.log(render(result, history).trimEnd());
    if (write) console.log('\nRecorded in .keelwright/doctor.md; security findings in .keelwright/security/audit.md (not committed)');
  }
}
process.exit(AREAS.some((a) => result.areas[a.id] === 'fail') ? 1 : 0);
