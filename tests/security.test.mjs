import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { after, describe, test } from 'node:test';
import { diagnose, render as renderDoctor } from '../scripts/lib/doctor.mjs';
import * as Sec from '../scripts/lib/security.mjs';

const NOW = '2026-11-20T10:00:00.000Z';
const dirs = [];
after(() => dirs.forEach((d) => rmSync(d, { recursive: true, force: true })));

const write = (root, f, text) => {
  mkdirSync(dirname(join(root, f)), { recursive: true });
  writeFileSync(join(root, f), text);
};
const git = (root, ...args) => execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@example.invalid', ...args], { cwd: root, stdio: 'pipe', encoding: 'utf8' });

function project(files = {}, { commit = true } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'keelwright-security-'));
  dirs.push(root);
  const all = { '.gitignore': 'node_modules\n.env\n.env.*\n', 'CLAUDE.md': '# App\n', ...files };
  for (const [f, text] of Object.entries(all)) write(root, f, text);
  git(root, 'init', '-q', '-b', 'main');
  if (commit) {
    git(root, 'add', '-A');
    git(root, 'commit', '-qm', 'feat: start');
  }
  return root;
}

// A fake OSV.dev: `vulns` maps "ecosystem|name|version" to the vulnerabilities it has.
function fakeOsv(vulns, { fail = false } = {}) {
  const calls = [];
  const fetch = async (url, init) => {
    calls.push(url);
    if (fail) throw new Error('getaddrinfo ENOTFOUND api.osv.dev');
    const ok = (body) => ({ ok: true, json: async () => body });
    if (url.endsWith('/querybatch')) {
      const { queries } = JSON.parse(init.body);
      return ok({ results: queries.map((q) => ({ vulns: (vulns[`${q.package.ecosystem}|${q.package.name}|${q.version}`] ?? []).map((v) => ({ id: v.id })) })) });
    }
    const id = decodeURIComponent(url.split('/vulns/')[1]);
    return ok(Object.values(vulns).flat().find((v) => v.id === id));
  };
  return { fetch, calls };
}
const noTools = (cmd) => {
  if (cmd === 'git') return '';
  throw Object.assign(new Error('not found'), { code: 'ENOENT' });
};

