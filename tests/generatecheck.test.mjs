import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, describe, test } from 'node:test';
import { applicableReviewRules, checkGenerated } from '../scripts/lib/generatecheck.mjs';

const dirs = [];
after(() => dirs.forEach((d) => rmSync(d, { recursive: true, force: true })));

const PACK = `---
id: astro
name: Astro
packages: [astro]
major: 7
researchedAt: 2026-11-16
status: reviewed
---

## Rules

| ID | Rule | Enforce with | Sources |
|---|---|---|---|
| ASTRO-01 | strict tsconfig | config: tsconfig | S1 |
| ASTRO-08 | validate action input | review | S1 |
| ASTRO-13 | content collections via getCollection | review | S1 |
`;

const agent = (name, extra = '') => `---\nname: ${name}\ndescription: The ${name} agent for this project — used when a change needs it, as described here.\ntools: Read, Grep, Glob${name === 'reviewer' ? ', Bash\ndisallowedTools: Write, Edit, MultiEdit, NotebookEdit' : ', Edit, Write, Bash'}\n${extra}---\n\nBody.\n`;

function project(overrides = {}) {
  const root = mkdtempSync(join(tmpdir(), 'keelwright-gen-'));
  dirs.push(root);
  const files = {
    'package.json': JSON.stringify({ scripts: { dev: 'x', check: 'x', 'test:e2e': 'x' } }),
    '.gitignore': 'node_modules\n.claude/settings.local.json\n',
    'commitlint.config.mjs': "export default { extends: ['@commitlint/config-conventional'] };\n",
    'docs/decisions/0001-record-architecture-decisions.md': 'x',
    'docs/prd.md': 'x',
    'CLAUDE.md': '# Site\n\nADRs live in `docs/decisions/`. Run `npm run check`.\n\nAgents: reviewer, tester, docs-keeper.\n',
    'CONTRIBUTING.md': '<!-- keelwright: status=generated date=2026-11-16 -->\n# Contributing\n\nCommits follow Conventional Commits. Run `npm run check`.\n',
    '.claude/agents/reviewer.md': agent('reviewer'),
    '.claude/agents/tester.md': agent('tester'),
    '.claude/agents/docs-keeper.md': agent('docs-keeper'),
    '.claude/skills/new-adr/SKILL.md': '---\nname: new-adr\ndescription: Record an architecture decision as a new ADR in docs/decisions/.\n---\n\nSteps.\n',
    '.claude/rules/astro.md': '---\npaths: ["src/**/*.astro"]\n---\n\n- Validate action input (ASTRO-08).\n',
    '.claude/settings.json': JSON.stringify({ permissions: { allow: ['Bash(npm run check)'] }, hooks: { PreToolUse: [{ matcher: 'Edit|Write', hooks: [{ type: 'command', command: 'node "$CLAUDE_PROJECT_DIR"/.claude/hooks/guard-files.mjs' }] }] } }),
    '.claude/hooks/guard-files.mjs': '',
    '.keelwright/stack-packs/astro.md': PACK,
    '.keelwright/scaffold.md': '# Scaffold\n\n## Pack rules not applied\n\n| Rule | Why |\n|---|---|\n| ASTRO-13 | No content collections yet |\n',
    ...overrides,
  };
  for (const [f, c] of Object.entries(files)) {
    if (c === null) continue;
    mkdirSync(join(root, f, '..'), { recursive: true });
    writeFileSync(join(root, f), c);
  }
  return root;
}

const issues = (root) => checkGenerated(root).map((i) => `${i.area}: ${i.issue}`);

