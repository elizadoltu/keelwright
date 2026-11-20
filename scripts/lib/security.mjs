// The security audit's mechanical checks (spec 7.7): known vulnerabilities in every locked
// dependency (OSV.dev), secrets in the git history (gitleaks), row-level security in the
// migrations, and Semgrep when it is installed. Read-only except its own record, which goes to
// .keelwright/security/ — a folder that git-ignores itself, because open findings in a committed
// file would disclose the vulnerabilities. Accepted risks live in .keelwright/security-accepted.json
// (committed) and expire.
//
// The network (OSV) and the external tools are injectable, so tests run offline.

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';

export const SEVERITIES = ['critical', 'high', 'medium', 'low'];
export const RECORD_DIR = '.keelwright/security';
export const ACCEPTED_FILE = '.keelwright/security-accepted.json';
export const MAX_ACCEPT_DAYS = 90;
const OSV = 'https://api.osv.dev/v1';
const HISTORY_MAX = 50;

const read = (root, f) => {
  try {
    return readFileSync(join(root, f), 'utf8');
  } catch {
    return null;
  }
};
const json = (root, f) => {
  try {
    return JSON.parse(read(root, f));
  } catch {
    return null;
  }
};

// --- locked packages ---------------------------------------------------------------------------
// Every locked package, direct and transitive, as OSV names them: { ecosystem, name, version, lockfile }.

function npmLock(lock) {
  const out = [];
  if (lock?.packages) {
    for (const [key, v] of Object.entries(lock.packages)) {
      if (!key || v.link || !v.version || !key.includes('node_modules/')) continue;
      out.push({ name: v.name ?? key.slice(key.lastIndexOf('node_modules/') + 13), version: v.version });
    }
  } else {
    // lockfileVersion 1: nested `dependencies`.
    const walk = (deps) => {
      for (const [name, v] of Object.entries(deps ?? {})) {
        if (v.version && !/^(file|link|git)[:+]/.test(v.version)) out.push({ name, version: v.version });
        walk(v.dependencies);
      }
    };
    walk(lock?.dependencies);
  }
  return out;
}

// pnpm v9: `  name@1.2.3:` / `  '@scope/name@1.2.3(peer@1)':`; v6: `  /name@1.2.3:`; v5: `  /name/1.2.3:`.
function pnpmLock(text) {
  const out = [];
  const section = /\npackages:\n([\s\S]*?)(?=\n\S|$)/.exec(`\n${text}`)?.[1] ?? '';
  for (const m of section.matchAll(/^ {2}'?\/?((?:@[^/@\s]+\/)?[^/@\s']+)[@/]([^'():\s]+)/gm)) {
    if (/^\d/.test(m[2])) out.push({ name: m[1], version: m[2] });
  }
  return out;
}

// yarn v1: `"a@^1", a@^1.2:` + `  version "1.2.3"`; berry: `"a@npm:^1":` + `  version: 1.2.3`.
function yarnLock(text) {
  const out = [];
  for (const block of text.split(/\n(?=\S)/)) {
    const head = /^"?((?:@[^/@\s]+\/)?[^@\s"]+)@([^,"\n]*)/.exec(block);
    const version = /\n\s+version:?\s+"?([^"\s]+)/.exec(block)?.[1];
    if (!head || !version || /^(workspace|link|portal|file|patch):/.test(head[2]) || head[1] === '__metadata') continue;
    out.push({ name: head[1], version });
  }
  return out;
}

// bun.lock (JSONC): "packages": { "name": ["name@1.2.3", …] }.
function bunLock(text) {
  try {
    const lock = JSON.parse(text.replace(/,(\s*[}\]])/g, '$1'));
    return Object.values(lock.packages ?? {})
      .map((v) => /^((?:@[^/@]+\/)?[^@]+)@(\d[^\s]*)$/.exec(Array.isArray(v) ? v[0] : ''))
      .filter(Boolean)
      .map((m) => ({ name: m[1], version: m[2] }));
  } catch {
    return [];
  }
}

// [[package]] blocks — uv.lock, poetry.lock, pdm.lock, Cargo.lock. Local packages (the project
// itself, workspace crates) have no registry source and are skipped.
function tomlLock(text, { needsSource }) {
  const out = [];
  for (const block of `\n${text}`.split(/\n\[\[package\]\]\n/).slice(1)) {
    const name = /^name\s*=\s*"([^"]+)"/m.exec(block)?.[1];
    const version = /^version\s*=\s*"([^"]+)"/m.exec(block)?.[1];
    const source = /^source\s*=\s*(.+)$/m.exec(block)?.[1] ?? '';
    if (!name || !version || /editable|virtual|directory|path\s*=/.test(source)) continue;
    if (needsSource && !source) continue;
    out.push({ name, version });
  }
  return out;
}

