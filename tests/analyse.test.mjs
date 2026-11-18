import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { after, describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { analyse, hookConfig, preflight, summary } from '../scripts/lib/analyse.mjs';

const PLUGIN = join(dirname(fileURLToPath(import.meta.url)), '..');
const roots = [];
after(() => roots.forEach((r) => rmSync(r, { recursive: true, force: true })));

function repo(files, { git = false } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'keelwright-analyse-'));
  roots.push(root);
  for (const [f, content] of Object.entries(files)) {
    mkdirSync(join(root, f, '..'), { recursive: true });
    writeFileSync(join(root, f), typeof content === 'string' ? content : JSON.stringify(content, null, 2));
  }
  if (git) {
    execFileSync('git', ['init', '-q'], { cwd: root });
    execFileSync('git', ['add', '-A'], { cwd: root });
  }
  return root;
}

const PNPM_LOCK = `lockfileVersion: '9.0'

importers:

  .:
    dependencies:
      express:
        specifier: ^4.21.0
        version: 4.21.2
    devDependencies:
      typescript:
        specifier: ~5.6.0
        version: 5.6.3
      vitest:
        specifier: ^2.1.0
        version: 2.1.9(@types/node@22.10.0)
`;

const expressApi = {
  'package.json': {
    name: 'orders-api',
    packageManager: 'pnpm@9.15.0',
    engines: { node: '>=20' },
    scripts: { dev: 'tsx watch src/index.ts', build: 'tsc -p .', 'type-check': 'tsc --noEmit', test: 'vitest run', verify: 'pnpm type-check && pnpm test' },
    dependencies: { express: '^4.21.0' },
    devDependencies: { typescript: '~5.6.0', vitest: '^2.1.0' },
  },
  'pnpm-lock.yaml': PNPM_LOCK,
  'tsconfig.json': '{ "compilerOptions": { "strict": true } }',
  'src/index.ts': 'x',
  'src/routes/orders.ts': 'x',
  'src/routes/orders.test.ts': 'x',
  '.github/workflows/ci.yml': 'jobs:\n  ci:\n    steps:\n      - run: pnpm install\n      - run: pnpm verify\n',
  'docs/adr/0001-use-express.md': '# Use Express',
  'AGENTS.md': '# Agents',
  'README.md': '# Orders API',
};

describe('analyse: a pnpm Express API', () => {
  const a = analyse(repo(expressApi), { pluginRoot: PLUGIN });

  test('toolchain, package manager, runtime and locked versions', () => {
    assert.equal(a.mode, 'create');
    assert.equal(a.toolchain, 'node');
    assert.equal(a.packageManager, 'pnpm');
    assert.deepEqual(a.lockfiles, ['pnpm-lock.yaml']);
    assert.deepEqual(a.runtime, { 'package.json engines.node': '>=20' });
    const v = Object.fromEntries(a.dependencies.map((d) => [d.name, d.locked]));
    assert.deepEqual(v, { express: '4.21.2', typescript: '5.6.3', vitest: '2.1.9' });
  });

  test('frameworks and stack packs', () => {
    assert.deepEqual(a.frameworks.map((f) => `${f.name} ${f.version}`), ['Express 4.21.2', 'TypeScript 5.6.3', 'Vitest 2.1.9']);
    for (const id of ['express', 'typescript', 'vitest']) assert.ok(a.packs.includes(id), id);
  });

  test('tasks are mapped to the contract with the project runner', () => {
    assert.equal(a.tasks.contract.typecheck, 'pnpm type-check');
    assert.equal(a.tasks.contract.test, 'pnpm test');
    assert.equal(a.tasks.contract.check, 'pnpm verify');
    assert.equal(a.tasks.contract.dev, 'pnpm dev');
    assert.deepEqual(a.tasks.missing, ['lint', 'format:check']);
  });

  test('CI task calls are expanded: pnpm verify runs the type check and the tests', () => {
    assert.deepEqual(a.tooling.ci.map((c) => c.name), ['GitHub Actions']);
    assert.ok(a.tooling.ciRuns.includes('test'));
    assert.ok(a.tooling.ciRuns.includes('typecheck'));
  });

  test('docs and other tools’ instructions', () => {
    assert.equal(a.docs.readme, 'README.md');
    assert.deepEqual(a.docs.adrDirs, [{ dir: 'docs/adr/', count: 1 }]);
    assert.deepEqual(a.docs.instructions, ['AGENTS.md']);
    assert.equal(a.tests.count, 1);
  });

  test('gaps', () => {
    assert.deepEqual(a.gaps.map((g) => g.id), ['secrets', 'hooks', 'dependency-updates', 'lint']);
  });

  test('the summary is readable', () => {
    const s = summary(a);
    assert.match(s, /Toolchain: node \(pnpm\)/);
    assert.match(s, /typecheck → pnpm type-check/);
    assert.match(s, /\[secrets\] no secret scanning/);
  });
});