describe('generated agent setup check', () => {
  test('a complete setup passes', () => {
    assert.deepEqual(issues(project()), []);
  });

  test('review rules: applicable ones must be covered, not-applied ones are excluded', () => {
    const r = applicableReviewRules(project());
    assert.deepEqual(r.review, ['ASTRO-08']);
    assert.ok(r.excluded.has('ASTRO-13'));
    const root = project({ '.claude/rules/astro.md': '- Something else. Also ASTRO-99.\n' });
    assert.deepEqual(issues(root), ['rules: stack-pack review rule ASTRO-08 is not in CLAUDE.md or .claude/rules/', 'rules: ASTRO-99 is cited but no stack pack defines it']);
  });

  test('a reviewer that can write is rejected', () => {
    const root = project({ '.claude/agents/reviewer.md': '---\nname: reviewer\ndescription: Reviews changes against conventions, decisions and requirements.\ntools: Read, Edit, Bash\n---\n' });
    assert.deepEqual(issues(root), ['agents: reviewer.md: the reviewer must be read-only but has Edit', 'agents: reviewer.md: disallowedTools should include Write and Edit']);
  });

  test('agents need explicit tools and a useful description', () => {
    const root = project({ '.claude/agents/tester.md': '---\nname: tester\ndescription: Tests.\n---\n' });
    assert.deepEqual(issues(root), ['agents: tester.md: description is missing or too short to know when to use it', 'agents: tester.md: no tools list — without one it inherits every tool']);
  });

  test('commands and paths must exist; placeholders are reported', () => {
    const root = project({ 'CLAUDE.md': '# Site\n\nADRs in `docs/decisions/`. Run `npm run deploy`. See `docs/architecture/overview.md`. Owner: <name>. Branches like `docs/adr-analytics` or `feat/…`.\nreviewer tester docs-keeper\n' });
    assert.deepEqual(issues(root), [
      'placeholders: CLAUDE.md:3: placeholder <name>',
      'commands: CLAUDE.md: "npm run deploy" — no such script in package.json',
      "paths: CLAUDE.md: `docs/architecture/overview.md` doesn't exist",
    ]);
  });

  test('an empty folder named in CLAUDE.md is reported (git would not keep it)', () => {
    const root = project({ 'CLAUDE.md': '# Site\n\nADRs live in `docs/decisions/`. Components in `src/components/atoms/` and `src/components/organisms/`. Run `npm run check`.\nreviewer tester docs-keeper\n', 'src/components/organisms/Header.astro': 'x' });
    mkdirSync(join(root, 'src/components/atoms/nested'), { recursive: true });
    assert.deepEqual(issues(root), [
      "paths: CLAUDE.md: `src/components/atoms/` is an empty folder — git doesn't keep it, so a fresh clone won't have it; add a `.gitkeep`",
    ]);
    writeFileSync(join(root, 'src/components/atoms/.gitkeep'), '');
    assert.deepEqual(issues(root), []);
  });

  test('CLAUDE.md over 200 lines', () => {
    const root = project({ 'CLAUDE.md': `ADRs: \`docs/decisions/\`. reviewer tester docs-keeper\n${'line\n'.repeat(210)}` });
    assert.match(issues(root)[0], /CLAUDE.md has 212 lines \(limit 200\)/);
  });

  test('unsafe settings, missing hook scripts, unignored local settings', () => {
    const root = project({
      '.claude/settings.json': JSON.stringify({ permissions: { allow: ['Bash(*)'] }, hooks: { PostToolUse: [{ hooks: [{ type: 'command', command: 'node .claude/hooks/missing.mjs' }] }] } }),
      '.gitignore': 'node_modules\n',
    });
    assert.deepEqual(issues(root), [
      'settings: permission "Bash(*)" allows every shell command',
      "settings: hook script .claude/hooks/missing.mjs doesn't exist",
      'settings: no PreToolUse guard (accepted ADRs, generated files, secrets)',
      "settings: .gitignore doesn't ignore .claude/settings.local.json",
    ]);
  });

  test('rule front matter: only paths is read', () => {
    const root = project({ '.claude/rules/astro.md': '---\npaths: ["src/**"]\ndescription: x\n---\n\nASTRO-08\n' });
    assert.deepEqual(issues(root), ['rules: .claude/rules/astro.md: "description" in front matter is ignored by Claude Code (only paths is read)']);
  });

  test('CONTRIBUTING.md must agree with commitlint', () => {
    const root = project({ 'CONTRIBUTING.md': '<!-- keelwright: status=generated -->\n# Contributing\n\nWrite good commit messages.\n' });
    assert.deepEqual(issues(root), ["contributing: commitlint enforces Conventional Commits but CONTRIBUTING.md doesn't say so"]);
  });
});

