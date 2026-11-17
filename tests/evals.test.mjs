import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, describe, test } from 'node:test';
import { GRADERS, loadRun, parseVerdict } from '../evals/lib/graders.mjs';
import { nextMessage, runCase } from '../evals/lib/runner.mjs';
import { summarise, toMarkdown } from '../evals/lib/summary.mjs';
import * as S from '../scripts/lib/state.mjs';

const NOW = '2026-11-16T10:00:00.000Z';
const dirs = [];
after(() => dirs.forEach((d) => rmSync(d, { recursive: true, force: true })));
const temp = () => {
  const d = mkdtempSync(join(tmpdir(), 'keelwright-evaltest-'));
  dirs.push(d);
  return d;
};
const write = (root, file, content) => {
  mkdirSync(join(root, file, '..'), { recursive: true });
  writeFileSync(join(root, file), content);
};
const CASE = {
  name: 'demo',
  stopAtGate: 1,
  answers: ['1a. 2b.'],
  expect: { projectType: 'web', primary: { choice: 'astro', rule: 1 }, documents: { include: ['prd', 'adr'], exclude: ['erd'] }, interviewQuestions: { min: 1 } },
};

// Simulates the pipeline the way /kickoff would, one call at a time.
function fakeClaude() {
  return async ({ cwd, prompt }) => {
    const st = () => S.load(cwd);
    if (prompt.startsWith('/keelwright:kickoff')) {
      S.save(cwd, S.create({ version: 'test', now: NOW }));
      const s = st();
      S.start(s, 'interview', { now: NOW });
      S.save(cwd, s);
      write(cwd, '.keelwright/interview.md', '- **Q:** Which?');
    } else if (prompt.startsWith('1a')) {
      write(cwd, '.keelwright/interview.md', '- **Q:** Which?\n  **A:** 1a');
      write(cwd, 'docs/prd.md', '# PRD');
      write(cwd, 'docs/decisions/0001-record-architecture-decisions.md', 'x');
      write(cwd, 'docs/decisions/0002-use-astro.md', 'Drivers: FR-001');
      const s = st();
      S.complete(s, 'interview', ['.keelwright/interview.md'], { root: cwd, now: NOW });
      S.setProjectType(s, 'web');
      S.mergeStack(s, { primary: { choice: 'Astro', rule: 1 } });
      S.start(s, 'prd', { now: NOW });
      S.complete(s, 'prd', ['docs/prd.md'], { root: cwd, now: NOW });
      S.save(cwd, s);
    }
    return { session_id: 'sess', total_cost_usd: 0.5, num_turns: 3, result: 'ok' };
  };
}

describe('eval runner', () => {
  test('answers the interview, then stops at the case gate', async () => {
    const out = temp();
    const r = await runCase({ ...CASE, dir: (() => { const d = temp(); write(d, 'input.md', 'idea'); return d; })() }, { pluginDir: '/plugin', outDir: out, invoke: fakeClaude() });
    assert.equal(r.stop, 'reached gate 1');
    assert.deepEqual(r.calls.map((c) => c.prompt), ['/keelwright:kickoff input.md', '1a. 2b.']);
    assert.equal(r.cost, 1);
    assert.ok(existsSync(join(out, 'docs/prd.md')));
    assert.ok(existsSync(join(out, '.keelwright/state.json')));
  });

  test('a call that changes nothing is reported as a stall', async () => {
    const dir = temp();
    write(dir, 'input.md', 'idea');
    const invoke = async ({ cwd }) => {
      if (!existsSync(join(cwd, '.keelwright/state.json'))) {
        const s = S.create({ version: 'test', now: NOW });
        S.start(s, 'interview', { now: NOW });
        S.save(cwd, s);
      }
      return { session_id: 's', total_cost_usd: 0.1, result: 'questions' };
    };
    const r = await runCase({ ...CASE, dir }, { pluginDir: '/p', outDir: temp(), invoke });
    assert.equal(r.stop, 'stalled: the state did not change');
    assert.equal(r.calls.length, 2);
  });

  test('next message approves earlier gates and answers the interview', () => {
    const s = S.create({ version: 't', now: NOW });
    S.start(s, 'interview', { now: NOW });
    assert.deepEqual(nextMessage(s, CASE, 0), { message: '1a. 2b.', usedAnswer: true });
    assert.match(nextMessage(s, CASE, 1).message, /Decide later/);
    assert.deepEqual(nextMessage(null, CASE, 0), { message: null, stop: 'no state after the first call' });
  });
});

describe('graders', () => {
  test('grade a finished run against the expectations', async () => {
    const dir = temp();
    await runCase({ ...CASE, dir: (() => { const d = temp(); write(d, 'input.md', 'idea'); return d; })() }, { pluginDir: '/p', outDir: dir, invoke: fakeClaude() });
    const run = loadRun(dir);
    const g = Object.fromEntries(Object.entries(GRADERS).map(([k, fn]) => [k, fn(run, CASE.expect, CASE)]));
    assert.equal(g['reached-gate'].pass, true);
    assert.equal(g['project-type'].pass, true);
    assert.equal(g.primary.pass, true, g.primary.detail);
    assert.equal(g['documents-include'].pass, true);
    assert.equal(g['documents-exclude'].pass, true);
    assert.equal(g['interview-asked'].pass, true);
    assert.equal(g['adr-traceability'].pass, true);
    assert.equal(g['documents-written'].pass, true);
    assert.equal(g.doccheck.pass, false, 'the one-line fake PRD has no stories');
  });

  test('a wrong frontend rule fails', () => {
    const run = { state: { stack: { primary: { choice: 'Astro', rule: 'rule 4' } } } };
    assert.equal(GRADERS.primary(run, CASE.expect).pass, false);
    assert.equal(GRADERS.primary({ state: { stack: { frontend: { choice: 'Astro', rule: 1 } } } }, CASE.expect).pass, true, 'older runs recorded it as frontend');
  });

  test('judge replies are parsed strictly', () => {
    assert.deepEqual(parseVerdict('Sure. {"pass": true, "reason": "nothing invented"}'), { pass: true, detail: 'nothing invented' });
    assert.deepEqual(parseVerdict('{"pass": false, "reason": "invented a phone number"}'), { pass: false, detail: 'invented a phone number' });
    assert.equal(parseVerdict('I think it passes').pass, false);
  });
});

