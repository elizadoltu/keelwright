// Run metrics (spec 8.2), kept in <project>/.keelwright/metrics.json. Recorded by the state CLI
// at every transition, so steps don't have to remember to do it. Nothing leaves the project.

import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { stepNames, stepsOf } from './pipeline.mjs';

export const METRICS_FILE = 'metrics.json';
export const SNAPSHOT_DIR = 'snapshots';
export const RATINGS = ['as-is', 'small-edits', 'rewritten', 'deleted'];
const SKIP = new Set(['.git', 'node_modules', '.keelwright']);

const metricsPath = (root) => join(root, '.keelwright', METRICS_FILE);
const snapshotRoot = (root, step) => join(root, '.keelwright', SNAPSHOT_DIR, step);

export function loadMetrics(root) {
  const p = metricsPath(root);
  if (existsSync(p)) return JSON.parse(readFileSync(p, 'utf8'));
  return { steps: {}, events: [], ratings: {} };
}

export function saveMetrics(root, metrics) {
  mkdirSync(join(root, '.keelwright'), { recursive: true });
  writeFileSync(metricsPath(root), `${JSON.stringify(metrics, null, 2)}\n`);
}

const stepMetrics = (m, step) => (m.steps[step] ??= { runs: 0, counters: {} });
const ms = (from, to) => (from && to ? Date.parse(to) - Date.parse(from) : null);
const event = (m, at, type, step, detail = {}) => m.events.push({ at, type, step, ...detail });

// ---------------------------------------------------------------------------
// Transitions (called by the CLI after the state change succeeded)
// ---------------------------------------------------------------------------

export function recordStart(m, step, { now, rerun, stale }) {
  const s = stepMetrics(m, step);
  s.runs += 1;
  s.startedAt = now;
  event(m, now, rerun ? 'rerun' : 'start', step, stale.length ? { stale } : {});
}

// Snapshot the outputs of a gated step so the edits made during review can be measured.
export function recordComplete(m, root, step, entry, { now, markers }) {
  const s = stepMetrics(m, step);
  const files = Object.keys(entry.outputs ?? {});
  s.completedAt = now;
  if (startedLate(root, files, s.startedAt)) {
    // The work happened before `STATE start`, so the step's time wasn't measured.
    s.startedLate = true;
    s.durationMs = null;
  } else {
    delete s.startedLate;
    s.durationMs = ms(s.startedAt, now);
  }
  if (entry.status === 'awaiting_review') {
    rmSync(snapshotRoot(root, step), { recursive: true, force: true });
    for (const f of files) {
      const dest = join(snapshotRoot(root, step), f);
      mkdirSync(dirname(dest), { recursive: true });
      cpSync(join(root, f), dest, { recursive: true, filter: (src) => !SKIP.has(src.split(/[\\/]/).pop()) });
    }
    s.gate = { awaitingAt: now, markersAtReview: markers };
  }
  event(m, now, 'complete', step, { status: entry.status, outputs: files.length });
}

export function recordSkip(m, step, { now, reason }) {
  stepMetrics(m, step).skipped = reason;
  event(m, now, 'skip', step, { reason });
}

// Compare what each step generated with what the user approved, then drop the snapshots.
export function recordApprove(m, root, gate, steps, { now, markersByStep, outputsByStep }) {
  for (const step of steps) {
    const s = stepMetrics(m, step);
    const g = (s.gate ??= {});
    g.approvedAt = now;
    g.reviewMs = ms(g.awaitingAt, now);
    g.markersAtApproval = markersByStep[step] ?? 0;
    g.edits = {};
    for (const out of outputsByStep[step] ?? []) {
      for (const file of listFiles(join(root, out), out)) {
        g.edits[file] = diffFile(join(snapshotRoot(root, step), file), join(root, file));
      }
      // Files the user deleted during review.
      for (const file of listFiles(join(snapshotRoot(root, step), out), out)) {
        if (!(file in g.edits)) g.edits[file] = diffFile(join(snapshotRoot(root, step), file), join(root, file));
      }
    }
    rmSync(snapshotRoot(root, step), { recursive: true, force: true });
  }
  event(m, now, 'approve', null, { gate, steps });
}

export function recordAcceptChanges(m, { now, accepted, stale, keepDownstream }) {
  for (const step of accepted) {
    const s = stepMetrics(m, step);
    s.editedAfterApproval = (s.editedAfterApproval ?? 0) + 1;
  }
  event(m, now, 'accept-changes', null, { accepted, stale, keepDownstream });
}

// Step-specific counters: "5" sets the value, "+1" adds to it.
export function recordCounter(m, step, key, value, mode = 'kickoff') {
  if (!stepNames(mode).includes(step)) throw new Error(`unknown step "${step}" (steps: ${stepNames(mode).join(', ')})`);
  if (!/^[a-z][a-z0-9-]*$/.test(key)) throw new Error(`invalid metric name "${key}" (lowercase, digits, dashes)`);
  const m2 = /^(\+)?(\d+)$/.exec(String(value));
  if (!m2) throw new Error(`metric value must be a number or +number, got "${value}"`);
  const s = stepMetrics(m, step);
  s.counters[key] = m2[1] ? (s.counters[key] ?? 0) + Number(m2[2]) : Number(m2[2]);
  return s.counters[key];
}

export function recordRating(m, file, rating, { now }) {
  if (!RATINGS.includes(rating)) throw new Error(`rating must be one of: ${RATINGS.join(', ')}`);
  m.ratings[file] = { rating, at: now };
}

// ---------------------------------------------------------------------------
// Line diff
// ---------------------------------------------------------------------------