describe('generated setup for another toolchain', () => {
  const python = (overrides = {}) =>
    project({
      'package.json': null,
      'commitlint.config.mjs': null,
      '.keelwright/state.json': JSON.stringify({ projectType: 'ai', stack: { toolchain: 'python' } }),
      'pyproject.toml': '[tool.poe.tasks]\nlint = "ruff check ."\ntest = "pytest"\ncheck = ["lint", "test"]\n',
      '.pre-commit-config.yaml': 'repos:\n  - repo: https://github.com/compilerla/conventional-pre-commit\n    hooks:\n      - id: conventional-pre-commit\n',
      'CLAUDE.md': '# Bot\n\nADRs in `docs/decisions/`. Run `uv run poe check`.\nreviewer tester docs-keeper\n',
      'CONTRIBUTING.md': '<!-- keelwright: status=generated -->\n# Contributing\n\nConventional Commits. `uv run poe test`.\n',
      '.claude/hooks/config.json': JSON.stringify({ onEdit: [], check: { run: ['uv', 'run', 'poe', 'check'], requires: '.venv' } }),
      ...overrides,
    });

  test('a complete Python setup passes', () => {
    assert.deepEqual(issues(python()), []);
  });

  test('commands must use the project task runner and exist', () => {
    const root = python({ 'CLAUDE.md': '# Bot\n\nADRs in `docs/decisions/`. Run `npm run check` or `uv run poe typecheck`.\nreviewer tester docs-keeper\n' });
    assert.deepEqual(issues(root), ['commands: CLAUDE.md: "npm run check" — this project runs its tasks with "uv run poe <task>"', 'commands: CLAUDE.md: "uv run poe typecheck" — no such task']);
  });

  test('the hooks need the toolchain config, and the commit-msg hook counts for Conventional Commits', () => {
    const root = python({ '.claude/hooks/config.json': null, 'CONTRIBUTING.md': '<!-- keelwright: status=generated -->\n# Contributing\n\nGood messages.\n' });
    assert.deepEqual(issues(root), [
      'settings: no .claude/hooks/config.json — without it the hooks run the Node.js defaults, not the python tools (node "<plugin root>/scripts/toolchains.mjs" hook-config python)',
      "contributing: the commit-msg hook enforces Conventional Commits but CONTRIBUTING.md doesn't say so",
    ]);
  });
});

