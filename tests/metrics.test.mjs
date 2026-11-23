import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { create } from '../scripts/lib/state.mjs';
import { diffLines, lcsLength, recordCounter, recordRating, report, withoutStatus } from '../scripts/lib/metrics.mjs';

const CLI = fileURLToPath(new URL('../scripts/state.mjs', import.meta.url));
const roots = [];
after(() => roots.forEach((r) => rmSync(r, { recursive: true, force: true })));

function project() {
  const root = mkdtempSync(join(tmpdir(), 'keelwright-metrics-'));
  roots.push(root);
  return root;
}
const write = (root, file, content) => {
  mkdirSync(join(root, file, '..'), { recursive: true });
  writeFileSync(join(root, file), content);
};
const cli = (root, ...args) => execFileSync('node', [CLI, ...args, '--root', root], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
const metrics = (root) => JSON.parse(readFileSync(join(root, '.keelwright/metrics.json'), 'utf8'));

describe('line diff', () => {
  test('lcs of lines', () => {
    assert.equal(lcsLength(['a', 'b', 'c', 'd'], ['a', 'c', 'd', 'e']), 3);
    assert.equal(lcsLength([], ['a']), 0);
  });

  test('unchanged, edited and rewritten files', () => {
    assert.deepEqual(diffLines(['a', 'b'], ['a', 'b']), { lines: 2, added: 0, removed: 0, changed: 0 });
    assert.deepEqual(diffLines(['a', 'b', 'c', 'd'], ['a', 'B', 'c', 'd']), { lines: 4, added: 1, removed: 1, changed: 0.25 });
    assert.deepEqual(diffLines(['a', 'b'], ['x', 'y', 'z']), { lines: 2, added: 3, removed: 2, changed: 1.5 });
  });
});

describe('status lines set on approval', () => {
  test('front-matter status is left out of the comparison, body lines are kept', () => {
    assert.deepEqual(withoutStatus(['---', 'status: draft', 'date: x', '---', 'status: in body']), ['---', 'date: x', '---', 'status: in body']);
    assert.deepEqual(withoutStatus(['# No front matter', 'status: x']), ['# No front matter', 'status: x']);
    assert.equal(withoutStatus(null), null);
  });
});

describe('counters and ratings', () => {
  test('counters can be set and incremented', () => {
    const m = { steps: {}, events: [], ratings: {} };
    assert.equal(recordCounter(m, 'interview', 'questions', '4'), 4);
    assert.equal(recordCounter(m, 'interview', 'questions', '+2'), 6);
    assert.throws(() => recordCounter(m, 'deploy', 'x', '1'), /unknown step/);
    assert.throws(() => recordCounter(m, 'prd', 'Bad Name', '1'), /invalid metric name/);
    assert.throws(() => recordCounter(m, 'prd', 'x', 'many'), /must be a number/);
  });

  test('ratings are validated', () => {
    const m = { steps: {}, events: [], ratings: {} };
    recordRating(m, 'docs/prd.md', 'small-edits', { now: 'now' });
    assert.equal(m.ratings['docs/prd.md'].rating, 'small-edits');
    assert.throws(() => recordRating(m, 'docs/prd.md', 'great', { now: 'now' }), /rating must be one of/);
  });
});

describe('recorded through the state CLI', () => {
  test('a gated step: runs, markers, edits at review, snapshots cleaned up', () => {
    const root = project();
    cli(root, 'init');
    cli(root, 'start', 'interview');
    write(root, '.keelwright/interview.md', 'notes');
    cli(root, 'complete', 'interview', '.keelwright/interview.md');
    cli(root, 'start', 'brief');
    cli(root, 'skip', 'brief', '--reason', 'not a client project');
    cli(root, 'metric', 'interview', 'questions', '5');

    cli(root, 'start', 'prd');
    write(root, 'docs/prd.md', ['# PRD', 'line 2', 'line 3', '[NEEDS CLARIFICATION: owner]'].join('\n'));
    write(root, 'docs/decisions/0002-x.md', 'adr');
    cli(root, 'complete', 'prd', 'docs/prd.md', 'docs/decisions/0002-x.md');
    assert.ok(existsSync(join(root, '.keelwright/snapshots/prd/docs/prd.md')));

    // The user edits during review: answers the question and rewrites one line.
    write(root, 'docs/prd.md', ['# PRD', 'line 2 changed', 'line 3', 'Owner: Ana'].join('\n'));
    cli(root, 'approve', '1');

    const m = metrics(root);
    assert.equal(m.steps.interview.runs, 1);
    assert.equal(m.steps.interview.counters.questions, 5);
    assert.equal(m.steps.prd.gate.markersAtReview, 1);
    assert.equal(m.steps.prd.gate.markersAtApproval, 0);
    assert.deepEqual(m.steps.prd.gate.edits['docs/prd.md'], { lines: 4, added: 2, removed: 2, changed: 0.5 });
    assert.deepEqual(m.steps.prd.gate.edits['docs/decisions/0002-x.md'], { lines: 1, added: 0, removed: 0, changed: 0 });
    assert.equal(existsSync(join(root, '.keelwright/snapshots/prd')), false);

    cli(root, 'rate', 'docs/prd.md', 'small-edits');
    const report = cli(root, 'report', '--write');
    assert.match(report, /\| prd \| approved \| 1 \|/);
    assert.match(report, /\| docs\/prd.md \| prd \| 4 \| 2 \| 2 \| 50% \| small-edits \|/);
    assert.match(report, /questions: 5/);
    assert.ok(existsSync(join(root, '.keelwright/report.md')));
  });

  test('re-runs and edits after approval are counted', () => {
    const root = project();
    cli(root, 'init');
    cli(root, 'start', 'interview');
    write(root, 'a.md', '1');
    cli(root, 'complete', 'interview', 'a.md');
    write(root, 'a.md', '2');
    cli(root, 'accept-changes');
    cli(root, 'start', 'interview');
    const m = metrics(root);
    assert.equal(m.steps.interview.runs, 2);
    assert.equal(m.steps.interview.editedAfterApproval, 1);
    assert.deepEqual(m.events.map((e) => e.type), ['start', 'complete', 'accept-changes', 'rerun']);
  });

  test('approving a document only changes its status: no edits are counted', () => {
    const root = project();
    cli(root, 'init');
    cli(root, 'start', 'interview');
    write(root, '.keelwright/interview.md', 'x');
    cli(root, 'complete', 'interview', '.keelwright/interview.md');
    cli(root, 'start', 'brief');
    cli(root, 'skip', 'brief', '--reason', 'not a client project');
    cli(root, 'start', 'prd');
    write(root, 'docs/prd.md', '---\nstatus: draft\n---\n\n# PRD\n');
    cli(root, 'complete', 'prd', 'docs/prd.md');
    write(root, 'docs/prd.md', '---\nstatus: approved\n---\n\n# PRD\n');
    cli(root, 'approve', '1');
    assert.deepEqual(metrics(root).steps.prd.gate.edits['docs/prd.md'], { lines: 5, added: 0, removed: 0, changed: 0 });
  });

  test('a step started after its work is flagged and its time is not measured', () => {
    const root = project();
    cli(root, 'init');
    write(root, '.keelwright/interview.md', 'x');
    const past = new Date(Date.now() - 60_000);
    utimesSync(join(root, '.keelwright/interview.md'), past, past);
    cli(root, 'start', 'interview');
    const r = spawnSync('node', [CLI, 'complete', 'interview', '.keelwright/interview.md', '--root', root], { encoding: 'utf8' });
    assert.equal(r.status, 0);
    assert.match(r.stderr, /written before `start interview`/);
    const s = metrics(root).steps.interview;
    assert.equal(s.startedLate, true);
    assert.equal(s.durationMs, null);
    assert.match(cli(root, 'report'), /\| interview \| done \| 1 \| not measured \|/);
  });

  test('a step time under 10 s from an older run is shown as not measured', () => {
    const state = create({ version: 't', now: '2026-01-01T00:00:00.000Z' });
    state.steps.interview.status = 'done';
    state.steps.prd.status = 'done';
    const m = { steps: { interview: { runs: 1, durationMs: 24, counters: {} }, prd: { runs: 1, durationMs: 180_000, counters: {} } }, ratings: {} };
    const text = report(m, state);
    assert.match(text, /\| interview \| done \| 1 \| not measured \|/);
    assert.match(text, /\| prd \| done \| 1 \| 3 min \|/);
  });

  test('a broken metrics file warns but never blocks the pipeline', () => {
    const root = project();
    cli(root, 'init');
    write(root, '.keelwright/metrics.json', '{not json');
    const outText = execFileSync('node', [CLI, 'start', 'interview', '--root', root], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    assert.match(outText, /Started interview/);
    assert.equal(JSON.parse(readFileSync(join(root, '.keelwright/state.json'), 'utf8')).steps.interview.status, 'in_progress');
  });
});
