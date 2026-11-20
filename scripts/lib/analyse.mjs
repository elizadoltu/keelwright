// `/adopt` create mode, step `analyse` (spec 5.2.1): the facts about an existing repository,
// collected mechanically. Judgement (project type, architecture, conventions) is left to the step,
// which reads this output. Offline and read-only: nothing here writes to the project.

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { availablePacks } from './packs.mjs';
import { pyprojectDependencies } from './scaffoldcheck.mjs';

const read = (root, f) => {
  try {
    return readFileSync(join(root, f), 'utf8');
  } catch {
    return null;
  }
};
const json = (root, f) => {
  try {
    return JSON.parse(read(root, f) ?? 'null');
  } catch {
    return null;
  }
};
const has = (root, f) => existsSync(join(root, f));

// ---------------------------------------------------------------------------
// Files: tracked and untracked-but-not-ignored when the folder is a git repository, else a walk.
// ---------------------------------------------------------------------------

const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'build', 'out', '.next', '.nuxt', '.svelte-kit', '.astro', '.turbo', '.venv', 'venv', '__pycache__', '.mypy_cache', '.pytest_cache', '.ruff_cache', 'target', '.dart_tool', '.godot', 'coverage', '.cache', 'vendor', 'Pods', '.gradle']);
const MAX_FILES = 20_000;

export function listFiles(root) {
  try {
    const out = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 64 * 1024 * 1024 });
    const files = out.split('\0').filter(Boolean).filter((f) => !f.split('/').some((p) => SKIP_DIRS.has(p)));
    return { git: true, files: files.filter((f) => existsSync(join(root, f))).sort().slice(0, MAX_FILES) };
  } catch {
    const files = [];
    const walk = (dir, rel) => {
      for (const n of readdirSync(dir)) {
        if (files.length >= MAX_FILES) return;
        const abs = join(dir, n);
        const r = rel ? `${rel}/${n}` : n;
        let st;
        try {
          st = statSync(abs);
        } catch {
          continue;
        }
        if (st.isDirectory()) {
          if (!SKIP_DIRS.has(n)) walk(abs, r);
        } else files.push(r);
      }
    };
    walk(root, '');
    return { git: false, files: files.sort() };
  }
}

// ---------------------------------------------------------------------------
// Toolchain, package manager, runtime pins
// ---------------------------------------------------------------------------

// Languages KeelWright has no toolchain for yet: reported so the step can say so.
const OTHER_LANGUAGES = [
  ['go', ['go.mod']],
  ['java / kotlin', ['pom.xml', 'build.gradle', 'build.gradle.kts']],
  ['ruby', ['Gemfile']],
  ['php', ['composer.json']],
  ['.net', ['global.json', 'Directory.Build.props']],
  ['swift', ['Package.swift']],
  ['elixir', ['mix.exs']],
];

