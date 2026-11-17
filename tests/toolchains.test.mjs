import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, describe, test } from 'node:test';
import { TOOLCHAIN, TOOLCHAINS, definedTasks, detectToolchain, requiredTasks, taskCommand } from '../scripts/lib/toolchains.mjs';

const dirs = [];
after(() => dirs.forEach((d) => rmSync(d, { recursive: true, force: true })));
function project(files) {
  const root = mkdtempSync(join(tmpdir(), 'keelwright-tc-'));
  dirs.push(root);
  for (const [f, c] of Object.entries(files)) {
    mkdirSync(join(root, f, '..'), { recursive: true });
    writeFileSync(join(root, f), c);
  }
  return root;
}

describe('toolchains', () => {
  test('every toolchain is defined', () => {
    assert.deepEqual(Object.keys(TOOLCHAIN).sort(), [...TOOLCHAINS].sort());
  });

  test('task names and commands', () => {
    assert.equal(taskCommand('node', 'format:check'), 'npm run format:check');
    assert.equal(taskCommand('python', 'format:check'), 'uv run poe format-check');
    assert.equal(taskCommand('godot', 'test:e2e'), 'just test-e2e');
    assert.equal(taskCommand('editor', 'test'), null);
    assert.deepEqual(requiredTasks('node', 'web'), ['lint', 'format:check', 'typecheck', 'test', 'check', 'dev', 'build', 'test:e2e']);
    assert.ok(requiredTasks('rust', 'library').includes('build'));
    assert.ok(requiredTasks('python', 'ai').includes('eval'));
  });

  test('detects the toolchain from the state, else the manifest', () => {
    assert.equal(detectToolchain(project({ 'pubspec.yaml': '' })), 'dart');
    assert.equal(detectToolchain(project({ 'package.json': '{}', '.keelwright/state.json': JSON.stringify({ stack: { toolchain: 'godot' } }) })), 'godot');
    assert.equal(detectToolchain(project({})), null);
  });

  test('reads poe tasks, justfile recipes and npm scripts', () => {
    const py = project({ 'pyproject.toml': '[project]\nname = "x"\n\n[tool.poe.tasks]\nlint = "ruff check ."\n"format-check" = "ruff format --check ."\n\n[tool.poe.tasks.check]\nsequence = ["lint"]\n\n[tool.ruff]\nline-length = 100\n' });
    assert.deepEqual(definedTasks(py, 'python').sort(), ['check', 'format-check', 'lint']);
    const just = project({ justfile: 'set shell := ["bash", "-c"]\n\n# Lint\nlint:\n  cargo clippy -- -D warnings\n\ntest *args:\n  cargo test {{args}}\n\n@check: lint test\n' });
    assert.deepEqual(definedTasks(just, 'rust'), ['lint', 'test', 'check']);
    assert.deepEqual(definedTasks(project({ 'package.json': '{"scripts":{"dev":"x"}}' }), 'node'), ['dev']);
  });
});
