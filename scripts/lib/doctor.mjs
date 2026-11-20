// The doctor (spec 7.0): how healthy a project is now, area by area. Mechanical checks only —
// no model calls — built on the existing checkers. Read-only except its own record
// (.keelwright/doctor.json and .keelwright/doctor.md). The application-security area (7.7) comes
// from scripts/lib/security.mjs, which the CLI runs first (it needs the network for OSV.dev) and
// passes in; its details never go into doctor.md, only the counts.

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { analyse } from './analyse.mjs';
import { crossCheck } from './crosscheck.mjs';
import { citedPaths } from './doccheck.mjs';
import { checkGenerated } from './generatecheck.mjs';
import { MAX_AGE_DAYS, parsePack, resolvedMajor } from './packs.mjs';
import { areaStatus as securityStatus } from './security.mjs';
import * as S from './state.mjs';

export const AREAS = [
  { id: 'setup', title: 'Claude setup' },
  { id: 'docs', title: 'Docs vs code' },
  { id: 'stack', title: 'Stack' },
  { id: 'tooling', title: 'Tooling and security' },
  { id: 'security', title: 'Application security' },
  { id: 'process', title: 'Process' },
  { id: 'delivery', title: 'Delivery' },
];
const LEVELS = ['fail', 'warn', 'info'];
const HISTORY_MAX = 50;
const COMMITS = 50;
const MARKER = '[NEEDS CLARIFICATION';

const read = (root, f) => {
  try {
    return readFileSync(join(root, f), 'utf8');
  } catch {
    return null;
  }
};

function mdFiles(root, dir) {
  const abs = join(root, dir);
  if (!existsSync(abs)) return [];
  const out = [];
  for (const name of readdirSync(abs)) {
    const rel = `${dir}/${name}`;
    if (statSync(join(root, rel)).isDirectory()) out.push(...mdFiles(root, rel));
    else if (name.endsWith('.md')) out.push(rel);
  }
  return out;
}

function gitLines(root, args) {
  try {
    return execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).split('\n').filter(Boolean);
  } catch {
    return null;
  }
}

// --- setup -----------------------------------------------------------------------------------

// generatecheck areas: what is drift in any Claude setup, and what only KeelWright's own setup has
// (a hand-made setup without a reviewer agent isn't unhealthy).
const SETUP_LEVEL = { commands: 'fail', paths: 'fail', settings: 'fail', placeholders: 'warn', 'claude-md': 'warn', rules: 'warn', agents: 'warn', skills: 'warn', contributing: 'warn' };
const KEELWRIGHT_ONLY = new Set(['agents', 'skills', 'contributing']);

function checkSetup(root, ctx, add) {
  if (!existsSync(join(root, 'CLAUDE.md')) && !existsSync(join(root, '.claude'))) {
    add('fail', 'no Claude setup (no CLAUDE.md or .claude/)', { fix: ctx.state ? `/keelwright:${ctx.mode} generate` : '/keelwright:adopt' });
    return;
  }
  for (const { area, issue } of checkGenerated(root)) {
    if (!ctx.state && (KEELWRIGHT_ONLY.has(area) || /mention the [\w-]+ agent|say where ADRs live|no rules in|stack-pack review rule|no PreToolUse guard|config\.json —|^no \.claude\/settings\.json$/.test(issue))) continue;
    let level = SETUP_LEVEL[area] ?? 'warn';
    if (area === 'settings' && /settings\.local\.json|PreToolUse guard|config\.json —/.test(issue)) level = 'warn';
    const fix = area === 'commands' || area === 'paths' ? 'correct the file to match the project' : ctx.state ? `/keelwright:${ctx.mode} generate` : null;
    add(level, issue, { evidence: area, fix });
  }
}

// A cited path that doesn't exist only means drift if it once did (or sits under a real top-level
// folder); a path written relative to a workspace (`api/`) never existed at the root.
function existedOnce(root, p) {
  const hist = gitLines(root, ['log', '-1', '--format=%h', '--', p.replace(/\/$/, '')]);
  if (hist !== null) return hist.length > 0;
  return existsSync(join(root, p.split('/')[0]));
}

// --- docs ------------------------------------------------------------------------------------