describe('analyse: a Poetry project with a Makefile', () => {
  const a = analyse(
    repo({
      'pyproject.toml': '[tool.poetry]\nname = "etl"\n\n[tool.poetry.dependencies]\npython = "^3.12"\nfastapi = "^0.115"\n\n[tool.poetry.group.dev.dependencies]\npytest = "^8.3"\n\n[tool.ruff]\nline-length = 100\n\n[tool.mypy]\nstrict = true\n',
      'poetry.lock': '\n[[package]]\nname = "fastapi"\nversion = "0.115.6"\n\n[[package]]\nname = "pytest"\nversion = "8.3.4"\n',
      Makefile: '.PHONY: lint test\nlint:\n\tpoetry run ruff check .\ntest:\n\tpoetry run pytest\nVAR := 1\n',
      '.pre-commit-config.yaml': 'repos:\n  - repo: https://github.com/gitleaks/gitleaks\n',
      '.python-version': '3.12.8\n',
      'app/main.py': 'x',
      'tests/test_main.py': 'x',
      '.gitlab-ci.yml': 'test:\n  script: make lint test\n',
    }),
    { pluginRoot: PLUGIN },
  );

  test('python with poetry, locked versions, make tasks', () => {
    assert.equal(a.toolchain, 'python');
    assert.equal(a.packageManager, 'poetry');
    assert.deepEqual(Object.fromEntries(a.dependencies.map((d) => [d.name, [d.locked, d.dev]])), { fastapi: ['0.115.6', false], pytest: ['8.3.4', true] });
    assert.equal(a.tasks.contract.lint, 'make lint');
    assert.equal(a.tasks.contract.test, 'make test');
    assert.ok(!a.tasks.defined.some((t) => t.name === 'VAR' || t.name === 'PHONY'));
    assert.deepEqual(a.runtime, { '.python-version': '3.12.8' });
  });

  test('tooling: Ruff, mypy, pytest, pre-commit with gitleaks, GitLab CI', () => {
    assert.deepEqual(a.tooling.lint.map((x) => x.name), ['Ruff']);
    assert.deepEqual(a.tooling.types.map((x) => x.name), ['mypy']);
    assert.deepEqual(a.tooling.test.map((x) => x.name), ['pytest']);
    assert.deepEqual(a.tooling.hooks.map((x) => x.name), ['pre-commit']);
    assert.deepEqual(a.tooling.secrets.map((x) => x.name), ['gitleaks']);
    assert.deepEqual(a.tooling.ci.map((x) => x.name), ['GitLab CI']);
    assert.deepEqual(a.gaps.map((g) => g.id), ['dependency-updates', 'check-task']);
  });
});

