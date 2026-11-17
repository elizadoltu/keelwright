import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, describe, test } from 'node:test';
import { checkScaffold } from '../scripts/lib/scaffoldcheck.mjs';
import { tokensToCss } from '../scripts/lib/tokens.mjs';

const dirs = [];
after(() => dirs.forEach((d) => rmSync(d, { recursive: true, force: true })));
const SHA = 'a'.repeat(40);
const TOKENS = JSON.stringify({ color: { $type: 'color', light: { surface: { $value: { colorSpace: 'srgb', components: [1, 1, 1], hex: '#ffffff' } } } } });

function project(overrides = {}) {
  const root = mkdtempSync(join(tmpdir(), 'keelwright-scaffold-'));
  dirs.push(root);
  const files = {
    'package.json': JSON.stringify({
      scripts: { dev: 'astro dev', build: 'astro build', lint: 'eslint .', 'format:check': 'prettier --check .', typecheck: 'astro check', test: 'vitest run', 'test:e2e': 'playwright test', check: 'astro sync && npm run lint', tokens: 'node scripts/tokens.mjs', prepare: 'husky' },
      dependencies: { astro: '7.4.12' },
      devDependencies: { typescript: 'npm:@typescript/typescript6@6.0.3', vitest: '5.1.0' },
      engines: { node: '>=26' },
    }),
    'package-lock.json': '{}',
    '.npmrc': 'save-exact=true\n',
    '.nvmrc': '26\n',
    '.gitignore': 'node_modules/\n.env\n.env.*\n!.env.example\n.keelwright/snapshots/\n.claude/settings.local.json\n',
    '.env.example': 'RESEND_API_KEY=\n',
    '.husky/pre-commit': 'npx lint-staged\ngitleaks git --pre-commit --staged --redact\n',
    '.husky/commit-msg': 'npx --no -- commitlint --edit "$1"\n',
    'commitlint.config.js': 'export default {};\n',
    '.lintstagedrc.json': '{}',
    '.github/workflows/ci.yml': `steps:\n  - uses: actions/checkout@${SHA} # v7\n  - run: npm run check\n  - run: npm run build\n  - run: npm run test:e2e\n  - uses: gitleaks/gitleaks-action@${SHA}\n`,
    '.github/dependabot.yml': 'updates:\n  - package-ecosystem: npm\n  - package-ecosystem: github-actions\n',
    'playwright.config.ts': 'export default {};\n',
    'tests/e2e/home.spec.ts': 'test',
    'src/lib/slug.test.ts': 'test',
    'design/tokens.json': TOKENS,
    'src/styles/tokens.css': tokensToCss(TOKENS),
    ...overrides,
  };
  for (const [f, c] of Object.entries(files)) {
    if (c === null) continue;
    mkdirSync(join(root, f, '..'), { recursive: true });
    writeFileSync(join(root, f), c);
  }
  return root;
}

const areas = (issues) => issues.map((i) => `${i.area}: ${i.issue}`);

