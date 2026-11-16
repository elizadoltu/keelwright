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
      scripts: { dev: 'astro dev', build: 'astro build', lint: 'eslint .', 'format:check': 'prettier --check .', typecheck: 'astro check', test: 'vitest run', 'test:e2e': 'playwright test', check: 'npm run lint', tokens: 'node scripts/tokens.mjs', prepare: 'husky' },
      dependencies: { astro: '7.4.12' },
      devDependencies: { typescript: 'npm:@typescript/typescript6@6.0.3', vitest: '5.1.0' },
      engines: { node: '>=26' },
    }),
    'package-lock.json': '{}',
    '.npmrc': 'save-exact=true\n',
    '.nvmrc': '26\n',
    '.gitignore': 'node_modules/\n.env\n.env.*\n!.env.example\n.keelwright/snapshots/\n',
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
  });

  test('.gitignore must cover secrets and snapshots', () => {
    const root = project({ '.gitignore': 'node_modules\n' });
    const issues = areas(checkScaffold(root));
    assert.ok(issues.includes("hygiene: .gitignore doesn't ignore .env"));
    assert.ok(issues.includes("hygiene: .gitignore doesn't ignore .keelwright/snapshots"));
  });
});
