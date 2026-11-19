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

  test('an earlier gate is approved in a fresh session', async () => {
    const dir = temp();
    write(dir, 'input.md', 'idea');
    const seen = [];
    const base = fakeClaude();
    const r = await runCase({ ...CASE, stopAtGate: 2, dir }, { pluginDir: '/p', outDir: temp(), invoke: async (o) => {
      seen.push({ prompt: o.prompt, resume: o.resume });
      if (o.prompt === '/keelwright:kickoff') return { session_id: 'fresh', total_cost_usd: 0.1, result: 'Gate 1' };
      if (o.prompt.startsWith('Approve gate 1')) { const s = S.load(o.cwd); S.approve(s, 1, { root: o.cwd, now: NOW }); S.save(o.cwd, s); return { session_id: 'fresh', total_cost_usd: 0.1, result: 'ok' }; }
      return base(o);
    } });
    const i = seen.findIndex((c) => c.prompt === '/keelwright:kickoff');
    assert.ok(i > 0, 'the gate is re-opened with the command');
    assert.equal(seen[i].resume, null);
    assert.deepEqual(seen[i + 1], { prompt: 'Approve gate 1. Keep open questions as they are.', resume: 'fresh' });
    assert.ok(r.calls.some((c) => c.prompt === '/keelwright:kickoff'));
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

describe('/adopt eval cases', () => {
  const PLUGIN = join(import.meta.dirname, '..');
  const caseDir = join(PLUGIN, 'evals/cases/adopt-orders-api');
  const ORDERS = { name: 'adopt-orders-api', dir: caseDir, ...JSON.parse(readFileSync(join(caseDir, 'case.json'), 'utf8')), stopAtGate: 1 };

  const ANALYSIS = (evidence) => `---\nstatus: draft\n---\n\n# Analysis: Orders API\n\n## Conventions\n\n| ID | Area | Convention | Evidence | Followed |\n|---|---|---|---|---|\n| C-01 | errors | Handlers throw \`HttpError\` | ${evidence} | mixed — \`src/routes/health.ts\` answers itself |\n| C-02 | layers | Routes call a service, services call repositories | \`src/services/orderService.ts\` | consistent |\n\n## Gaps\n\n| ID | Gap | Proposed fix |\n|---|---|---|\n| G-01 | no secret scanning (gitleaks) | gitleaks in CI |\n| G-02 | no git hooks | Husky |\n| G-03 | no Dependabot | dependabot.yml |\n`;

  // /adopt as the runner sees it: asks about the branch first, then analyses and stops at gate 1.
  const fakeAdopt = ({ evidence = '`src/errors.ts`, `src/app.ts`', touch = null } = {}) => async ({ cwd, prompt }) => {
    if (prompt === '/keelwright:adopt') return { session_id: 's', total_cost_usd: 0.1, result: 'Create a branch keelwright-adopt?' };
    if (prompt.startsWith('Stay on the current branch')) {
      const s = S.create({ version: 'test', now: NOW, mode: 'adopt' });
      S.start(s, 'analyse', { now: NOW });
      S.mergeStack(s, { toolchain: 'node', versions: { express: '4.21.2', pg: '8.13.1' } });
      write(cwd, '.keelwright/analysis.md', ANALYSIS(evidence));
      if (touch) write(cwd, touch, '// changed by the run\n');
      S.complete(s, 'analyse', ['.keelwright/analysis.md'], { root: cwd, now: NOW });
      S.save(cwd, s);
    }
    return { session_id: 's', total_cost_usd: 0.4, result: 'ok' };
  };

  test('nextMessage: stay on the branch first; apply fixes in gaps', () => {
    assert.deepEqual(nextMessage(null, ORDERS, 0, { call: 1 }), { message: 'Stay on the current branch and continue.' });
    assert.equal(nextMessage(null, ORDERS, 0, { call: 2 }).stop, 'no state after the first call');
    const s = S.create({ version: 't', now: NOW, mode: 'adopt' });
    for (const step of ['analyse', 'document', 'research']) s.steps[step] = { status: 'approved' };
    s.steps.gaps = { status: 'in_progress' };
    assert.match(nextMessage(s, { ...ORDERS, stopAtGate: 3 }, 0).message, /Apply every proposed fix/);
  });

  test('a run on the fixture repo: reaches gate 1, cites real files, changes no code', async () => {
    const out = temp();
    const r = await runCase(ORDERS, { pluginDir: PLUGIN, outDir: out, invoke: fakeAdopt() });
    assert.equal(r.stop, 'reached gate 1');
    const run = loadRun(out, ORDERS);
    assert.ok(run.files.before['src/routes/health.ts'] && run.files.after['.keelwright/analysis.md']);
    const g = (name) => GRADERS[name](run, ORDERS.expect, ORDERS);
    for (const name of ['mode', 'reached-gate', 'cited-files', 'code-untouched', 'analysis-check', 'conventions', 'gaps-found', 'versions-in-use']) assert.equal(g(name).pass, true, `${name}: ${g(name).detail}`);
    assert.equal(g('adr-folder'), null, 'not graded before the document step');
    assert.equal(g('adr-traceability'), null);
  });

  test('an invented file and a changed source file fail their graders', async () => {
    const out = temp();
    await runCase(ORDERS, { pluginDir: PLUGIN, outDir: out, invoke: fakeAdopt({ evidence: '`src/middleware/errors.ts`', touch: 'src/routes/health.ts' }) });
    const run = loadRun(out, ORDERS);
    assert.match(GRADERS['cited-files'](run, ORDERS.expect).detail, /src\/middleware\/errors.ts/);
    assert.deepEqual(GRADERS['code-untouched'](run, ORDERS.expect), { pass: false, detail: 'changed: src/routes/health.ts' });
  });

  test('ADR folder, retroactive ADRs and pack majors after the document and research steps', () => {
    const dir = temp();
    write(dir, '.keelwright/state.json', JSON.stringify({ mode: 'adopt', steps: { document: { status: 'awaiting_review' }, research: { status: 'awaiting_review' } } }));
    const before = { 'docs/adr/0001-use-express.md': 'a', 'src/db.ts': 'b' };
    write(dir, '.eval/files.json', JSON.stringify({ before, after: { ...before, 'docs/adr/0002-use-postgresql-through-pg.md': 'c', 'docs/decisions/0001-record-architecture-decisions.md': 'd' } }));
    write(dir, 'docs/adr/0002-use-postgresql-through-pg.md', '# 0002. Use PostgreSQL through pg\n\n## Context\n\nRecorded retroactively by KeelWright from the code on 2026-11-18.\n\n## Decision\n\nEvidence:\n- `src/db.ts` — the pool\n\n## Alternatives\n\nWe also considered MongoDB and MySQL.\n');
    write(dir, '.keelwright/stack-packs/express.md', '---\nid: express\nmajor: 5\n---\n');
    const run = loadRun(dir, ORDERS);
    assert.match(GRADERS['adr-folder'](run, ORDERS.expect).detail, /ADRs written outside the project's folder: docs\/decisions\/0001/);
    assert.match(GRADERS['retro-adrs'](run, ORDERS.expect).detail, /lists alternatives the repository never mentions/);
    assert.deepEqual(GRADERS['pack-majors'](run, ORDERS.expect), { pass: false, detail: 'express: expected major 4' });
  });

  test('every adopt fixture repo gives the facts its case expects from the analysis script', async () => {
    const { analyse } = await import('../scripts/lib/analyse.mjs');
    for (const name of ['adopt-orders-api', 'adopt-etl-python', 'adopt-workspace-app']) {
      const c = JSON.parse(readFileSync(join(PLUGIN, 'evals/cases', name, 'case.json'), 'utf8'));
      const a = analyse(join(PLUGIN, 'evals/cases', name, 'repo'));
      assert.equal(a.mode, 'create', name);
      assert.equal(a.toolchain, c.expect.toolchain, name);
      const locked = Object.fromEntries(a.dependencies.map((d) => [d.name, d.locked]));
      for (const [pkg, v] of Object.entries(c.expect.versions)) assert.ok(String(locked[pkg]).startsWith(v), `${name}: ${pkg} ${locked[pkg]}`);
      if (c.expect.workspaces) assert.deepEqual(a.workspaces.map((w) => w.path), c.expect.workspaces);
    }
  });
});