describe('analyse: tox environments', () => {
  test('tox envs are tasks; CI that runs tox runs the tests; .env in test fixtures is not a gap', () => {
    const a = analyse(
      repo({
        'pyproject.toml': '[project]\nname = "x"\ndependencies = ["click>=8"]\n\n[tool.tox]\nenv_list = ["py3.13", "style", "typing"]\n\n[tool.tox.env.style]\ncommands = [["pre-commit", "run", "--all-files"]]\n\n[tool.tox.env.typing]\ncommands = [["mypy"]]\n',
        'tox.ini': '[testenv:tests]\ncommands = pytest\n',
        'uv.lock': '\n[[package]]\nname = "click"\nversion = "8.1.8"\n',
        '.github/workflows/tests.yaml': 'steps:\n  - run: uv run tox run\n',
        'tests/test_apps/.env': 'FOO=bar',
      }),
    );
    assert.equal(a.tasks.contract.test, 'tox run -e tests');
    assert.equal(a.tasks.contract.lint, 'tox run -e style');
    assert.equal(a.tasks.contract.typecheck, 'tox run -e typing');
    assert.ok(a.tooling.ciRuns.includes('test'));
    assert.ok(!a.gaps.some((g) => g.id === 'env-committed'));
  });
});

describe('analyse: special cases', () => {
  test('a Claude setup means audit mode; templates and fixtures don’t count', () => {
    assert.equal(analyse(repo({ 'package.json': {}, 'templates/CLAUDE.md': 'x' })).mode, 'create');
    assert.equal(analyse(repo({ 'package.json': {}, '.claude/settings.json': '{}' })).mode, 'audit');
    assert.equal(analyse(repo({ 'package.json': {}, 'services/api/CLAUDE.md': 'x' })).mode, 'audit');
  });

  test('--preflight: what stops /adopt before it creates any state', () => {
    const cli = (files) => JSON.parse(execFileSync('node', [join(PLUGIN, 'scripts/analyse.mjs'), '--root', repo(files), '--preflight'], { encoding: 'utf8' }));
    const ids = (files) => cli(files).blockers.map((b) => b.id);
    assert.deepEqual(cli({ 'package.json': {}, 'src/a.js': 'x' }), { mode: 'create', toolchain: 'node', packageManager: 'npm', workspaces: null, blockers: [] });
    assert.deepEqual(cli({ 'package.json': {}, 'CLAUDE.md': 'x' }).blockers[0], { id: 'audit', detail: ['CLAUDE.md'] });
    assert.deepEqual(ids({ 'package.json': { workspaces: ['packages/*'] }, 'packages/a/package.json': {}, 'services/api/pyproject.toml': '' }), ['monorepo']);
    assert.deepEqual(cli({ 'package.json': { workspaces: ['web', 'api'] }, 'package-lock.json': '{}', 'web/package.json': {}, 'api/package.json': {} }).workspaces, ['api', 'web']);
    assert.deepEqual(cli({ 'go.mod': 'module x', 'main.go': 'x' }).blockers, [{ id: 'toolchain', detail: ['go'] }]);
    assert.deepEqual(ids({ 'notes.txt': 'x' }), ['no-project']);
  });

  test('monorepos are detected', () => {
    const a = analyse(repo({ 'package.json': { workspaces: ['packages/*'] }, 'packages/web/package.json': {}, 'packages/api/package.json': {} }));
    assert.equal(a.monorepo.detected, true);
    assert.deepEqual(a.monorepo.markers, ['package.json workspaces']);
    assert.deepEqual(a.monorepo.packages, ['packages/api', 'packages/web']);
    const b = analyse(repo({ 'web/package.json': {}, 'api/pyproject.toml': '' }));
    assert.deepEqual(b.monorepo.markers, ['2 nested manifests']);
  });

  test('unsupported languages are named, and rust uses cargo for its tasks', () => {
    const go = analyse(repo({ 'go.mod': 'module x', 'main.go': 'x' }));
    assert.equal(go.toolchain, null);
    assert.deepEqual(go.otherLanguages, ['go']);
    const rust = analyse(repo({ 'Cargo.toml': '[package]\nname = "x"\n\n[dependencies]\nclap = { version = "4.5", features = ["derive"] }\n', 'Cargo.lock': '\n[[package]]\nname = "clap"\nversion = "4.5.23"\n' }));
    assert.deepEqual(rust.dependencies, [{ name: 'clap', spec: '4.5', locked: '4.5.23', dev: false }]);
    assert.equal(rust.tasks.contract.test, 'cargo test');
  });

  test('git: ignored files are left out, committed .env files are a gap', () => {
    const a = analyse(repo({ 'package.json': {}, '.gitignore': 'secret-notes.txt\n', 'secret-notes.txt': 'x', '.env': 'KEY=1', 'src/a.js': 'x' }, { git: true }));
    assert.equal(a.git, true);
    assert.ok(!a.structure.topLevel.includes('secret-notes.txt'));
    assert.ok(a.gaps.some((g) => g.id === 'env-committed' && g.issue.includes('.env')));
  });
});

