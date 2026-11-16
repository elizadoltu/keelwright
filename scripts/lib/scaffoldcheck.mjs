// Mechanical checks on a scaffolded web project (spec 5.5): exact versions, standard scripts,
// git hooks with secret scanning, CI with actions pinned by SHA, dependency updates, generated
// theme in sync with the tokens, first migration from the schema. What the scaffold step must
// pass before it completes.

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { tokensToCss } from './tokens.mjs';

export const REQUIRED_SCRIPTS = ['dev', 'build', 'lint', 'format:check', 'typecheck', 'test', 'test:e2e', 'check'];
const EXACT = /^(?:npm:(?:@[^@/]+\/)?[^@]+@)?\d+\.\d+\.\d+$/;
const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', '.astro', '.output', '.vercel', '.keelwright', 'test-results', 'playwright-report']);

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

export function checkScaffold(root, { versions = {} } = {}) {
  const issues = [];
  const add = (area, issue) => issues.push({ area, issue });

  // --- package.json -----------------------------------------------------------
  const pkgText = read(root, 'package.json');
  if (!pkgText) {
    add('package', 'no package.json');
    return issues;
  }
  const pkg = JSON.parse(pkgText);
  const scripts = pkg.scripts ?? {};
  for (const s of REQUIRED_SCRIPTS) if (!scripts[s]) add('scripts', `npm script "${s}" is missing`);
  if (existsSync(join(root, 'design/tokens.json')) && !scripts.tokens) add('scripts', 'npm script "tokens" is missing (regenerates the theme from design/tokens.json)');
  if (!/husky/.test(scripts.prepare ?? '')) add('scripts', 'npm script "prepare" should run husky');

  const deps = { ...pkg.dependencies, ...pkg.devDependencies };
  for (const [name, range] of Object.entries(deps)) {
    if (!EXACT.test(range)) add('versions', `${name} "${range}" is not an exact version`);
    else if (versions[name] && !range.endsWith(versions[name])) add('versions', `${name} ${range} differs from the resolved ${versions[name]}`);
  }
  if (!pkg.engines?.node) add('versions', 'package.json has no engines.node');
  const node = versions.node ?? versions['Node.js'];
  const nvm = read(root, '.nvmrc') ?? read(root, '.node-version');
  if (!nvm) add('versions', 'no .nvmrc or .node-version');
  else if (node && nvm.trim().replace(/^v/, '') !== node && nvm.trim().replace(/^v/, '') !== node.split('.')[0]) add('versions', `.nvmrc says ${nvm.trim()}, the resolved Node.js is ${node}`);
  if (!anyOf(root, ['package-lock.json', 'pnpm-lock.yaml', 'yarn.lock', 'bun.lock', 'bun.lockb'])) add('versions', 'no lockfile');
  if (existsSync(join(root, 'package-lock.json')) && !/save-exact\s*=\s*true/.test(read(root, '.npmrc') ?? '')) add('versions', '.npmrc should set save-exact=true');

  // --- repository hygiene -------------------------------------------------------
  const gitignore = read(root, '.gitignore') ?? '';
  for (const entry of ['node_modules', '.env', '.keelwright/snapshots']) {
    if (!gitignore.split('\n').some((l) => l.trim().replace(/^\//, '').replace(/\/$/, '') === entry || l.trim() === `${entry}*` || l.trim() === `${entry}.*`)) add('hygiene', `.gitignore doesn't ignore ${entry}`);
  }
  if (!existsSync(join(root, '.env.example'))) add('hygiene', 'no .env.example');

  // --- git hooks ---------------------------------------------------------------------
  const preCommit = read(root, '.husky/pre-commit');
  if (!preCommit) add('hooks', 'no .husky/pre-commit');
  else {
    if (!/gitleaks/.test(preCommit)) add('hooks', 'pre-commit doesn\'t run gitleaks');
    if (!/lint-staged/.test(preCommit)) add('hooks', 'pre-commit doesn\'t run lint-staged');
  }
  if (!/commitlint/.test(read(root, '.husky/commit-msg') ?? '')) add('hooks', 'no .husky/commit-msg running commitlint');
  if (!anyOf(root, ['commitlint.config.js', 'commitlint.config.mjs', 'commitlint.config.cjs', 'commitlint.config.ts', '.commitlintrc', '.commitlintrc.json', '.commitlintrc.yml'])) add('hooks', 'no commitlint config');
  if (!pkg['lint-staged'] && !anyOf(root, ['.lintstagedrc', '.lintstagedrc.json', '.lintstagedrc.js', '.lintstagedrc.mjs', 'lint-staged.config.js', 'lint-staged.config.mjs'])) add('hooks', 'no lint-staged config');

  // --- CI ----------------------------------------------------------------------------
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
    if (!/run\s+check\b|run check|npm run check/.test(ci)) add('ci', 'CI doesn\'t run the "check" script');
    if (!/test:e2e/.test(ci)) add('ci', 'CI doesn\'t run the E2E tests');
    if (!/run\s+build|npm run build/.test(ci)) add('ci', 'CI doesn\'t build');
  }
  const dependabot = read(root, '.github/dependabot.yml');
  if (!dependabot && !anyOf(root, ['renovate.json', '.github/renovate.json'])) add('ci', 'no dependency updates (.github/dependabot.yml or renovate.json)');
  else if (dependabot) {
    if (!/package-ecosystem:\s*["']?npm/.test(dependabot)) add('ci', 'Dependabot doesn\'t update npm packages');
    if (!/package-ecosystem:\s*["']?github-actions/.test(dependabot)) add('ci', 'Dependabot doesn\'t update GitHub Actions');
  }

  // --- tests -------------------------------------------------------------------------
  const files = walk(root);
  if (!anyOf(root, ['playwright.config.ts', 'playwright.config.js', 'playwright.config.mjs'])) add('tests', 'no playwright config');
  if (!files.some((f) => /\.(spec|test)\.[cm]?[jt]sx?$/.test(f) && /e2e/.test(f))) add('tests', 'no E2E test (e.g. tests/e2e/*.spec.ts)');
  if (!files.some((f) => /\.test\.[cm]?[jt]sx?$/.test(f) && !/e2e/.test(f))) add('tests', 'no unit test (*.test.ts)');

  // --- generated theme -------------------------------------------------------------------
  const tokens = read(root, 'design/tokens.json');
  if (tokens) {
    const expected = tokensToCss(tokens);
    const generated = files.filter((f) => f.endsWith('.css')).find((f) => read(root, f).startsWith('/* Generated from design/tokens.json'));
    if (!generated) add('theme', 'no CSS file generated from design/tokens.json');
    else if (read(root, generated) !== expected) add('theme', `${generated} is out of date with design/tokens.json`);
  }

  // --- database ----------------------------------------------------------------------------
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
