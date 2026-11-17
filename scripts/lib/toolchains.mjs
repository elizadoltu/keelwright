// What each toolchain uses to build, check and protect a project (spec 5.5, reference/toolchains.md).
// The single machine-readable definition behind preflight, scaffoldcheck and generatecheck; the
// prose rules for the steps are in reference/toolchains.md — keep the two in sync.

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { TOOLCHAINS } from './pipeline.mjs';

export { TOOLCHAINS };

// The task contract: the same task names in every project, so CONTRIBUTING.md, CLAUDE.md, the
// hooks and CI can rely on them. npm scripts use a colon (format:check); just and poe use a dash.
export const TASKS = ['dev', 'build', 'preview', 'lint', 'format', 'format:check', 'typecheck', 'test', 'test:e2e', 'tokens', 'eval', 'check'];

export const TOOLCHAIN = {
  node: {
    runner: 'npm run',
    manifest: 'package.json',
    lockfiles: ['package-lock.json', 'pnpm-lock.yaml', 'yarn.lock', 'bun.lock', 'bun.lockb'],
    runtimePin: ['.nvmrc', '.node-version'],
    gitHooks: 'husky',
    dependabot: ['npm'],
    ignore: ['node_modules'],
    tasks: ['lint', 'format:check', 'typecheck', 'test', 'check'],
    tools: [],
    unitTest: /\.test\.[cm]?[jt]sx?$/,
    check: { run: ['npm', 'run', 'check', '--silent'], requires: 'node_modules', label: 'npm run check' },
    onEdit: [
      { run: ['node_modules/.bin/prettier', '--write', '--ignore-unknown', '--log-level', 'warn', '{file}'] },
      { files: '\\.(?:[cm]?[jt]sx?|astro|vue|svelte)$', run: ['node_modules/.bin/eslint', '--fix', '--no-warn-ignored', '--max-warnings=0', '{file}'], report: true, label: 'ESLint' },
    ],
  },
  python: {
    runner: 'uv run poe',
    manifest: 'pyproject.toml',
    lockfiles: ['uv.lock'],
    runtimePin: ['.python-version'],
    gitHooks: 'pre-commit',
    dependabot: ['uv', 'pre-commit'],
    ignore: ['.venv', '__pycache__'],
    tasks: ['lint', 'format', 'format-check', 'typecheck', 'test', 'check'],
    tools: [{ cmd: 'uv', why: 'installs Python, the dependencies and runs every task (https://docs.astral.sh/uv/getting-started/installation/)' }],
    unitTest: /(^|\/)tests?\/(.+\/)?test_[^/]+\.py$|_test\.py$/,
    check: { run: ['uv', 'run', 'poe', 'check'], requires: '.venv', label: 'uv run poe check' },
    onEdit: [
      { files: '\\.pyi?$', run: ['.venv/bin/ruff', 'format', '{file}'] },
      { files: '\\.pyi?$', run: ['.venv/bin/ruff', 'check', '--fix', '{file}'], report: true, label: 'Ruff' },
    ],
  },
  dart: {
    runner: 'just',
    manifest: 'pubspec.yaml',
    lockfiles: ['pubspec.lock'],
    runtimePin: [],
    gitHooks: 'pre-commit',
    dependabot: ['pub', 'pre-commit'],
    ignore: ['.dart_tool', 'build'],
    tasks: ['lint', 'format', 'format-check', 'test', 'check'],
    tools: [
      { cmd: 'flutter', why: 'the Flutter SDK (https://docs.flutter.dev/get-started/install)' },
      { cmd: 'just', why: 'runs the project tasks (https://just.systems/man/en/packages.html)' },
      { cmd: 'uv', why: 'runs pre-commit for the git hooks (https://docs.astral.sh/uv/getting-started/installation/)' },
    ],
    unitTest: /(^|\/)test\/(.+\/)?[^/]+_test\.dart$/,
    check: { run: ['just', 'check'], requires: '.dart_tool', label: 'just check' },
    onEdit: [
      { files: '\\.dart$', run: ['dart', 'format', '{file}'] },
      { files: '\\.dart$', run: ['dart', 'analyze', '--fatal-infos', '{file}'], report: true, label: 'dart analyze' },
    ],
  },
  rust: {
    runner: 'just',
    manifest: 'Cargo.toml',
    lockfiles: ['Cargo.lock'],
    runtimePin: ['rust-toolchain.toml'],
    gitHooks: 'pre-commit',
    dependabot: ['cargo', 'pre-commit'],
    ignore: ['target'],
    tasks: ['lint', 'format', 'format-check', 'test', 'check'],
    tools: [
      { cmd: 'cargo', why: 'the Rust toolchain via rustup (https://rustup.rs)' },
      { cmd: 'just', why: 'runs the project tasks (https://just.systems/man/en/packages.html)' },
      { cmd: 'uv', why: 'runs pre-commit for the git hooks (https://docs.astral.sh/uv/getting-started/installation/)' },
    ],
    unitTest: /(^src\/.+\.rs$|^tests\/.+\.rs$)/,
    unitTestContent: /#\[test\]|#\[tokio::test\]/,
    check: { run: ['just', 'check'], requires: null, label: 'just check' },
    onEdit: [{ files: '\\.rs$', run: ['rustfmt', '--edition', '2024', '{file}'] }],
  },
  godot: {
    runner: 'just',
    manifest: 'project.godot',
    lockfiles: [],
    runtimePin: [],
    gitHooks: 'pre-commit',
    dependabot: ['pre-commit'],
    ignore: ['.godot'],
    tasks: ['lint', 'format', 'format-check', 'test', 'check'],
    tools: [
      { cmd: 'godot', why: 'the Godot editor binary on PATH as `godot`, for headless import and tests (https://godotengine.org/download)' },
      { cmd: 'just', why: 'runs the project tasks (https://just.systems/man/en/packages.html)' },
      { cmd: 'uv', why: 'runs gdtoolkit (gdformat, gdlint) and pre-commit (https://docs.astral.sh/uv/getting-started/installation/)' },
    ],
    unitTest: /(^|\/)test\/(.+\/)?test_[^/]+\.gd$/,
    check: { run: ['just', 'check'], requires: '.godot', label: 'just check' },
    onEdit: [
      { files: '\\.gd$', run: ['uvx', '--from', 'gdtoolkit==4.*', 'gdformat', '{file}'] },
      { files: '\\.gd$', run: ['uvx', '--from', 'gdtoolkit==4.*', 'gdlint', '{file}'], report: true, label: 'gdlint' },
    ],
  },
  editor: {
    runner: null,
    manifest: null,
    lockfiles: [],
    runtimePin: [],
    gitHooks: 'pre-commit',
    dependabot: [],
    ignore: [],
    tasks: [],
    tools: [{ cmd: 'uv', why: 'runs pre-commit for the git hooks (https://docs.astral.sh/uv/getting-started/installation/)' }],
    unitTest: null,
    check: null,
    onEdit: [],
  },
};

