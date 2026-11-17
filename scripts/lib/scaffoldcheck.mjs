// Mechanical checks on a scaffolded project (spec 5.5), for every toolchain (scripts/lib/toolchains.mjs):
// the task contract, exact versions and a lockfile, git hooks with secret scanning and Conventional
// Commits, CI with actions pinned by SHA, dependency updates, a unit test, the generated theme in
// sync with the tokens, and the first migration from the schema. Web projects also need a build and
// Playwright E2E tests; editor-based engines (Unity, Unreal, native IDE apps) need setup instructions.
// What the scaffold step must pass before it completes.

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { themeFor } from './tokens.mjs';
import { TOOLCHAIN, definedTasks, detectToolchain, requiredTasks, taskCommand } from './toolchains.mjs';

// Kept for callers that only know web projects.
export const REQUIRED_SCRIPTS = ['dev', 'build', 'lint', 'format:check', 'typecheck', 'test', 'test:e2e', 'check'];
const EXACT = /^(?:npm:(?:@[^@/]+\/)?[^@]+@)?\d+\.\d+\.\d+$/;
const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'build', 'target', '.venv', '.dart_tool', '.godot', '.astro', '.output', '.vercel', '.expo', '.keelwright', 'test-results', 'playwright-report', 'Library', 'Temp']);
const GENERATED = /^\/\* Generated from design\/tokens\.json by KeelWright/;

const read = (root, f) => (existsSync(join(root, f)) ? readFileSync(join(root, f), 'utf8') : null);
const anyOf = (root, files) => files.find((f) => existsSync(join(root, f))) ?? null;

function walk(root, dir = '', out = []) {
  const abs = join(root, dir);
  if (!existsSync(abs)) return out;
  for (const name of readdirSync(abs)) {
    if (SKIP_DIRS.has(name)) continue;
    const rel = dir ? `${dir}/${name}` : name;
    if (statSync(join(root, rel)).isDirectory()) walk(root, rel, out);
    else out.push(rel);
  }
  return out;
}

function readState(root) {
  try {
    return JSON.parse(read(root, '.keelwright/state.json') ?? '{}');
  } catch {
    return {};
  }
}

