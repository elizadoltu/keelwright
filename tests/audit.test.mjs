import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { after, describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import * as A from '../scripts/lib/audit.mjs';

const PLUGIN = join(dirname(fileURLToPath(import.meta.url)), '..');
const roots = [];
after(() => roots.forEach((r) => rmSync(r, { recursive: true, force: true })));

const write = (root, f, text) => {
  mkdirSync(join(root, f, '..'), { recursive: true });
  writeFileSync(join(root, f), text);
};
const git = (root, ...args) => execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@example.invalid', ...args], { cwd: root, stdio: 'pipe', encoding: 'utf8' });

function project(files) {
  const root = mkdtempSync(join(tmpdir(), 'keelwright-audit-'));
  roots.push(root);
  for (const [f, text] of Object.entries(files)) write(root, f, text);
  git(root, 'init', '-q');
  git(root, 'add', '-A');
  git(root, 'commit', '-q', '-m', 'chore: init');
  return root;
}
// Offline, and without gitleaks or Semgrep on PATH: only the file-based checks run.
const cli = (root, ...args) => spawnSync('node', [join(PLUGIN, 'scripts/audit.mjs'), ...args, '--root', root, '--offline'], { encoding: 'utf8', env: { ...process.env, PATH: dirname(process.execPath) + ':/usr/bin:/bin' } });

const empty = { decisions: {}, secure: {} };
const result = (findings) => ({ mode: null, findings });

describe('audit mode: the fix plan', () => {
  test('each finding gets a kind of fix; notes are left out', () => {
    const items = A.plan(
      result([
        { area: 'setup', level: 'fail', issue: 'CLAUDE.md runs `npm test`, which no task defines', evidence: 'commands', fix: 'correct the file to match the project' },
        { area: 'docs', level: 'warn', issue: 'docs/prd.md: 2 open questions ([NEEDS CLARIFICATION])', fix: 'answer them in the file' },
        { area: 'stack', level: 'warn', issue: 'stack pack astro was researched for astro 4, but the project uses 5', fix: '/keelwright:adopt research --refresh' },
        { area: 'tooling', level: 'warn', issue: 'no Dependabot or Renovate', evidence: 'dependency-updates', fix: '/keelwright:adopt gaps' },
        { area: 'process', level: 'warn', issue: 'Husky hooks are not installed in this clone (core.hooksPath isn\'t set)', fix: 'run the install' },
        { area: 'docs', level: 'info', issue: '1 reviewed document edited since approval', fix: '/keelwright:adopt — accept the edits' },
      ]),
      empty,
    );
    assert.deepEqual(items.map((x) => [x.id, x.kind, x.how]), [
      ['FIX-01', 'edit', 'correct the file to match the project'],
      ['FIX-02', 'answer', 'answer them in the file'],
      ['FIX-03', 'step', '/keelwright:adopt research --refresh'],
      ['FIX-04', 'gap', 'dependency-updates'],
      ['FIX-05', 'command', 'run the install'],
    ]);
  });

  test('a leaked secret comes first; upgrades of one package are one fix, to the highest version', () => {
    const sec = (check, fingerprint, severity, issue, fix) => ({ area: 'security', level: ['critical', 'high'].includes(severity) ? 'fail' : 'warn', issue: `${severity}: ${issue}`, fix, secure: true, check, fingerprint, severity });
    const items = A.plan(
      result([
        { area: 'setup', level: 'fail', issue: 'a path that moved', evidence: 'paths', fix: 'correct the file' },
        sec('dependencies', 'osv:GHSA-1:npm:lodash', 'high', 'lodash 4.17.20: GHSA-1', 'upgrade lodash to 4.17.21 or later'),
        sec('dependencies', 'osv:GHSA-2:npm:lodash', 'medium', 'lodash 4.17.20: GHSA-2', 'upgrade lodash to 4.17.23 or later'),
        sec('secrets', 'secret:aws-access-token:src/a.ts', 'critical', 'possible secret in src/a.ts:3', 'rotate the secret first'),
        sec('rls', 'rls:orders', 'high', 'table public.orders has no row-level security', 'enable it in a new migration'),
      ]),
      empty,
    );
    assert.deepEqual(items.map((x) => x.kind), ['rotate', 'edit', 'upgrade', 'edit']);
    const up = items.find((x) => x.kind === 'upgrade');
    assert.deepEqual(up.keys, ['osv:GHSA-1:npm:lodash', 'osv:GHSA-2:npm:lodash']);
    assert.equal(up.how, 'upgrade lodash to 4.17.23 or later');
    assert.equal(up.severity, 'high');
    assert.match(items.at(-1).how, /never edit a migration that has run/);
  });

  test('declined and accepted fixes are not offered again; deferred ones are', () => {
    const f = { area: 'setup', level: 'warn', issue: 'x', evidence: 'rules', fix: 'y' };
    const key = A.findingKey(f);
    assert.equal(A.plan(result([f]), { decisions: { [key]: { decision: 'declined' } }, secure: {} }).length, 0);
    assert.equal(A.plan(result([f]), { decisions: { [key]: { decision: 'deferred' } }, secure: {} })[0].previously, 'deferred');
    assert.equal(A.plan(result([f]), { decisions: { [key]: { decision: 'declined' } }, secure: {} }, { all: true }).length, 1);
  });
});

describe('audit mode: the CLI on a project', () => {
  const files = {
    'CLAUDE.md': '# App\n',
    'package.json': JSON.stringify({ dependencies: { '@supabase/supabase-js': '2.0.0' } }),
    'supabase/migrations/20260101_init.sql': 'create table public.orders (id int);\n',
    '.gitignore': 'node_modules\n',
  };

  test('plan → a fix that is not done can’t be recorded as applied → fix it → applied', () => {
    const root = project(files);
    const p = cli(root, 'plan', '--json');
    assert.equal(p.status, 0, p.stderr);
    const fixes = JSON.parse(p.stdout).fixes;
    const rls = fixes.find((x) => x.keys.includes('rls:orders'));
    assert.ok(rls, JSON.stringify(fixes.map((x) => x.keys)));
    // The plan names security findings, so it stays out of git.
    assert.equal(readFileSync(join(root, '.keelwright/security/.gitignore'), 'utf8'), '*\n');

    const early = cli(root, 'decide', rls.id, 'applied');
    assert.equal(early.status, 1);
    assert.match(early.stderr, /still finds/);

    write(root, 'supabase/migrations/20260102_rls.sql', 'alter table public.orders enable row level security;\ncreate policy "own" on public.orders for select using (true);\n');
    assert.match(cli(root, 'check', rls.id).stdout, /fixed/);
    const ok = cli(root, 'decide', rls.id, 'applied');
    assert.equal(ok.status, 0, ok.stderr);
    // Security decisions go to the git-ignored record; audit.md only counts them.
    assert.equal(JSON.parse(readFileSync(join(root, A.SECURE_RECORD), 'utf8')).decisions['rls:orders'].decision, 'applied');
    const md = readFileSync(join(root, A.RECORD_MD), 'utf8');
    assert.ok(!md.includes('orders'), md);
    assert.match(md, /Security: 1 applied/);
  });

  test('a declined fix needs a reason, is recorded in audit.md and isn’t offered again', () => {
    const root = project({ ...files, 'supabase/migrations/20260101_init.sql': '' });
    const fixes = JSON.parse(cli(root, 'plan', '--json').stdout).fixes;
    const env = fixes.find((x) => x.keys.includes('hygiene:env-not-ignored'));
    const other = fixes.find((x) => !x.secure);
    assert.ok(env && other, JSON.stringify(fixes.map((x) => x.keys)));
    assert.match(cli(root, 'decide', other.id, 'declined').stderr, /needs a reason/);
    assert.equal(cli(root, 'decide', other.id, 'declined', '--note', 'intentional').status, 0);
    assert.match(readFileSync(join(root, A.RECORD_MD), 'utf8'), /\| declined \| intentional \|/);
    const again = JSON.parse(cli(root, 'plan', '--json').stdout).fixes;
    assert.ok(!again.some((x) => x.keys.includes(other.keys[0])));
  });

  test('a security risk is accepted for at most 90 days, and the doctor then counts it as accepted', () => {
    const root = project({ ...files, 'supabase/migrations/20260101_init.sql': '' });
    const env = JSON.parse(cli(root, 'plan', '--json').stdout).fixes.find((x) => x.keys.includes('hygiene:env-not-ignored'));
    assert.match(cli(root, 'accept', env.id, '--reason', 'x', '--days', '120').stderr, /between 1 and 90/);
    const r = cli(root, 'accept', env.id, '--reason', 'no .env is ever used; config comes from the host', '--days', '30');
    assert.equal(r.status, 0, r.stderr);
    const acc = JSON.parse(readFileSync(join(root, '.keelwright/security-accepted.json'), 'utf8')).accepted;
    assert.equal(acc[0].fingerprint, 'hygiene:env-not-ignored');
    const again = JSON.parse(cli(root, 'plan', '--json').stdout).fixes;
    assert.ok(!again.some((x) => x.keys.includes('hygiene:env-not-ignored')));
    assert.ok(!existsSync(join(root, '.keelwright/security/fixes.json')) || !readFileSync(join(root, A.RECORD_MD), 'utf8').includes('.env'));
  });
});