function pipfileLock(lock) {
  return ['default', 'develop'].flatMap((g) => Object.entries(lock?.[g] ?? {}))
    .map(([name, v]) => ({ name, version: /^==\s*(.+)$/.exec(v.version ?? '')?.[1] }))
    .filter((p) => p.version);
}

// pubspec.lock: packages: <name>: … source: hosted … version: "1.2.3".
function pubspecLock(text) {
  const out = [];
  for (const m of text.matchAll(/\n {2}([\w-]+):\n((?: {4}.*\n?)+)/g)) {
    const version = /\n? {4}version: "([^"]+)"/.exec(m[2])?.[1];
    if (version && / {4}source: hosted/.test(m[2])) out.push({ name: m[1], version });
  }
  return out;
}

const LOCKFILES = [
  ['package-lock.json', 'npm', (t) => npmLock(JSON.parse(t))],
  ['npm-shrinkwrap.json', 'npm', (t) => npmLock(JSON.parse(t))],
  ['pnpm-lock.yaml', 'npm', pnpmLock],
  ['yarn.lock', 'npm', yarnLock],
  ['bun.lock', 'npm', bunLock],
  ['uv.lock', 'PyPI', (t) => tomlLock(t, { needsSource: false })],
  ['poetry.lock', 'PyPI', (t) => tomlLock(t, { needsSource: false })],
  ['pdm.lock', 'PyPI', (t) => tomlLock(t, { needsSource: false })],
  ['Pipfile.lock', 'PyPI', (t) => pipfileLock(JSON.parse(t))],
  ['Cargo.lock', 'crates.io', (t) => tomlLock(t, { needsSource: true })],
  ['pubspec.lock', 'Pub', pubspecLock],
];