export function detectStack(root, files) {
  const top = new Set(files.filter((f) => !f.includes('/')));
  let toolchain = null;
  if (top.has('package.json')) toolchain = 'node';
  else if (top.has('pyproject.toml') || top.has('requirements.txt') || top.has('setup.py') || top.has('Pipfile')) toolchain = 'python';
  else if (top.has('pubspec.yaml')) toolchain = 'dart';
  else if (top.has('Cargo.toml')) toolchain = 'rust';
  else if (top.has('project.godot')) toolchain = 'godot';
  else if (files.some((f) => /^(Assets|ProjectSettings)\//.test(f)) && files.some((f) => f.startsWith('ProjectSettings/'))) toolchain = 'editor';
  else if (files.some((f) => /\.uproject$/.test(f) || /\.xcodeproj\//.test(f))) toolchain = 'editor';
  if (!toolchain && top.has('build.gradle.kts') && files.some((f) => f.startsWith('app/src/main/'))) toolchain = 'editor';
  const others = OTHER_LANGUAGES.filter(([, markers]) => markers.some((m) => top.has(m) || files.some((f) => f.endsWith('.csproj')) && m === 'global.json')).map(([l]) => l);

  let packageManager = null;
  if (toolchain === 'node') {
    const declared = /^(npm|pnpm|yarn|bun)@/.exec(json(root, 'package.json')?.packageManager ?? '')?.[1];
    packageManager = declared ?? (top.has('pnpm-lock.yaml') ? 'pnpm' : top.has('yarn.lock') ? 'yarn' : top.has('bun.lock') || top.has('bun.lockb') ? 'bun' : 'npm');
  } else if (toolchain === 'python') {
    packageManager = top.has('uv.lock') ? 'uv' : top.has('poetry.lock') || /\[tool\.poetry\]/.test(read(root, 'pyproject.toml') ?? '') ? 'poetry' : top.has('Pipfile') ? 'pipenv' : top.has('pdm.lock') ? 'pdm' : 'pip';
  } else if (toolchain === 'dart') packageManager = /\bflutter:/.test(read(root, 'pubspec.yaml') ?? '') ? 'flutter' : 'dart';
  else if (toolchain === 'rust') packageManager = 'cargo';

  const LOCKS = ['package-lock.json', 'pnpm-lock.yaml', 'yarn.lock', 'bun.lock', 'bun.lockb', 'uv.lock', 'poetry.lock', 'Pipfile.lock', 'pdm.lock', 'Cargo.lock', 'pubspec.lock'];
  const lockfiles = LOCKS.filter((l) => top.has(l));

  const runtime = {};
  const pin = (file, value) => {
    if (value) runtime[file] = value.trim();
  };
  pin('.nvmrc', read(root, '.nvmrc'));
  pin('.node-version', read(root, '.node-version'));
  pin('package.json engines.node', json(root, 'package.json')?.engines?.node);
  pin('.python-version', read(root, '.python-version'));
  pin('pyproject.toml requires-python', /^\s*requires-python\s*=\s*["']([^"']+)["']/m.exec(read(root, 'pyproject.toml') ?? '')?.[1]);
  pin('rust-toolchain', read(root, 'rust-toolchain') ?? /channel\s*=\s*["']([^"']+)["']/.exec(read(root, 'rust-toolchain.toml') ?? '')?.[1]);
  pin('pubspec.yaml sdk', /^\s*sdk:\s*["']?([^"'\n]+)["']?/m.exec(/environment:[\s\S]*?(?=\n\S|$)/.exec(read(root, 'pubspec.yaml') ?? '')?.[0] ?? '')?.[1]);
  pin('.tool-versions', read(root, '.tool-versions'));
  pin('project.godot', /config\/features=PackedStringArray\("([\d.]+)/.exec(read(root, 'project.godot') ?? '')?.[1]);

  return { toolchain, otherLanguages: others, packageManager, lockfiles, runtime };
}

// ---------------------------------------------------------------------------
// Dependencies with their locked versions
// ---------------------------------------------------------------------------

// `ws`: a workspace folder — its own nested install first (npm), its importer block (pnpm).
function nodeLocked(root, name, ws = null) {
  const lock = json(root, 'package-lock.json');
  for (const key of [...(ws ? [`${ws}/node_modules/${name}`] : []), `node_modules/${name}`]) if (lock?.packages?.[key]?.version) return lock.packages[key].version;
  let pnpm = read(root, 'pnpm-lock.yaml');
  if (pnpm && ws) {
    const start = pnpm.search(new RegExp(`\\n  '?${ws.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')}'?:\\n`));
    if (start >= 0) {
      const rest = pnpm.slice(start + 1);
      const end = rest.slice(1).search(/\n  \S|\n\S/);
      pnpm = `\n${end >= 0 ? rest.slice(0, end + 1) : rest}`;
    }
  }
  if (pnpm) {
    // importers: . : dependencies: <name>: { specifier, version } — the version may carry peer suffixes.
    const esc = name.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
    const m = new RegExp(`\\n\\s+'?${esc}'?:\\n\\s+specifier:[^\\n]*\\n\\s+version:\\s*'?([^\\s'(]+)`).exec(pnpm);
    if (m) return m[1];
  }
  const yarn = read(root, 'yarn.lock');
  if (yarn) {
    const esc = name.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
    const m = new RegExp(`(?:^|\\n)"?${esc}@[^\\n]*:\\n\\s+version:?\\s+"?([^"\\s]+)`).exec(yarn);
    if (m) return m[1];
  }
  return json(root, `${ws ? `${ws}/` : ''}node_modules/${name}/package.json`)?.version ?? json(root, `node_modules/${name}/package.json`)?.version ?? null;
}

// [[package]] name = "x" / version = "y" — uv.lock, poetry.lock, pdm.lock and Cargo.lock share it.
function tomlLock(text) {
  const out = {};
  for (const block of (text ?? '').split(/\n\[\[package\]\]\n/).slice(1)) {
    const name = /^name\s*=\s*"([^"]+)"/m.exec(block)?.[1];
    const version = /^version\s*=\s*"([^"]+)"/m.exec(block)?.[1];
    if (name && version) out[name.toLowerCase().replace(/_/g, '-')] = version;
  }
  return out;
}

const pyName = (d) => /^([A-Za-z0-9][\w.-]*)/.exec(d)?.[1]?.toLowerCase().replace(/_/g, '-') ?? null;
const pySpec = (d) => d.slice(pyName(d)?.length ?? 0).replace(/^\[[^\]]*\]/, '').split(';')[0].trim();

export function dependencies(root, toolchain) {
  const deps = [];
  if (toolchain === 'node') {
    const pkg = json(root, 'package.json') ?? {};
    for (const [group, dev] of [['dependencies', false], ['devDependencies', true], ['peerDependencies', false]]) {
      for (const [name, spec] of Object.entries(pkg[group] ?? {})) {
        if (deps.some((d) => d.name === name)) continue;
        deps.push({ name, spec, locked: nodeLocked(root, name), dev });
      }
    }
  } else if (toolchain === 'python') {
    const locked = { ...tomlLock(read(root, 'poetry.lock')), ...tomlLock(read(root, 'pdm.lock')), ...tomlLock(read(root, 'uv.lock')) };
    const py = pyprojectDependencies(read(root, 'pyproject.toml') ?? '');
    const add = (d, dev) => {
      const name = pyName(d);
      if (name && name !== 'python' && !deps.some((x) => x.name === name)) deps.push({ name, spec: pySpec(d), locked: locked[name] ?? (/^==\s*([\w.]+)$/.exec(pySpec(d))?.[1] ?? null), dev });
    };
    py.runtime.forEach((d) => add(d, false));
    py.dev.forEach((d) => add(d, true));
    // Poetry: [tool.poetry.dependencies] and [tool.poetry.group.<g>.dependencies] tables.
    let section = null;
    for (const line of (read(root, 'pyproject.toml') ?? '').split('\n')) {
      const h = /^\s*\[([^\]]+)\]\s*$/.exec(line);
      if (h) {
        section = h[1].trim();
        continue;
      }
      const m = /^\s*([A-Za-z0-9][\w.-]*)\s*=\s*(.+)$/.exec(line);
      if (!m || !section) continue;
      if (section === 'tool.poetry.dependencies') add(`${m[1]}${m[2].replace(/["'{}]/g, '').trim()}`, false);
      else if (/^tool\.poetry\.(group\.[\w-]+\.)?dev-dependencies$|^tool\.poetry\.group\.[\w-]+\.dependencies$/.test(section)) add(`${m[1]}${m[2].replace(/["'{}]/g, '').trim()}`, true);
    }
    for (const f of ['requirements.txt', 'requirements-dev.txt', 'requirements/dev.txt', 'requirements/base.txt']) {
      for (const line of (read(root, f) ?? '').split('\n')) {
        const l = line.replace(/#.*/, '').trim();
        if (l && !l.startsWith('-')) add(l, /dev/.test(f));
      }
    }
  } else if (toolchain === 'rust') {
    const locked = tomlLock(read(root, 'Cargo.lock'));
    let section = null;
    for (const line of (read(root, 'Cargo.toml') ?? '').split('\n')) {
      const h = /^\s*\[([^\]]+)\]\s*$/.exec(line);
      if (h) {
        section = h[1].trim();
        continue;
      }
      const m = /^\s*([\w-]+)\s*=\s*(.+)$/.exec(line);
      if (m && /^(dependencies|dev-dependencies|build-dependencies)$/.test(section)) {
        const spec = /^"([^"]+)"/.exec(m[2])?.[1] ?? /version\s*=\s*"([^"]+)"/.exec(m[2])?.[1] ?? m[2].trim();
        deps.push({ name: m[1], spec, locked: locked[m[1].replace(/_/g, '-')] ?? null, dev: section !== 'dependencies' });
      }
    }
  } else if (toolchain === 'dart') {
    const lock = read(root, 'pubspec.lock') ?? '';
    const lockedOf = (n) => new RegExp(`\\n  ${n}:\\n(?:    .*\\n)*?    version: "([^"]+)"`).exec(lock)?.[1] ?? null;
    let group = null;
    for (const line of (read(root, 'pubspec.yaml') ?? '').split('\n')) {
      if (/^\S/.test(line)) group = /^(dependencies|dev_dependencies):/.exec(line)?.[1] ?? null;
      const m = group && /^  ([\w-]+):\s*(.*)$/.exec(line);
      if (m) deps.push({ name: m[1], spec: m[2].trim() || null, locked: lockedOf(m[1]), dev: group === 'dev_dependencies' });
    }
  }
  return deps;
}

// ---------------------------------------------------------------------------
// Frameworks and the stack packs that cover them
// ---------------------------------------------------------------------------

