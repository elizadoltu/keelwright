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