describe('locked packages', () => {
  test('npm, pnpm, yarn (v1 and berry), bun', () => {
    const root = project({
      'package-lock.json': JSON.stringify({ lockfileVersion: 3, packages: { '': { name: 'app' }, 'node_modules/lodash': { version: '4.17.20' }, 'node_modules/a/node_modules/@scope/b': { version: '1.0.0' }, 'node_modules/local': { link: true } } }),
      'pnpm-lock.yaml': "lockfileVersion: '9.0'\n\nimporters:\n\n  .:\n    dependencies:\n      x:\n        specifier: ^1\n        version: 1.0.0\n\npackages:\n\n  '@babel/core@7.26.0':\n    resolution: {integrity: sha512-x}\n\n  react-dom@19.0.0(react@19.0.0):\n    resolution: {integrity: sha512-y}\n\nsnapshots:\n\n  zzz@1.0.0: {}\n",
      'yarn.lock': '# yarn lockfile v1\n\n"minimist@^1.2.0", minimist@^1.2.5:\n  version "1.2.5"\n  resolved "https://x"\n\n"@types/node@npm:^22":\n  version: 22.1.0\n\n"app@workspace:.":\n  version: 0.0.0-use.local\n',
      'bun.lock': '{\n  "lockfileVersion": 1,\n  "packages": {\n    "ms": ["ms@2.1.3", "", {}, "sha512-x"],\n  },\n}\n',
    });
    const got = Sec.lockedPackages(root).map((p) => `${p.ecosystem}|${p.name}|${p.version}`);
    for (const want of ['npm|lodash|4.17.20', 'npm|@scope/b|1.0.0', 'npm|@babel/core|7.26.0', 'npm|react-dom|19.0.0', 'npm|minimist|1.2.5', 'npm|@types/node|22.1.0', 'npm|ms|2.1.3']) assert.ok(got.includes(want), `${want} in ${got}`);
    assert.ok(!got.some((g) => /local|zzz|\|app\|/.test(g)), got.join(', '));
  });

  test('Python, Rust and Dart lockfiles; local packages skipped', () => {
    const root = project({
      'uv.lock': 'version = 1\n\n[[package]]\nname = "app"\nversion = "0.1.0"\nsource = { editable = "." }\n\n[[package]]\nname = "jinja2"\nversion = "3.1.2"\nsource = { registry = "https://pypi.org/simple" }\n',
      'Pipfile.lock': JSON.stringify({ default: { requests: { version: '==2.31.0' } }, develop: {} }),
      'Cargo.lock': 'version = 3\n\n[[package]]\nname = "mycli"\nversion = "0.1.0"\n\n[[package]]\nname = "time"\nversion = "0.1.44"\nsource = "registry+https://github.com/rust-lang/crates.io-index"\n',
      'pubspec.lock': 'packages:\n  http:\n    dependency: "direct main"\n    description:\n      name: http\n    source: hosted\n    version: "0.13.0"\n  mylocal:\n    dependency: "direct main"\n    source: path\n    version: "1.0.0"\n',
    });
    const got = Sec.lockedPackages(root).map((p) => `${p.ecosystem}|${p.name}|${p.version}`);
    assert.deepEqual(got.sort(), ['PyPI|jinja2|3.1.2', 'PyPI|requests|2.31.0', 'Pub|http|0.13.0', 'crates.io|time|0.1.44'].sort());
  });

  test('a lockfile that starts with its first [[package]] block keeps it', () => {
    const root = project({ 'poetry.lock': '[[package]]\nname = "jinja2"\nversion = "2.10"\n' });
    assert.deepEqual(Sec.lockedPackages(root).map((p) => p.name), ['jinja2']);
  });
});

describe('severity', () => {
  test('CVSS 3.1 base scores', () => {
    assert.equal(Sec.cvss3('CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H'), 9.8);
    assert.equal(Sec.cvss3('CVSS:3.1/AV:N/AC:L/PR:N/UI:R/S:C/C:L/I:L/A:N'), 6.1);
    assert.equal(Sec.cvss3('CVSS:3.1/AV:L/AC:L/PR:L/UI:N/S:U/C:H/I:N/A:N'), 5.5);
    assert.equal(Sec.cvss3('CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:N/I:N/A:N'), 0);
  });

  test('the advisory\'s own word wins; then CVSS; otherwise medium, marked as not given', () => {
    assert.deepEqual(Sec.severityOf({ database_specific: { severity: 'MODERATE' } }), { severity: 'medium', given: true });
    assert.deepEqual(Sec.severityOf({ severity: [{ type: 'CVSS_V3', score: 'CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H' }] }), { severity: 'critical', given: true });
    assert.deepEqual(Sec.severityOf({}), { severity: 'medium', given: false });
  });
});

