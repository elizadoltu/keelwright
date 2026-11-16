import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';

const HOOKS = fileURLToPath(new URL('../templates/claude/hooks/', import.meta.url));
const dirs = [];
after(() => dirs.forEach((d) => rmSync(d, { recursive: true, force: true })));

function project(files) {
  const root = mkdtempSync(join(tmpdir(), 'keelwright-hooks-'));
  dirs.push(root);
  for (const [f, c] of Object.entries(files)) {
    mkdirSync(join(root, f, '..'), { recursive: true });
    writeFileSync(join(root, f), c);
  }
  return root;
}

const hook = (name, root, input) =>
  spawnSync('node', [join(HOOKS, name)], { input: JSON.stringify({ cwd: root, ...input }), encoding: 'utf8', env: { ...process.env, CLAUDE_PROJECT_DIR: root } });

const hasGitleaks = spawnSync('gitleaks', ['version']).status === 0;

describe('guard-files hook', () => {
  const root = project({
    'docs/decisions/0002-use-astro.md': '---\nstatus: accepted\ndate: 2026-11-16\n---\n\n# 0002. Use Astro\n',
    'docs/decisions/0003-draft.md': '---\nstatus: proposed\n---\n',
    'src/styles/tokens.css': '/* Generated from design/tokens.json by KeelWright — do not edit. */\n@theme {}\n',
    'src/app.ts': 'export {};\n',
  });

  test('blocks editing an accepted ADR', () => {
    const r = hook('guard-files.mjs', root, { tool_name: 'Edit', tool_input: { file_path: 'docs/decisions/0002-use-astro.md', old_string: '# 0002. Use Astro', new_string: '# 0002. Use Next.js' } });
    assert.equal(r.status, 2);
    assert.match(r.stderr, /accepted ADR and must not be changed/);
  });

  test('allows superseding an accepted ADR through its status line only', () => {
    const r = hook('guard-files.mjs', root, { tool_name: 'Edit', tool_input: { file_path: 'docs/decisions/0002-use-astro.md', old_string: 'status: accepted', new_string: 'status: superseded by ADR-0009' } });
    assert.equal(r.status, 0, r.stderr);
  });

  test('blocks overwriting an accepted ADR with Write, allows editing a proposed one', () => {
    assert.equal(hook('guard-files.mjs', root, { tool_name: 'Write', tool_input: { file_path: 'docs/decisions/0002-use-astro.md', content: 'x' } }).status, 2);
    assert.equal(hook('guard-files.mjs', root, { tool_name: 'Edit', tool_input: { file_path: 'docs/decisions/0003-draft.md', old_string: 'a', new_string: 'b' } }).status, 0);
  });

  test('blocks editing a generated file and names its source', () => {
    const r = hook('guard-files.mjs', root, { tool_name: 'Edit', tool_input: { file_path: join(root, 'src/styles/tokens.css'), old_string: 'a', new_string: 'b' } });
    assert.equal(r.status, 2);
    assert.match(r.stderr, /generated from design\/tokens.json/);
  });

  test('allows ordinary edits and ignores input without a file', () => {
    assert.equal(hook('guard-files.mjs', root, { tool_name: 'Edit', tool_input: { file_path: 'src/app.ts', old_string: 'export {};', new_string: 'export const a = 1;' } }).status, 0);
    assert.equal(hook('guard-files.mjs', root, { tool_name: 'Bash', tool_input: { command: 'ls' } }).status, 0);
  });

  test('blocks a secret in new content', { skip: !hasGitleaks && 'gitleaks not installed' }, () => {
    const r = hook('guard-files.mjs', root, { tool_name: 'Write', tool_input: { file_path: 'src/keys.ts', content: 'export const key = "AKIAIOSFODNN7EXAMPL3";\n' } });
    assert.equal(r.status, 2);
    assert.match(r.stderr, /Possible secret/);
  });
});

describe('format-on-edit hook', () => {
  test('does nothing without the project tools or for files outside the project', () => {
    const root = project({ 'src/a.ts': 'export {}\n' });
    assert.equal(hook('format-on-edit.mjs', root, { tool_name: 'Edit', tool_input: { file_path: 'src/a.ts' } }).status, 0);
    assert.equal(hook('format-on-edit.mjs', root, { tool_name: 'Edit', tool_input: { file_path: '/etc/hosts' } }).status, 0);
  });

  test('reports lint errors the fixer leaves to Claude', () => {
    const root = project({
      'src/a.ts': 'x',
      'node_modules/.bin/eslint': '#!/bin/sh\necho "src/a.ts: no-explicit-any"\nexit 1\n',
    });
    spawnSync('chmod', ['+x', join(root, 'node_modules/.bin/eslint')]);
    const r = hook('format-on-edit.mjs', root, { tool_name: 'Edit', tool_input: { file_path: 'src/a.ts' } });
    assert.equal(r.status, 2);
    assert.match(r.stderr, /need a manual fix:\nsrc\/a.ts: no-explicit-any/);
  });
});

describe('check-on-stop hook', () => {
  test('lets Claude stop when it is already continuing because of the hook', () => {
    assert.equal(hook('check-on-stop.mjs', project({}), { stop_hook_active: true }).status, 0);
  });

  test('runs npm run check when files changed, and reports a failure', () => {
    const root = project({
      'package.json': JSON.stringify({ scripts: { check: 'echo "lint failed in src/a.ts" && exit 1' } }),
      'node_modules/.keep': '',
    });
    spawnSync('git', ['init', '-q'], { cwd: root });
    const r = hook('check-on-stop.mjs', root, { stop_hook_active: false });
    assert.equal(r.status, 2);
    assert.match(r.stderr, /npm run check fails[\s\S]*lint failed in src\/a.ts/);
  });

  test('stays quiet when nothing changed', () => {
    const root = project({ 'package.json': '{}', 'node_modules/.keep': '' });
    spawnSync('git', ['init', '-q'], { cwd: root });
    spawnSync('git', ['add', '-A'], { cwd: root });
    spawnSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@e.st', 'commit', '-qm', 'init'], { cwd: root });
    assert.equal(hook('check-on-stop.mjs', root, {}).status, 0);
  });
});
