// `/adopt` audit mode (spec 7.4): the doctor's findings as fixes, approved one by one. This module
// is mechanical: it turns findings into a fix plan (what kind of fix, how), groups repeats, and
// records each decision so a declined fix isn't offered again. The model drafts each diff; nothing
// here changes the project except the records:
//   .keelwright/audit.json + audit.md          decisions on non-security findings (committed)
//   .keelwright/security/fixes.json            decisions on security findings (git-ignored, 7.7)
//   .keelwright/security-accepted.json         accepted security risks (committed, spec 7.7)

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { AREAS } from './doctor.mjs';
import { ACCEPTED_FILE, MAX_ACCEPT_DAYS, RECORD_DIR, SEVERITIES, compareVersions, loadAccepted } from './security.mjs';

export const RECORD = '.keelwright/audit.json';
export const RECORD_MD = '.keelwright/audit.md';
export const SECURE_RECORD = `${RECORD_DIR}/fixes.json`;
export const DECISIONS = ['applied', 'declined', 'deferred', 'accepted'];

// What each kind of fix means for the command (commands/adopt.md, audit mode).
export const KINDS = {
  edit: 'a change to files, drafted and shown as a diff',
  gap: "a tooling fix, following steps/gaps.md's fix guide for this gap",
  step: 'a KeelWright step to re-run',
  command: 'a command to run in the project',
  upgrade: 'a dependency upgrade, under the version policy (a new major needs an ADR)',
  rotate: 'a leaked secret: the team rotates it first; then remove it or ignore a false positive',
  answer: 'open questions only the team can answer',
};

export function findingKey(f) {
  if (f.fingerprint) return f.fingerprint;
  const h = createHash('sha256').update(`${f.area}\0${f.issue}`).digest('hex').slice(0, 10);
  return `${f.area}:${h}`;
}

// The kind of fix a finding needs, and how. `null` when there is nothing to do (notes).
export function classify(f, { mode = null } = {}) {
  const fix = f.fix ?? '';
  const keelwrightStep = /^\/keelwright:\w+/.test(fix) ? fix.split(/\s+—/)[0] : null;
  switch (f.area) {
    case 'setup':
      if (/^(agents|skills|contributing)$/.test(f.evidence ?? '') && mode) return { kind: 'step', how: `/keelwright:${mode} generate` };
      if (/settings\.local\.json/.test(f.issue)) return { kind: 'gap', how: 'hygiene' };
      return { kind: 'edit', how: fix || 'correct the file to match the project' };
    case 'docs':
      if (/open question/.test(f.issue)) return { kind: 'answer', how: fix || 'answer them in the file' };
      if (keelwrightStep) return { kind: 'step', how: keelwrightStep };
      return { kind: 'edit', how: fix ? `${fix}; an accepted ADR is never edited — a new ADR supersedes it` : 'update the document' };
    case 'stack':
      if (keelwrightStep) return { kind: 'step', how: keelwrightStep };
      return { kind: 'edit', how: fix || 'update the stack pack' };
    case 'tooling':
      if (f.evidence === '.keelwright/gaps.md') return { kind: 'gap', how: 'revisit the declined gap' };
      return { kind: 'gap', how: f.evidence ?? 'gap' };
    case 'security':
      if (f.check === 'dependencies') return { kind: 'upgrade', how: fix };
      if (f.check === 'secrets') return { kind: 'rotate', how: fix };
      if (f.check === 'rls') return { kind: 'edit', how: `${fix} — never edit a migration that has run` };
      if (f.check) return { kind: 'edit', how: fix };
      return null; // checks that didn't run are the doctor's to report, not a fix
    case 'process':
      if (/not installed/.test(f.issue)) return { kind: 'command', how: fix };
      if (/Conventional Commits/.test(f.issue)) return { kind: 'gap', how: 'hooks' };
      return fix ? { kind: 'edit', how: fix } : null;
    default:
      return fix ? { kind: 'edit', how: fix } : null;
  }
}

const LEVEL_ORDER = ['fail', 'warn', 'info'];
const areaIndex = (a) => AREAS.findIndex((x) => x.id === a);
const sevIndex = (s) => (s ? SEVERITIES.indexOf(s) : SEVERITIES.length);

// The fix plan from a doctor result (security findings carry their check and fingerprint). Notes
// are left out unless `all`; so are fixes already declined or accepted. Upgrades of the same
// package are one fix, to the highest fixed version named. A leaked secret comes first: rotating it
// can't wait for the rest.
export function plan(result, record, { mode = result.mode, all = false } = {}) {
  const items = new Map();
  for (const f of result.findings) {
    if (f.level === 'info' && !all) continue;
    const fx = classify(f, { mode });
    if (!fx) continue;
    const key = findingKey(f);
    const decided = (f.secure ? record.secure : record.decisions)[key];
    if (decided && ['declined', 'accepted'].includes(decided.decision) && !all) continue;
    const pkg = fx.kind === 'upgrade' ? /^upgrade (\S+) to (\S+)/.exec(fx.how) : null;
    const group = pkg ? `upgrade:${pkg[1]}` : key;
    const prev = items.get(group);
    if (prev) {
      prev.keys.push(key);
      prev.issues.push(f.issue);
      if (LEVEL_ORDER.indexOf(f.level) < LEVEL_ORDER.indexOf(prev.level)) prev.level = f.level;
      if (sevIndex(f.severity) < sevIndex(prev.severity)) prev.severity = f.severity;
      const to = /^upgrade \S+ to (\S+)/.exec(prev.how)?.[1];
      if (pkg && to && compareVersions(pkg[2], to) > 0) prev.how = fx.how;
      continue;
    }
    items.set(group, {
      id: null,
      keys: [key],
      area: f.area,
      level: f.level,
      ...(f.severity ? { severity: f.severity } : {}),
      kind: fx.kind,
      how: fx.how,
      issues: [f.issue],
      evidence: f.evidence ?? null,
      secure: Boolean(f.secure),
      previously: decided?.decision ?? null,
    });
  }
  const list = [...items.values()].sort((a, b) => (b.kind === 'rotate') - (a.kind === 'rotate') || LEVEL_ORDER.indexOf(a.level) - LEVEL_ORDER.indexOf(b.level) || areaIndex(a.area) - areaIndex(b.area) || sevIndex(a.severity) - sevIndex(b.severity));
  list.forEach((x, i) => {
    x.id = `FIX-${String(i + 1).padStart(2, '0')}`;
  });
  return list;
}