describe('known vulnerabilities (OSV.dev)', () => {
  const lodash = { ecosystem: 'npm', name: 'lodash', version: '4.17.20', lockfile: 'package-lock.json' };
  const ghsa = { id: 'GHSA-35jh-r3h4-6jhm', aliases: ['CVE-2021-23337'], summary: 'Command injection in lodash', database_specific: { severity: 'HIGH' }, affected: [{ package: { ecosystem: 'npm', name: 'lodash' }, ranges: [{ type: 'SEMVER', events: [{ introduced: '0' }, { fixed: '4.17.21' }] }] }] };
  const alias = { id: 'CVE-2021-23337', aliases: ['GHSA-35jh-r3h4-6jhm'], affected: [] };

  test('one finding per vulnerability (aliases merged), with severity and the fixed version', async () => {
    const osv = fakeOsv({ 'npm|lodash|4.17.20': [ghsa, alias] });
    const r = await Sec.checkDependencies([lodash, { ecosystem: 'npm', name: 'ms', version: '2.1.3', lockfile: 'package-lock.json' }], { fetch: osv.fetch });
    assert.equal(r.status, 'checked');
    assert.equal(r.findings.length, 1);
    const f = r.findings[0];
    assert.equal(f.severity, 'high');
    assert.match(f.issue, /lodash 4\.17\.20 \(npm\): GHSA-35jh-r3h4-6jhm — Command injection/);
    assert.equal(f.fix, 'upgrade lodash to 4.17.21 or later');
    assert.equal(f.fingerprint, 'osv:GHSA-35jh-r3h4-6jhm:npm:lodash');
  });

  test('the fix names the lowest fixed version above the installed one', async () => {
    const v = { id: 'GHSA-m', database_specific: { severity: 'CRITICAL' }, affected: [{ package: { ecosystem: 'npm', name: 'minimist' }, ranges: [{ events: [{ introduced: '0' }, { fixed: '0.2.4' }, { introduced: '1.0.0' }, { fixed: '1.2.6' }] }] }] };
    const r = await Sec.checkDependencies([{ ecosystem: 'npm', name: 'minimist', version: '1.2.5', lockfile: 'package-lock.json' }], { fetch: fakeOsv({ 'npm|minimist|1.2.5': [v] }).fetch });
    assert.equal(r.findings[0].fix, 'upgrade minimist to 1.2.6 or later');
    assert.equal(Sec.compareVersions('1.10.0', '1.9.9'), 1);
  });

  test('offline is "not checked", never a pass', async () => {
    const r = await Sec.checkDependencies([lodash], { fetch: fakeOsv({}, { fail: true }).fetch });
    assert.equal(r.status, 'not-checked');
    assert.match(r.reason, /OSV\.dev could not be reached/);
  });
});

describe('secrets (gitleaks)', () => {
  test('a leak in the history, reported redacted; a missing gitleaks is "not checked"', () => {
    const root = project();
    const exec = (cmd, args) => {
      const report = args[args.indexOf('--report-path') + 1];
      assert.ok(args.includes('--redact'), 'gitleaks always runs with --redact');
      writeFileSync(report, JSON.stringify([{ RuleID: 'aws-access-token', File: 'config/old.js', StartLine: 3, Commit: 'abc1234def5678' }, { RuleID: 'aws-access-token', File: 'config/old.js', StartLine: 3, Commit: 'fed9876aaa' }]));
      return '';
    };
    const r = Sec.checkSecrets(root, { exec });
    assert.equal(r.findings[0].severity, 'critical');
    assert.equal(r.findings.length, 1, 'one secret carried through two commits is one finding');
    assert.equal(r.findings[0].fingerprint, 'secret:aws-access-token:config/old.js');
    assert.match(r.findings[0].issue, /aws-access-token\) in config\/old\.js:3, commits abc1234, fed9876 — the file is gone, but the secret is still in the history/);
    assert.equal(Sec.checkSecrets(root, { exec: noTools }).status, 'not-checked');
  });

  const hasGitleaks = spawnSync('gitleaks', ['version']).status === 0;
  test('with the real gitleaks: a key removed in a later commit is still found', { skip: !hasGitleaks && 'gitleaks not installed' }, () => {
    const root = project({ 'src/app.js': 'export const x = 1;\n' });
    write(root, 'src/keys.js', 'const key = "AKIA' + 'YDR4ZQ7XKPN3W2TF";\nconst secret = "Bx9mQ2' + 'vL7kR4tN8pW3sJ6hF1dG5cZ0aY2eU9iO";\n');
    git(root, 'add', '-A');
    git(root, 'commit', '-qm', 'feat: keys');
    git(root, 'rm', '-q', 'src/keys.js');
    git(root, 'commit', '-qm', 'fix: drop keys');
    const r = Sec.checkSecrets(root);
    assert.equal(r.status, 'checked');
    assert.ok(r.findings.some((f) => f.evidence === 'src/keys.js' && /still in the history/.test(f.issue)), JSON.stringify(r.findings));
    assert.ok(!JSON.stringify(r.findings).includes('YDR4ZQ7XKPN3W2TF'), 'the secret itself is never in the output');
  });
});