describe('scaffold check', () => {
  test('a complete scaffold passes', () => {
    assert.deepEqual(areas(checkScaffold(project(), { versions: { astro: '7.4.12', typescript: '6.0.3', node: '26.13.1' } })), []);
  });

  test('an Astro check that skips astro sync fails on a fresh CI checkout', () => {
    const pkg = (check, extra = {}) => JSON.stringify({ scripts: { dev: 'x', build: 'x', lint: 'x', 'format:check': 'x', typecheck: 'x', test: 'x', 'test:e2e': 'x', tokens: 'x', prepare: 'husky', check, ...extra }, dependencies: { astro: '7.4.12' } });
    const has = (root) => areas(checkScaffold(root, { versions: { astro: '7.4.12' } })).some((i) => i.includes('astro sync'));
    assert.ok(has(project({ 'package.json': pkg('npm run lint && npm run test') })));
    assert.ok(!has(project({ 'package.json': pkg('npm run sync && npm run lint', { sync: 'astro sync' }) })));
  });

  test('ranges, version drift, missing scripts and lockfile', () => {
    const root = project({
      'package.json': JSON.stringify({ scripts: { dev: 'x' }, dependencies: { astro: '^7.4.12', vitest: '5.0.0' } }),
      'package-lock.json': null,
    });
    const issues = areas(checkScaffold(root, { versions: { vitest: '5.1.0' } }));
    assert.ok(issues.includes('versions: astro "^7.4.12" is not an exact version'));
    assert.ok(issues.includes('versions: vitest 5.0.0 differs from the resolved 5.1.0'));
    assert.ok(issues.includes('scripts: npm script "test:e2e" is missing'));
    assert.ok(issues.includes('versions: no lockfile'));
    assert.ok(issues.includes('versions: package.json has no engines.node'));
  });

  test('hooks without gitleaks, unpinned actions, no Dependabot', () => {
    const root = project({
      '.husky/pre-commit': 'npx lint-staged\n',
      '.github/workflows/ci.yml': 'steps:\n  - uses: actions/checkout@v7\n  - run: npm run check\n  - run: npm run build\n  - run: npm run test:e2e\n',
      '.github/dependabot.yml': null,
    });
    const issues = areas(checkScaffold(root));
    assert.ok(issues.includes("hooks: pre-commit doesn't run gitleaks"));
    assert.ok(issues.includes('ci: action actions/checkout@v7 is not pinned to a commit SHA'));
    assert.ok(issues.includes("ci: CI doesn't run gitleaks"));
    assert.ok(issues.includes('ci: no dependency updates (.github/dependabot.yml or renovate.json)'));
  });

  test('theme out of date with the tokens', () => {
    const root = project({ 'src/styles/tokens.css': '/* Generated from design/tokens.json by KeelWright */\n@theme {}\n' });
    assert.deepEqual(areas(checkScaffold(root)), ['theme: src/styles/tokens.css is out of date with design/tokens.json']);
  });

  test('schema tables must be in the first migration', () => {
    const root = project({
      'docs/architecture/schema.sql': 'create table clients (id uuid);\ncreate table invoices (id uuid);\n',
      'supabase/migrations/20261116000000_init.sql': 'create table clients (id uuid);\n',
    });
    assert.deepEqual(areas(checkScaffold(root)), ['database: table invoices from schema.sql is not in the first migration']);
    const plain = project({ 'docs/architecture/schema.sql': 'create table articles (id uuid);\n', 'migrations/20261117000000_init.sql': 'create table articles (id uuid);\n' });
    assert.deepEqual(areas(checkScaffold(plain)), [], 'plain SQL migrations for a database other than Supabase');
    const none = project({ 'docs/architecture/schema.sql': 'create table articles (id uuid);\n' });
    assert.deepEqual(areas(checkScaffold(none)), ['database: docs/architecture/schema.sql exists but there is no SQL migration (supabase/migrations/, migrations/ or db/migrations/)']);
  });

  test('.gitignore must cover secrets and snapshots', () => {
    const root = project({ '.gitignore': 'node_modules\n' });
    const issues = areas(checkScaffold(root));
    assert.ok(issues.includes("hygiene: .gitignore doesn't ignore .env"));
    assert.ok(issues.includes("hygiene: .gitignore doesn't ignore .keelwright/snapshots"));
  });
});

function bare(files) {
  const root = mkdtempSync(join(tmpdir(), 'keelwright-scaffold-'));
  dirs.push(root);
  for (const [f, c] of Object.entries(files)) {
    mkdirSync(join(root, f, '..'), { recursive: true });
    writeFileSync(join(root, f), c);
  }
  return root;
}

const PRE_COMMIT = `default_install_hook_types: [pre-commit, commit-msg]
repos:
  - repo: https://github.com/gitleaks/gitleaks
    rev: ${SHA} # frozen: v8.30.1
    hooks:
      - id: gitleaks
  - repo: https://github.com/compilerla/conventional-pre-commit
    rev: ${SHA} # frozen: v4.5.0
    hooks:
      - id: conventional-pre-commit
        stages: [commit-msg]
`;

