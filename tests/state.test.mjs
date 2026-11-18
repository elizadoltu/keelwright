import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, beforeEach, describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { MODES, downstreamOf, stepsInGate, stepsOf } from '../scripts/lib/pipeline.mjs';
import * as S from '../scripts/lib/state.mjs';

const NOW = '2026-11-16T10:00:00.000Z';
const CLI = fileURLToPath(new URL('../scripts/state.mjs', import.meta.url));
const roots = [];

function project() {
  const root = mkdtempSync(join(tmpdir(), 'keelwright-test-'));
  roots.push(root);
  return root;
}

function write(root, file, content = 'x') {
  const abs = join(root, file);
  mkdirSync(join(abs, '..'), { recursive: true });
  writeFileSync(abs, content);
}

// Runs a step from start to complete with one output file.
function runStep(state, root, step, file = `docs/${step}.md`, content = step) {
  S.start(state, step, { now: NOW });
  write(root, file, content);
  S.complete(state, step, [file], { root, now: NOW });
}

after(() => roots.forEach((r) => rmSync(r, { recursive: true, force: true })));

describe('pipeline', () => {
  test('downstream of prd is everything after it', () => {
    assert.deepEqual(downstreamOf('prd'), ['architecture', 'features', 'design', 'research', 'scaffold', 'generate', 'publish']);
  });

  test('gate 2 siblings are not downstream of each other', () => {
    assert.deepEqual(downstreamOf('features'), ['research', 'scaffold', 'generate', 'publish']);
  });

  test('unknown step is rejected', () => {
    assert.throws(() => downstreamOf('deploy'), /unknown step/);
  });
});