// The project's name for a task: npm keeps the colon, just and poe use a dash.
export const taskName = (toolchain, task) => (toolchain === 'node' ? task : task.replace(/:/g, '-'));

// The command that runs a task, e.g. "uv run poe test" or "just check".
export const taskCommand = (toolchain, task) => (TOOLCHAIN[toolchain]?.runner ? `${TOOLCHAIN[toolchain].runner} ${taskName(toolchain, task)}` : null);

// Required tasks for a project: the toolchain's own, plus what the project type needs.
export function requiredTasks(toolchain, projectType) {
  const tasks = new Set(TOOLCHAIN[toolchain]?.tasks ?? []);
  if (toolchain === 'node' && projectType === 'web') for (const t of ['dev', 'build', 'test:e2e']) tasks.add(t);
  if (projectType === 'library' && toolchain !== 'editor') tasks.add(taskName(toolchain, 'build'));
  // AI projects: offline evals against the eval plan (they call the model, so they cost money and
  // are not part of `check`).
  if (projectType === 'ai' && toolchain !== 'editor') tasks.add('eval');
  return [...tasks];
}

const read = (root, f) => (existsSync(join(root, f)) ? readFileSync(join(root, f), 'utf8') : null);

// The toolchain a project uses: from the state, else from its manifest.
export function detectToolchain(root) {
  try {
    const state = JSON.parse(read(root, '.keelwright/state.json') ?? '{}');
    if (TOOLCHAINS.includes(state.stack?.toolchain)) return state.stack.toolchain;
  } catch {
    // fall through to the files
  }
  if (existsSync(join(root, 'package.json'))) return 'node';
  if (existsSync(join(root, 'pyproject.toml'))) return 'python';
  if (existsSync(join(root, 'pubspec.yaml'))) return 'dart';
  if (existsSync(join(root, 'Cargo.toml'))) return 'rust';
  if (existsSync(join(root, 'project.godot'))) return 'godot';
  return null;
}

// Task names a project defines: npm scripts, poe tasks in pyproject.toml, or justfile recipes.
export function definedTasks(root, toolchain) {
  if (toolchain === 'node') {
    try {
      return Object.keys(JSON.parse(read(root, 'package.json') ?? '{}').scripts ?? {});
    } catch {
      return [];
    }
  }
  if (toolchain === 'python') {
    const text = read(root, 'pyproject.toml') ?? '';
    const names = new Set();
    let inTasks = false;
    for (const line of text.split('\n')) {
      const header = /^\s*\[([^\]]+)\]\s*$/.exec(line);
      if (header) {
        inTasks = header[1].trim() === 'tool.poe.tasks';
        const sub = /^tool\.poe\.tasks\.("?)([\w:-]+)\1$/.exec(header[1].trim());
        if (sub) names.add(sub[2]);
        continue;
      }
      const key = inTasks && /^\s*("?)([\w:-]+)\1\s*=/.exec(line);
      if (key) names.add(key[2]);
    }
    return [...names];
  }
  const just = read(root, 'justfile') ?? read(root, 'Justfile') ?? read(root, '.justfile');
  if (!just) return [];
  return [...just.matchAll(/^@?([A-Za-z_][\w-]*)(?:\s+[^:\n=]*)?:(?!=)/gm)].map((m) => m[1]);
}

// Commands that run project tasks, as written in documents and settings.
export const TASK_COMMAND = /\b(npm run|uv run poe|just) ([\w:-]+)/g;