const pythonProject = (overrides = {}) => ({
  '.keelwright/state.json': JSON.stringify({ projectType: 'ai', stack: { toolchain: 'python' } }),
  'pyproject.toml': `[project]\nname = "support-bot"\ndependencies = [\n  "anthropic==2.9.0",\n  "fastapi==0.163.1",\n]\n\n[dependency-groups]\ndev = ["pytest==9.2.0", "ruff==0.17.5", "poethepoet==0.49.0"]\n\n[tool.poe.tasks]\nlint = "ruff check ."\nformat = "ruff format ."\nformat-check = "ruff format --check ."\ntypecheck = "pyright"\ntest = "pytest"\neval = "pytest evals"\n\n[tool.poe.tasks.check]\nsequence = ["lint", "format-check", "typecheck", "test"]\n`,
  'uv.lock': '',
  '.python-version': '3.15\n',
  '.gitignore': '.venv/\n__pycache__/\n.env\n!.env.example\n.keelwright/snapshots/\n.claude/settings.local.json\n',
  '.env.example': 'ANTHROPIC_API_KEY=\n',
  '.pre-commit-config.yaml': PRE_COMMIT,
  '.github/workflows/ci.yml': `steps:\n  - uses: astral-sh/setup-uv@${SHA} # v7\n  - run: uv run poe check\n  - uses: gitleaks/gitleaks-action@${SHA}\n`,
  '.github/dependabot.yml': 'updates:\n  - package-ecosystem: uv\n  - package-ecosystem: pre-commit\n  - package-ecosystem: github-actions\n',
  'tests/test_answer.py': 'def test_x(): pass\n',
  ...overrides,
});

