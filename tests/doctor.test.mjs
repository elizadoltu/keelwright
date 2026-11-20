import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { after, describe, test } from 'node:test';
import { diagnose, record } from '../scripts/lib/doctor.mjs';
import * as S from '../scripts/lib/state.mjs';

const CLI = join(import.meta.dirname, '../scripts/doctor.mjs');
const NOW = '2026-11-19T10:00:00.000Z';
const dirs = [];
after(() => dirs.forEach((d) => rmSync(d, { recursive: true, force: true })));

const write = (root, f, text) => {
  mkdirSync(dirname(join(root, f)), { recursive: true });
  writeFileSync(join(root, f), text);
};
const git = (root, ...args) => execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@example.invalid', ...args], { cwd: root, stdio: 'ignore' });

// A small Node.js project with a hand-made Claude setup, committed.
function project(files = {}, commits = ['feat: start']) {
  const root = mkdtempSync(join(tmpdir(), 'keelwright-doctor-'));
  dirs.push(root);
  const all = {
    'package.json': JSON.stringify({ scripts: { test: 'vitest run', lint: 'eslint .' }, devDependencies: { vitest: '^4.1.0', eslint: '^9.0.0' } }),
    'package-lock.json': JSON.stringify({ lockfileVersion: 3, packages: { 'node_modules/vitest': { version: '4.1.12' }, 'node_modules/eslint': { version: '9.30.0' } } }),
    '.gitignore': 'node_modules\n.claude/settings.local.json\n',
    'CLAUDE.md': '# App\n\nRun `npm run test`.\n',
    ...files,
  };
  for (const [f, text] of Object.entries(all)) write(root, f, text);
  git(root, 'init', '-q', '-b', 'main');
  git(root, 'add', '-A');
  for (const msg of commits) git(root, 'commit', '-q', '--allow-empty', '-m', msg);
  return root;
}
const by = (r, area) => r.findings.filter((f) => f.area === area);
const has = (r, area, level, re) => by(r, area).some((f) => f.level === level && re.test(f.issue));