function listFiles(abs, rel) {
  if (!existsSync(abs)) return [];
  if (!statSync(abs).isDirectory()) return [rel];
  return readdirSync(abs)
    .filter((n) => !SKIP.has(n))
    .sort()
    .flatMap((n) => listFiles(join(abs, n), `${rel}/${n}`));
}

// True when every output was last written before the step was started: the step did its work
// first and called `STATE start` only afterwards.
export function startedLate(root, outputs, startedAt) {
  if (!startedAt || !outputs.length) return false;
  const start = Date.parse(startedAt);
  const times = outputs.flatMap((o) => listFiles(join(root, o), o)).map((f) => statSync(join(root, f)).mtimeMs);
  return times.length > 0 && times.every((t) => t < start);
}

const readLines = (p) => (existsSync(p) ? readFileSync(p, 'utf8').split('\n') : null);

// Longest common subsequence of lines; above the size cap, fall back to a multiset comparison.
export function lcsLength(a, b) {
  if (a.length * b.length > 4_000_000) {
    const counts = new Map();
    for (const l of a) counts.set(l, (counts.get(l) ?? 0) + 1);
    let common = 0;
    for (const l of b) {
      const c = counts.get(l);
      if (c) {
        common++;
        counts.set(l, c - 1);
      }
    }
    return common;
  }
  let prev = new Uint32Array(b.length + 1);
  let cur = new Uint32Array(b.length + 1);
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      cur[j] = a[i - 1] === b[j - 1] ? prev[j - 1] + 1 : Math.max(prev[j], cur[j - 1]);
    }
    [prev, cur] = [cur, prev];
    cur.fill(0);
  }
  return prev[b.length];
}

export function diffLines(before, after) {
  const common = lcsLength(before, after);
  const removed = before.length - common;
  const added = after.length - common;
  const changed = before.length ? Math.round((Math.max(removed, added) / before.length) * 100) / 100 : added ? 1 : 0;
  return { lines: before.length, added, removed, changed };
}

// The approval itself sets `status:` in the front matter (draft → approved, proposed → accepted);
// that isn't a user edit, so the line is left out of the comparison.
export function withoutStatus(lines) {
  if (lines === null || lines[0] !== '---') return lines;
  const end = lines.indexOf('---', 1);
  if (end === -1) return lines;
  return lines.filter((l, i) => !(i > 0 && i < end && /^status:/.test(l)));
}

function diffFile(snapshot, current) {
  const before = withoutStatus(readLines(snapshot));
  const after = withoutStatus(readLines(current));
  if (before === null && after === null) return { lines: 0, added: 0, removed: 0, changed: 0 };
  if (after === null) return { lines: before.length, added: 0, removed: before.length, changed: 1, deleted: true };
  if (before === null) return { lines: 0, added: after.length, removed: 0, changed: 1, created: true };
  return diffLines(before, after);
}

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

const minutes = (msValue) => (msValue == null ? '—' : `${Math.max(1, Math.round(msValue / 60000))} min`);
const pct = (x) => `${Math.round(x * 100)}%`;

export function report(m, state) {
  const lines = ['# KeelWright run report', ''];
  const mode = state.mode ?? 'kickoff';
  lines.push(`- Mode: /${mode}`);
  lines.push(`- Project type: ${state.projectType ?? '—'}`);
  lines.push(`- KeelWright: ${state.keelwright}`);
  lines.push(`- Started: ${state.createdAt}`);
  lines.push('');
  lines.push('## Steps', '', '| Step | Status | Runs | Time | Review time | Open questions (review → approval) | Edited after approval | Counters |', '|---|---|---|---|---|---|---|---|');
  for (const { name } of stepsOf(mode)) {
    const s = m.steps[name];
    const st = state.steps[name].status;
    if (!s && st === 'pending') continue;
    const g = s?.gate;
    const q = g?.markersAtReview != null ? `${g.markersAtReview} → ${g.markersAtApproval ?? '…'}` : '—';
    const counters = Object.entries(s?.counters ?? {}).map(([k, v]) => `${k}: ${v}`).join(', ') || '—';
    lines.push(`| ${name} | ${st} | ${s?.runs ?? 0} | ${s?.startedLate ? 'not measured' : minutes(s?.durationMs)} | ${minutes(g?.reviewMs)} | ${q} | ${s?.editedAfterApproval ?? 0} | ${counters} |`);
  }

  const edits = Object.entries(m.steps).flatMap(([step, s]) => Object.entries(s.gate?.edits ?? {}).map(([file, e]) => ({ step, file, ...e })));
  if (edits.length) {
    lines.push('', '## Edits at review gates', '', 'How much of each generated document the user changed before approving it.', '');
    lines.push('| Document | Step | Lines | Added | Removed | Changed | Rating |', '|---|---|---|---|---|---|---|');
    for (const e of edits) {
      const note = e.deleted ? ' (deleted)' : e.created ? ' (created)' : '';
      lines.push(`| ${e.file}${note} | ${e.step} | ${e.lines} | ${e.added} | ${e.removed} | ${pct(e.changed)} | ${m.ratings[e.file]?.rating ?? '—'} |`);
    }
    const total = edits.reduce((acc, e) => acc + e.lines, 0);
    const changed = edits.reduce((acc, e) => acc + Math.max(e.added, e.removed), 0);
    lines.push('', `Overall: ${total ? pct(changed / total) : '0%'} of generated lines changed at review.`);
  }

  const rated = Object.entries(m.ratings);
  if (rated.length) {
    const counts = Object.fromEntries(RATINGS.map((r) => [r, rated.filter(([, v]) => v.rating === r).length]));
    lines.push('', '## Ratings', '', RATINGS.map((r) => `- ${r}: ${counts[r]}`).join('\n'));
  }
  return `${lines.join('\n')}\n`;
}