describe('generated agent setup check: /adopt', () => {
  // A pnpm project adopted with its own ADR folder, tasks and hook config.
  const adopted = (overrides = {}) =>
    project({
      'package.json': JSON.stringify({ packageManager: 'pnpm@9.15.0', scripts: { dev: 'x', lint: 'x', test: 'x', verify: 'x' } }),
      'pnpm-lock.yaml': "lockfileVersion: '9.0'\n",
      '.keelwright/state.json': JSON.stringify({ mode: 'adopt', stack: { toolchain: 'node' } }),
      'docs/decisions/0001-record-architecture-decisions.md': null,
      'docs/adr/0001-use-express.md': '# Use Express',
      'docs/prd.md': null,
      'CLAUDE.md': '# Orders API\n\nADRs live in `docs/adr/`. Run `pnpm verify` before finishing; `pnpm lint` to lint. Make sure tests pass.\n\nAgents: reviewer, tester, docs-keeper.\n',
      'CONTRIBUTING.md': '<!-- keelwright: status=merged date=2026-11-18 -->\n# Contributing\n\nCommits follow Conventional Commits. `pnpm install`, then `pnpm run verify`.\n',
      '.claude/settings.json': JSON.stringify({ permissions: { allow: ['Bash(pnpm verify)'] }, hooks: { PreToolUse: [{ matcher: 'Edit|Write', hooks: [{ type: 'command', command: 'node "$CLAUDE_PROJECT_DIR"/.claude/hooks/guard-files.mjs' }] }] } }),
      '.claude/hooks/config.json': JSON.stringify({ onEdit: [], check: { run: ['pnpm', 'verify'], requires: 'node_modules', label: 'pnpm verify' } }),
      ...overrides,
    });

  test('the project’s own commands, ADR folder and hook config pass', () => {
    assert.deepEqual(issues(adopted()), []);
  });

  test('npm commands in a pnpm project, unknown tasks, a hook config running a non-task, the wrong ADR folder', () => {
    const root = adopted({
      'CLAUDE.md': '# Orders API\n\nADRs live in `docs/decisions/`. Run `npm run check` and `pnpm typecheck`.\n\nAgents: reviewer, tester, docs-keeper.\n',
      '.claude/hooks/config.json': JSON.stringify({ onEdit: [], check: { run: ['pnpm', 'check'] } }),
    });
    assert.deepEqual(issues(root), [
      'claude-md: CLAUDE.md doesn\'t say where ADRs live (docs/adr/)',
      'commands: CLAUDE.md: "npm run check" — not one of this project\'s tasks',
      'commands: CLAUDE.md: "pnpm typecheck" — not one of this project\'s tasks',
      'paths: CLAUDE.md: `docs/decisions/` doesn\'t exist',
      'settings: .claude/hooks/config.json runs "pnpm check" on stop, but it isn\'t one of this project\'s tasks',
    ]);
  });

  test('no hook config in an adopted project points to analyse --hook-config', () => {
    assert.ok(issues(adopted({ '.claude/hooks/config.json': null })).some((i) => /analyse\.mjs" --hook-config/.test(i)));
  });

  test('rules set aside in the generate record are not required', () => {
    const root = adopted({ '.claude/rules/astro.md': '- Something else.\n', '.keelwright/generate.md': '# Generate\n\n## Pack rules not applied\n\n| Rule | Why |\n|---|---|\n| ASTRO-08 | the project validates in middleware, see C-03 |\n' });
    assert.ok(!issues(root).some((i) => i.includes('ASTRO-08')));
  });
});

describe('generated agent setup check: /adopt workspace repo', () => {
  const ws = (overrides = {}) =>
    project({
      'package.json': JSON.stringify({ name: 'app', workspaces: ['frontend', 'backend'], scripts: { 'lint:backend': 'npm run lint --workspace backend' } }),
      'package-lock.json': JSON.stringify({ lockfileVersion: 3, packages: {} }),
      'frontend/package.json': JSON.stringify({ name: 'web', scripts: { lint: 'eslint .', dev: 'vite' } }),
      'backend/package.json': JSON.stringify({ name: 'api', scripts: { lint: 'eslint .', build: 'tsc' } }),
      '.keelwright/state.json': JSON.stringify({ mode: 'adopt', stack: { toolchain: 'node' } }),
      'docs/prd.md': null,
      'CLAUDE.md': '# App\n\nADRs live in `docs/decisions/`. Lint with `npm run lint --workspace frontend`, `npm run lint -w api`, `npm run lint --workspaces`, `npm run lint:backend`.\n\nAgents: reviewer, tester, docs-keeper.\n',
      'CONTRIBUTING.md': '<!-- keelwright: status=generated date=2026-11-18 -->\n# Contributing\n\nCommits follow Conventional Commits. `npm ci`, then `npm run dev --workspace frontend`.\n',
      '.claude/hooks/config.json': JSON.stringify({ onEdit: [{ files: '^frontend/', cwd: 'frontend', run: ['node_modules/.bin/eslint', '{file}'] }], check: null }),
      ...overrides,
    });

  test('workspace scripts by path or name, and --workspaces, are the project’s tasks', () => {
    assert.deepEqual(issues(ws()), []);
  });

  test('a script a workspace doesn’t have, or a root script that doesn’t exist, is reported', () => {
    const root = ws({ 'CLAUDE.md': '# App\n\nADRs live in `docs/decisions/`. Run `npm run test --workspace backend` and `npm run build`.\n\nAgents: reviewer, tester, docs-keeper.\n' });
    assert.deepEqual(issues(root), [
      'commands: CLAUDE.md: "npm run test --workspace backend" — not one of this project\'s tasks',
      'commands: CLAUDE.md: "npm run build" — not one of this project\'s tasks',
    ]);
  });
});

describe('generatecheck: a project with a UI', () => {
  const SKILL = (body) => `---\nname: implement-story\ndescription: Implement one user story end to end, from its acceptance criteria to passing checks.\n---\n\n${body}\n`;
  test('the implement skill looks at the result running (web, mobile, game)', () => {
    const web = { '.keelwright/state.json': JSON.stringify({ projectType: 'web' }) };
    const missing = issues(project({ ...web, '.claude/skills/implement-story/SKILL.md': SKILL('5. Check.\n6. Review.') }));
    assert.ok(missing.some((i) => /implement-story: no "Look at it running" step/.test(i)), missing.join('\n'));
    const ok = issues(project({ ...web, '.claude/skills/implement-story/SKILL.md': SKILL('6. **Look at it running**: start it.') }));
    assert.ok(!ok.some((i) => /Look at it running/.test(i)));
    const lib = issues(project({ '.keelwright/state.json': JSON.stringify({ projectType: 'library' }), '.claude/skills/implement-story/SKILL.md': SKILL('5. Check.') }));
    assert.ok(!lib.some((i) => /Look at it running/.test(i)));
  });
});

describe('generatecheck: rules scoped to folders that are gone', () => {
  test('a rule for a folder the history had and the project dropped never loads; a folder not created yet is fine', async () => {
    const { execFileSync } = await import('node:child_process');
    const { rmSync: rm } = await import('node:fs');
    const root = project({ 'src/legacy/a.js': 'x', '.claude/rules/legacy.md': '---\npaths: ["src/legacy/**"]\n---\n\n- x\n', '.claude/rules/later.md': '---\npaths: ["src/jobs/**"]\n---\n\n- y\n' });
    const git = (...a) => execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', ...a], { cwd: root, stdio: 'ignore' });
    git('init', '-q');
    git('add', '-A');
    git('commit', '-qm', 'init');
    assert.ok(!issues(root).some((i) => /never loads/.test(i)));
    rm(join(root, 'src/legacy'), { recursive: true });
    const found = issues(root).filter((i) => /never loads/.test(i));
    assert.deepEqual(found, ['rules: .claude/rules/legacy.md: scoped to `src/legacy/**`, which no longer exists — the rule never loads']);
  });
});