function checkDocs(root, ctx, add) {
  if (!existsSync(join(root, 'docs'))) return;
  for (const { issue } of crossCheck(root, ['docs']).issues) add('warn', issue, { evidence: 'refs' });

  // Files the overview and ADRs cite must still exist: a missing one means the code moved on.
  const adrDir = ctx.facts?.docs.adrDirs[0]?.dir?.replace(/\/$/, '') ?? 'docs/decisions';
  const described = [...mdFiles(root, adrDir), ...['docs/architecture/overview.md'].filter((f) => existsSync(join(root, f)))];
  for (const f of described) {
    const text = read(root, f) ?? '';
    const missing = [...new Set(citedPaths(text).filter((p) => p.includes('/') && !/^https?:|^\/|[*<>{}$…]/.test(p)))].filter((p) => !existsSync(join(root, p.replace(/\/$/, ''))) && existedOnce(root, p));
    for (const p of missing) add('warn', `${f} cites \`${p}\`, which no longer exists`, { fix: 'update the document, or record a new ADR if the decision changed' });
  }

  // Open questions anywhere in the documents.
  for (const f of [...mdFiles(root, 'docs'), '.keelwright/analysis.md'].filter((x) => existsSync(join(root, x)))) {
    const n = (read(root, f) ?? '').split(MARKER).length - 1;
    if (n) add('warn', `${f}: ${n} open question${n > 1 ? 's' : ''} ([NEEDS CLARIFICATION])`, { fix: 'answer them in the file' });
  }

  // Reviewed documents edited since approval: fine, but the steps after them don't know yet.
  // (Code and setup files from scaffold, gaps and generate change with the project; not listed.)
  if (ctx.state) {
    const edited = S.changes(ctx.state, root).changed.filter((c) => ctx.state.steps[c.step].status === 'approved').map((c) => c.file);
    if (edited.length) add('info', `${edited.length} reviewed document${edited.length > 1 ? 's' : ''} edited since approval: ${edited.join(', ')}`, { fix: `/keelwright:${ctx.mode} — accept the edits, or regenerate what depends on them` });
  }
}

// --- stack -----------------------------------------------------------------------------------

function checkStack(root, ctx, add, now) {
  const dir = join(root, '.keelwright/stack-packs');
  const versions = Object.fromEntries((ctx.facts?.dependencies ?? []).filter((d) => d.locked).map((d) => [d.name, d.locked]));
  if (existsSync(dir)) {
    for (const name of readdirSync(dir).filter((n) => n.endsWith('.md'))) {
      const pack = parsePack(readFileSync(join(dir, name), 'utf8'), name);
      const { id, major, researchedAt } = pack.meta;
      if (!id) continue;
      const fix = `/keelwright:${ctx.mode ?? 'adopt'} research --refresh`;
      const used = resolvedMajor(pack, versions);
      if (pack.meta.packages?.length && Object.keys(versions).length && used === null && !/^(git-hooks|pre-commit|vercel|railway|netlify|github-actions)$/.test(id)) {
        add('info', `stack pack ${id} is installed, but the project no longer uses ${pack.meta.packages[0]}`, { fix });
      } else if (used !== null && major != null && Number(major) !== used) {
        add('warn', `stack pack ${id} was researched for ${id} ${major}, but the project uses ${used}`, { fix });
      }
      const age = researchedAt ? Math.floor((Date.parse(now) - Date.parse(researchedAt)) / 86_400_000) : null;
      if (age !== null && age > MAX_AGE_DAYS) add('info', `stack pack ${id} was researched ${age} days ago (refreshed after ${MAX_AGE_DAYS})`, { fix });
    }
  }
  // End of life and majors behind, as recorded by the gaps step (no network here).
  for (const row of gapRows(root).filter((r) => /^recorded/.test(r.decision))) add('info', `${row.id} ${row.gap} — recorded ${row.note ? `(${row.note})` : ''}`.trim(), { evidence: '.keelwright/gaps.md' });
}

// --- tooling ---------------------------------------------------------------------------------

function gapRows(root) {
  const text = read(root, '.keelwright/gaps.md');
  if (!text) return [];
  return text
    .split('\n')
    .filter((l) => /^\|\s*[A-Z]+-\d+\s*\|/.test(l))
    .map((l) => l.split('|').slice(1, -1).map((c) => c.trim()))
    .map(([id, gap, decision, , note]) => ({ id, gap, decision: (decision ?? '').toLowerCase(), note: (note ?? '').replace(/\s+/g, ' ').slice(0, 160) }));
}

