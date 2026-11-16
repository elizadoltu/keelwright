#!/usr/bin/env node
// Before scaffolding: can this machine build the project? Run in the project root.
//
//   node preflight.mjs [--root <dir>] [--json]
//
// Checks the local Node.js against every resolved npm package's engines.node (required) and the
// resolved Node.js LTS (recommended), and that git, gitleaks and — when the project has a database
// schema — the Supabase CLI and Docker are installed. Exits 1 when something required is missing.

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { httpFetchJson, parseVersion, satisfies } from './lib/versions.mjs';

const argv = process.argv.slice(2);
const rootIdx = argv.indexOf('--root');
const root = resolve(rootIdx >= 0 ? argv[rootIdx + 1] : process.cwd());
const state = JSON.parse(readFileSync(join(root, '.keelwright/state.json'), 'utf8'));
const versions = state.stack?.versions ?? {};

const tool = (cmd, args = ['--version']) => {
  try {
    return execFileSync(cmd, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim().split('\n')[0];
  } catch {
    return null;
  }
};

const results = [];
const add = (level, what, detail) => results.push({ level, what, detail });

// Node.js: required by the packages, recommended by the stack.
const local = process.version.replace(/^v/, '');
const engines = [];
for (const [name, version] of Object.entries(versions)) {
  if (name === 'node' || !/^(@[a-z0-9][\w.-]*\/)?[a-z0-9][\w.-]*$/i.test(name) || !parseVersion(String(version))) continue;
  try {
    const encoded = name.startsWith('@') ? `@${encodeURIComponent(name.slice(1))}` : encodeURIComponent(name);
    const meta = await httpFetchJson(`https://registry.npmjs.org/${encoded}/${version}`);
    if (meta.engines?.node) engines.push({ name, range: meta.engines.node });
  } catch {
    // Not on npm (e.g. a binary such as gitleaks): no engines to check.
  }
}
const unmet = engines.filter((e) => satisfies(local, e.range) === false);
if (unmet.length) add('required', 'Node.js', `local ${local} doesn't satisfy ${unmet.map((e) => `${e.name} (${e.range})`).join(', ')}`);
else add('ok', 'Node.js', `local ${local} satisfies every package's engines (${engines.length} checked)`);
const lts = versions.node;
if (lts && parseVersion(lts)?.major !== parseVersion(local)?.major) add('recommended', 'Node.js LTS', `the project pins Node.js ${lts.split('.')[0]} (current LTS); you have ${local}. Install it with your version manager, e.g. \`nvm install ${lts.split('.')[0]} && nvm use ${lts.split('.')[0]}\``);

// Tools.
const git = tool('git');
add(git ? 'ok' : 'required', 'git', git ?? 'not installed');
const gitleaks = tool('gitleaks', ['version']);
add(gitleaks ? 'ok' : 'recommended', 'gitleaks', gitleaks ?? 'not installed — the pre-commit hook needs it (https://github.com/gitleaks/gitleaks#installing)');
if (existsSync(join(root, 'docs/architecture/schema.sql'))) {
  const supabase = tool('supabase');
  add(supabase ? 'ok' : 'required', 'Supabase CLI', supabase ?? 'not installed — needed for the local database and migrations');
  const docker = tool('docker');
  add(docker ? 'ok' : 'recommended', 'Docker', docker ?? 'not installed — the Supabase CLI runs the local database in Docker');
}

if (argv.includes('--json')) console.log(JSON.stringify(results, null, 2));
else for (const r of results) console.log(`${{ ok: 'ok  ', required: 'FAIL', recommended: 'WARN' }[r.level]} ${r.what}: ${r.detail}`);
process.exit(results.some((r) => r.level === 'required') ? 1 : 0);
