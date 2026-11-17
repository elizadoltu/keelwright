#!/usr/bin/env node
// Before scaffolding: can this machine build the project? Run in the project root.
//
//   node preflight.mjs [--root <dir>] [--json]
//
// Checks what the project's toolchain needs (scripts/lib/toolchains.mjs): for Node.js projects the
// local Node.js against every resolved npm package's engines.node (required) and the resolved LTS
// (recommended); for the others their tools (uv, flutter, cargo, godot, just). Always git and
// gitleaks; with a Supabase database, the Supabase CLI and Docker. Exits 1 when something required
// is missing.

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { TOOLCHAIN, detectToolchain } from './lib/toolchains.mjs';
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

const toolchain = detectToolchain(root) ?? 'node';
add('ok', 'Toolchain', toolchain);

// Node.js: required by the packages, recommended by the stack. (Node.js also runs KeelWright's own
// scripts, so it is always present; its version matters only for Node.js projects.)
const local = process.version.replace(/^v/, '');
if (toolchain === 'node') {
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
}

// The toolchain's own tools.
for (const t of TOOLCHAIN[toolchain].tools) {
  const found = tool(t.cmd, t.cmd === 'godot' ? ['--version', '--headless'] : ['--version']);
  add(found ? 'ok' : 'required', t.cmd, found ?? `not installed — ${t.why}`);
}
if (toolchain === 'python' && versions.python) add('ok', 'Python', `uv installs Python ${versions.python} for the project (no system Python needed)`);
if (toolchain === 'dart' && versions.flutter) {
  const flutter = tool('flutter');
  const have = /Flutter (\d+\.\d+\.\d+)/.exec(flutter ?? '')?.[1];
  if (have && have !== versions.flutter) add('recommended', 'Flutter', `the project was resolved with Flutter ${versions.flutter}; you have ${have} (\`flutter upgrade\`)`);
}
if (toolchain === 'editor') add('recommended', 'Engine / IDE', 'install the engine version the PRD names (e.g. through Unity Hub or the Epic Games Launcher) — the setup instructions in docs/setup.md say how');

// Tools.
const git = tool('git');
add(git ? 'ok' : 'required', 'git', git ?? 'not installed');
const gitleaks = tool('gitleaks', ['version']);
add(gitleaks ? 'ok' : 'recommended', 'gitleaks', gitleaks ?? 'not installed — the pre-commit hook needs it (https://github.com/gitleaks/gitleaks#installing)');
// The Supabase CLI only when the stack's database is Supabase (another PostgreSQL uses its own migration tool).
if (existsSync(join(root, 'docs/architecture/schema.sql')) && /supabase/i.test(JSON.stringify(state.stack ?? {}))) {
  const supabase = tool('supabase');
  add(supabase ? 'ok' : 'required', 'Supabase CLI', supabase ?? 'not installed — needed for the local database and migrations');
  const docker = tool('docker');
  add(docker ? 'ok' : 'recommended', 'Docker', docker ?? 'not installed — the Supabase CLI runs the local database in Docker');
}

if (argv.includes('--json')) console.log(JSON.stringify(results, null, 2));
else for (const r of results) console.log(`${{ ok: 'ok  ', required: 'FAIL', recommended: 'WARN' }[r.level]} ${r.what}: ${r.detail}`);
process.exit(results.some((r) => r.level === 'required') ? 1 : 0);