describe('summary', () => {
  test('pass rates per grader and the threshold', () => {
    const results = [
      { case: 'a', run: 1, stop: 'reached gate 1', cost: 1, minutes: 5, grades: { x: { pass: true }, y: { pass: true } } },
      { case: 'a', run: 2, stop: 'reached gate 1', cost: 1, minutes: 5, grades: { x: { pass: true }, y: { pass: false, detail: 'too long' } } },
      { case: 'a', run: 3, stop: 'stalled', cost: 1, minutes: 5, grades: { x: { pass: true }, y: { pass: false, detail: 'too long' } } },
    ];
    const s = summarise(results, { threshold: 0.67 });
    assert.equal(s.cases.a.graders.x.rate, 1);
    assert.equal(Math.round(s.cases.a.graders.y.rate * 100), 33);
    assert.deepEqual(s.below, ['a / y']);
    assert.equal(s.ok, false);
    const md = toMarkdown(s);
    assert.match(md, /\| y \| 33% \(1\/3\) \| run 2: too long<br>run 3: too long \|/);
    assert.match(md, /reached gate 1 ×2, stalled ×1/);
  });
});

describe('judge voting', () => {
  test('the last verdict in a reasoned reply wins', async () => {
    const { parseVerdict } = await import('../evals/lib/graders.mjs');
    const reply = 'Q1 fine.\nExample {"pass": false, "reason": "x"} is not the answer.\n{"pass": true, "reason": "all needed"}';
    assert.deepEqual(parseVerdict(reply), { pass: true, detail: 'all needed' });
  });

  test('majority of votes', async () => {
    const { majority } = await import('../evals/lib/graders.mjs');
    const v = (pass, detail) => ({ pass, detail });
    assert.deepEqual(majority([v(true, 'a'), v(false, 'b'), v(true, 'c')]), { pass: true, detail: '2/3 votes pass — a' });
    assert.deepEqual(majority([v(false, 'b'), v(false, 'd'), v(true, 'c')]), { pass: false, detail: '1/3 votes pass — b' });
  });
});

describe('interview-asked grader', () => {
  test('uses the metrics count, else numbered or plain Q markers', () => {
    const dir = temp();
    const run = { dir, state: {} };
    const expect = { interviewQuestions: { min: 2 } };
    write(dir, '.keelwright/interview.md', '- **Q1:** a\n- **Q2:** b');
    assert.equal(GRADERS['interview-asked'](run, expect).pass, true);
    write(dir, '.keelwright/metrics.json', JSON.stringify({ steps: { interview: { counters: { questions: 1 } } } }));
    assert.deepEqual(GRADERS['interview-asked'](run, expect), { pass: false, detail: '1 questions (metrics)' });
  });
});

describe('packs grader', () => {
  test('expected packs chosen, removed technologies left out', () => {
    const expect = { packs: { include: ['astro'], exclude: ['express'] } };
    assert.equal(GRADERS.packs({ state: { stack: { packs: { astro: 'd', tailwind: 'd' } } } }, expect).pass, true);
    assert.deepEqual(GRADERS.packs({ state: { stack: { packs: { express: 'd' } } } }, expect), { pass: false, detail: 'missing: astro; unexpected: express' });
  });
});

describe('versions grader', async () => {
  const { gradeVersions } = await import('../evals/lib/graders.mjs');
  const responses = {
    'https://www.python.org/api/v2/downloads/release/?is_published=true&pre_release=false&version=3': [{ name: 'Python 3.15.2', is_published: true, pre_release: false }],
    'https://pypi.org/pypi/ruff/json': { info: { version: '0.17.5' }, releases: { '0.17.4': [{ yanked: false }], '0.17.5': [{ yanked: false }] } },
    'https://pypi.org/pypi/fastapi/json': { info: { version: '0.163.1' }, releases: { '0.163.1': [{ yanked: false }] } },
  };
  const fetchJson = async (url) => {
    if (!(url in responses)) throw new Error(`HTTP 404 ${url}`);
    return responses[url];
  };
  const run = (versions) => ({ dir: '/nonexistent', adrs: [], state: { stack: { toolchain: 'python', versions } } });

  test('checks Python packages on PyPI and the runtime against python.org', async () => {
    assert.equal((await gradeVersions(run({ python: '3.15.2', ruff: '0.17.5', fastapi: '0.163.1', 'gitleaks/gitleaks': '8.30.1' }), fetchJson)).pass, true);
    const r = await gradeVersions(run({ python: '3.14.0', ruff: '0.17.4' }), fetchJson);
    assert.equal(r.pass, false);
    assert.match(r.detail, /python 3.14.0 is not the current stable \(3.15.2\); ruff 0.17.4 is older than 0.17.5 with no ADR/);
  });
});