// --- the record --------------------------------------------------------------------------------

const readJson = (root, f, fallback) => {
  try {
    return JSON.parse(readFileSync(join(root, f), 'utf8'));
  } catch {
    return fallback;
  }
};

export function loadRecord(root) {
  return { decisions: readJson(root, RECORD, {}).decisions ?? {}, secure: readJson(root, SECURE_RECORD, {}).decisions ?? {} };
}

export function decide(root, keys, decision, { note = '', issues = {}, secure = false, now = new Date().toISOString() } = {}) {
  if (!DECISIONS.includes(decision) || decision === 'accepted') throw new Error(`decision must be applied, declined or deferred (accept a security risk with \`accept\`)`);
  if (decision === 'declined' && !note.trim()) throw new Error('a declined fix needs a reason (--note)');
  const rec = loadRecord(root);
  const target = secure ? rec.secure : rec.decisions;
  for (const k of keys) target[k] = { decision, at: now.slice(0, 10), ...(note ? { note } : {}), ...(issues[k] ? { issue: issues[k] } : {}) };
  save(root, rec);
  return rec;
}

// Accepting a security risk: an entry in security-accepted.json (the doctor reads it) with an end
// date at most MAX_ACCEPT_DAYS away, and the decision in the git-ignored fixes record.
export function accept(root, fingerprint, { reason, days = MAX_ACCEPT_DAYS, by = null, now = new Date().toISOString() } = {}) {
  if (!reason?.trim()) throw new Error('an accepted risk needs a reason (--reason)');
  if (!(days > 0 && days <= MAX_ACCEPT_DAYS)) throw new Error(`--days must be between 1 and ${MAX_ACCEPT_DAYS}`);
  const today = now.slice(0, 10);
  const until = new Date(Date.parse(today) + days * 86_400_000).toISOString().slice(0, 10);
  const accepted = loadAccepted(root).filter((a) => a.fingerprint !== fingerprint);
  accepted.push({ fingerprint, reason, ...(by ? { by } : {}), acceptedAt: today, until });
  mkdirSync(join(root, '.keelwright'), { recursive: true });
  writeFileSync(join(root, ACCEPTED_FILE), `${JSON.stringify({ accepted }, null, 2)}\n`);
  const rec = loadRecord(root);
  rec.secure[fingerprint] = { decision: 'accepted', at: today, note: reason, until };
  save(root, rec);
  return { fingerprint, until };
}

function save(root, rec) {
  mkdirSync(join(root, '.keelwright'), { recursive: true });
  writeFileSync(join(root, RECORD), `${JSON.stringify({ decisions: rec.decisions }, null, 2)}\n`);
  writeFileSync(join(root, RECORD_MD), render(rec));
  if (Object.keys(rec.secure).length) {
    mkdirSync(join(root, RECORD_DIR), { recursive: true });
    // The folder git-ignores itself, as the security audit's record does.
    if (!existsSync(join(root, RECORD_DIR, '.gitignore'))) writeFileSync(join(root, RECORD_DIR, '.gitignore'), '*\n');
    writeFileSync(join(root, SECURE_RECORD), `${JSON.stringify({ decisions: rec.secure }, null, 2)}\n`);
  }
}

// audit.md: the decisions on non-security findings, so the team sees what was declined and why.
// Security decisions are only counted (spec 7.7: their details stay out of git).
export function render(rec) {
  const L = ['# Audit', '', 'Decisions on the doctor\'s findings in `/adopt` audit mode (spec 7.4). A declined fix is not offered again unless asked for (`audit.mjs plan --all`); the decisions themselves are in `audit.json`.', ''];
  const rows = Object.entries(rec.decisions).sort((a, b) => (b[1].at ?? '').localeCompare(a[1].at ?? ''));
  if (rows.length) {
    L.push('| Date | Finding | Decision | Note |', '|---|---|---|---|');
    for (const [k, d] of rows) L.push(`| ${d.at} | ${(d.issue ?? k).replace(/\|/g, '\\|')} | ${d.decision} | ${(d.note ?? '').replace(/\|/g, '\\|')} |`);
  } else L.push('No decisions yet.');
  const sec = Object.values(rec.secure);
  if (sec.length) {
    const n = (d) => sec.filter((x) => x.decision === d).length;
    L.push('', `Security: ${n('applied')} applied, ${n('accepted')} accepted, ${n('declined')} declined, ${n('deferred')} deferred — details in \`${SECURE_RECORD}\` (not committed).`);
  }
  return `${L.join('\n')}\n`;
}

// Which of the given keys the doctor still finds — the check after a fix is applied.
export function stillFound(result, keys) {
  const found = new Set(result.findings.filter((f) => !/^accepted: /.test(f.issue)).map((f) => findingKey(f)));
  return keys.filter((k) => found.has(k));
}
