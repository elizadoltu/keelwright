import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, describe, test } from 'node:test';
import * as P from '../scripts/lib/profile.mjs';

const CLI = join(import.meta.dirname, '../scripts/profile.mjs');
const STATE = join(import.meta.dirname, '../scripts/state.mjs');
const dirs = [];
after(() => dirs.forEach((d) => rmSync(d, { recursive: true, force: true })));
const tmp = () => {
  const d = mkdtempSync(join(tmpdir(), 'keelwright-profile-'));
  dirs.push(d);
  return d;
};
const cli = (dir, ...args) => spawnSync('node', [CLI, ...args], { encoding: 'utf8', env: { ...process.env, KEELWRIGHT_HOME: dir } });

describe('profile: the file', () => {
  test('asked once: set, or skip, and it is remembered', () => {
    const dir = tmp();
    assert.equal(JSON.parse(cli(dir, 'show', '--json').stdout).asked, false);
    assert.equal(cli(dir, 'skip').status, 0);
    const s = JSON.parse(cli(dir, 'show', '--json').stdout);
    assert.deepEqual([s.asked, s.role, s.doctorOrder[0]], [true, null, 'setup']);
    assert.equal(cli(dir, 'set', '--name', 'Ana Pop', '--role', 'project-manager', '--jira', 'SKI').status, 0);
    const pm = JSON.parse(cli(dir, 'show', '--json').stdout);
    assert.deepEqual([pm.name, pm.tag, pm.defaults.jiraProject, pm.doctorOrder[0]], ['Ana Pop', 'pm', 'SKI', 'delivery']);
    assert.equal(typeof pm.pmSkills, 'boolean', 'a PM is told whether pm-skills is installed');
    cli(dir, 'set', '--confluence', 'SKI');
    assert.deepEqual(JSON.parse(readFileSync(join(dir, 'profile.json'), 'utf8')).defaults, { jiraProject: 'SKI', confluenceSpace: 'SKI' }, 'set merges');
  });

  test('never an email address; only known roles', () => {
    const dir = tmp();
    assert.match(cli(dir, 'set', '--name', 'ana@example.com').stderr, /never holds an email address/);
    assert.match(cli(dir, 'set', '--role', 'designer').stderr, /unknown role "designer"/);
    assert.throws(() => P.save({ defaults: { team: 'x' } }, { dir }), /unknown default "team"/);
  });

  test('pm-skills is detected from the installed plugins', () => {
    const claude = tmp();
    mkdirSync(join(claude, 'plugins'), { recursive: true });
    writeFileSync(join(claude, 'plugins/installed_plugins.json'), JSON.stringify({ plugins: { 'code-review@official': [] } }));
    assert.equal(P.pmSkillsInstalled(claude), false);
    writeFileSync(join(claude, 'plugins/installed_plugins.json'), JSON.stringify({ plugins: { 'pm-product-discovery@pm-skills': [] } }));
    assert.equal(P.pmSkillsInstalled(claude), true);
  });
});

describe('profile: working sets and questions', () => {
  const FILES = ['docs/prd.md', 'docs/features.md', 'docs/backlog.md', 'docs/architecture/overview.md', 'docs/architecture/erd.md', 'docs/decisions/0001-record.md', 'docs/design/screen-flow.md', 'docs/design/visual-identity.md', '.keelwright/stack-packs/astro.md', 'CLAUDE.md'];

  test('each role owns its documents; no role owns everything', () => {
    assert.deepEqual(P.workingSet('project-manager', FILES).mine, ['docs/prd.md', 'docs/features.md', 'docs/backlog.md']);
    assert.deepEqual(P.workingSet('business-analyst', FILES).mine, ['docs/prd.md', 'docs/architecture/erd.md', 'docs/design/screen-flow.md']);
    assert.deepEqual(P.workingSet('developer', FILES).mine, ['docs/architecture/overview.md', 'docs/architecture/erd.md', 'docs/decisions/0001-record.md', '.keelwright/stack-packs/astro.md', 'CLAUDE.md']);
    assert.deepEqual(P.workingSet(null, FILES).others, []);
    assert.deepEqual(P.workingSet('account-manager', FILES).mine, []);
  });

  test('role-tagged questions: mine and untagged ones, the rest waiting on others', () => {
    assert.equal(P.markerTag('- [NEEDS CLARIFICATION (ba): which fields are required?]'), 'ba');
    assert.equal(P.markerTag('- [NEEDS CLARIFICATION: owner]'), null);
    assert.equal(P.markerTag('- [NEEDS CLARIFICATION (cto): x]'), null, 'an unknown tag is anyone’s');
    const m = [{ role: null }, { role: 'pm' }, { role: 'dev' }];
    assert.deepEqual(P.questionsFor('project-manager', m), { mine: [{ role: null }, { role: 'pm' }], waiting: [{ role: 'dev' }] });
  });

  test('STATE markers --role shows the person’s questions and counts the rest', () => {
    const root = tmp();
    execFileSync('node', [STATE, 'init', '--input', 'x', '--root', root]);
    mkdirSync(join(root, 'docs'), { recursive: true });
    writeFileSync(join(root, 'docs/prd.md'), '# PRD\n- [NEEDS CLARIFICATION (pm): launch date?]\n- [NEEDS CLARIFICATION (dev): hosting?]\n- [NEEDS CLARIFICATION: languages?]\n');
    writeFileSync(join(root, '.keelwright/interview.md'), 'x');
    for (const [step, file] of [['interview', '.keelwright/interview.md'], ['prd', 'docs/prd.md']]) {
      execFileSync('node', [STATE, 'start', step, '--root', root]);
      execFileSync('node', [STATE, 'complete', step, file, '--root', root]);
    }
    const out = execFileSync('node', [STATE, 'markers', '--role', 'pm', '--root', root], { encoding: 'utf8' });
    assert.match(out, /launch date/);
    assert.match(out, /languages/);
    assert.doesNotMatch(out, /hosting/);
    assert.match(out, /Waiting on others: dev 1/);
  });
});
