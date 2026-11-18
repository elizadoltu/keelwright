#!/usr/bin/env node
// Stack packs (spec 5.4).
//
//   node packs.mjs list                              available packs (user cache and shipped)
//   node packs.mjs plan <id>... [--refresh] [--root <dir>]
//                                                    reuse or research each pack, using the
//                                                    project's resolved versions (state.stack.versions)
//   node packs.mjs install <id>... [--root <dir>]    copy the chosen packs into <project>/.keelwright/stack-packs/
//   node packs.mjs validate <file>...                check pack structure, rules and sources
//   node packs.mjs save <file>...                    copy reviewed packs into the user cache
//
// --json prints machine-readable output.

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { availablePacks, choosePack, install, plan, saveToCache, userPackDir, validatePack } from './lib/packs.mjs';

const PLUGIN_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const json = argv.includes('--json');
const refresh = argv.includes('--refresh');
const rootIdx = argv.indexOf('--root');
const root = resolve(rootIdx >= 0 ? argv[rootIdx + 1] : process.cwd());
const [command, ...args] = argv.filter((a, i) => !a.startsWith('--') && (rootIdx < 0 || i !== rootIdx + 1));
const out = (human, data) => console.log(json ? JSON.stringify(data, null, 2) : human);
const fail = (msg) => {
  console.error(`error: ${msg}`);
  process.exit(1);
};

function stackVersions() {
  const p = join(root, '.keelwright', 'state.json');
  return existsSync(p) ? (JSON.parse(readFileSync(p, 'utf8')).stack?.versions ?? {}) : {};
}

switch (command) {
  case 'list': {
    const packs = availablePacks(PLUGIN_ROOT);
    const rows = Object.values(packs).flatMap((list) => list.map((p) => ({ id: p.meta.id, major: p.meta.major, researchedAt: p.meta.researchedAt, status: p.meta.status, location: p.location })));
    out(rows.length ? rows.map((r) => `${r.id.padEnd(18)} major ${String(r.major).padEnd(4)} ${r.researchedAt}  ${r.status.padEnd(9)} ${r.location}`).join('\n') : `No packs (user cache: ${userPackDir()})`, rows);
    break;
  }
  case 'plan': {
    if (!args.length) fail('usage: plan <id>... [--refresh]');
    const p = plan(args, stackVersions(), { pluginRoot: PLUGIN_ROOT, refresh });
    out(p.map((x) => `${x.id.padEnd(18)} ${x.action.padEnd(9)} ${x.reason}`).join('\n'), p);
    break;
  }
  case 'install': {
    if (!args.length) fail('usage: install <id>...');
    const packs = availablePacks(PLUGIN_ROOT);
    const versions = stackVersions();
    const done = args.map((id) => {
      const best = choosePack(packs[id], versions);
      if (!best) fail(`no pack "${id}" — research it first`);
      return install(best, root);
    });
    out(done.map((d) => `Installed ${d}`).join('\n'), done);
    break;
  }
  case 'validate': {
    if (!args.length) fail('usage: validate <file>...');
    const results = args.map((f) => ({ file: f, issues: validatePack(readFileSync(f, 'utf8')) }));
    out(results.map((r) => `${r.issues.length ? 'FAIL' : 'ok  '} ${r.file}${r.issues.map((i) => `\n     - ${i}`).join('')}`).join('\n'), results);
    if (results.some((r) => r.issues.length)) process.exit(1);
    break;
  }
  case 'save': {
    if (!args.length) fail('usage: save <file>...');
    try {
      const saved = args.map((f) => saveToCache(f));
      out(saved.map((s) => `Saved ${s}`).join('\n'), saved);
    } catch (err) {
      fail(err.message);
    }
    break;
  }
  default:
    console.log(readFileSync(fileURLToPath(import.meta.url), 'utf8').split('\n').slice(1, 15).map((l) => l.replace(/^\/\/ ?/, '')).join('\n'));
    process.exit(command ? 1 : 0);
}