describe('doctor', () => {
  test('no Claude setup fails the setup area and points to /adopt', () => {
    const root = project();
    unlinkSync(join(root, 'CLAUDE.md'));
    const r = diagnose(root, { now: NOW });
    assert.equal(r.areas.setup, 'fail');
    assert.equal(by(r, 'setup')[0].fix, '/keelwright:adopt');
  });

  test('a hand-made setup is checked for drift, not for KeelWright\'s own conventions', () => {
    const root = project({ 'CLAUDE.md': '# App\n\nRun `npm run test` and `npm run typecheck`. See `src/server/app.ts`.\n' });
    const r = diagnose(root, { now: NOW });
    assert.ok(has(r, 'setup', 'fail', /npm run typecheck.*no such script/), JSON.stringify(by(r, 'setup')));
    assert.ok(has(r, 'setup', 'fail', /src\/server\/app\.ts` doesn't exist/));
    assert.ok(!by(r, 'setup').some((f) => /agent|skills|settings\.json|ADRs live|CONTRIBUTING/.test(f.issue)), JSON.stringify(by(r, 'setup')));
    assert.equal(r.keelwright, false);
    assert.equal(r.areas.delivery, 'skipped');
  });

  test('docs: a cited file that was deleted is drift; a path that never existed at the root is not', () => {
    const root = project({ 'src/old/handler.ts': 'x', 'docs/decisions/0002-use-express.md': '# 0002\n\nEvidence:\n- `src/old/handler.ts` — the handler\n- `api/` — the API folder in the backend workspace\n\n[NEEDS CLARIFICATION: who decided]\n' });
    git(root, 'rm', '-q', 'src/old/handler.ts');
    git(root, 'commit', '-qm', 'refactor: drop the old handler');
    const r = diagnose(root, { now: NOW });
    assert.ok(has(r, 'docs', 'warn', /0002-use-express\.md cites `src\/old\/handler\.ts`, which no longer exists/));
    assert.ok(!by(r, 'docs').some((f) => /`api\/`/.test(f.issue)));
    assert.ok(has(r, 'docs', 'warn', /1 open question/));
  });

  test('stack: a pack researched for another major, an old pack, and recorded gaps', () => {
    const pack = (major, at) => `---\nid: vitest\nname: Vitest\npackages: [vitest]\nmajor: ${major}\nresearchedAt: ${at}\nstatus: reviewed\n---\n\n# Vitest\n`;
    const root = project({
      '.keelwright/stack-packs/vitest.md': pack(5, '2026-06-01'),
      '.keelwright/gaps.md': '# Gaps\n\n| ID | Gap | Decision | Files | Note |\n|---|---|---|---|---|\n| G-05 | Node.js 20 is past end of life | recorded | — | 24 is current LTS |\n| G-02 | No Dependabot | declined | — | "we use Renovate" |\n',
    });
    const r = diagnose(root, { now: NOW });
    assert.ok(has(r, 'stack', 'warn', /researched for vitest 5, but the project uses 4/));
    assert.ok(has(r, 'stack', 'info', /researched 171 days ago/));
    assert.ok(has(r, 'stack', 'info', /G-05 Node\.js 20 is past end of life — recorded/));
    assert.ok(has(r, 'tooling', 'info', /G-02 No Dependabot was declined: "we use Renovate"/));
  });

  test('tooling: no secret scanning fails', () => {
    const r = diagnose(project(), { now: NOW });
    assert.equal(r.areas.tooling, 'fail');
    assert.ok(has(r, 'tooling', 'fail', /secret scanning/));
  });

  test('process: commits off the documented style, and hooks not installed in this clone', () => {
    const root = project({ 'CONTRIBUTING.md': 'We use Conventional Commits.\n', '.husky/pre-commit': 'npm run lint\n' }, ['feat: start', 'fix stuff', 'wip', 'fix(api): handle errors']);
    const r = diagnose(root, { now: NOW });
    assert.ok(has(r, 'process', 'warn', /2 of the last 4 commits don't follow Conventional Commits/), JSON.stringify(by(r, 'process')));
    assert.ok(has(r, 'process', 'warn', /Husky hooks are not installed/));
    git(root, 'config', 'core.hooksPath', '.husky/_');
    assert.ok(!has(diagnose(root, { now: NOW }), 'process', 'warn', /Husky/));
  });

  test('process: a repository with no commits is a finding, not "not a git repository"', () => {
    const root = project({ 'src/a.ts': 'x' }, []);
    const r = diagnose(root, { now: NOW });
    assert.notEqual(r.areas.process, 'skipped');
    assert.ok(has(r, 'process', 'warn', /^no commits yet — \d+ files and folders never committed: the git hooks, secret scanning and CI have never run$/), JSON.stringify(by(r, 'process')));
    assert.ok(!has(diagnose(project()), 'process', 'warn', /no commits yet/));
  });

  test('a KeelWright project: reviewed documents edited since approval are one note', () => {
    const root = project({ 'docs/prd.md': '# PRD\n' });
    const s = S.create({ version: 't', now: NOW });
    s.steps.prd = { status: 'approved', outputs: { 'docs/prd.md': 'stale-hash' } };
    S.save(root, s);
    const r = diagnose(root, { now: NOW });
    assert.equal(r.keelwright, true);
    assert.ok(has(r, 'docs', 'info', /1 reviewed document edited since approval: docs\/prd\.md/));
  });

  test('the record keeps a history and the CLI exits 1 on a failing area', () => {
    const root = project();
    record(root, diagnose(root, { now: '2026-11-18T10:00:00.000Z' }));
    const r = spawnSync('node', [CLI, '--root', root, '--offline'], { encoding: 'utf8' });
    assert.equal(r.status, 1);
    const md = readFileSync(join(root, '.keelwright/doctor.md'), 'utf8');
    assert.match(md, /\| Tooling and security \| FAIL \|/);
    assert.match(md, /## History/);
    assert.equal(JSON.parse(readFileSync(join(root, '.keelwright/doctor.json'), 'utf8')).history.length, 2);
    const dry = spawnSync('node', [CLI, '--root', root, '--no-write', '--json', '--offline'], { encoding: 'utf8' });
    assert.equal(JSON.parse(dry.stdout).history, 3);
    assert.equal(JSON.parse(readFileSync(join(root, '.keelwright/doctor.json'), 'utf8')).history.length, 2, '--no-write records nothing');
    assert.ok(existsSync(join(root, 'CLAUDE.md')));
  });
});