describe('row-level security', () => {
  test('only when the database is exposed through an API', () => {
    const root = project({ 'db/migrations/001.sql': 'create table notes (id int);\n' });
    assert.equal(Sec.checkRls(root).status, 'skipped');
  });

  test('tables without RLS are high; RLS without a policy is low; later migrations count', () => {
    const root = project({
      'package.json': JSON.stringify({ dependencies: { '@supabase/supabase-js': '2.0.0' } }),
      'supabase/migrations/20260101_init.sql': [
        'create table public.profiles (id uuid primary key); -- personal data',
        'alter table public.profiles enable row level security;',
        'create policy "own profile" on public.profiles for select using (auth.uid() = id);',
        'create table if not exists "orders" (id int);',
        'create table audit_log (id int);',
        'alter table only audit_log enable row level security;',
        'create table private.secrets (id int);',
        'create table tmp (id int);',
      ].join('\n'),
      'supabase/migrations/20260201_more.sql': '/* tidy up */\ndrop table tmp;\n',
    });
    const r = Sec.checkRls(root);
    assert.equal(r.tables, 3, "profiles, orders, audit_log — tmp was dropped, private.* is not exposed");
    assert.deepEqual(r.findings.map((f) => [f.fingerprint, f.severity]), [['rls:orders', 'high'], ['rls-policy:audit_log', 'low']]);
    assert.equal(r.findings[0].evidence, 'supabase/migrations/20260101_init.sql');
  });
});

describe('safety nets', () => {
  test('.env not ignored, and CI actions not pinned to a SHA', () => {
    const root = project({
      '.gitignore': 'node_modules\n',
      '.github/workflows/ci.yml': 'jobs:\n  t:\n    steps:\n      - uses: actions/checkout@v4\n      - uses: actions/setup-node@1d0ff469b7ec7b3cb9d8673fde0c81c44821de2a # v4\n      - uses: ./.github/actions/local\n',
    });
    const r = Sec.checkHygiene(root);
    assert.deepEqual(r.findings.map((f) => f.fingerprint), ['hygiene:env-not-ignored', 'hygiene:unpinned-actions']);
    assert.match(r.findings[1].issue, /1 CI action not pinned.*actions\/checkout@v4 \(ci\.yml\)/);
    assert.deepEqual(Sec.checkHygiene(project()).findings, []);
  });
});

describe('accepted risks', () => {
  const f = { fingerprint: 'osv:X:npm:a', severity: 'high', issue: 'a' };
  test('accepted until a date, at most 90 days, then open again', () => {
    const ok = Sec.applyAccepted([f], [{ fingerprint: f.fingerprint, reason: 'not reachable', by: 'Eliza', acceptedAt: '2026-11-01', until: '2026-12-31' }], NOW);
    assert.equal(ok.findings[0].status, 'accepted');
    const long = Sec.applyAccepted([f], [{ fingerprint: f.fingerprint, reason: 'r', acceptedAt: '2026-01-01', until: '2027-12-31' }], NOW);
    assert.equal(long.findings[0].status, 'open');
    assert.ok(long.notes.some((n) => /more than 90 days — counted until 2026-04-01/.test(n)));
    assert.ok(long.notes.some((n) => /expired on 2026-04-01 — open again/.test(n)));
    assert.equal(Sec.applyAccepted([f], [{ fingerprint: f.fingerprint }], NOW).findings[0].status, 'open');
  });
});