export function lockedPackages(root, lockfiles = LOCKFILES.map(([f]) => f)) {
  const seen = new Set();
  const out = [];
  for (const [file, ecosystem, parse] of LOCKFILES) {
    if (!lockfiles.includes(file)) continue;
    const text = read(root, file);
    if (text === null) continue;
    let pkgs = [];
    try {
      pkgs = parse(text);
    } catch {
      continue;
    }
    for (const p of pkgs) {
      const key = `${ecosystem}|${p.name}|${p.version}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ ecosystem, name: p.name, version: p.version, lockfile: file });
    }
  }
  return out;
}

// --- severity ----------------------------------------------------------------------------------

// CVSS 3.x base score from its vector (FIRST's specification, section 7).
export function cvss3(vector) {
  const m = Object.fromEntries(vector.split('/').slice(1).map((p) => p.split(':')));
  const W = {
    AV: { N: 0.85, A: 0.62, L: 0.55, P: 0.2 },
    AC: { L: 0.77, H: 0.44 },
    UI: { N: 0.85, R: 0.62 },
    CIA: { H: 0.56, L: 0.22, N: 0 },
  };
  const changed = m.S === 'C';
  const PR = { N: 0.85, L: changed ? 0.68 : 0.62, H: changed ? 0.5 : 0.27 }[m.PR];
  if ([W.AV[m.AV], W.AC[m.AC], PR, W.UI[m.UI], W.CIA[m.C], W.CIA[m.I], W.CIA[m.A]].some((x) => x === undefined)) return null;
  const iss = 1 - (1 - W.CIA[m.C]) * (1 - W.CIA[m.I]) * (1 - W.CIA[m.A]);
  const impact = changed ? 7.52 * (iss - 0.029) - 3.25 * (iss - 0.02) ** 15 : 6.42 * iss;
  if (impact <= 0) return 0;
  const exploit = 8.22 * W.AV[m.AV] * W.AC[m.AC] * PR * W.UI[m.UI];
  const roundUp = (x) => Math.ceil(Math.round(x * 100000) / 10000) / 10;
  return roundUp(Math.min(changed ? 1.08 * (impact + exploit) : impact + exploit, 10));
}

const fromScore = (s) => (s >= 9 ? 'critical' : s >= 7 ? 'high' : s >= 4 ? 'medium' : 'low');
const WORDS = { CRITICAL: 'critical', HIGH: 'high', MODERATE: 'medium', MEDIUM: 'medium', LOW: 'low' };

export function severityOf(vuln) {
  const word = vuln.database_specific?.severity ?? vuln.affected?.map((a) => a.ecosystem_specific?.severity).find(Boolean);
  if (word && WORDS[String(word).toUpperCase()]) return { severity: WORDS[String(word).toUpperCase()], given: true };
  const v3 = vuln.severity?.find((s) => s.type === 'CVSS_V3')?.score;
  const score = v3 ? cvss3(v3) : null;
  if (score !== null) return { severity: fromScore(score), given: true };
  return { severity: 'medium', given: false };
}

// Dotted numeric comparison, enough to order fixed versions (1.2.6 > 1.2.5 > 0.2.4).
export function compareVersions(a, b) {
  const pa = String(a).split(/[.+-]/).map((x) => Number.parseInt(x, 10));
  const pb = String(b).split(/[.+-]/).map((x) => Number.parseInt(x, 10));
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (Number.isNaN(pa[i]) ? 0 : (pa[i] ?? 0)) - (Number.isNaN(pb[i]) ? 0 : (pb[i] ?? 0));
    if (d) return Math.sign(d);
  }
  return 0;
}

// The fixed versions above the installed one, lowest first (a fix on an older branch doesn't help).
function fixedVersions(vuln, pkg) {
  const fixed = new Set();
  for (const a of vuln.affected ?? []) {
    if (a.package?.ecosystem !== pkg.ecosystem || a.package?.name?.toLowerCase() !== pkg.name.toLowerCase()) continue;
    for (const r of a.ranges ?? []) for (const e of r.events ?? []) if (e.fixed) fixed.add(e.fixed);
  }
  return [...fixed].filter((v) => compareVersions(v, pkg.version) > 0).sort(compareVersions);
}

// --- dependencies: OSV ------------------------------------------------------------------------

async function pool(items, size, fn) {
  const out = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(size, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]);
    }
  }));
  return out;
}

export async function checkDependencies(pkgs, { fetch = globalThis.fetch } = {}) {
  if (!pkgs.length) return { status: 'checked', findings: [], packages: 0 };
  const post = async (path, body) => {
    const res = await fetch(`${OSV}${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    if (!res.ok) throw new Error(`OSV ${path}: HTTP ${res.status}`);
    return res.json();
  };
  const get = async (path) => {
    const res = await fetch(`${OSV}${path}`);
    if (!res.ok) throw new Error(`OSV ${path}: HTTP ${res.status}`);
    return res.json();
  };
  try {
    const hits = []; // [pkg, vulnId]
    for (let i = 0; i < pkgs.length; i += 1000) {
      const chunk = pkgs.slice(i, i + 1000);
      const { results = [] } = await post('/querybatch', { queries: chunk.map((p) => ({ package: { name: p.name, ecosystem: p.ecosystem }, version: p.version })) });
      results.forEach((r, j) => (r.vulns ?? []).forEach((v) => hits.push([chunk[j], v.id])));
    }
    const ids = [...new Set(hits.map(([, id]) => id))];
    const details = Object.fromEntries((await pool(ids, 8, (id) => get(`/vulns/${encodeURIComponent(id)}`))).map((v) => [v.id, v]));
    const findings = [];
    const reported = new Map(); // package key → ids and aliases already reported
    for (const [pkg, id] of hits) {
      const v = details[id];
      if (!v || v.withdrawn) continue;
      const key = `${pkg.ecosystem}|${pkg.name}|${pkg.version}`;
      const known = reported.get(key) ?? new Set();
      if (known.has(id) || (v.aliases ?? []).some((a) => known.has(a))) continue;
      [id, ...(v.aliases ?? [])].forEach((a) => known.add(a));
      reported.set(key, known);
      const { severity, given } = severityOf(v);
      const fixed = fixedVersions(v, pkg);
      findings.push({
        check: 'dependencies',
        fingerprint: `osv:${id}:${pkg.ecosystem}:${pkg.name}`,
        severity,
        issue: `${pkg.name} ${pkg.version} (${pkg.ecosystem}): ${id}${v.summary ? ` — ${v.summary}` : ''}${given ? '' : ' (no severity given; treated as medium)'}`,
        evidence: pkg.lockfile,
        fix: fixed.length ? `upgrade ${pkg.name} to ${fixed[0]} or later` : 'no fixed version yet — check the advisory for a workaround',
        url: `https://osv.dev/vulnerability/${id}`,
      });
    }
    return { status: 'checked', findings, packages: pkgs.length };
  } catch (e) {
    return { status: 'not-checked', reason: `OSV.dev could not be reached (${e.message})`, findings: [], packages: pkgs.length };
  }
}

// --- secrets: gitleaks -------------------------------------------------------------------------

function defaultExec(cmd, args, opts = {}) {
  return execFileSync(cmd, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64 * 1024 * 1024, ...opts });
}

export function checkSecrets(root, { exec = defaultExec } = {}) {
  if (!existsSync(join(root, '.git'))) return { status: 'not-checked', reason: 'not a git repository', findings: [] };
  const dir = mkdtempSync(join(tmpdir(), 'keelwright-gitleaks-'));
  try {
    const report = join(dir, 'report.json');
    const common = ['--no-banner', '--redact', '--exit-code', '0', '--report-format', 'json', '--report-path', report];
    // gitleaks 8.19+ has `git`; older versions only `detect`.
    let ran = false;
    for (const args of [['git', ...common, root], ['detect', '--source', root, ...common]]) {
      try {
        exec('gitleaks', args, { cwd: root });
        ran = true;
        break;
      } catch (e) {
        if (e.code === 'ENOENT') return { status: 'not-checked', reason: 'gitleaks is not installed', findings: [] };
      }
    }
    if (!ran) return { status: 'not-checked', reason: 'gitleaks failed to run', findings: [] };
    const leaks = JSON.parse(readFileSync(report, 'utf8') || '[]');
    // One finding per rule and file: the same secret carried through several commits is one leak.
    const groups = new Map();
    for (const l of leaks) {
      const key = `${l.RuleID}:${l.File}`;
      const g = groups.get(key) ?? { ...l, commits: new Set() };
      if (l.Commit) g.commits.add(l.Commit.slice(0, 7));
      groups.set(key, g);
    }
    const findings = [...groups.entries()].map(([key, l]) => {
      const inTree = existsSync(join(root, l.File));
      const commits = [...l.commits];
      return {
        check: 'secrets',
        fingerprint: `secret:${key}`,
        severity: 'critical',
        issue: `possible secret (${l.RuleID}) in ${l.File}:${l.StartLine}${commits.length ? `, commit${commits.length > 1 ? 's' : ''} ${commits.slice(0, 3).join(', ')}${commits.length > 3 ? ', …' : ''}` : ''}${inTree ? '' : ' — the file is gone, but the secret is still in the history'}`,
        evidence: l.File,
        fix: 'rotate the secret first; then remove it from the code (a test fixture or false positive goes in .gitleaksignore)',
      };
    });
    return { status: 'checked', findings };
  } catch (e) {
    return { status: 'not-checked', reason: `gitleaks output could not be read (${e.message})`, findings: [] };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

// --- data access: row-level security ------------------------------------------------------------

function sqlFiles(root, dir, out = []) {
  const abs = join(root, dir);
  if (!existsSync(abs)) return out;
  for (const name of readdirSync(abs).sort()) {
    const rel = dir ? `${dir}/${name}` : name;
    if (/^(node_modules|\.git|dist|build|\.venv|target)$/.test(name)) continue;
    const st = statSync(join(root, rel));
    if (st.isDirectory()) sqlFiles(root, rel, out);
    else if (name.endsWith('.sql') && /(^|\/)migrations\//.test(rel)) out.push(rel);
  }
  return out;
}

// The database is exposed through an API when it's Supabase (PostgREST) or PostgREST itself.
export function exposedDatabase(root) {
  if (existsSync(join(root, 'supabase'))) return true;
  const pkg = json(root, 'package.json');
  const deps = { ...pkg?.dependencies, ...pkg?.devDependencies };
  if (Object.keys(deps).some((d) => d.startsWith('@supabase/'))) return true;
  return /supabase|postgrest/i.test(read(root, 'pyproject.toml') ?? '') || /supabase_flutter|supabase:/.test(read(root, 'pubspec.yaml') ?? '');
}

const ident = (s) => {
  const parts = s.replace(/"/g, '').toLowerCase().split('.');
  return parts.length === 2 ? { schema: parts[0], table: parts[1] } : { schema: 'public', table: parts[0] };
};
const NAME = '((?:"[^"]+"|[\\w$]+)(?:\\.(?:"[^"]+"|[\\w$]+))?)';

// The tables the SQL migrations leave in the public schema, following them in order.
export function migrationTables(root) {
  const files = sqlFiles(root, '');
  const tables = new Map(); // table → { file, rls, policies }
  for (const f of files) {
    const sql = (read(root, f) ?? '').replace(/--[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
    const events = [
      ...[...sql.matchAll(new RegExp(`create\\s+(?:unlogged\\s+)?table\\s+(?:if\\s+not\\s+exists\\s+)?${NAME}`, 'gi'))].map((m) => ({ at: m.index, kind: 'create', ...ident(m[1]) })),
      ...[...sql.matchAll(new RegExp(`drop\\s+table\\s+(?:if\\s+exists\\s+)?${NAME}`, 'gi'))].map((m) => ({ at: m.index, kind: 'drop', ...ident(m[1]) })),
      ...[...sql.matchAll(new RegExp(`alter\\s+table\\s+(?:if\\s+exists\\s+)?(?:only\\s+)?${NAME}\\s+(enable|disable)\\s+row\\s+level\\s+security`, 'gi'))].map((m) => ({ at: m.index, kind: m[2].toLowerCase(), ...ident(m[1]) })),
      ...[...sql.matchAll(new RegExp(`create\\s+policy\\s+(?:"[^"]+"|\\w+)\\s+on\\s+${NAME}`, 'gi'))].map((m) => ({ at: m.index, kind: 'policy', ...ident(m[1]) })),
    ].sort((a, b) => a.at - b.at);
    for (const e of events) {
      if (e.schema !== 'public') continue;
      if (e.kind === 'create') tables.set(e.table, { file: f, rls: false, policies: 0 });
      else if (e.kind === 'drop') tables.delete(e.table);
      else if (tables.has(e.table)) {
        const t = tables.get(e.table);
        if (e.kind === 'enable') t.rls = true;
        if (e.kind === 'disable') t.rls = false;
        if (e.kind === 'policy') t.policies++;
      }
    }
  }
  return { files, tables };
}

export function checkRls(root) {
  if (!exposedDatabase(root)) return { status: 'skipped', reason: 'the database is not exposed through an API', findings: [] };
  const { files, tables } = migrationTables(root);
  if (!files.length) return { status: 'skipped', reason: 'no SQL migrations', findings: [] };
  const findings = [];
  for (const [table, t] of tables) {
    if (!t.rls) findings.push({ check: 'rls', fingerprint: `rls:${table}`, severity: 'high', issue: `table public.${table} has no row-level security — anyone with the public API key can read and change it`, evidence: t.file, fix: `\`alter table public.${table} enable row level security;\` and add policies, in a new migration` });
    else if (!t.policies) findings.push({ check: 'rls', fingerprint: `rls-policy:${table}`, severity: 'low', issue: `table public.${table} has row-level security but no policy — the API can't reach it at all (fine if only the server uses it)`, evidence: t.file, fix: 'add a policy, or note in the threat model that only the server reads it' });
  }
  return { status: 'checked', findings, tables: tables.size };
}

// --- threat model vs code --------------------------------------------------------------------
// A mitigated risk whose enforcing file is gone isn't mitigated any more; a table the migrations
// added that the threat model never mentions is surface nobody has thought about.

export const THREAT_MODEL = 'docs/security/threat-model.md';

export function checkThreatModel(root) {
  const text = read(root, THREAT_MODEL);
  if (text === null) return { status: 'skipped', reason: 'no threat model', findings: [] };
  const findings = [];
  for (const row of text.split('\n').filter((l) => /^\|\s*SEC-\d{2}\s*\|/.test(l))) {
    const [id, , , where = '', , enforced = '', status = ''] = row.split('|').slice(1, -1).map((c) => c.trim());
    if (!/^mitigated/i.test(status)) continue;
    const missing = [...`${where} ${enforced}`.matchAll(/`([^`\n]+)`/g)]
      .map((m) => m[1].replace(/:\d+(-\d+)?$/, ''))
      .filter((p) => p.includes('/') && !/[*<>{}\s]|^https?:/.test(p) && !existsSync(join(root, p.replace(/\/$/, ''))));
    for (const p of missing) findings.push({ check: 'threat-model', fingerprint: `threat-model:${id}:${p}`, severity: 'medium', issue: `${id} is marked mitigated, but \`${p}\`, which it cites, no longer exists`, evidence: THREAT_MODEL, fix: `check the mitigation still holds; update ${id} (status open if it doesn't)` });
  }
  const { tables } = migrationTables(root);
  const lower = text.toLowerCase();
  for (const [table, t] of tables) {
    if (!new RegExp(`(^|[^\\w])${table.replace(/[$]/g, '\\$')}([^\\w]|$)`).test(lower)) findings.push({ check: 'threat-model', fingerprint: `threat-model:table:${table}`, severity: 'low', issue: `table ${table} (${t.file}) isn't in the threat model`, evidence: t.file, fix: 'the docs-keeper adds it: its data (personal or not), who may read and change it, and a SEC- risk if it adds one' });
  }
  return { status: 'checked', findings, risks: (text.match(/^\|\s*SEC-\d{2}\s*\|/gm) ?? []).length };
}

// --- static analysis: Semgrep (optional) ---------------------------------------------------------

const SEMGREP_LEVEL = { ERROR: 'high', WARNING: 'medium', INFO: 'low' };

export function checkSemgrep(root, { exec = defaultExec } = {}) {
  let out;
  try {
    out = exec('semgrep', ['scan', '--config', 'p/default', '--json', '--quiet', '--metrics=off', root], { cwd: root });
  } catch (e) {
    if (e.code === 'ENOENT') return { status: 'not-installed', reason: 'Semgrep is not installed (optional: `pipx install semgrep` or `brew install semgrep`)', findings: [] };
    if (!e.stdout) return { status: 'not-checked', reason: 'Semgrep failed to run', findings: [] };
    out = e.stdout;
  }
  try {
    const findings = (JSON.parse(out).results ?? []).map((r) => {
      const file = relative(root, join(root, r.path)) || r.path;
      return {
        check: 'semgrep',
        fingerprint: `semgrep:${r.check_id}:${file}`,
        severity: SEMGREP_LEVEL[r.extra?.severity] ?? 'medium',
        issue: `${file}:${r.start?.line}: ${(r.extra?.message ?? r.check_id).split('\n')[0].slice(0, 200)}`,
        evidence: file,
        fix: `see Semgrep rule ${r.check_id}`,
      };
    });
    const unique = [...new Map(findings.map((f) => [`${f.fingerprint}:${f.issue}`, f])).values()];
    return { status: 'checked', findings: unique };
  } catch {
    return { status: 'not-checked', reason: 'Semgrep output could not be read', findings: [] };
  }
}

// --- safety nets -------------------------------------------------------------------------------
// The security gaps the doctor's tooling area doesn't already report (secret scanning, committed
// .env files and dependency updates are there): .env files git would pick up, and CI actions that
// aren't pinned to a commit SHA (a moved tag runs someone else's code with the CI's secrets).

export function checkHygiene(root, { exec = defaultExec } = {}) {
  const findings = [];
  if (existsSync(join(root, '.git'))) {
    let ignored = true;
    try {
      exec('git', ['check-ignore', '-q', '--no-index', '.env'], { cwd: root });
    } catch (e) {
      ignored = e.code === 'ENOENT';
    }
    if (!ignored) findings.push({ check: 'hygiene', fingerprint: 'hygiene:env-not-ignored', severity: 'medium', issue: '`.env` is not git-ignored — a local secrets file would be committed with `git add -A`', evidence: '.gitignore', fix: 'add `.env` and `.env.*` (with `!.env.example`) to .gitignore' });
  }
  const wf = join(root, '.github/workflows');
  if (existsSync(wf)) {
    const unpinned = new Set();
    for (const name of readdirSync(wf).filter((n) => /\.ya?ml$/.test(n))) {
      for (const m of (read(root, `.github/workflows/${name}`) ?? '').matchAll(/^\s*-?\s*uses:\s*['"]?([^'"\s#]+)/gm)) {
        const ref = m[1];
        if (ref.startsWith('./') || ref.startsWith('docker://')) continue;
        if (!/@[0-9a-f]{40}$/.test(ref)) unpinned.add(`${ref} (${name})`);
      }
    }
    if (unpinned.size) findings.push({ check: 'hygiene', fingerprint: 'hygiene:unpinned-actions', severity: 'low', issue: `${unpinned.size} CI action${unpinned.size > 1 ? 's' : ''} not pinned to a commit SHA: ${[...unpinned].slice(0, 5).join(', ')}${unpinned.size > 5 ? ', …' : ''}`, evidence: '.github/workflows', fix: 'pin each to its full commit SHA with the version in a comment; Dependabot keeps them current' });
  }
  return { status: 'checked', findings };
}

// --- accepted risks -----------------------------------------------------------------------------

export function loadAccepted(root) {
  const data = json(root, ACCEPTED_FILE);
  return Array.isArray(data?.accepted) ? data.accepted : [];
}

// An acceptance needs a reason and an expiry at most 90 days after it was accepted; past its expiry
// the finding is open again.
export function applyAccepted(findings, accepted, now) {
  const today = now.slice(0, 10);
  const notes = [];
  const valid = new Map();
  for (const a of accepted) {
    const limit = a.acceptedAt ? new Date(Date.parse(a.acceptedAt) + MAX_ACCEPT_DAYS * 86_400_000).toISOString().slice(0, 10) : null;
    if (!a.fingerprint || !a.reason || !a.until) notes.push(`${ACCEPTED_FILE}: an entry without fingerprint, reason or until is ignored`);
    else if (limit && a.until > limit) notes.push(`${ACCEPTED_FILE}: ${a.fingerprint} is accepted until ${a.until}, more than ${MAX_ACCEPT_DAYS} days — counted until ${limit}`);
    if (!a.fingerprint || !a.reason || !a.until) continue;
    const until = limit && a.until > limit ? limit : a.until;
    if (until < today) notes.push(`${a.fingerprint}: the acceptance expired on ${until} — open again`);
    else valid.set(a.fingerprint, { ...a, until });
  }
  const out = findings.map((f) => (valid.has(f.fingerprint) ? { ...f, status: 'accepted', accepted: valid.get(f.fingerprint) } : { ...f, status: 'open' }));
  return { findings: out, notes };
}

// --- the audit ----------------------------------------------------------------------------------

export const CHECKS = [
  { id: 'dependencies', title: 'Known vulnerabilities' },
  { id: 'secrets', title: 'Secrets' },
  { id: 'rls', title: 'Data access (row-level security)' },
  { id: 'hygiene', title: 'Safety nets' },
  { id: 'threat-model', title: 'Threat model vs code' },
  { id: 'semgrep', title: 'Static analysis (Semgrep, optional)' },
  { id: 'deep', title: 'Judgement review (--deep, optional)' },
];

// The last deep review's findings (scripts/lib/deep.mjs writes them), carried by every later audit
// until they are fixed or accepted. A finding whose file is gone is dropped: the code it cited
// changed, and the next --deep run looks again.
export const DEEP_FILE = `${RECORD_DIR}/deep.json`;
export function checkDeep(root) {
  const deep = json(root, DEEP_FILE);
  if (!deep) return { status: 'skipped', reason: 'no deep review yet (`--deep`, costs money)', findings: [] };
  const findings = (deep.findings ?? [])
    .filter((f) => existsSync(join(root, f.file)))
    .map((f) => ({
      check: 'deep',
      fingerprint: f.fingerprint,
      severity: f.severity,
      issue: `${f.category}: ${f.title} — ${f.file}:${f.line} (deep review ${String(deep.at).slice(0, 10)})`,
      evidence: f.file,
      fix: f.fix,
    }));
  const reviewed = (deep.areas ?? []).filter((a) => a.status === 'reviewed').length;
  return { status: 'checked', reason: `${String(deep.at).slice(0, 10)}: ${reviewed} of ${(deep.areas ?? []).length} areas reviewed, $${deep.cost}`, findings, at: deep.at };
}

export async function audit(root, { now = new Date().toISOString(), offline = false, fetch = globalThis.fetch, exec = defaultExec, lockfiles } = {}) {
  const pkgs = lockedPackages(root, lockfiles);
  const offlineResult = { status: 'not-checked', reason: 'offline (--offline)', findings: [] };
  const checks = {
    dependencies: offline ? { ...offlineResult, packages: pkgs.length } : await checkDependencies(pkgs, { fetch }),
    secrets: checkSecrets(root, { exec }),
    rls: checkRls(root),
    hygiene: checkHygiene(root, { exec }),
    'threat-model': checkThreatModel(root),
    semgrep: offline ? offlineResult : checkSemgrep(root, { exec }),
    deep: checkDeep(root),
  };
  const { findings, notes } = applyAccepted(Object.values(checks).flatMap((c) => c.findings), loadAccepted(root), now);
  findings.sort((a, b) => (a.status === 'open' ? 0 : 1) - (b.status === 'open' ? 0 : 1) || SEVERITIES.indexOf(a.severity) - SEVERITIES.indexOf(b.severity));
  const open = findings.filter((f) => f.status === 'open');
  const counts = Object.fromEntries(SEVERITIES.map((s) => [s, open.filter((f) => f.severity === s).length]));
  counts.accepted = findings.length - open.length;
  for (const c of Object.values(checks)) delete c.findings;
  return { at: now, checks, counts, findings, notes };
}

// pass / warn / fail, as the doctor area (spec 7.7): fail on an open critical or high finding (a
// leaked secret is critical); warn on medium or low, or a check that couldn't run (Semgrep not
// installed is a note — it is optional).
export function areaStatus(result) {
  if (result.counts.critical || result.counts.high) return 'fail';
  if (result.counts.medium || result.counts.low) return 'warn';
  if (Object.entries(result.checks).some(([id, c]) => c.status === 'not-checked' && !['semgrep', 'deep'].includes(id))) return 'warn';
  return 'pass';
}

// --- the record ---------------------------------------------------------------------------------

export function loadHistory(root) {
  return json(root, `${RECORD_DIR}/audit.json`)?.history ?? [];
}

const STATUS = { checked: 'checked', 'not-checked': 'NOT CHECKED', skipped: 'skipped', 'not-installed': 'not installed' };

export function render(result, history) {
  const c = result.counts;
  const L = [
    '# Security audit',
    '',
    `Checked ${result.at.slice(0, 10)} · open: ${c.critical} critical, ${c.high} high, ${c.medium} medium, ${c.low} low · ${c.accepted} accepted. Mechanical checks only (spec 7.7).`,
    '',
    '> **Not committed.** This folder ignores itself: open findings in a committed file would disclose them. `.keelwright/doctor.md` keeps the counts. This is not a penetration test and doesn\'t cover the deployed infrastructure.',
    '',
    '| Check | Status | Notes |',
    '|---|---|---|',
  ];
  for (const { id, title } of CHECKS) {
    const k = result.checks[id];
    const extra = id === 'dependencies' && k.packages != null ? `${k.packages} locked packages` : id === 'rls' && k.tables != null ? `${k.tables} tables` : id === 'threat-model' && k.risks != null ? `${k.risks} risks` : '';
    L.push(`| ${title} | ${STATUS[k.status] ?? k.status} | ${[k.reason, extra].filter(Boolean).join('; ') || '—'} |`);
  }
  const open = result.findings.filter((f) => f.status === 'open');
  if (open.length) {
    L.push('', '## Open findings', '', '| Severity | Finding | Fix | Fingerprint |', '|---|---|---|---|');
    for (const f of open) L.push(`| ${f.severity} | ${f.issue.replace(/\|/g, '\\|')}${f.url ? ` ([advisory](${f.url}))` : ''} | ${f.fix.replace(/\|/g, '\\|')} | \`${f.fingerprint}\` |`);
  }
  const accepted = result.findings.filter((f) => f.status === 'accepted');
  if (accepted.length) {
    L.push('', '## Accepted', '', '| Finding | Reason | By | Until |', '|---|---|---|---|');
    for (const f of accepted) L.push(`| ${f.issue.replace(/\|/g, '\\|')} | ${f.accepted.reason} | ${f.accepted.by ?? '—'} | ${f.accepted.until} |`);
  }
  if (result.notes.length) L.push('', '## Notes', '', ...result.notes.map((n) => `- ${n}`));
  L.push('', `To accept a finding, add it to \`${ACCEPTED_FILE}\` (committed): \`{ "accepted": [{ "fingerprint": "…", "reason": "…", "by": "…", "acceptedAt": "YYYY-MM-DD", "until": "YYYY-MM-DD" }] }\` — at most ${MAX_ACCEPT_DAYS} days.`);
  if (history.length > 1) {
    L.push('', '## History', '', '| Date | Critical | High | Medium | Low | Accepted |', '|---|---|---|---|---|---|');
    for (const h of history.slice(-10).reverse()) L.push(`| ${h.at.slice(0, 16).replace('T', ' ')} | ${h.counts.critical} | ${h.counts.high} | ${h.counts.medium} | ${h.counts.low} | ${h.counts.accepted} |`);
  }
  return `${L.join('\n')}\n`;
}

export function record(root, result) {
  const history = [...loadHistory(root), { at: result.at, counts: result.counts }].slice(-HISTORY_MAX);
  const dir = join(root, RECORD_DIR);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, '.gitignore'), '# Written by the KeelWright security audit (spec 7.7). Open findings stay out of git.\n*\n');
  writeFileSync(join(dir, 'audit.json'), `${JSON.stringify({ history, last: result }, null, 2)}\n`);
  writeFileSync(join(dir, 'audit.md'), render(result, history));
  return history;
}
