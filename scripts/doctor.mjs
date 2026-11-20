#!/usr/bin/env node
// The doctor (spec 7.0): the project's health, area by area. Mechanical checks only — no model
// calls, no network. Writes its record to .keelwright/doctor.md and .keelwright/doctor.json
// (with the history) and changes nothing else.
//
//   node doctor.mjs [--json] [--no-write] [--root <dir>]
//
// Exits 1 when an area fails.

import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { AREAS, diagnose, loadHistory, record, render } from './lib/doctor.mjs';

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const rootAt = args.indexOf('--root');
const root = resolve(rootAt >= 0 ? args[rootAt + 1] : process.cwd());
const pluginRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

const result = diagnose(root, { pluginRoot });
const history = flag('--no-write') ? [...loadHistory(root), result] : record(root, result);
if (flag('--json')) console.log(JSON.stringify({ ...result, history: history.length }, null, 2));
else {
  console.log(render(result, history).trimEnd());
  if (!flag('--no-write')) console.log('\nRecorded in .keelwright/doctor.md');
}
process.exit(AREAS.some((a) => result.areas[a.id] === 'fail') ? 1 : 0);