describe('analyse: hook config from the project’s own tools', () => {
  test('pnpm with ESLint and Prettier: both on edit, the check task on stop', () => {
    const root = repo({ ...expressApi, 'eslint.config.js': 'x', '.prettierrc': '{}' });
    const c = hookConfig(analyse(root), root);
    assert.deepEqual(c.onEdit.map((e) => e.run[0]), ['node_modules/.bin/prettier', 'node_modules/.bin/eslint']);
    assert.deepEqual(c.check, { run: ['pnpm', 'verify'], requires: 'node_modules', label: 'pnpm verify' });
  });

  test('poetry with Ruff: ruff through poetry; no check task means no stop check', () => {
    const root = repo({ 'pyproject.toml': '[tool.poetry]\nname = "x"\n\n[tool.ruff]\nline-length = 100\n', 'app/main.py': 'x' });
    const c = hookConfig(analyse(root), root);
    assert.deepEqual(c.onEdit.map((e) => e.run.join(' ')), ['poetry run ruff format {file}', 'poetry run ruff check --fix {file}']);
    assert.equal(c.check, null);
  });

  test('a project without a formatter or linter gets no edit hooks', () => {
    const root = repo({ 'package.json': { scripts: { test: 'node --test' } } });
    assert.deepEqual(hookConfig(analyse(root), root).onEdit, []);
  });
});