describe('scaffold check: other toolchains', () => {
  test('a complete Python project passes', () => {
    assert.deepEqual(areas(checkScaffold(bare(pythonProject()), { versions: { python: '3.15.2', anthropic: '2.9.0' } })), []);
  });

  test('Python: ranges in an app, missing tasks, unpinned hook revs', () => {
    const files = pythonProject({
      'pyproject.toml': '[project]\ndependencies = ["anthropic>=2.9.0"]\n\n[tool.poe.tasks]\ntest = "pytest"\n',
      '.pre-commit-config.yaml': 'repos:\n  - repo: https://github.com/gitleaks/gitleaks\n    rev: v8.30.1\n    hooks:\n      - id: gitleaks\n',
    });
    const issues = areas(checkScaffold(bare(files)));
    for (const expected of [
      'tasks: task "check" is missing (uv run poe check)',
      'tasks: task "format-check" is missing (uv run poe format-check)',
      'versions: "anthropic>=2.9.0" is not an exact version (==)',
      'hooks: no Conventional Commits check on commit-msg (compilerla/conventional-pre-commit)',
      'hooks: https://github.com/gitleaks/gitleaks rev v8.30.1 is not pinned to a commit SHA (pre-commit autoupdate --freeze)',
    ]) assert.ok(issues.includes(expected), `missing "${expected}" in ${JSON.stringify(issues, null, 1)}`);
  });

  test('a Python library may declare ranges for its users, with the resolved version as lower bound', () => {
    const files = pythonProject({
      '.keelwright/state.json': JSON.stringify({ projectType: 'library', stack: { toolchain: 'python' } }),
      'pyproject.toml': pythonProject()['pyproject.toml'].replace('"anthropic==2.9.0"', '"anthropic>=2.8"').replace('"fastapi==0.163.1"', '"fastapi>=0.163.1"').replace('[tool.poe.tasks.check]', 'build = "uv build"\n\n[tool.poe.tasks.check]'),
    });
    assert.deepEqual(areas(checkScaffold(bare(files), { versions: { anthropic: '2.9.0', fastapi: '0.163.1' } })), ['versions: "anthropic>=2.8" should have the resolved 2.9.0 as its lower bound (e.g. >=2.9.0)']);
  });

  test('Godot: justfile tasks, .godot ignored, gdUnit test', () => {
    const files = {
      '.keelwright/state.json': JSON.stringify({ projectType: 'game', stack: { toolchain: 'godot' } }),
      'project.godot': 'config_version=5\n',
      justfile: 'lint:\n  uvx --from "gdtoolkit==4.*" gdlint .\nformat:\n  gdformat .\nformat-check:\n  gdformat --check .\ntest:\n  ./addons/gdUnit4/runtest.sh -a res://test\ncheck: lint format-check test\n',
      '.gitignore': '.godot/\n.env\n.keelwright/snapshots/\n.claude/settings.local.json\n',
      '.pre-commit-config.yaml': PRE_COMMIT,
      '.github/workflows/ci.yml': `steps:\n  - uses: actions/checkout@${SHA}\n  - run: just check\n  - uses: gitleaks/gitleaks-action@${SHA}\n`,
      '.github/dependabot.yml': 'updates:\n  - package-ecosystem: pre-commit\n  - package-ecosystem: github-actions\n',
      'test/test_score.gd': 'extends GdUnitTestSuite\n',
    };
    assert.deepEqual(areas(checkScaffold(bare(files))), []);
    assert.deepEqual(areas(checkScaffold(bare({ ...files, 'test/test_score.gd': '', justfile: 'test:\n  x\n' }))).filter((i) => i.startsWith('tasks')), ['tasks: task "lint" is missing (just lint)', 'tasks: task "format" is missing (just format)', 'tasks: task "format-check" is missing (just format-check)', 'tasks: task "check" is missing (just check)']);
  });

  test('Rust: a unit test means a #[test] function', () => {
    const files = {
      'Cargo.toml': '[package]\nname = "csvtool"\n',
      'Cargo.lock': '',
      'rust-toolchain.toml': '[toolchain]\nchannel = "1.100.0"\n',
      justfile: 'lint:\n  cargo clippy\nformat:\n  cargo fmt\nformat-check:\n  cargo fmt --check\ntest:\n  cargo test\nbuild:\n  cargo build --release\ncheck: lint format-check test\n',
      '.keelwright/state.json': JSON.stringify({ projectType: 'library', stack: { toolchain: 'rust' } }),
      '.gitignore': 'target/\n.env\n.keelwright/snapshots/\n.claude/settings.local.json\n',
      '.pre-commit-config.yaml': PRE_COMMIT,
      '.github/workflows/ci.yml': `steps:\n  - run: just check\n  - uses: gitleaks/gitleaks-action@${SHA}\n`,
      '.github/dependabot.yml': 'updates:\n  - package-ecosystem: cargo\n  - package-ecosystem: pre-commit\n  - package-ecosystem: github-actions\n',
      'src/lib.rs': 'pub fn parse() {}\n',
    };
    assert.deepEqual(areas(checkScaffold(bare(files))), ['tests: no unit test (#[test] in src/ or tests/)']);
    assert.deepEqual(areas(checkScaffold(bare({ ...files, 'src/lib.rs': '#[cfg(test)]\nmod tests {\n  #[test]\n  fn parses() {}\n}\n' }))), []);
  });

  test('editor-based engines need setup instructions instead of tasks', () => {
    const files = {
      '.keelwright/state.json': JSON.stringify({ projectType: 'game', stack: { toolchain: 'editor' } }),
      '.gitignore': '.env\n.keelwright/snapshots/\n.claude/settings.local.json\n',
      '.pre-commit-config.yaml': PRE_COMMIT,
      '.github/workflows/ci.yml': `steps:\n  - uses: gitleaks/gitleaks-action@${SHA}\n`,
      '.github/dependabot.yml': 'updates:\n  - package-ecosystem: github-actions\n',
    };
    assert.deepEqual(areas(checkScaffold(bare(files))), ['setup: no docs/setup.md — editor-based projects get written setup instructions']);
  });
});