function checkTooling(root, ctx, add) {
  const fix = ctx.mode === 'adopt' ? '/keelwright:adopt gaps' : null;
  for (const g of ctx.facts?.gaps ?? []) add(['secrets', 'env-committed'].includes(g.id) ? 'fail' : 'warn', g.issue, { evidence: g.id, fix });
  for (const row of gapRows(root).filter((r) => r.decision.startsWith('declined'))) add('info', `${row.id} ${row.gap} was declined${row.note ? `: ${row.note}` : ''}`, { evidence: '.keelwright/gaps.md', fix: 'still the right call?' });
}

// --- process ---------------------------------------------------------------------------------

const CONVENTIONAL = /^(\w+)(\([^)]*\))?!?: \S/;

function checkProcess(root, ctx, add) {
  if (gitLines(root, ['rev-parse', '--git-dir']) === null) return false;
  // A repository with no commits: the hooks, gitleaks and CI have never run on anything (found in
  // the skier-portfolio run: a whole site built and reviewed, nothing ever committed).
  if (gitLines(root, ['rev-parse', '--verify', '-q', 'HEAD']) === null) {
    const pending = gitLines(root, ['status', '--porcelain', '--untracked-files=normal'])?.length ?? 0;
    add('warn', `no commits yet${pending ? ` — ${pending} files and folders never committed` : ''}: the git hooks, secret scanning and CI have never run`, { fix: 'commit the work in reviewable steps (`chore: scaffold project`, then one commit per story); the hooks check each one' });
  }
  const subjects = gitLines(root, ['log', `-${COMMITS}`, '--no-merges', '--format=%s']) ?? [];
  const conventionFiles = ['CONTRIBUTING.md', 'CLAUDE.md', 'commitlint.config.js', 'commitlint.config.mjs', 'commitlint.config.cjs', '.commitlintrc.json'].map((f) => read(root, f) ?? '').join('\n');
  if (subjects.length && /Conventional Commits|config-conventional/i.test(conventionFiles)) {
    const off = subjects.filter((s) => !CONVENTIONAL.test(s));
    const share = off.length / subjects.length;
    if (share > 0.1) add('warn', `${off.length} of the last ${subjects.length} commits don't follow Conventional Commits (e.g. "${off[0].slice(0, 60)}")`, { fix: 'a commit-msg hook (commitlint) enforces it' });
  }
  // Hooks the repository defines but this clone hasn't installed.
  const hooksPath = gitLines(root, ['config', '--get', 'core.hooksPath'])?.[0] ?? null;
  if (existsSync(join(root, '.husky')) && !(hooksPath ?? '').startsWith('.husky')) add('warn', 'Husky hooks are not installed in this clone (core.hooksPath isn\'t set)', { fix: 'run the install (its `prepare` script sets them up)' });
  if (existsSync(join(root, '.pre-commit-config.yaml')) && !hooksPath && !existsSync(join(root, '.git/hooks/pre-commit'))) add('warn', 'pre-commit hooks are not installed in this clone', { fix: '`pre-commit install`' });
  return true;
}

// ---------------------------------------------------------------------------------------------

// The security audit's findings as doctor findings: critical and high fail, medium and low warn,
// accepted ones are a note. `secure` keeps their details out of doctor.md.
function addSecurity(security, add) {
  for (const f of security.findings) {
    const level = f.status === 'accepted' ? 'info' : ['critical', 'high'].includes(f.severity) ? 'fail' : 'warn';
    add(level, `${f.status === 'accepted' ? 'accepted: ' : ''}${f.severity}: ${f.issue}`, { evidence: f.evidence, fix: f.fix, secure: true, check: f.check, fingerprint: f.fingerprint, severity: f.severity });
  }
  for (const [id, c] of Object.entries(security.checks)) {
    if (c.status === 'not-checked') add(id === 'semgrep' ? 'info' : 'warn', `${id} not checked: ${c.reason}`, { fix: id === 'dependencies' ? 'run the doctor online' : null });
    if (c.status === 'not-installed') add('info', c.reason);
  }
  for (const n of security.notes) add('info', n);
}