describe('analyse: a workspace repo adopted as one project', () => {
  const LOCK = {
    lockfileVersion: 3,
    packages: {
      '': { workspaces: ['frontend', 'backend'] },
      'node_modules/react': { version: '19.2.1' },
      'node_modules/typescript': { version: '5.9.3' },
      'node_modules/eslint': { version: '9.39.1' },
      'node_modules/express': { version: '5.2.1' },
      'backend/node_modules/typescript': { version: '5.8.2' },
    },
  };
  const files = {
    'package.json': { name: 'app', workspaces: ['frontend', 'backend'], scripts: { test: 'echo "Error: no test specified" && exit 1', lint: 'npm run lint --workspace frontend', 'lint:backend': 'npm run lint --workspace backend', prepare: 'husky' }, devDependencies: { husky: '^9.0.0' } },
    'package-lock.json': LOCK,
    '.husky/pre-push': 'npm run lint',
    '.github/workflows/be.yml': 'steps:\n  - run: npm ci\n  - run: npm run lint:backend\n  - run: npm run test --workspace backend\n',
    'frontend/package.json': { name: 'web', scripts: { lint: 'eslint .', test: 'vitest run', build: 'tsc -b && vite build' }, dependencies: { react: '^19.2.0' }, devDependencies: { typescript: '~5.9.3', eslint: '^9.39.0', prettier: '^3.0.0' } },
    'frontend/tsconfig.json': '{ "compilerOptions": { "strict": true } }',
    'frontend/eslint.config.js': 'x',
    'frontend/src/App.tsx': 'x',
    'frontend/src/App.test.tsx': 'x',
    'backend/package.json': { name: 'api', scripts: { lint: 'eslint .', test: "echo 'No tests yet' && exit 0" }, dependencies: { express: '^5.2.1' }, devDependencies: { typescript: '~5.8.0', eslint: '^9.39.0' } },
    'backend/tsconfig.json': '{}',
    'backend/eslint.config.js': 'x',
    'backend/src/index.ts': 'x',
  };
  const root = repo(files);
  const a = analyse(root, { pluginRoot: PLUGIN });

  test('workspaces are adoptable, with locked versions per workspace', () => {
    assert.equal(a.monorepo.adoptable, true);
    assert.deepEqual(a.workspaces.map((w) => [w.path, w.name]), [['backend', 'api'], ['frontend', 'web']]);
    const be = a.workspaces[0];
    assert.equal(be.dependencies.find((d) => d.name === 'typescript').locked, '5.8.2', 'nested install wins');
    assert.equal(a.workspaces[1].dependencies.find((d) => d.name === 'typescript').locked, '5.9.3');
    assert.deepEqual(a.frameworks.map((f) => `${f.name} ${f.version} (${f.workspace})`), ['Express 5.2.1 (backend)', 'TypeScript 5.8.2 (backend)', 'React 19.2.1 (frontend)', 'TypeScript 5.9.3 (frontend)']);
    assert.equal(a.tooling.types[0].name, 'TypeScript (strict)');
  });

  test('tasks run from the root; placeholder scripts are not tasks', () => {
    assert.equal(a.tasks.contract.test, undefined, "npm init's default test is not a test task");
    assert.equal(a.workspaces[1].tasks.contract.test, 'npm run test --workspace frontend');
    assert.equal(a.workspaces[0].tasks.contract.test, undefined, "echo 'No tests yet' is not a test task");
    assert.ok(a.tooling.ciRuns.includes('lint') && a.tooling.ciRuns.includes('test'));
  });

  test('gaps look across workspaces', () => {
    const ids = a.gaps.map((g) => `${g.id}: ${g.issue}`);
    assert.ok(ids.includes('tasks: workspace backend has no test task'), ids.join('\n'));
    assert.ok(!ids.some((g) => g.startsWith('hooks') || g.startsWith('lockfile') || g.startsWith('ci:')), ids.join('\n'));
    assert.ok(ids.some((g) => g.startsWith('check-task') && g.includes('across backend, frontend')), ids.join('\n'));
  });

  test('preflight passes; the hook config runs each workspace’s tools from its folder', () => {
    assert.deepEqual(preflight(a).blockers, []);
    const c = hookConfig(a, root);
    assert.deepEqual(c.onEdit.map((e) => [e.cwd, e.label ?? e.run[0]]), [['backend', 'ESLint (backend)'], ['frontend', 'node_modules/.bin/prettier'], ['frontend', 'ESLint (frontend)']]);
    assert.ok(new RegExp(c.onEdit[0].files).test('backend/src/index.ts') && !new RegExp(c.onEdit[0].files).test('frontend/src/App.tsx'));
  });

  test('pnpm workspaces from pnpm-workspace.yaml run with --filter; too many or mixed projects stay a monorepo', () => {
    const p = analyse(repo({ 'package.json': { name: 'r', packageManager: 'pnpm@9.0.0' }, 'pnpm-workspace.yaml': "packages:\n  - 'apps/*'\n  - packages/*  # shared\n", 'pnpm-lock.yaml': "lockfileVersion: '9.0'\n", 'apps/web/package.json': { name: '@r/web', scripts: { dev: 'vite' } }, 'packages/ui/package.json': { name: '@r/ui' } }));
    assert.deepEqual(p.workspaces.map((w) => w.path), ['apps/web', 'packages/ui']);
    assert.equal(p.workspaces[0].tasks.contract.dev, 'pnpm --filter @r/web dev');
    const mixed = analyse(repo({ 'package.json': { workspaces: ['web'] }, 'web/package.json': {}, 'api/pyproject.toml': '' }));
    assert.equal(mixed.workspaces, null);
    assert.deepEqual(mixed.monorepo.notAdoptable, ['projects outside the workspaces: api']);
    const nx = analyse(repo({ 'package.json': { workspaces: ['a'] }, 'nx.json': '{}', 'a/package.json': {} }));
    assert.deepEqual(nx.monorepo.notAdoptable, ["nx.json isn't supported yet"]);
  });
});
