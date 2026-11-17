import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { jiraItems, pageBody, parseFeatures, parseStories, plan, repoUrlFromRemote, requirementsByStory, updateRecord } from '../scripts/lib/publish.mjs';

const CLI = fileURLToPath(new URL('../scripts/publish.mjs', import.meta.url));
const dirs = [];
after(() => dirs.forEach((d) => rmSync(d, { recursive: true, force: true })));

const PRD = `---
status: approved
date: 2026-11-17
---

# PRD: Streaks

## User stories

<!-- Priority P1 = MVP -->

### US-1 [P1] Manage habits

As a person keeping habits, I want to add habits so that the list matches my goals.

**Acceptance criteria**
- WHEN the person adds a habit THE SYSTEM SHALL show it with a streak of 0.

### US-2 [P2] Sync between devices

As a person with two devices, I want my habits on both.

**Acceptance criteria**
- WHEN a change is made on one device THE SYSTEM SHALL show it on the other within a minute.

### US-3 [P3] Share a habit

As a person, I want to share a habit with a friend.

## Functional requirements

| ID | Requirement | Story |
|---|---|---|
| FR-001 | The system shall store habits on the device. | US-1 |
| FR-002 | The system shall sync changes. | US-2 |
`;

const FEATURES = `# Feature breakdown: Streaks

## Features

| ID | Feature | Activity | Stories | Slice | Depends on | Status |
|---|---|---|---|---|---|---|
| F-01 | Manage habits | A-1 | US-1 | Now | — | planned |
| F-02 | Sync | A-2 | US-2 | Next | F-01 | planned |
`;

const BACKLOG = `# Deferred backlog: Streaks

## Deferred items

| ID | Item | Source | Why deferred | Revisit when | Size |
|---|---|---|---|---|---|
| BL-001 | Sync between devices | F-02 · US-2 | Not needed for the MVP | 100 users | M |
| BL-002 | Paid tier | PRD non-goals | Free first | 3 months after launch | L |

## Known technical debt

| ID | Debt | Impact | Plan |
|---|---|---|---|
| TD-001 | Device clocks decide conflicts | Rare lost edits | Server time in v2 |
`;

function project(extra = {}) {
  const root = mkdtempSync(join(tmpdir(), 'keelwright-publish-'));
  dirs.push(root);
  const files = {
    'docs/prd.md': PRD,
    'docs/features.md': FEATURES,
    'docs/backlog.md': BACKLOG,
    'docs/decisions/0002-use-expo.md': '---\nstatus: accepted\n---\n\n# 0002. Use Expo\n\nSee the [PRD](../prd.md) and [Expo](https://expo.dev).\n',
    ...extra,
  };
  for (const [f, c] of Object.entries(files)) {
    mkdirSync(join(root, f, '..'), { recursive: true });
    writeFileSync(join(root, f), c);
  }
  return root;
}

describe('publish: parsing', () => {
  test('stories, requirements and features', () => {
    assert.deepEqual(parseStories(PRD).map((s) => [s.id, s.priority, s.title]), [['US-1', 'P1', 'Manage habits'], ['US-2', 'P2', 'Sync between devices'], ['US-3', 'P3', 'Share a habit']]);
    assert.match(parseStories(PRD)[0].text, /^As a person keeping habits[\s\S]*SHALL show it with a streak of 0\.$/);
    assert.deepEqual(requirementsByStory(PRD), { 'US-1': ['FR-001 — The system shall store habits on the device.'], 'US-2': ['FR-002 — The system shall sync changes.'] });
    assert.deepEqual(parseFeatures(FEATURES)[1], { id: 'F-02', name: 'Sync', activity: 'A-2', stories: ['US-2'], slice: 'next', dependsOn: ['F-01'] });
  });

  test('repository URLs from git remotes', () => {
    assert.equal(repoUrlFromRemote('git@github.com:acme/streaks.git'), 'https://github.com/acme/streaks');
    assert.equal(repoUrlFromRemote('https://token@github.com/acme/streaks.git\n'), 'https://github.com/acme/streaks');
    assert.equal(repoUrlFromRemote(''), null);
  });
});