const FRAMEWORKS = [
  ['Next.js', 'frontend', ['next']],
  ['Remix / React Router', 'frontend', ['@remix-run/*', 'react-router', '@react-router/*']],
  ['TanStack Start', 'frontend', ['@tanstack/react-start']],
  ['Astro', 'frontend', ['astro']],
  ['Nuxt', 'frontend', ['nuxt']],
  ['SvelteKit', 'frontend', ['@sveltejs/kit']],
  ['Angular', 'frontend', ['@angular/core']],
  ['Vue', 'ui', ['vue']],
  ['Svelte', 'ui', ['svelte']],
  ['React', 'ui', ['react']],
  ['Solid', 'ui', ['solid-js']],
  ['Vite', 'build', ['vite']],
  ['Expo', 'mobile', ['expo']],
  ['React Native', 'mobile', ['react-native']],
  ['Electron', 'desktop', ['electron']],
  ['Express', 'backend', ['express']],
  ['Fastify', 'backend', ['fastify']],
  ['NestJS', 'backend', ['@nestjs/core']],
  ['Hono', 'backend', ['hono']],
  ['Koa', 'backend', ['koa']],
  ['Prisma', 'data', ['prisma', '@prisma/client']],
  ['Drizzle', 'data', ['drizzle-orm']],
  ['Supabase', 'data', ['@supabase/supabase-js', 'supabase']],
  ['Mongoose', 'data', ['mongoose']],
  ['TypeORM', 'data', ['typeorm']],
  ['Sequelize', 'data', ['sequelize']],
  ['Tailwind CSS', 'styling', ['tailwindcss']],
  ['TypeScript', 'language', ['typescript']],
  ['Vitest', 'test', ['vitest']],
  ['Jest', 'test', ['jest']],
  ['Mocha', 'test', ['mocha']],
  ['Playwright', 'e2e', ['@playwright/test']],
  ['Cypress', 'e2e', ['cypress']],
  ['Phaser', 'game', ['phaser']],
  ['Three.js', 'graphics', ['three']],
  ['Anthropic SDK', 'ai', ['@anthropic-ai/sdk', 'anthropic']],
  ['OpenAI SDK', 'ai', ['openai']],
  ['LangChain', 'ai', ['langchain', '@langchain/*', 'langchain-*']],
  ['Django', 'backend', ['django']],
  ['FastAPI', 'backend', ['fastapi']],
  ['Flask', 'backend', ['flask']],
  ['SQLAlchemy', 'data', ['sqlalchemy']],
  ['Pydantic', 'data', ['pydantic']],
  ['Celery', 'jobs', ['celery']],
  ['pytest', 'test', ['pytest']],
  ['Typer / Click', 'cli', ['typer', 'click']],
  ['Flutter', 'mobile', ['flutter']],
  ['Axum', 'backend', ['axum']],
  ['Actix Web', 'backend', ['actix-web']],
  ['Tokio', 'runtime', ['tokio']],
  ['Bevy', 'game', ['bevy']],
  ['Clap', 'cli', ['clap']],
];

const globRe = (g) => new RegExp(`^${g.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*')}$`);

export function frameworks(deps) {
  return FRAMEWORKS.flatMap(([name, kind, pkgs]) => {
    const res = pkgs.map(globRe);
    const hit = deps.find((d) => res.some((r) => r.test(d.name)));
    return hit ? [{ name, kind, package: hit.name, version: hit.locked ?? hit.spec, ...(hit.workspace ? { workspace: hit.workspace } : {}) }] : [];
  });
}

export function packCandidates(deps, pluginRoot) {
  if (!pluginRoot) return [];
  const packs = availablePacks(pluginRoot);
  return Object.entries(packs)
    .filter(([, list]) => (list[0].meta.packages ?? []).some((g) => deps.some((d) => globRe(g).test(d.name))))
    .map(([id]) => id)
    .sort();
}

// ---------------------------------------------------------------------------
// Tasks, mapped to KeelWright's task contract
// ---------------------------------------------------------------------------

const CONTRACT = {
  dev: ['dev', 'start:dev', 'serve', 'start'],
  build: ['build'],
  lint: ['lint', 'lint:check', 'eslint', 'style', 'pre-commit'],
  format: ['format', 'fmt', 'prettier:write', 'format:write'],
  'format:check': ['format:check', 'format-check', 'fmt:check', 'fmt-check', 'prettier:check', 'check-format', 'check:format'],
  typecheck: ['typecheck', 'type-check', 'types', 'check-types', 'check:types', 'tsc', 'typecheck:all', 'mypy', 'pyright', 'typing'],
  test: ['test', 'test:unit', 'unit', 'tests', 'py', 'tests-dev'],
  'test:e2e': ['test:e2e', 'e2e', 'test-e2e', 'playwright', 'cypress', 'test:integration'],
  check: ['check', 'verify', 'validate', 'ci', 'check-all', 'precommit'],
};

const runnerFor = (toolchain, pm, source) => {
  if (source === 'make') return 'make';
  if (source === 'just') return 'just';
  if (source === 'poe') return { uv: 'uv run poe', poetry: 'poetry run poe', pdm: 'pdm run poe' }[pm] ?? 'poe';
  if (source === 'pdm') return 'pdm run';
  if (source === 'tox') return 'tox run -e';
  if (source === 'nox') return 'nox -s';
  if (source === 'composer') return 'composer';
  return { npm: 'npm run', pnpm: 'pnpm', yarn: 'yarn', bun: 'bun run' }[pm] ?? 'npm run';
};