export function diagnose(root, { now = new Date().toISOString(), pluginRoot = null, security = null, only = null } = {}) {
  const state = S.exists(root) ? S.load(root) : null;
  const ctx = { state, mode: state ? S.modeOf(state) : null, facts: null };
  try {
    ctx.facts = analyse(root, { pluginRoot });
  } catch {
    // an unreadable project: the areas that need the facts say less
  }
  const findings = [];
  const skipped = {};
  const adder = (area) => (level, issue, extra = {}) => findings.push({ area, level, issue, ...extra });
  const run = (id) => !only || only === id;
  if (run('setup')) checkSetup(root, ctx, adder('setup'));
  if (run('docs')) checkDocs(root, ctx, adder('docs'));
  if (run('stack')) checkStack(root, ctx, adder('stack'), now);
  if (run('tooling')) checkTooling(root, ctx, adder('tooling'));
  if (run('security')) {
    if (security) addSecurity(security, adder('security'));
    else skipped.security = 'not run';
  }
  if (run('process') && !checkProcess(root, ctx, adder('process'))) skipped.process = 'not a git repository';
  skipped.delivery = 'not checked yet';
  for (const { id } of AREAS) if (!run(id)) skipped[id] = `not run (only ${only})`;

  const areas = {};
  for (const { id } of AREAS) {
    const own = findings.filter((f) => f.area === id);
    areas[id] = skipped[id] ? 'skipped' : id === 'security' ? securityStatus(security) : own.some((f) => f.level === 'fail') ? 'fail' : own.some((f) => f.level === 'warn') ? 'warn' : 'pass';
  }
  findings.sort((a, b) => AREAS.findIndex((x) => x.id === a.area) - AREAS.findIndex((x) => x.id === b.area) || LEVELS.indexOf(a.level) - LEVELS.indexOf(b.level));
  const counts = Object.fromEntries(LEVELS.map((l) => [l, findings.filter((f) => f.level === l).length]));
  return { at: now, mode: ctx.mode, keelwright: Boolean(state), areas, skipped, counts, findings, ...(security ? { security: security.counts } : {}) };
}

// --- the record ------------------------------------------------------------------------------

export function loadHistory(root) {
  try {
    return JSON.parse(readFileSync(join(root, '.keelwright/doctor.json'), 'utf8')).history ?? [];
  } catch {
    return [];
  }
}

const ICON = { pass: 'pass', warn: 'warn', fail: 'FAIL', skipped: '—' };

export function render(result, history) {
  const lines = ['# Doctor', '', `Checked ${result.at.slice(0, 10)} · ${result.counts.fail} to fix, ${result.counts.warn} to look at, ${result.counts.info} notes. Mechanical checks only (spec 7.0).`, ''];
  lines.push('| Area | Status | Findings |', '|---|---|---|');
  for (const { id, title } of AREAS) {
    const n = result.findings.filter((f) => f.area === id && f.level !== 'info').length;
    lines.push(`| ${title} | ${ICON[result.areas[id]]} | ${result.skipped[id] ?? n} |`);
  }
  for (const { id, title } of AREAS) {
    const own = result.findings.filter((f) => f.area === id);
    if (!own.length) continue;
    lines.push('', `## ${title}`, '');
    if (id === 'security' && result.security) {
      const c = result.security;
      lines.push(`Open: ${c.critical} critical, ${c.high} high, ${c.medium} medium, ${c.low} low · ${c.accepted} accepted. The findings are in \`.keelwright/security/audit.md\`, which isn't committed (spec 7.7).`);
    }
    for (const f of own.filter((x) => !x.secure)) lines.push(`- **${f.level}** ${f.issue}${f.fix ? ` → ${f.fix}` : ''}`);
  }
  if (history.length > 1) {
    lines.push('', '## History', '', `| Date | ${AREAS.map((a) => a.title).join(' | ')} | To fix | To look at |`, `|---|${AREAS.map(() => '---|').join('')}---|---|`);
    for (const h of history.slice(-10).reverse()) lines.push(`| ${h.at.slice(0, 16).replace('T', ' ')} | ${AREAS.map((a) => ICON[h.areas[a.id]] ?? '—').join(' | ')} | ${h.counts.fail} | ${h.counts.warn} |`);
  }
  return `${lines.join('\n')}\n`;
}

export function record(root, result) {
  const history = [...loadHistory(root), { at: result.at, areas: result.areas, counts: result.counts }].slice(-HISTORY_MAX);
  mkdirSync(join(root, '.keelwright'), { recursive: true });
  writeFileSync(join(root, '.keelwright/doctor.json'), `${JSON.stringify({ history }, null, 2)}\n`);
  writeFileSync(join(root, '.keelwright/doctor.md'), render(result, history));
  return history;
}