describe('commands and step files match the pipelines', () => {
  const plugin = fileURLToPath(new URL('..', import.meta.url));
  for (const mode of MODES) {
    test(`/${mode}: every step is in the command's table and has a step file`, () => {
      const command = readFileSync(join(plugin, 'commands', `${mode}.md`), 'utf8');
      const section = command.split(/^## The pipeline.*$/m)[1].split(/^## /m)[0];
      const table = [...section.matchAll(/^\| `([a-z-]+)` \|/gm)].map((m) => m[1]);
      const names = stepsOf(mode).map((s) => s.name);
      assert.deepEqual(table, names);
      for (const n of names) assert.ok(existsSync(join(plugin, 'steps', `${n}.md`)), `steps/${n}.md`);
    });
  }
});

describe('adopt pipeline', () => {
  test('analyse is gate 1; document and research share gate 2; gaps, generate and publish follow', () => {
    assert.deepEqual(downstreamOf('analyse', 'adopt'), ['document', 'research', 'gaps', 'generate', 'publish']);
    assert.deepEqual(downstreamOf('document', 'adopt'), ['gaps', 'generate', 'publish']);
    assert.deepEqual(stepsInGate(2, 'adopt'), ['document', 'research']);
    assert.throws(() => downstreamOf('interview', 'adopt'), /unknown step "interview"/);
    assert.throws(() => downstreamOf('analyse', 'migrate'), /unknown mode/);
  });

  test('a run: analyse → gate 1 → document + research → gate 2 → gaps → generate', () => {
    const root = project();
    const state = S.create({ version: '0.1.0', now: NOW, mode: 'adopt' });
    assert.equal(state.mode, 'adopt');
    assert.equal(S.modeOf(state), 'adopt');
    assert.deepEqual(Object.keys(state.steps), ['analyse', 'document', 'research', 'gaps', 'generate', 'publish']);
    assert.deepEqual(state.documents, ['adr', 'architecture-overview', 'development-workflow']);
    assert.deepEqual(S.next(state), { action: 'run', step: 'analyse', optional: false });
    assert.throws(() => S.start(state, 'prd', { now: NOW }), /unknown step "prd"/);

    runStep(state, root, 'analyse', '.keelwright/analysis.md');
    assert.deepEqual(S.next(state), { action: 'review', gate: 1, steps: ['analyse'] });
    S.approve(state, 1, { root, now: NOW });
    runStep(state, root, 'document', 'docs/architecture/overview.md');
    runStep(state, root, 'research', '.keelwright/stack-packs/express.md');
    assert.deepEqual(S.next(state), { action: 'review', gate: 2, steps: ['document', 'research'] });
    assert.deepEqual(S.approve(state, 2, { root, now: NOW }), ['document', 'research']);
    runStep(state, root, 'gaps', '.keelwright/gaps.md');
    assert.equal(state.steps.gaps.status, 'done');
    assert.deepEqual(S.next(state), { action: 'run', step: 'generate', optional: false });
  });

  test('a re-run of analyse marks the later steps stale; edits are detected', () => {
    const root = project();
    const state = S.create({ version: '0.1.0', now: NOW, mode: 'adopt' });
    runStep(state, root, 'analyse', '.keelwright/analysis.md');
    S.approve(state, 1, { root, now: NOW });
    runStep(state, root, 'document', 'docs/architecture/overview.md');
    write(root, '.keelwright/analysis.md', 'corrected');
    assert.deepEqual(S.changes(state, root).affected, ['document']);
    assert.deepEqual(S.start(state, 'analyse', { now: NOW }).stale, ['document']);
  });

  test('the adopt document set needs the adopt baseline, not the PRD', () => {
    const state = S.create({ version: '0.1.0', now: NOW, mode: 'adopt' });
    S.setDocuments(state, ['adr', 'architecture-overview', 'development-workflow', 'c4']);
    assert.deepEqual(state.documents, ['adr', 'development-workflow', 'architecture-overview', 'c4']);
    assert.throws(() => S.setDocuments(state, ['adr', 'development-workflow']), /architecture-overview/);
    assert.throws(() => S.create({ version: '0.1.0', now: NOW, mode: 'migrate' }), /unknown mode/);
  });

  test('a state without a mode is a kickoff', () => {
    const state = S.create({ version: '0.1.0', now: NOW });
    delete state.mode;
    assert.equal(S.modeOf(state), 'kickoff');
    assert.deepEqual(S.next(state), { action: 'run', step: 'interview', optional: false });
  });
});

describe('state transitions', () => {
  let root;
  let state;
  beforeEach(() => {
    root = project();
    state = S.create({ version: '0.1.0', now: NOW });
  });

  test('a new state starts with the interview and the always documents', () => {
    assert.deepEqual(S.next(state), { action: 'run', step: 'interview', optional: false });
    assert.deepEqual(state.documents, ['prd', 'adr', 'backlog', 'development-workflow']);
  });

  test('a step cannot start before its dependencies', () => {
    assert.throws(() => S.start(state, 'prd', { now: NOW }), /waiting for interview/);
  });

  test('a step without a gate is done and hashed; a gated step waits for review', () => {
    runStep(state, root, 'interview');
    assert.equal(state.steps.interview.status, 'done');
    assert.match(state.steps.interview.outputs['docs/interview.md'], /^sha256:/);

    runStep(state, root, 'prd');
    assert.equal(state.steps.prd.status, 'awaiting_review');
    assert.deepEqual(S.next(state), { action: 'review', gate: 1, steps: ['prd'] });
  });

  test('gate 2 is reviewed only after all three of its steps ran', () => {
    runStep(state, root, 'interview');
    runStep(state, root, 'prd');
    S.approve(state, 1, { root, now: NOW });
    runStep(state, root, 'architecture');
    assert.equal(S.next(state).step, 'features');
    runStep(state, root, 'features');
    S.start(state, 'design', { now: NOW });
    S.skip(state, 'design', 'no user-facing UI', { now: NOW });
    assert.deepEqual(S.next(state), { action: 'review', gate: 2, steps: ['architecture', 'features', 'design'] });
    assert.deepEqual(S.approve(state, 2, { root, now: NOW }), ['architecture', 'features']);
    assert.equal(S.next(state).step, 'research');
  });

  test('approving hashes the files as edited during the review', () => {
    runStep(state, root, 'interview');
    runStep(state, root, 'prd');
    write(root, 'docs/prd.md', 'edited by the user during review');
    S.approve(state, 1, { root, now: NOW });
    assert.equal(state.steps.prd.outputs['docs/prd.md'], S.hashPath(root, 'docs/prd.md'));
    assert.deepEqual(S.changes(state, root).changed, []);
  });

  test('a gate that is not waiting cannot be approved', () => {
    assert.throws(() => S.approve(state, 1, { root, now: NOW }), /not waiting/);
    assert.throws(() => S.approve(state, 9, { root, now: NOW }), /unknown gate/);
  });

  test('re-running a step marks the steps after it stale, not its siblings', () => {
    runStep(state, root, 'interview');
    runStep(state, root, 'prd');
    S.approve(state, 1, { root, now: NOW });
    runStep(state, root, 'architecture');
    runStep(state, root, 'features');
    runStep(state, root, 'design');
    S.approve(state, 2, { root, now: NOW });
    runStep(state, root, 'research');
    S.approve(state, 3, { root, now: NOW });

    const r = S.start(state, 'features', { now: NOW });
    assert.equal(r.rerun, true);
    assert.deepEqual(r.stale, ['research']);
    assert.equal(state.steps.architecture.status, 'approved');
    assert.equal(state.steps.scaffold.status, 'pending');
  });

  test('a stale step runs again in pipeline order', () => {
    runStep(state, root, 'interview');
    runStep(state, root, 'prd');
    S.approve(state, 1, { root, now: NOW });
    S.start(state, 'interview', { now: NOW });
    assert.equal(state.steps.prd.status, 'stale');
    write(root, 'docs/interview.md', 'new notes');
    S.complete(state, 'interview', ['docs/interview.md'], { root, now: NOW });
    assert.equal(S.next(state).step, 'prd');
  });

  test('skipping needs a reason', () => {
    runStep(state, root, 'interview');
    assert.throws(() => S.skip(state, 'prd', '', { now: NOW }), /reason/);
  });

  test('outputs must exist and stay inside the project', () => {
    S.start(state, 'interview', { now: NOW });
    assert.throws(() => S.complete(state, 'interview', ['missing.md'], { root, now: NOW }), /does not exist/);
    assert.throws(() => S.complete(state, 'interview', ['../outside.md'], { root, now: NOW }), /outside the project/);
    assert.throws(() => S.complete(state, 'interview', [], { root, now: NOW }), /at least one/);
  });

  test('completing a step that is not in progress fails', () => {
    write(root, 'a.md');
    assert.throws(() => S.complete(state, 'interview', ['a.md'], { root, now: NOW }), /not in_progress/);
  });
});

describe('edit detection', () => {
  let root;
  let state;
  beforeEach(() => {
    root = project();
    state = S.create({ version: '0.1.0', now: NOW });
    runStep(state, root, 'interview');
    runStep(state, root, 'prd');
    S.approve(state, 1, { root, now: NOW });
    runStep(state, root, 'architecture');
    runStep(state, root, 'features');
    runStep(state, root, 'design');
  });

  test('an edited approved file is reported with the steps it would regenerate', () => {
    write(root, 'docs/prd.md', 'stack changed to Astro');
    const c = S.changes(state, root);
    assert.deepEqual(c.changed, [{ step: 'prd', file: 'docs/prd.md', change: 'modified' }]);
    assert.deepEqual(c.affected, ['architecture', 'features', 'design']);
  });

  test('a deleted file is reported as deleted', () => {
    rmSync(join(root, 'docs/prd.md'));
    assert.equal(S.changes(state, root).changed[0].change, 'deleted');
  });

  test('files of steps still under review are not reported', () => {
    write(root, 'docs/architecture.md', 'edited during review');
    assert.deepEqual(S.changes(state, root).changed, []);
  });

  test('accepting edits rebases the hashes and marks downstream stale', () => {
    write(root, 'docs/prd.md', 'stack changed');
    const r = S.acceptChanges(state, root);
    assert.deepEqual(r.stale, ['architecture', 'features', 'design']);
    assert.deepEqual(S.changes(state, root).changed, []);
    assert.equal(S.next(state).step, 'architecture');
  });

  test('accepting edits can keep downstream as it is', () => {
    write(root, 'docs/prd.md', 'typo fix');
    const r = S.acceptChanges(state, root, { keepDownstream: true });
    assert.deepEqual(r.stale, []);
    assert.equal(state.steps.architecture.status, 'awaiting_review');
  });

  test('directories are hashed by content and file names', () => {
    const before = (write(root, 'src/a.ts', '1'), S.hashPath(root, 'src'));
    write(root, 'src/b.ts', '2');
    assert.notEqual(S.hashPath(root, 'src'), before);
    write(root, 'src/node_modules/x.js', 'ignored');
    const withDeps = S.hashPath(root, 'src');
    rmSync(join(root, 'src/node_modules'), { recursive: true });
    assert.equal(S.hashPath(root, 'src'), withDeps);
  });
});

describe('markers and setters', () => {
  test('open clarification markers are found in files under review', () => {
    const root = project();
    const state = S.create({ version: '0.1.0', now: NOW });
    runStep(state, root, 'interview');
    runStep(state, root, 'prd', 'docs/prd.md', '# PRD\n\n- [NEEDS CLARIFICATION: languages?]\n');
    assert.deepEqual(S.markers(state, root), [
      { step: 'prd', file: 'docs/prd.md', line: 3, text: '- [NEEDS CLARIFICATION: languages?]' },
    ]);
  });

  test('the document set is validated against the catalog', () => {
    const state = S.create({ version: '0.1.0', now: NOW });
    assert.throws(() => S.setDocuments(state, ['prd', 'adr', 'backlog', 'development-workflow', 'wiki']), /unknown document keys: wiki/);
    assert.throws(() => S.setDocuments(state, ['prd', 'erd']), /always/);
    S.setDocuments(state, ['erd', 'prd', 'adr', 'backlog', 'development-workflow', 'c4']);
    assert.deepEqual(state.documents, ['prd', 'adr', 'backlog', 'development-workflow', 'c4', 'erd']);
  });

  test('project type and stack are validated', () => {
    const state = S.create({ version: '0.1.0', now: NOW });
    assert.throws(() => S.setProjectType(state, 'desktop'), /unknown project type/);
    S.setProjectType(state, 'web');
    S.mergeStack(state, { resolvedAt: '2026-11-16' });
    S.mergeStack(state, { versions: { node: '24.0.0' } });
    assert.deepEqual(state.stack, { resolvedAt: '2026-11-16', versions: { node: '24.0.0' } });
    S.mergeStack(state, { versions: { astro: '7.4.12' } });
    assert.deepEqual(state.stack.versions, { node: '24.0.0', astro: '7.4.12' }, 'nested objects merge key by key');
    assert.throws(() => S.mergeStack(state, [1]), /JSON object/);
    S.mergeStack(state, { toolchain: 'python' });
    assert.equal(state.stack.toolchain, 'python');
    assert.throws(() => S.mergeStack(state, { toolchain: 'maven' }), /unknown toolchain "maven"/);
  });
});

describe('CLI', () => {
  const cli = (root, ...args) => execFileSync('node', [CLI, ...args, '--root', root], { encoding: 'utf8' });
  const cliFails = (root, ...args) => {
    try {
      cli(root, ...args);
    } catch (err) {
      return err.stderr;
    }
    assert.fail('expected the command to fail');
  };

  test('runs a step and a gate end to end', () => {
    const root = project();
    cli(root, 'init', '--input', 'A booking site');
    assert.match(cli(root, 'next'), /run step "interview"/);
    cli(root, 'start', 'interview');
    write(root, '.keelwright/interview.md', 'notes');
    cli(root, 'complete', 'interview', '.keelwright/interview.md');
    cli(root, 'set', 'project-type', 'web');
    cli(root, 'start', 'prd');
    write(root, 'docs/prd.md', '[NEEDS CLARIFICATION: x]');
    cli(root, 'complete', 'prd', 'docs/prd.md');
    const status = cli(root, 'status');
    assert.match(status, /review gate 1/);
    assert.match(status, /docs\/prd.md:1/);
    assert.match(cli(root, 'approve', '1'), /Gate 1 approved: prd/);
    const json = JSON.parse(cli(root, 'status', '--json'));
    assert.equal(json.projectType, 'web');
    assert.equal(json.input, 'A booking site');
    assert.equal(json.next.step, 'architecture');
  });

  test('adopt: init, mode, steps, metric and report', () => {
    const root = project();
    assert.equal(cli(root, 'mode').trim(), 'none');
    assert.match(cli(root, 'steps', '--mode', 'adopt'), /^analyse/);
    cli(root, 'init', '--mode', 'adopt');
    assert.equal(cli(root, 'mode').trim(), 'adopt');
    assert.match(cli(root, 'steps'), /gaps {2}deps: document, research/);
    assert.match(cli(root, 'next'), /run step "analyse"/);
    cli(root, 'start', 'analyse');
    write(root, '.keelwright/analysis.md', 'analysis');
    cli(root, 'complete', 'analyse', '.keelwright/analysis.md');
    assert.match(cli(root, 'metric', 'analyse', 'doccheck-failures', '+1'), /= 1/);
    assert.match(cliFails(root, 'metric', 'interview', 'questions', '1'), /unknown step "interview"/);
    const status = cli(root, 'status');
    assert.match(status, /Mode: \/adopt/);
    assert.match(status, /review gate 1 \(analyse\)/);
    assert.doesNotMatch(status, /interview/);
    const report = cli(root, 'report');
    assert.match(report, /Mode: \/adopt/);
    assert.match(report, /\| analyse \| awaiting_review \|/);
    assert.match(cli(root, 'downstream', 'document'), /gaps, generate, publish/);
    assert.match(cliFails(project(), 'init', '--mode', 'migrate'), /unknown mode/);
  });

  test('errors are short messages with exit code 1', () => {
    const root = project();
    assert.match(cliFails(root, 'status'), /^error: no KeelWright state/);
    cli(root, 'init');
    assert.match(cliFails(root, 'init'), /already exists/);
    assert.match(cliFails(root, 'start', 'deploy'), /unknown step/);
    assert.match(cliFails(root, 'set', 'stack', '{bad'), /valid JSON/);
  });
});