function makeTargets(text) {
  return [...(text ?? '').matchAll(/^([A-Za-z][\w:-]*)\s*:(?!=)/gm)].map((m) => m[1]).filter((t) => t !== 'PHONY');
}
function justRecipes(text) {
  return [...(text ?? '').matchAll(/^@?([A-Za-z][\w-]*)(?:\s+[^:=\n]*)?:(?!=)/gm)].map((m) => m[1]).filter((t) => !['set', 'alias', 'export'].includes(t));
}
// tox environments: tox.ini [testenv:<name>] and pyproject [tool.tox.env.<name>]; nox sessions.
function toxEnvs(ini, pyproject) {
  return [...new Set([...(ini ?? '').matchAll(/^\[testenv:([\w.-]+)\]/gm), ...(pyproject ?? '').matchAll(/^\[tool\.tox\.env\.([\w.-]+)\]/gm)].map((m) => m[1]))];
}
function noxSessions(text) {
  return [...(text ?? '').matchAll(/@(?:nox\.)?session[^\n]*\n\s*def\s+(\w+)/g)].map((m) => m[1]);
}
function poeTasks(text) {
  const names = new Set();
  let inTasks = false;
  for (const line of (text ?? '').split('\n')) {
    const h = /^\s*\[([^\]]+)\]\s*$/.exec(line);
    if (h) {
      inTasks = h[1].trim() === 'tool.poe.tasks';
      const sub = /^tool\.poe\.tasks\.("?)([\w:-]+)\1$/.exec(h[1].trim());
      if (sub) names.add(sub[2]);
      continue;
    }
    const k = inTasks && /^\s*("?)([\w:-]+)\1\s*=/.exec(line);
    if (k) names.add(k[2]);
  }
  return [...names];
}

// A script that only prints (npm init's default test, "echo 'No tests yet' && exit 0") is not a task.
const PLACEHOLDER = /^echo\s+(["'])[^"']*\1\s*(&&\s*exit\s+\d+)?$/;

function contractOf(defined) {
  const contract = {};
  for (const [task, names] of Object.entries(CONTRACT)) {
    const variants = (n) => [n, n.replace(/:/g, '-'), n.replace(/:/g, '_')];
    const hit = names.flatMap(variants).map((n) => defined.find((d) => d.name === n)).find(Boolean);
    if (hit) contract[task] = hit.run;
  }
  return contract;
}

// A workspace's script, run from the repository root the package manager's way.
export function workspaceRun(pm, path, name, script) {
  if (pm === 'pnpm') return `pnpm --filter ${name} ${script}`;
  if (pm === 'yarn') return `yarn workspace ${name} ${script}`;
  if (pm === 'bun') return `bun run --filter ${name} ${script}`;
  return `npm run ${script} --workspace ${path}`;
}

export function tasks(root, toolchain, packageManager) {
  const defined = [];
  const add = (name, source, command) => defined.push({ name, source, run: `${runnerFor(toolchain, packageManager, source)} ${name}`, command });
  const pkg = json(root, 'package.json');
  for (const [n, c] of Object.entries(pkg?.scripts ?? {})) if (!PLACEHOLDER.test(String(c).trim())) add(n, 'package.json', c);
  for (const n of poeTasks(read(root, 'pyproject.toml'))) add(n, 'poe');
  for (const f of ['justfile', 'Justfile', '.justfile']) for (const n of justRecipes(read(root, f))) add(n, 'just');
  for (const f of ['Makefile', 'makefile', 'GNUmakefile']) for (const n of makeTargets(read(root, f))) add(n, 'make');
  for (const n of toxEnvs(read(root, 'tox.ini'), read(root, 'pyproject.toml'))) add(n, 'tox');
  for (const n of noxSessions(read(root, 'noxfile.py'))) add(n, 'nox');
  // npm's own shortcuts
  for (const t of defined) if (t.source === 'package.json' && packageManager === 'npm' && ['test', 'start'].includes(t.name)) t.run = `npm ${t.name}`;

  const contract = contractOf(defined);
  // Toolchains whose own CLI covers a task without a task runner.
  if (toolchain === 'rust') {
    contract.build ??= 'cargo build';
    contract.test ??= 'cargo test';
    contract.lint ??= 'cargo clippy --all-targets -- -D warnings';
    contract['format:check'] ??= 'cargo fmt --check';
  }
  if (toolchain === 'dart') {
    const flutter = packageManager === 'flutter';
    contract.test ??= flutter ? 'flutter test' : 'dart test';
    contract.lint ??= flutter ? 'flutter analyze' : 'dart analyze';
    contract['format:check'] ??= 'dart format --output=none --set-exit-if-changed .';
  }
  const missing = ['lint', 'test', 'typecheck', 'format:check', 'check'].filter((t) => !contract[t]);
  return { defined, contract, missing };
}

// ---------------------------------------------------------------------------
// Tooling already in place
// ---------------------------------------------------------------------------

export function tooling(root, files, deps) {
  const dep = (...names) => names.some((n) => deps.some((d) => d.name === n));
  const file = (re) => files.filter((f) => re.test(f));
  const pyproject = read(root, 'pyproject.toml') ?? '';
  const t = {
    lint: [],
    format: [],
    types: [],
    test: [],
    e2e: [],
    hooks: [],
    secrets: [],
    commits: [],
    ci: [],
    dependencyUpdates: [],
    env: [],
  };
  const put = (k, name, evidence) => evidence.length && t[k].push({ name, evidence: evidence.slice(0, 3) });
  put('lint', 'ESLint', [...file(/(^|\/)(eslint\.config\.[cm]?[jt]s|\.eslintrc(\.\w+)?)$/), ...(dep('eslint') ? ['package.json'] : [])]);
  put('lint', 'Biome', file(/(^|\/)biome\.jsonc?$/));
  put('lint', 'Oxlint', [...file(/(^|\/)\.?oxlintrc\.json$/), ...(dep('oxlint') ? ['package.json'] : [])]);
  put('lint', 'Ruff', [...file(/(^|\/)\.?ruff\.toml$/), ...(/\[tool\.ruff/.test(pyproject) ? ['pyproject.toml'] : [])]);
  put('lint', 'Flake8', file(/(^|\/)\.flake8$/));
  put('lint', 'Pylint', [...file(/(^|\/)\.pylintrc$/), ...(/\[tool\.pylint/.test(pyproject) ? ['pyproject.toml'] : [])]);
  put('lint', 'Dart analyzer', file(/^analysis_options\.yaml$/));
  put('lint', 'Clippy', file(/(^|\/)\.?clippy\.toml$/));
  put('lint', 'gdlint', file(/(^|\/)gdlintrc$/));
  put('format', 'Prettier', [...file(/(^|\/)(\.prettierrc(\.\w+)?|prettier\.config\.[cm]?[jt]s)$/), ...(dep('prettier') ? ['package.json'] : [])]);
  put('format', 'Biome', file(/(^|\/)biome\.jsonc?$/));
  put('format', 'Black', /\[tool\.black\]/.test(pyproject) || dep('black') ? ['pyproject.toml'] : []);
  put('format', 'Ruff format', /\[tool\.ruff\.format\]/.test(pyproject) ? ['pyproject.toml'] : []);
  put('format', 'rustfmt', file(/(^|\/)\.?rustfmt\.toml$/));
  put('format', 'EditorConfig', file(/^\.editorconfig$/));
  // The root tsconfig, or the workspaces' (nested tsconfigs elsewhere are examples or tooling).
  const tsconfigs = file(/^([\w@.-]+\/){0,2}tsconfig(\.[\w-]+)?\.json$/).filter((f) => !/(^|\/)(examples?|fixtures?|templates?|node_modules)\//.test(f));
  const strict = tsconfigs.some((f) => /"strict"\s*:\s*true|tsconfigs\/strict/.test(read(root, f) ?? ''));
  put('types', strict ? 'TypeScript (strict)' : 'TypeScript', tsconfigs);
  put('types', 'mypy', [...file(/(^|\/)mypy\.ini$/), ...(/\[tool\.mypy\]/.test(pyproject) ? ['pyproject.toml'] : [])]);
  put('types', 'Pyright', [...file(/(^|\/)pyrightconfig\.json$/), ...(/\[tool\.pyright\]/.test(pyproject) ? ['pyproject.toml'] : [])]);
  put('test', 'Vitest', [...file(/(^|\/)vitest\.(config|workspace)\.[cm]?[jt]s$/), ...(dep('vitest') ? ['package.json'] : [])]);
  put('test', 'Jest', [...file(/(^|\/)jest\.config\.[cm]?[jt]s(on)?$/), ...(dep('jest') ? ['package.json'] : [])]);
  put('test', 'Mocha', [...file(/(^|\/)\.mocharc(\.\w+)?$/), ...(dep('mocha') ? ['package.json'] : [])]);
  put('test', 'pytest', [...file(/(^|\/)(pytest\.ini|conftest\.py)$/), ...(/\[tool\.pytest/.test(pyproject) || dep('pytest') ? ['pyproject.toml'] : [])]);
  put('test', 'gdUnit4', file(/^addons\/gdUnit4\//));
  put('e2e', 'Playwright', [...file(/(^|\/)playwright\.config\.[cm]?[jt]s$/), ...(dep('@playwright/test') ? ['package.json'] : [])]);
  put('e2e', 'Cypress', [...file(/(^|\/)cypress\.config\.[cm]?[jt]s$/), ...(dep('cypress') ? ['package.json'] : [])]);
  put('e2e', 'Maestro', file(/^\.maestro\//));
  put('hooks', 'Husky', file(/^\.husky\/[^_][\w-]*$/));
  put('hooks', 'Lefthook', file(/^\.?lefthook(-local)?\.ya?ml$/));
  put('hooks', 'pre-commit', file(/^\.pre-commit-config\.ya?ml$/));
  put('hooks', 'simple-git-hooks', dep('simple-git-hooks') ? ['package.json'] : []);
  put('hooks', 'lint-staged', [...file(/(^|\/)(\.lintstagedrc(\.\w+)?|lint-staged\.config\.[cm]?[jt]s)$/), ...(dep('lint-staged') ? ['package.json'] : [])]);

  const ciFiles = file(/^(\.github\/workflows\/[^/]+\.ya?ml|\.gitlab-ci\.yml|\.circleci\/config\.yml|azure-pipelines\.ya?ml|bitbucket-pipelines\.yml|Jenkinsfile|\.buildkite\/[^/]+\.ya?ml)$/);
  const ciSystem = (f) => (f.startsWith('.github/') ? 'GitHub Actions' : f.startsWith('.gitlab') ? 'GitLab CI' : f.startsWith('.circleci') ? 'CircleCI' : f.startsWith('azure') ? 'Azure Pipelines' : f.startsWith('bitbucket') ? 'Bitbucket Pipelines' : f === 'Jenkinsfile' ? 'Jenkins' : 'Buildkite');
  for (const sys of [...new Set(ciFiles.map(ciSystem))]) put('ci', sys, ciFiles.filter((f) => ciSystem(f) === sys));

  const hookAndCi = [...t.hooks.flatMap((h) => h.evidence), ...ciFiles].filter((f) => has(root, f) && !statSync(join(root, f)).isDirectory());
  const scanText = (re) => hookAndCi.filter((f) => re.test(read(root, f) ?? ''));
  put('secrets', 'gitleaks', [...scanText(/gitleaks/), ...file(/^\.gitleaks\.toml$/)]);
  put('secrets', 'TruffleHog', scanText(/trufflehog/i));
  put('secrets', 'detect-secrets', [...scanText(/detect-secrets/), ...file(/^\.secrets\.baseline$/)]);
  put('commits', 'commitlint', [...file(/(^|\/)(commitlint\.config\.[cm]?[jt]s|\.commitlintrc(\.\w+)?)$/), ...(dep('@commitlint/cli') ? ['package.json'] : [])]);
  put('commits', 'conventional-pre-commit', scanText(/conventional-pre-commit/));
  put('dependencyUpdates', 'Dependabot', file(/^\.github\/dependabot\.ya?ml$/));
  put('dependencyUpdates', 'Renovate', file(/^(\.github\/)?renovate\.json5?$|^\.renovaterc(\.json)?$/));
  put('env', '.env.example', file(/(^|\/)\.env\.(example|sample|template)$/));
  return { ...t, ciFiles };
}

// What the CI configuration seems to run, by keyword — enough to spot a CI that runs no checks.
// Task calls (`npm run check`, `make lint`) are expanded into their commands first.
export function ciRuns(root, ciFiles, defined) {
  let text = ciFiles.map((f) => read(root, f) ?? '').join('\n');
  for (let depth = 0; depth < 3; depth++) {
    const extra = defined.filter((d) => d.command && new RegExp(`(^|[\\s;&|])${d.run.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\w:-])`).test(text) && !text.includes(d.command)).map((d) => d.command);
    if (!extra.length) break;
    text += `\n${extra.join('\n')}`;
  }
  const runs = [];
  if (/\b(lint|eslint|ruff check|clippy|analyze|biome (check|ci)|pre-commit run)\b/.test(text)) runs.push('lint');
  if (/\b(test|pytest|vitest|jest|tox run|nox)\b/.test(text)) runs.push('test');
  if (/\b(typecheck|type-check|tsc|mypy|pyright|astro check|typing)\b/.test(text)) runs.push('typecheck');
  if (/\b(build)\b/.test(text)) runs.push('build');
  if (/gitleaks|trufflehog|detect-secrets/.test(text)) runs.push('secrets');
  return runs;
}

// ---------------------------------------------------------------------------
// Structure, docs, tests, other tools' instructions, monorepo markers
// ---------------------------------------------------------------------------

export function structure(files) {
  const counts = new Map();
  for (const f of files) {
    const parts = f.split('/');
    if (parts.length < 2) continue;
    const top = parts[0];
    counts.set(top, (counts.get(top) ?? 0) + 1);
    if (parts.length > 2) counts.set(`${top}/${parts[1]}`, (counts.get(`${top}/${parts[1]}`) ?? 0) + 1);
  }
  const dirs = [...counts.entries()].map(([dir, n]) => ({ dir: `${dir}/`, files: n })).sort((a, b) => a.dir.localeCompare(b.dir));
  const ext = new Map();
  for (const f of files) {
    const m = /\.([A-Za-z0-9]+)$/.exec(f);
    if (m) ext.set(m[1].toLowerCase(), (ext.get(m[1].toLowerCase()) ?? 0) + 1);
  }
  const extensions = Object.fromEntries([...ext.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12));
  return { files: files.length, topLevel: files.filter((f) => !f.includes('/')), dirs, extensions };
}

const TEST_FILE = /(^|\/)(__tests__|tests?)\/|\.(test|spec)\.[cm]?[jt]sx?$|(^|\/)test_[^/]+\.py$|_test\.(py|go|dart)$|(^|\/)test_[^/]+\.gd$/;

export function testFiles(files) {
  const list = files.filter((f) => TEST_FILE.test(f) && /\.[a-z]+$/.test(f) && !/\.(snap|json|md|txt|png|jpe?g|svg)$/.test(f));
  return { count: list.length, sample: list.slice(0, 8) };
}

const INSTRUCTION_FILES = /^(AGENTS\.md|GEMINI\.md|CONVENTIONS\.md|\.cursorrules|\.windsurfrules|\.cursor\/rules\/.+|\.github\/copilot-instructions\.md|\.github\/instructions\/.+\.md|\.clinerules(\/.+)?)$/;

export function docs(files) {
  const md = files.filter((f) => /\.(md|mdx|adoc|rst)$/i.test(f));
  const adrDirs = [...new Set(md.map((f) => /^(.*(?:^|\/)(?:adrs?|decisions|decision-records)\/)/i.exec(f)?.[1]).filter(Boolean))];
  return {
    readme: files.find((f) => /^readme(\.\w+)?$/i.test(f)) ?? null,
    contributing: files.find((f) => /^(\.github\/)?contributing(\.\w+)?$/i.test(f)) ?? null,
    adrDirs: adrDirs.map((d) => ({ dir: d, count: md.filter((f) => f.startsWith(d)).length })),
    docs: md.filter((f) => /^docs?\//i.test(f)).slice(0, 60),
    instructions: files.filter((f) => INSTRUCTION_FILES.test(f)),
    // A Claude setup: CLAUDE.md or .claude/ at the root, or a nested CLAUDE.md outside templates and fixtures.
    claude: files.filter((f) => /^(CLAUDE\.md|\.claude\/.+|CLAUDE\.local\.md)$/.test(f) || (/\/CLAUDE\.md$/.test(f) && !/(^|\/)(templates?|fixtures?|examples?|test|tests)\//.test(f))),
  };
}

export function monorepo(root, files) {
  const pkg = json(root, 'package.json');
  const markers = [];
  if (pkg?.workspaces) markers.push('package.json workspaces');
  for (const f of ['pnpm-workspace.yaml', 'nx.json', 'turbo.json', 'lerna.json', 'rush.json']) if (files.includes(f)) markers.push(f);
  if (/^\s*\[workspace\]/m.test(read(root, 'Cargo.toml') ?? '')) markers.push('Cargo.toml [workspace]');
  if (/\[tool\.uv\.workspace\]/.test(read(root, 'pyproject.toml') ?? '')) markers.push('pyproject.toml [tool.uv.workspace]');
  const MANIFEST = /(^|\/)(package\.json|pyproject\.toml|Cargo\.toml|pubspec\.yaml|go\.mod)$/;
  const packages = [...new Set(files.filter((f) => f.includes('/') && MANIFEST.test(f) && !/(^|\/)(examples?|fixtures?|templates?|test|tests|e2e)\//.test(f)).map((f) => f.replace(/\/[^/]+$/, '')))].sort();
  if (packages.length >= 2 && !markers.length) markers.push(`${packages.length} nested manifests`);
  // A workspace repo adopted as ONE project (spec 5.2.1): package-manager workspaces (npm, pnpm,
  // yarn; Turborepo on top is fine), one lockfile at the root, every nested project a Node.js
  // workspace, at most MAX_WORKSPACES of them. Anything else is a monorepo: adopt one package.
  const workspaces = workspacePaths(root, files);
  const stray = packages.filter((p) => !workspaces.includes(p));
  const why = [];
  if (!markers.some((m) => m === 'package.json workspaces' || m === 'pnpm-workspace.yaml')) why.push('no npm, pnpm or yarn workspaces');
  for (const m of markers.filter((x) => ['nx.json', 'lerna.json', 'rush.json'].includes(x) || x.startsWith('Cargo') || x.startsWith('pyproject'))) why.push(`${m} isn't supported yet`);
  if (workspaces.length > MAX_WORKSPACES) why.push(`${workspaces.length} workspaces (at most ${MAX_WORKSPACES})`);
  if (stray.length) why.push(`projects outside the workspaces: ${stray.slice(0, 5).join(', ')}`);
  const detected = markers.length > 0;
  return { detected, markers, packages: packages.slice(0, 30), workspaces, adoptable: detected && !why.length && workspaces.length > 0, notAdoptable: detected ? why : [] };
}

const MAX_WORKSPACES = 6;

function workspacePaths(root, files) {
  const pkg = json(root, 'package.json');
  let globs = Array.isArray(pkg?.workspaces) ? pkg.workspaces : (pkg?.workspaces?.packages ?? []);
  const pnpm = read(root, 'pnpm-workspace.yaml');
  const block = pnpm ? (/^packages:\s*\n((?:[ \t]+-.*\n?)+)/m.exec(pnpm)?.[1] ?? '') : '';
  globs = [...globs, ...[...block.matchAll(/-\s*['"]?([^'"\n#]+?)['"]?\s*(?:#.*)?$/gm)].map((m) => m[1].trim())];
  const res = globs.filter((g) => !g.startsWith('!')).map((g) => new RegExp(`^${g.replace(/\/$/, '').replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*\*/g, '§').replace(/\*/g, '[^/]*').replace(/§/g, '.*')}$`));
  const dirs = files.filter((f) => /\/package\.json$/.test(f) && !/(^|\/)node_modules\//.test(f)).map((f) => f.replace(/\/package\.json$/, ''));
  return [...new Set(dirs.filter((d) => res.some((r) => r.test(d))))].sort();
}

// One workspace of an adopted workspace repo: its dependencies (locked from the root lockfile),
// frameworks, tasks run from the root, and tests.
export function workspace(root, files, path, pm) {
  const pkg = json(root, `${path}/package.json`) ?? {};
  const name = pkg.name ?? path;
  const deps = [];
  for (const [group, dev] of [['dependencies', false], ['devDependencies', true], ['peerDependencies', false]]) {
    for (const [dep, spec] of Object.entries(pkg[group] ?? {})) {
      if (!deps.some((d) => d.name === dep)) deps.push({ name: dep, spec, locked: nodeLocked(root, dep, path), dev, workspace: path });
    }
  }
  const defined = Object.entries(pkg.scripts ?? {})
    .filter(([, c]) => !PLACEHOLDER.test(String(c).trim()))
    .map(([n, c]) => ({ name: n, source: 'package.json', workspace: path, run: workspaceRun(pm, path, name, n), command: c }));
  const contract = contractOf(defined);
  const own = files.filter((f) => f.startsWith(`${path}/`));
  return {
    path,
    name,
    dependencies: deps,
    frameworks: frameworks(deps),
    tasks: { defined, contract, missing: ['lint', 'test', 'typecheck', 'format:check'].filter((t) => !contract[t]) },
    tests: testFiles(own),
    files: own.length,
  };
}

// ---------------------------------------------------------------------------
// Gaps (spec 5.2.1). End-of-life checks need live data, so the step runs them with versions.mjs.
// ---------------------------------------------------------------------------

export function gaps(a, files) {
  const out = [];
  const add = (id, issue) => out.push({ id, issue });
  const tl = a.tooling;
  // In a workspace repo a task may live in a workspace rather than the root.
  const task = (t) => a.tasks.contract[t] ?? a.workspaces?.map((w) => w.tasks.contract[t]).find(Boolean) ?? null;
  const tests = a.tests.count;
  if (!tl.secrets.length) add('secrets', 'no secret scanning (gitleaks) in git hooks or CI');
  if (!tl.hooks.length) add('hooks', 'no git hooks (pre-commit checks run only in CI, if at all)');
  if (!tl.ci.length) add('ci', 'no CI configuration');
  else {
    for (const k of ['lint', 'test']) if (task(k) && !tl.ciRuns.includes(k)) add('ci-checks', `CI doesn't seem to run ${k}`);
  }
  if (!tl.dependencyUpdates.length) add('dependency-updates', 'no Dependabot or Renovate configuration');
  if (!task('lint') && !tl.lint.length) add('lint', 'no linter configured');
  else if (!task('lint')) add('tasks', 'no lint task (a linter is configured, but no script runs it)');
  if (!task('test')) add('tasks', tests ? 'no test task (test files exist)' : 'no test task and no tests');
  else if (!tests) add('tests', 'a test task exists, but there are no test files');
  for (const w of a.workspaces ?? []) {
    // Only where another workspace or the root has the task; none anywhere is one gap above.
    const missing = ['lint', 'test'].filter((t) => task(t) && !w.tasks.contract[t]);
    if (missing.length) add('tasks', `workspace ${w.path} has no ${missing.join(' or ')} task`);
  }
  const parts = ['lint', 'typecheck', 'test'].filter((t) => task(t));
  if (!a.tasks.contract.check && parts.length >= 2) add('check-task', `no single check task${a.workspaces ? ' at the root' : ''} — ${parts.join(', ')} run separately${a.workspaces ? ` (across ${a.workspaces.map((w) => w.path).join(', ')})` : ''}, so the Claude stop hook and CI have no one command to run`);
  if (a.toolchain && a.dependencies.length && !a.lockfiles.length && a.toolchain !== 'godot' && a.toolchain !== 'editor') add('lockfile', 'no lockfile committed');
  if (a.toolchain && !Object.keys(a.runtime).length && ['node', 'python'].includes(a.toolchain)) add('runtime-pin', `no pinned ${a.toolchain === 'node' ? 'Node.js' : 'Python'} version`);
  const committedEnv = files.filter((f) => /(^|\/)\.env(\.[\w-]+)?$/.test(f) && !/\.(example|sample|template)$/.test(f) && !/(^|\/)(tests?|fixtures?|examples?|test_apps)\//.test(f));
  if (a.git && committedEnv.length) add('env-committed', `environment files tracked by git: ${committedEnv.join(', ')}`);
  if (a.git && files.some((f) => /(^|\/)node_modules\//.test(f))) add('hygiene', 'node_modules tracked by git');
  return out;
}

// ---------------------------------------------------------------------------

export function analyse(root, { pluginRoot = null } = {}) {
  const { git, files } = listFiles(root);
  const stack = detectStack(root, files);
  const mono = monorepo(root, files);
  const ws = mono.adoptable && stack.toolchain === 'node' ? mono.workspaces.map((p) => workspace(root, files, p, stack.packageManager)) : null;
  // A workspace repo: the root's dependencies plus every workspace's, each tagged with its workspace.
  const rootDeps = dependencies(root, stack.toolchain);
  const deps = [...rootDeps, ...(ws ?? []).flatMap((w) => w.dependencies)];
  const a = {
    root,
    git,
    ...stack,
    dependencies: deps,
    // Per workspace: the same framework may be on different versions in two workspaces.
    frameworks: ws ? [...frameworks(rootDeps), ...ws.flatMap((w) => w.frameworks)] : frameworks(deps),
    packs: packCandidates(deps, pluginRoot),
    tasks: tasks(root, stack.toolchain, stack.packageManager),
    tooling: tooling(root, files, deps),
    structure: structure(files),
    tests: testFiles(files),
    docs: docs(files),
    monorepo: mono,
    workspaces: ws,
  };
  a.tooling.ciRuns = ciRuns(root, a.tooling.ciFiles, [...a.tasks.defined, ...(ws ?? []).flatMap((w) => w.tasks.defined)]);
  a.mode = a.docs.claude.length ? 'audit' : 'create';
  a.gaps = gaps(a, files);
  // The file list, for /start's route; not enumerable, so --json stays short.
  Object.defineProperty(a, 'files', { value: files, enumerable: false });
  return a;
}

// A short human-readable summary (the step reads the JSON; this is for people).
// .claude/hooks/config.json for an adopted project: the formatter and linter it already has, run
// on each edited file, and its own check on stop — never tools it doesn't use (spec 5.2.1, 5.3).
const PY_PREFIX = { uv: ['uv', 'run'], poetry: ['poetry', 'run'], pdm: ['pdm', 'run'] };
export function hookConfig(a, root = null) {
  const has = (kind, name) => a.tooling[kind].some((t) => t.name === name);
  const onEdit = [];
  const checkCmd = a.tasks.contract.check ?? null;
  let requires = null;
  if (a.toolchain === 'node' && a.workspaces) {
    // Each workspace's own tools, run from its folder (ESLint finds its config from the working
    // directory); binaries are looked up in the workspace first, then the hoisted root install.
    const esc = (p) => p.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
    const configIn = (kind, name, ws) => a.tooling[kind].some((t) => t.name === name && t.evidence.some((e) => e.startsWith(`${ws}/`)));
    for (const w of a.workspaces) {
      const uses = (dep, kind, name) => w.dependencies.some((d) => d.name === dep) || configIn(kind, name, w.path);
      const scope = `^${esc(w.path)}/`;
      if (uses('prettier', 'format', 'Prettier')) onEdit.push({ files: scope, cwd: w.path, run: ['node_modules/.bin/prettier', '--write', '--ignore-unknown', '--log-level', 'warn', '{file}'] });
      if (uses('@biomejs/biome', 'lint', 'Biome')) onEdit.push({ files: `${scope}.*\\.(?:[cm]?[jt]sx?|json)$`, cwd: w.path, run: ['node_modules/.bin/biome', 'check', '--write', '--no-errors-on-unmatched', '{file}'], report: true, label: `Biome (${w.path})` });
      if (uses('eslint', 'lint', 'ESLint')) onEdit.push({ files: `${scope}.*\\.(?:[cm]?[jt]sx?|astro|vue|svelte)$`, cwd: w.path, run: ['node_modules/.bin/eslint', '--fix', '--no-warn-ignored', '{file}'], report: true, label: `ESLint (${w.path})` });
    }
    requires = 'node_modules';
  } else if (a.toolchain === 'node') {
    const bin = (b) => `node_modules/.bin/${b}`;
    const code = '\\.(?:[cm]?[jt]sx?|astro|vue|svelte)$';
    if (has('format', 'Prettier')) onEdit.push({ run: [bin('prettier'), '--write', '--ignore-unknown', '--log-level', 'warn', '{file}'] });
    if (has('lint', 'Biome') || has('format', 'Biome')) onEdit.push({ files: `${code.slice(0, -1)}|json)$`, run: [bin('biome'), 'check', '--write', '--no-errors-on-unmatched', '{file}'], report: true, label: 'Biome' });
    if (has('lint', 'ESLint')) onEdit.push({ files: code, run: [bin('eslint'), '--fix', '--no-warn-ignored', '{file}'], report: true, label: 'ESLint' });
    requires = 'node_modules';
  } else if (a.toolchain === 'python') {
    const pre = PY_PREFIX[a.packageManager] ?? [];
    const py = '\\.pyi?$';
    if (has('format', 'Ruff format') || (has('lint', 'Ruff') && !has('format', 'Black'))) onEdit.push({ files: py, run: [...pre, 'ruff', 'format', '{file}'] });
    if (has('format', 'Black')) onEdit.push({ files: py, run: [...pre, 'black', '--quiet', '{file}'] });
    if (has('lint', 'Ruff')) onEdit.push({ files: py, run: [...pre, 'ruff', 'check', '--fix', '{file}'], report: true, label: 'Ruff' });
    if (a.packageManager === 'uv') requires = '.venv';
  } else if (a.toolchain === 'dart') {
    onEdit.push({ files: '\\.dart$', run: ['dart', 'format', '{file}'] }, { files: '\\.dart$', run: ['dart', 'analyze', '{file}'], report: true, label: 'dart analyze' });
    requires = '.dart_tool';
  } else if (a.toolchain === 'rust') {
    const edition = /^\s*edition\s*=\s*"(\d{4})"/m.exec((root && read(root, 'Cargo.toml')) ?? '')?.[1] ?? '2021';
    onEdit.push({ files: '\\.rs$', run: ['rustfmt', '--edition', edition, '{file}'] });
  }
  const check = checkCmd ? { run: checkCmd.split(/\s+/), requires, label: checkCmd } : null;
  return { onEdit, check };
}

// What /adopt checks before it creates any state: an existing Claude setup (audit mode), a
// monorepo (adopt one package, from its folder), a toolchain KeelWright supports, and a project at all.
// With `pipeline` (the state's mode and next action) and `commits`, it also carries `/start`'s route (spec 5.0).
export function preflight(a, { pipeline = null, commits = null } = {}) {
  const blockers = [];
  if (a.mode === 'audit') blockers.push({ id: 'audit', detail: a.docs.claude });
  if (a.monorepo.detected && !a.workspaces) blockers.push({ id: 'monorepo', detail: a.monorepo.packages, why: a.monorepo.notAdoptable });
  if (!a.structure.files || (!a.toolchain && !a.otherLanguages.length)) blockers.push({ id: 'no-project', detail: [] });
  else if (!a.toolchain) blockers.push({ id: 'toolchain', detail: a.otherLanguages });
  const base = { mode: a.mode, toolchain: a.toolchain, packageManager: a.packageManager, workspaces: a.workspaces?.map((w) => w.path) ?? null, blockers };
  return { ...base, route: route(a, blockers, { pipeline, commits }) };
}

// ---------------------------------------------------------------------------
// /start (spec 5.0): which route the folder needs. `kickoff`, `adopt` and `doctor` are the routes;
// `continue` resumes a pipeline, `ask` shows what was found and lets the user choose, `stop` is a
// blocker `/adopt` can't get past. /kickoff and /adopt stay as overrides when the guess is wrong.
// ---------------------------------------------------------------------------

// Files that say nothing about which route: KeelWright's own record, editor and OS clutter, licence.
const NOT_CONTENT = /^(\.keelwright\/|\.vscode\/|\.idea\/|\.git(ignore|attributes|keep)$|\.editorconfig$|LICEN[CS]E(\.\w+)?$|COPYING$)|(^|\/)(\.DS_Store|Thumbs\.db|\.gitkeep)$/i;
// Notes, specs and PRDs: the input of a kickoff, not a project.
const NOTE_FILE = /\.(md|mdx|txt|rst|adoc|org|pdf|docx?|odt|rtf|pages|pptx?|key|xlsx?|csv|png|jpe?g|gif|svg|webp|heic)$/i;
export const CODE_FILE = /\.(?:[cm]?[jt]sx?|py|dart|rs|gd|go|java|kt|swift|rb|php|cs|astro|vue|svelte|c|cc|cpp|h|hpp|sql|sh)$/;
const SUBFOLDER_MANIFEST = /\/(package\.json|pyproject\.toml|requirements\.txt|Cargo\.toml|pubspec\.yaml|project\.godot|go\.mod)$/;
// "A fresh scaffold with a few commits" (spec 5.0): too little history and code to describe.
export const FRESH = { commits: 3, codeFiles: 25 };

export function route(a, blockers, { pipeline = null, commits = null } = {}) {
  const files = (a.files ?? []).filter((f) => !NOT_CONTENT.test(f));
  const notes = files.filter((f) => NOTE_FILE.test(f));
  const code = files.filter((f) => CODE_FILE.test(f) && !/(^|\/)(node_modules|vendor)\//.test(f));
  const claude = a.docs.claude;
  const facts = {
    files: files.length,
    codeFiles: code.length,
    commits,
    claude: claude.slice(0, 5),
    adrDirs: a.docs.adrDirs.map((d) => d.dir),
    notes: notes.slice(0, 20),
  };
  const r = (to, why, extra = {}) => ({ to, why, ...extra, facts });

  if (pipeline) {
    // A finished pipeline is not resumed: the project now has its Claude setup, so health is next.
    if (pipeline.next?.action === 'complete') return r(claude.length ? 'doctor' : 'continue', `the ${pipeline.mode} pipeline is complete`, { pipeline: pipeline.mode });
    return r('continue', `a ${pipeline.mode} pipeline is in progress`, { pipeline: pipeline.mode });
  }
  if (!files.length) return r('kickoff', 'the folder is empty');
  const projectBlocker = blockers.find((b) => b.id === 'monorepo' || b.id === 'toolchain');
  const nested = [...new Set(files.filter((f) => SUBFOLDER_MANIFEST.test(f) && !/(^|\/)(examples?|fixtures?|templates?|node_modules)\//.test(f)).map((f) => f.replace(/\/[^/]+$/, '')))].sort();

  if (!a.toolchain && !a.otherLanguages.length) {
    if (nested.length && !a.monorepo.detected) return r('ask', 'code-in-subfolder', { detail: nested.slice(0, 10), options: ['subfolder', 'kickoff'] });
    if (nested.length) return r('stop', 'monorepo', { blocker: projectBlocker ?? { id: 'monorepo', detail: nested, why: a.monorepo.notAdoptable } });
    if (files.every((f) => NOTE_FILE.test(f)) || !code.length) {
      if (claude.length && !notes.some((n) => !claude.includes(n))) return r('ask', 'claude-setup-without-code', { options: ['kickoff', 'doctor'] });
      return r('kickoff', notes.length ? 'only notes, specs or a PRD' : 'no code', { inputs: notes.filter((n) => !claude.includes(n)).slice(0, 20) });
    }
    return r('ask', 'unrecognised', { detail: code.slice(0, 10), options: ['kickoff', 'adopt'] });
  }
  // The blockers are /adopt's: the doctor is read-only and works on any repository.
  if (claude.length) return r('doctor', 'code with a Claude setup', projectBlocker ? { note: projectBlocker } : {});
  if (projectBlocker) return r('stop', projectBlocker.id, { blocker: projectBlocker });
  if (a.git && commits !== null && commits <= FRESH.commits && code.length <= FRESH.codeFiles) {
    return r('ask', 'fresh-scaffold', { options: ['kickoff', 'adopt'] });
  }
  return r('adopt', 'code without a Claude setup');
}

export function commitCount(root) {
  try {
    return Number(execFileSync('git', ['rev-list', '--count', 'HEAD'], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim());
  } catch {
    return 0;
  }
}

export function summary(a) {
  const L = [];
  const list = (xs) => (xs.length ? xs.join(', ') : 'none');
  L.push(`Mode: ${a.mode}${a.mode === 'audit' ? ` (Claude setup found: ${a.docs.claude.slice(0, 3).join(', ')})` : ''}`);
  if (a.workspaces) {
    L.push(`Workspaces (adopted as one project): ${a.workspaces.map((w) => w.path).join(', ')}`);
    for (const w of a.workspaces) L.push(`  ${w.path}: ${list(w.frameworks.map((f) => `${f.name} ${f.version ?? ''}`.trim()))}; tasks ${list(Object.entries(w.tasks.contract).map(([k, v]) => `${k} → ${v}`))}; test files ${w.tests.count}`);
  } else if (a.monorepo.detected) L.push(`Monorepo: ${a.monorepo.markers.join(', ')} — packages: ${list(a.monorepo.packages)}${a.monorepo.notAdoptable.length ? ` (${a.monorepo.notAdoptable.join('; ')})` : ''}`);
  L.push(`Toolchain: ${a.toolchain ?? 'not supported'}${a.packageManager ? ` (${a.packageManager})` : ''}${a.otherLanguages.length ? `; other languages: ${a.otherLanguages.join(', ')}` : ''}`);
  L.push(`Runtime: ${list(Object.entries(a.runtime).map(([k, v]) => `${k} ${v}`))}`);
  L.push(`Lockfiles: ${list(a.lockfiles)}`);
  L.push(`Frameworks: ${list(a.frameworks.map((f) => `${f.name} ${f.version ?? ''}`.trim()))}`);
  L.push(`Stack packs available: ${list(a.packs)}`);
  L.push(`Dependencies: ${a.dependencies.length} (${a.dependencies.filter((d) => !d.locked).length} without a locked version)`);
  L.push(`Tasks: ${list(Object.entries(a.tasks.contract).map(([k, v]) => `${k} → ${v}`))}`);
  if (a.tasks.missing.length) L.push(`Tasks missing: ${a.tasks.missing.join(', ')}`);
  for (const [k, label] of [['lint', 'Lint'], ['format', 'Format'], ['types', 'Types'], ['test', 'Unit tests'], ['e2e', 'E2E'], ['hooks', 'Git hooks'], ['secrets', 'Secret scanning'], ['commits', 'Commit messages'], ['ci', 'CI'], ['dependencyUpdates', 'Dependency updates']]) {
    L.push(`${label}: ${list(a.tooling[k].map((x) => x.name))}`);
  }
  L.push(`CI runs: ${list(a.tooling.ciRuns)}`);
  L.push(`Files: ${a.structure.files} (${list(Object.entries(a.structure.extensions).slice(0, 6).map(([e, n]) => `${e} ${n}`))}); test files: ${a.tests.count}`);
  L.push(`Docs: README ${a.docs.readme ?? 'none'}; CONTRIBUTING ${a.docs.contributing ?? 'none'}; ADRs ${list(a.docs.adrDirs.map((d) => `${d.dir} (${d.count})`))}; docs/ ${a.docs.docs.length} files`);
  if (a.docs.instructions.length) L.push(`Other tools' instructions: ${a.docs.instructions.join(', ')}`);
  L.push('', `Gaps (${a.gaps.length}):`, ...a.gaps.map((g) => `  - [${g.id}] ${g.issue}`));
  return L.join('\n');
}