describe('the audit and the doctor', () => {
  function vulnerable() {
    return project({
      'package.json': JSON.stringify({ dependencies: { lodash: '4.17.20', '@supabase/supabase-js': '2.0.0' } }),
      'package-lock.json': JSON.stringify({ lockfileVersion: 3, packages: { 'node_modules/lodash': { version: '4.17.20' } } }),
      'supabase/migrations/001_init.sql': 'create table orders (id int);\n',
    });
  }
  const osv = () => fakeOsv({ 'npm|lodash|4.17.20': [{ id: 'GHSA-1', summary: 'Prototype pollution', database_specific: { severity: 'MODERATE' }, affected: [] }] });

  test('fail on high; the record git-ignores itself; doctor.md has only the counts', async () => {
    const root = vulnerable();
    const result = await Sec.audit(root, { now: NOW, fetch: osv().fetch, exec: noTools });
    assert.deepEqual(result.counts, { critical: 0, high: 1, medium: 1, low: 0, accepted: 0 });
    assert.equal(Sec.areaStatus(result), 'fail');
    Sec.record(root, result);
    assert.match(readFileSync(join(root, '.keelwright/security/audit.md'), 'utf8'), /table public\.orders has no row-level security/);
    assert.equal(git(root, 'status', '--porcelain', '--untracked-files=all').trim(), '', 'nothing in .keelwright/security/ shows up for git');

    const doctor = diagnose(root, { now: NOW, security: result });
    assert.equal(doctor.areas.security, 'fail');
    const md = renderDoctor(doctor, [doctor]);
    assert.match(md, /\| Application security \| FAIL \|/);
    assert.match(md, /Open: 0 critical, 1 high, 1 medium, 0 low · 0 accepted/);
    assert.doesNotMatch(md, /orders|lodash|GHSA-1/, 'no finding details in the committed doctor.md');
  });

  test('accepting a finding moves it out of the counts', async () => {
    const root = vulnerable();
    write(root, Sec.ACCEPTED_FILE, JSON.stringify({ accepted: [{ fingerprint: 'rls:orders', reason: 'only the server role reads it; anon key not shipped', by: 'Eliza', acceptedAt: '2026-11-20', until: '2027-01-31' }] }));
    const result = await Sec.audit(root, { now: NOW, fetch: osv().fetch, exec: noTools });
    assert.equal(result.counts.high, 0);
    assert.equal(result.counts.accepted, 1);
    assert.equal(Sec.areaStatus(result), 'warn');
  });

  test('offline: dependencies not checked is a warning; Semgrep missing is only a note', async () => {
    const root = project();
    const off = await Sec.audit(root, { now: NOW, offline: true, exec: noTools });
    assert.equal(off.checks.dependencies.status, 'not-checked');
    assert.equal(Sec.areaStatus(off), 'warn');
    const on = await Sec.audit(root, { now: NOW, fetch: osv().fetch, exec: noTools });
    assert.equal(on.checks.semgrep.status, 'not-installed');
    assert.equal(on.checks.secrets.status, 'not-checked');
    const doctor = diagnose(root, { now: NOW, security: on });
    assert.ok(doctor.findings.some((x) => x.area === 'security' && x.level === 'info' && /Semgrep is not installed/.test(x.issue)));
    assert.ok(doctor.findings.some((x) => x.area === 'security' && x.level === 'warn' && /secrets not checked: gitleaks is not installed/.test(x.issue)));
  });

  test('`doctor security` runs only that area', async () => {
    const root = vulnerable();
    const result = await Sec.audit(root, { now: NOW, fetch: osv().fetch, exec: noTools });
    const d = diagnose(root, { now: NOW, security: result, only: 'security' });
    assert.equal(d.areas.setup, 'skipped');
    assert.equal(d.skipped.setup, 'not run (only security)');
    assert.ok(d.findings.every((x) => x.area === 'security'));
  });
});