// Dependency strings of a pyproject.toml: [project] dependencies and [dependency-groups] lists.
export function pyprojectDependencies(text) {
  const deps = { runtime: [], dev: [] };
  let section = null;
  let collecting = null;
  for (const line of text.split('\n')) {
    const header = /^\s*\[([^\]]+)\]\s*$/.exec(line);
    if (header) {
      section = header[1].trim();
      collecting = null;
      continue;
    }
    const open = /^\s*([\w-]+)\s*=\s*\[(.*)$/.exec(line);
    if (open && ((section === 'project' && open[1] === 'dependencies') || section === 'dependency-groups')) {
      collecting = section === 'project' ? 'runtime' : 'dev';
      for (const m of open[2].matchAll(/"([^"]+)"|'([^']+)'/g)) deps[collecting].push(m[1] ?? m[2]);
      if (/\]\s*(#.*)?$/.test(open[2])) collecting = null;
      continue;
    }
    if (collecting) {
      for (const m of line.matchAll(/"([^"]+)"|'([^']+)'/g)) deps[collecting].push(m[1] ?? m[2]);
      if (/^\s*\]/.test(line) || /\]\s*,?\s*(#.*)?$/.test(line)) collecting = null;
    }
  }
  return deps;
}

export function checkScaffold(root, { versions = {}, toolchain = null, projectType = null } = {}) {
  const issues = [];
  const add = (area, issue) => issues.push({ area, issue });
  const state = readState(root);
  const tc = toolchain ?? detectToolchain(root);
  const type = projectType ?? state.projectType ?? null;
  if (!tc) {
    add('toolchain', 'no manifest found (package.json, pyproject.toml, pubspec.yaml, Cargo.toml or project.godot) and no stack.toolchain in the state');
    return issues;
  }
  const info = TOOLCHAIN[tc];
  const web = tc === 'node' && (type === 'web' || type === null);
  const library = type === 'library';
  const files = walk(root);

  // --- tasks and versions -----------------------------------------------------------
  if (tc === 'node') checkNode(root, { versions, web, library, add });
  else if (tc !== 'editor') {
    const defined = definedTasks(root, tc);
    for (const t of requiredTasks(tc, type)) if (!defined.includes(t)) add('tasks', `task "${t}" is missing (${taskCommand(tc, t)})`);
    if (existsSync(join(root, 'design/tokens.json')) && !defined.includes('tokens')) add('tasks', `task "tokens" is missing (regenerates the theme from design/tokens.json)`);
    if (!existsSync(join(root, info.manifest))) add('versions', `no ${info.manifest}`);
    if (info.lockfiles.length && !anyOf(root, info.lockfiles)) add('versions', `no lockfile (${info.lockfiles.join(' or ')})`);
    if (info.runtimePin.length && !anyOf(root, info.runtimePin)) add('versions', `no ${info.runtimePin.join(' or ')} pinning the runtime`);
    if (tc === 'python') checkPython(root, { versions, library, add });
  } else if (!existsSync(join(root, 'docs/setup.md'))) {
    add('setup', 'no docs/setup.md — editor-based projects get written setup instructions');
  }

  // --- repository hygiene -------------------------------------------------------------
  const gitignore = read(root, '.gitignore') ?? '';
  const ignored = (entry) => gitignore.split('\n').some((l) => {
    const t = l.trim().replace(/^\//, '').replace(/\/$/, '');
    return t === entry || t === `${entry}*` || t === `${entry}.*` || t === `${entry}/`;
  });
  for (const entry of [...info.ignore, '.env', '.keelwright/snapshots', '.claude/settings.local.json']) if (!ignored(entry)) add('hygiene', `.gitignore doesn't ignore ${entry}`);
  if (['web', 'mobile', 'ai'].includes(type ?? 'web') && !existsSync(join(root, '.env.example'))) add('hygiene', 'no .env.example');

  // --- git hooks -------------------------------------------------------------------------
  if (info.gitHooks === 'husky') checkHusky(root, add);
  else checkPreCommit(root, add);

  // --- CI ------------------------------------------------------------------------------------
  const wfDir = join(root, '.github/workflows');
  const workflows = existsSync(wfDir) ? readdirSync(wfDir).filter((f) => /\.ya?ml$/.test(f)) : [];
  if (!workflows.length) add('ci', 'no GitHub Actions workflow');
  const ci = workflows.map((f) => read(root, `.github/workflows/${f}`)).join('\n');
  for (const m of ci.matchAll(/uses:\s*([^\s#]+)/g)) {
    const ref = m[1];
    if (ref.startsWith('./') || ref.startsWith('docker://')) continue;
    if (!/@[0-9a-f]{40}$/.test(ref)) add('ci', `action ${ref} is not pinned to a commit SHA`);
  }
  if (workflows.length) {
    if (!/gitleaks/.test(ci)) add('ci', 'CI doesn\'t run gitleaks');
    const check = taskCommand(tc, 'check');
    if (tc === 'node') {
      if (!/run\s+check\b|npm run check/.test(ci)) add('ci', 'CI doesn\'t run the "check" script');
    } else if (check && !ci.includes(check) && !new RegExp(`\\b(poe|just)\\s+check\\b`).test(ci)) add('ci', `CI doesn't run the check task (${check})`);
    if (web && !/test:e2e/.test(ci)) add('ci', 'CI doesn\'t run the E2E tests');
    if (web && !/run\s+build|npm run build/.test(ci)) add('ci', 'CI doesn\'t build');
  }
  const dependabot = read(root, '.github/dependabot.yml');
  if (!dependabot && !anyOf(root, ['renovate.json', '.github/renovate.json'])) add('ci', 'no dependency updates (.github/dependabot.yml or renovate.json)');
  else if (dependabot) {
    const ecosystems = [...dependabot.matchAll(/package-ecosystem:\s*["']?([\w-]+)/g)].map((m) => m[1]);
    for (const e of [...info.dependabot, 'github-actions']) {
      if (ecosystems.includes(e)) continue;
      if (tc === 'node' && e === 'npm') add('ci', 'Dependabot doesn\'t update npm packages');
      else if (e === 'github-actions') add('ci', 'Dependabot doesn\'t update GitHub Actions');
      else add('ci', `Dependabot doesn't update ${e}`);
    }
  }

  // --- tests ---------------------------------------------------------------------------------
  if (web) {
    if (!anyOf(root, ['playwright.config.ts', 'playwright.config.js', 'playwright.config.mjs'])) add('tests', 'no playwright config');
    if (!files.some((f) => /\.(spec|test)\.[cm]?[jt]sx?$/.test(f) && /e2e/.test(f))) add('tests', 'no E2E test (e.g. tests/e2e/*.spec.ts)');
  }
  if (info.unitTest) {
    const unit = files.filter((f) => info.unitTest.test(f) && !/e2e/.test(f));
    const found = info.unitTestContent ? unit.some((f) => info.unitTestContent.test(read(root, f) ?? '')) : unit.length > 0;
    if (!found) add('tests', `no unit test (${{ node: '*.test.ts', python: 'tests/test_*.py', dart: 'test/*_test.dart', rust: '#[test] in src/ or tests/', godot: 'test/test_*.gd' }[tc]})`);
  }

  // --- generated theme -------------------------------------------------------------------------
  const tokens = read(root, 'design/tokens.json');
  if (tokens && tc !== 'editor' && tc !== 'godot' && tc !== 'python' && tc !== 'rust') {
    const generated = files.filter((f) => themeFor(f)).filter((f) => GENERATED.test(read(root, f)));
    if (!generated.length) add('theme', 'no theme file generated from design/tokens.json');
    for (const f of generated) if (read(root, f) !== themeFor(f)(tokens)) add('theme', `${f} is out of date with design/tokens.json`);
  }

  // --- database ----------------------------------------------------------------------------------
  const schema = read(root, 'docs/architecture/schema.sql');
  if (schema) {
    const migDir = join(root, 'supabase/migrations');
    const migrations = existsSync(migDir) ? readdirSync(migDir).filter((f) => f.endsWith('.sql')).sort() : [];
    if (!migrations.length) add('database', 'docs/architecture/schema.sql exists but supabase/migrations/ has no migration');
    else {
      const first = read(root, `supabase/migrations/${migrations[0]}`).toLowerCase();
      for (const m of schema.matchAll(/create table\s+(?:if not exists\s+)?([\w."]+)/gi)) {
        if (!first.includes(m[1].toLowerCase().replace(/"/g, ''))) add('database', `table ${m[1]} from schema.sql is not in the first migration`);
      }
    }
  }
  return issues;
}

function checkNode(root, { versions, web, library, add }) {
  const pkgText = read(root, 'package.json');
  if (!pkgText) {
    add('package', 'no package.json');
    return;
  }
  const pkg = JSON.parse(pkgText);
  const scripts = pkg.scripts ?? {};
  const required = web ? REQUIRED_SCRIPTS : requiredTasks('node', library ? 'library' : null);
  for (const s of required) if (!scripts[s]) add('scripts', `npm script "${s}" is missing`);
  if (existsSync(join(root, 'design/tokens.json')) && !scripts.tokens) add('scripts', 'npm script "tokens" is missing (regenerates the theme from design/tokens.json)');
  if (!/husky/.test(scripts.prepare ?? '')) add('scripts', 'npm script "prepare" should run husky');

  // A published library declares ranges for what its users install (the resolved version as the
  // lower bound); everything it only develops with is exact.
  const exactOnly = library ? { ...pkg.devDependencies } : { ...pkg.dependencies, ...pkg.devDependencies };
  for (const [name, range] of Object.entries(exactOnly)) {
    if (!EXACT.test(range)) add('versions', `${name} "${range}" is not an exact version`);
    else if (versions[name] && !range.endsWith(versions[name])) add('versions', `${name} ${range} differs from the resolved ${versions[name]}`);
  }
  if (library) {
    for (const [name, range] of Object.entries(pkg.dependencies ?? {})) {
      if (versions[name] && !String(range).includes(versions[name])) add('versions', `${name} "${range}" should have the resolved ${versions[name]} as its lower bound (e.g. ^${versions[name]})`);
    }
  }
  if (!pkg.engines?.node) add('versions', 'package.json has no engines.node');
  const node = versions.node ?? versions['Node.js'];
  const nvm = read(root, '.nvmrc') ?? read(root, '.node-version');
  if (!nvm) add('versions', 'no .nvmrc or .node-version');
  else if (node && nvm.trim().replace(/^v/, '') !== node && nvm.trim().replace(/^v/, '') !== node.split('.')[0]) add('versions', `.nvmrc says ${nvm.trim()}, the resolved Node.js is ${node}`);
  if (!anyOf(root, TOOLCHAIN.node.lockfiles)) add('versions', 'no lockfile');
  if (existsSync(join(root, 'package-lock.json')) && !/save-exact\s*=\s*true/.test(read(root, '.npmrc') ?? '')) add('versions', '.npmrc should set save-exact=true');
}

function checkPython(root, { versions, library, add }) {
  const deps = pyprojectDependencies(read(root, 'pyproject.toml') ?? '');
  const name = (d) => /^([A-Za-z0-9][\w.-]*)/.exec(d)?.[1]?.toLowerCase();
  const exactOnly = library ? deps.dev : [...deps.runtime, ...deps.dev];
  for (const d of exactOnly) {
    if (!/==\s*[\d.]+(\s*;.*)?$/.test(d)) add('versions', `"${d}" is not an exact version (==)`);
    else {
      const resolved = versions[name(d)];
      if (resolved && !d.includes(`==${resolved}`)) add('versions', `${d} differs from the resolved ${resolved}`);
    }
  }
  if (library) {
    for (const d of deps.runtime) {
      const resolved = versions[name(d)];
      if (resolved && !d.includes(resolved)) add('versions', `"${d}" should have the resolved ${resolved} as its lower bound (e.g. >=${resolved})`);
    }
  }
  const pin = read(root, '.python-version')?.trim();
  if (pin && versions.python && !versions.python.startsWith(pin)) add('versions', `.python-version says ${pin}, the resolved Python is ${versions.python}`);
}

function checkHusky(root, add) {
  const preCommit = read(root, '.husky/pre-commit');
  if (!preCommit) add('hooks', 'no .husky/pre-commit');
  else {
    if (!/gitleaks/.test(preCommit)) add('hooks', 'pre-commit doesn\'t run gitleaks');
    if (!/lint-staged/.test(preCommit)) add('hooks', 'pre-commit doesn\'t run lint-staged');
  }
  if (!/commitlint/.test(read(root, '.husky/commit-msg') ?? '')) add('hooks', 'no .husky/commit-msg running commitlint');
  if (!anyOf(root, ['commitlint.config.js', 'commitlint.config.mjs', 'commitlint.config.cjs', 'commitlint.config.ts', '.commitlintrc', '.commitlintrc.json', '.commitlintrc.yml'])) add('hooks', 'no commitlint config');
  const pkg = JSON.parse(read(root, 'package.json') ?? '{}');
  if (!pkg['lint-staged'] && !anyOf(root, ['.lintstagedrc', '.lintstagedrc.json', '.lintstagedrc.js', '.lintstagedrc.mjs', 'lint-staged.config.js', 'lint-staged.config.mjs'])) add('hooks', 'no lint-staged config');
}

// pre-commit framework (also run by prek): gitleaks, Conventional Commits on commit-msg, revs pinned.
function checkPreCommit(root, add) {
  const config = read(root, '.pre-commit-config.yaml');
  if (!config) {
    add('hooks', 'no .pre-commit-config.yaml');
    return;
  }
  if (!/gitleaks\/gitleaks/.test(config) || !/id:\s*gitleaks\b/.test(config)) add('hooks', 'pre-commit doesn\'t run gitleaks (repo gitleaks/gitleaks, id gitleaks)');
  if (!/id:\s*conventional-pre-commit/.test(config)) add('hooks', 'no Conventional Commits check on commit-msg (compilerla/conventional-pre-commit)');
  if (!/default_install_hook_types:[^\n]*commit-msg|default_install_hook_types:\s*\n(\s*-\s*[\w-]+\s*\n)*\s*-\s*commit-msg/.test(config)) add('hooks', 'default_install_hook_types should include commit-msg, so `pre-commit install` installs the commit message check');
  for (const m of config.matchAll(/^\s*-?\s*repo:\s*(\S+)\s*\n\s*rev:\s*['"]?([^\s'"#]+)/gm)) {
    if (['local', 'meta'].includes(m[1])) continue;
    if (!/^[0-9a-f]{40}$/.test(m[2])) add('hooks', `${m[1]} rev ${m[2]} is not pinned to a commit SHA (pre-commit autoupdate --freeze)`);
  }
}