describe('publish: Jira items', () => {
  test('epics, stories under their epic, tasks for what no story covers', () => {
    const items = jiraItems(project(), { repoUrl: 'https://github.com/acme/streaks' });
    assert.deepEqual(items.map((i) => [i.id, i.kind, i.parent]), [
      ['F-01', 'epic', null],
      ['F-02', 'epic', null],
      ['US-1', 'story', 'F-01'],
      ['US-2', 'story', 'F-02'],
      ['US-3', 'story', null],
      ['BL-002', 'task', null],
      ['TD-001', 'task', null],
    ]);
    const us1 = items.find((i) => i.id === 'US-1');
    assert.deepEqual(us1.labels, ['keelwright', 'kw-us-1', 'slice-now']);
    assert.match(us1.description, /\*\*Acceptance criteria\*\*\n- WHEN the person adds a habit/);
    assert.match(us1.description, /- FR-001 — The system shall store habits on the device\./);
    assert.match(us1.description, /\[docs\/prd\.md\]\(https:\/\/github\.com\/acme\/streaks\/blob\/HEAD\/docs\/prd\.md\) \(US-1\)/);
    assert.deepEqual(items.find((i) => i.id === 'US-3').labels, ['keelwright', 'kw-us-3', 'slice-later'], 'no feature: slice from the priority');
    assert.ok(items.find((i) => i.id === 'BL-002').labels.includes('deferred'));
  });

  test('deferred items and debt can be left out', () => {
    const ids = jiraItems(project(), { include: { deferred: false, debt: false } }).map((i) => i.id);
    assert.ok(!ids.includes('BL-002') && !ids.includes('TD-001'));
  });

  test('without docs/prd.md there is nothing to publish', () => {
    assert.throws(() => jiraItems(project({ 'docs/prd.md': '' }).replace(/$/, '/missing')), /docs\/prd\.md not found/);
  });
});

describe('publish: Confluence pages', () => {
  test('a root page, folder pages, unique titles and rewritten links', () => {
    const root = project();
    const pages = plan('confluence', root).items;
    assert.deepEqual(pages.map((p) => [p.path, p.title, p.parent]), [
      ['docs/', 'Streaks — Documentation', null],
      ['docs/decisions/', 'Streaks — Decisions', 'docs/'],
      ['docs/backlog.md', 'Deferred backlog: Streaks', 'docs/'],
      ['docs/decisions/0002-use-expo.md', 'Streaks — 0002. Use Expo', 'docs/decisions/'],
      ['docs/features.md', 'Feature breakdown: Streaks', 'docs/'],
      ['docs/prd.md', 'PRD: Streaks', 'docs/'],
    ]);
    const body = pageBody(root, 'docs/decisions/0002-use-expo.md');
    assert.match(body, /^\*\*Status:\*\* accepted\n\n_Source: `docs\/decisions\/0002-use-expo.md`/);
    assert.ok(!body.includes('# 0002. Use Expo'), 'the H1 is the page title');
    assert.match(body, /See the PRD \(`docs\/prd\.md`\) and \[Expo\]\(https:\/\/expo\.dev\)\./);
    const linked = pageBody(root, 'docs/decisions/0002-use-expo.md', { record: { pages: { 'docs/prd.md': { url: 'https://acme.atlassian.net/wiki/x/1' } } } });
    assert.match(linked, /See the \[PRD\]\(https:\/\/acme\.atlassian\.net\/wiki\/x\/1\)/);
  });
});

describe('publish: plan and record', () => {
  test('create, then unchanged, update after an edit, orphaned when removed — never deleted', () => {
    const root = project();
    const cli = (...args) => execFileSync('node', [CLI, ...args, '--root', root, '--repo-url', 'none'], { encoding: 'utf8' });
    assert.match(cli('plan', 'jira'), /^jira: 7 to create, 0 to update, 0 unchanged/);
    cli('config', 'jira', '{"cloudId":"c1","projectKey":"STR"}');
    cli('record', 'jira', 'F-01', 'STR-1');
    cli('record', 'jira', 'US-1', 'STR-2');
    let p = plan('jira', root);
    assert.equal(p.items.find((i) => i.id === 'US-1').action, 'unchanged');
    assert.equal(p.items.find((i) => i.id === 'US-1').parentKey, 'STR-1');
    assert.equal(p.settings.projectKey, 'STR');

    writeFileSync(join(root, 'docs/prd.md'), PRD.replace('with a streak of 0', 'with a streak of zero').replace(/### US-3[\s\S]*?(?=## Functional)/, ''));
    p = plan('jira', root);
    assert.equal(p.items.find((i) => i.id === 'US-1').action, 'update');
    updateRecord(root, (r) => {
      r.jira.items['US-3'] = { key: 'STR-9', hash: 'sha256:x' };
    });
    assert.deepEqual(plan('jira', root).orphaned, [{ id: 'US-3', key: 'STR-9' }]);
    assert.match(cli('status'), /jira: project STR — 1 up to date, 1 changed since publishing, 4 new, 1 no longer in the documents\nconfluence: not published/);
  });

  test('pages become an update when a linked page gets its URL', () => {
    const root = project();
    const cli = (...args) => execFileSync('node', [CLI, ...args, '--root', root, '--repo-url', 'none'], { encoding: 'utf8' });
    cli('record', 'confluence', 'docs/decisions/0002-use-expo.md', '101', '1');
    assert.equal(plan('confluence', root).items.find((i) => i.path === 'docs/decisions/0002-use-expo.md').action, 'unchanged');
    cli('record', 'confluence', 'docs/prd.md', '102', '1', '--url', 'https://acme.atlassian.net/wiki/x/2');
    assert.equal(plan('confluence', root).items.find((i) => i.path === 'docs/decisions/0002-use-expo.md').action, 'update', 'its link to the PRD now resolves');
  });
});
