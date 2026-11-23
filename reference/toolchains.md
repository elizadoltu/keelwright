# Toolchains

<!--
Runtime rules for the `scaffold` and `generate` steps on every project type (spec 5.5). The
machine-readable part (task runner, lockfiles, ignores, hook commands, required tasks) is
scripts/lib/toolchains.mjs, which scaffoldcheck, preflight and generatecheck use — keep the two in
sync. Web projects on Node.js also follow reference/web-scaffold.md.
Facts about tools were checked against official sources on 2026-11-17; flags change, so always
read the generator's `--help` before running it.
-->

The **toolchain** is how a project is built and checked, independent of its type: an Expo app and a TypeScript library are both `node`. The `architecture` step records it with `STATE set stack '{"toolchain": "<t>"}'`.

| Toolchain | Used for | Task runner | Manifest + lockfile | Runtime pin |
|---|---|---|---|---|
| `node` | Web, Expo (React Native), Phaser, TypeScript AI services, npm libraries and CLIs | npm scripts — `npm run <task>` | `package.json` + `package-lock.json` | `.nvmrc` |
| `python` | Python AI services, Python libraries and CLIs | [poethepoet](https://poethepoet.natn.io/) tasks in `pyproject.toml` — `uv run poe <task>` | `pyproject.toml` + `uv.lock` | `.python-version` |
| `dart` | Flutter apps and Dart packages | [just](https://just.systems) — `just <task>` | `pubspec.yaml` + `pubspec.lock` | `environment:` in `pubspec.yaml` |
| `rust` | Rust CLIs and crates | `just <task>` | `Cargo.toml` + `Cargo.lock` | `rust-toolchain.toml` |
| `godot` | Godot 4 games (GDScript) | `just <task>` | `project.godot` | `config/features` in `project.godot` |
| `editor` | Unity, Unreal, native Xcode / Android Studio apps | — | the engine's own files | the engine version in `docs/setup.md` |

`node scripts/toolchains.mjs tasks <toolchain> <project type>` prints the required tasks and their commands; `hook-config <toolchain>` prints the Claude Code hook configuration.

## The task contract

Every project has the same task names, so `CONTRIBUTING.md`, `CLAUDE.md`, the hooks and CI can rely on them. npm scripts keep the colon (`format:check`); just and poe use a dash (`format-check`).

| Task | Does | Required for |
|---|---|---|
| `dev` | Run the app locally | web (and apps, when the stack has a dev server) |
| `build` | Production build / package | web, libraries |
| `lint` | Linter | all |
| `format` / `format:check` | Formatter, writing / checking only | all |
| `typecheck` | Type checker | `node`, `python` |
| `test` | Unit tests, single run | all |
| `test:e2e` | End-to-end tests | web (other apps when the stack has an E2E tool) |
| `tokens` | Regenerate the theme from `design/tokens.json` | projects with tokens |
| `eval` | Offline evals against the eval plan (calls the model — costs money) | AI projects |
| `check` | Everything fast, in order: lint, format check, type check, unit tests, theme drift | all |

`check` never includes `eval` or E2E tests.

## Versions

- **Apps** (web, mobile, games, AI services): every dependency at the exact resolved version in the manifest (`npm` with `save-exact`, `==` in `pyproject.toml`), and the lockfile committed.
- **Libraries**: what users install with the library is a range with the resolved version as the lower bound (`^1.4.2`, `>=1.4.2`) — exact pins would conflict with the users' own dependencies; development tools stay exact.
- **Dart and Rust**: their convention is caret requirements in the manifest (`^1.4.2`, `"1.4.2"` in Cargo means `^`) with the lockfile as the exact record; write the resolved version as the requirement and commit the lockfile.
- Resolve everything with `scripts/versions.mjs`: `node`, `python`, `flutter`, `rust`, `godot`, `unity`, `npm:`, `pypi:`, `crates:`, `pub:`, `github:`. Unreal has no machine-readable release feed: look the version up on the official release notes and record the URL next to it.

## Per toolchain

### `node`

As in `reference/web-scaffold.md` (npm, `.npmrc` `save-exact=true`, `.nvmrc`, `engines.node`, Husky + lint-staged + commitlint + gitleaks, ESLint flat config + Prettier, Vitest), with the generator of the stack:

- **Expo** — `create-expo-app@<resolved> <dir> --template default --no-install --yes --no-agents-md` (Expo Router; `--no-agents-md` stops it writing `AGENTS.md` and `.claude/settings.json`, which the `generate` step owns). Remove the example screens (the template's `reset-project` script), then create one route file per P1 screen (`S-` IDs) in `app/`. Unit tests: `jest-expo` + React Native Testing Library (`test` runs Jest, not Vitest). Lint: `npx expo lint` sets up ESLint with `eslint-config-expo`. Install with `npx expo install` so native modules match the SDK. E2E with Maestro is optional in the skeleton (`test:e2e` only when a Maestro flow exists). Theme: `tokens` writes `src/theme/tokens.ts` (`node scripts/tokens-to-css.mjs design/tokens.json src/theme/tokens.ts`).
- **Phaser** — the official generator is interactive only; copy the official template pinned to a commit instead: `npx degit phaserjs/template-vite-ts#<sha>` (resolve the SHA with `versions.mjs github:phaserjs/template-vite-ts`), then set `phaser` to the resolved version. Game logic in plain TypeScript modules tested with Vitest; scenes stay thin.
- **TypeScript library / CLI** — no generator: `package.json` by hand with `type: module`, `exports`, `files`, `bin` for a CLI; build with tsdown (tsup is no longer maintained); `build` runs tsdown, then `publint` and `@arethetypeswrong/cli` check the package. Publish from CI with npm trusted publishing (GitHub OIDC, `id-token: write`).
- **TypeScript AI service** — no generator: Express (the default backend) or the framework the stack chose; the provider SDK; prompts as files in `prompts/`; evals in `evals/` run by the `eval` task.

### `python`

- **Generator:** `uv init <dir> --app` (a service) or `--lib` (a library), with `--vcs none` (the scaffold handles git) and `--python <major.minor>`; it writes `.python-version`. uv now packages apps by default (`src/<package>/`); keep that.
- **Dependencies:** `uv add <pkg>==<resolved>` (apps) or `uv add "<pkg>>=<resolved>"` (libraries); development tools with `uv add --dev <tool>==<resolved>`: `ruff`, `pyright` (type checker; Astral's `ty` is still beta), `pytest`, `poethepoet`.
- **Tasks** in `pyproject.toml`:

  ```toml
  [tool.poe.tasks]
  lint = "ruff check ."
  format = "ruff format ."
  format-check = "ruff format --check ."
  typecheck = "pyright"
  test = "pytest"
  check = ["lint", "format-check", "typecheck", "test"]
  ```

- **Tests:** `tests/test_*.py`. **Ignore:** `.venv/`, `__pycache__/`, `.ruff_cache/`, `.pytest_cache/`, `dist/`.
- **CI:** `astral-sh/setup-uv` → `uv sync --locked` → `uv run poe check`. **Dependabot:** `uv`.
- **Libraries** publish to PyPI with trusted publishing from GitHub Actions (`uv build`, then the PyPI publish action, `id-token: write`).

### `dart` (Flutter)

- **Generator:** `flutter create <dir> --empty --org <reverse domain> --project-name <name> --platforms <ios,android,…> --no-pub` (non-interactive).
- **Lints:** `flutter_lints` (the template's default) in `analysis_options.yaml`.
- **Tasks** in `justfile`: `lint` = `flutter analyze`, `format` = `dart format .`, `format-check` = `dart format --output=none --set-exit-if-changed .`, `test` = `flutter test`, `tokens` = `node scripts/tokens-to-css.mjs design/tokens.json lib/theme/tokens.dart` (KeelWright's script needs Node.js only at scaffold time and for `tokens`), `check` = `lint format-check test`.
- **Tests:** `test/*_test.dart`; integration tests in `integration_test/`. **Ignore:** `.dart_tool/`, `build/`.
- **CI:** a Flutter setup action pinned by SHA, `flutter pub get`, `just check` (install just with its official action or `cargo install`). **Dependabot:** `pub`.

### `rust`

- **Generator:** `cargo new <dir> --lib` or `--bin`, with `--vcs none`; `rust-toolchain.toml` pins the resolved Rust version.
- **Tasks** in `justfile`: `lint` = `cargo clippy --all-targets -- -D warnings`, `format` = `cargo fmt`, `format-check` = `cargo fmt --check`, `test` = `cargo test`, `build` = `cargo build --release`, `check` = `lint format-check test`.
- **Tests:** `#[test]` functions in `src/` or `tests/`. **Ignore:** `target/`.
- **CI:** rustup on the GitHub runner reads `rust-toolchain.toml`; `just check`. **Dependabot:** `cargo`.

### `godot`

- **No generator:** write `project.godot` by hand (`config_version=5`, the name, `config/features=PackedStringArray("<major.minor>")`, the main scene), then run `godot --headless --import --path .` once so the editor files exist.
- **Code:** GDScript with static types. Game rules live in plain scripts that don't depend on the scene tree (Humble Object), so they can be tested headless; scenes stay thin.
- **Lint / format:** gdtoolkit 4 (`gdformat`, `gdlint`), run through `uvx --from "gdtoolkit==<resolved>"` so no global Python setup is needed.
- **Tests:** gdUnit4 installed into `addons/gdUnit4/` from its release pinned to the resolved version; tests in `test/test_*.gd`; `test` = `./addons/gdUnit4/runtest.sh --godot_bin "$(which godot)" -a res://test` (headless).
- **Tasks** in `justfile`: `lint`, `format`, `format-check`, `test`, `check` = `lint format-check test`.
- **Ignore:** `.godot/` (the github/gitignore Godot template). **CI:** download the pinned Godot release from its GitHub release, `godot --headless --import`, `just check`; exports only when the release plan needs them.

### `editor` (Unity, Unreal, native IDE apps)

The project is created in the engine's editor or IDE, so the scaffold writes **`docs/setup.md`** instead: the engine version (resolved: `unity`; Unreal from its release notes), how to create the project in this folder (Unity can also do it from the command line: `Unity -batchmode -createProject <path> -quit`), the template and packages to choose, where code goes (from the architecture overview), and how to run tests (Unity Test Framework: `-batchmode -runTests -testPlatform EditMode -testResults results.xml`, without `-quit`).

The scaffold still creates everything that doesn't need the engine: `.gitignore` from the engine's github/gitignore template (`Unity.gitignore`, `UnrealEngine.gitignore`), Git LFS rules for binary assets (`.gitattributes`, from the asset pipeline), the pre-commit hooks, CI with gitleaks, Dependabot for GitHub Actions and `.env.example` when there are secrets.

## Git hooks

- `node`: Husky + lint-staged + commitlint + gitleaks (`reference/web-scaffold.md`, the `git-hooks` pack).
- Every other toolchain: the **pre-commit** framework (`.pre-commit-config.yaml`; contributors run it with `uvx pre-commit install`, or the compatible `prek`):

  ```yaml
  default_install_hook_types: [pre-commit, commit-msg]
  repos:
    - repo: https://github.com/gitleaks/gitleaks
      rev: <sha> # frozen: v<version>
      hooks:
        - id: gitleaks
    - repo: https://github.com/compilerla/conventional-pre-commit
      rev: <sha> # frozen: v<version>
      hooks:
        - id: conventional-pre-commit
          stages: [commit-msg]
    - repo: local
      hooks:
        - id: format
          name: format
          entry: <the toolchain's format command, e.g. uv run ruff format>
          language: system
          types: [<python | dart | rust | …>]
  ```

  Claude Code protects `.pre-commit-config.yaml` (like `.husky/`): writing it needs the user's approval, and a headless session can't write it at all — the step then shows the file for the user to create.

  Revs are commit SHAs with the tag as a comment (`versions.mjs github:<owner>/<repo>`, or `pre-commit autoupdate --freeze`). Dependabot's `pre-commit` ecosystem keeps them current.

## CI and dependency updates

- One workflow: install with the lockfile → `check` → `build` when the project builds → E2E when it has them → gitleaks; Conventional Commits checked on pull requests. Every action pinned to a commit SHA. When the workflow restricts `permissions`, the gitleaks job gets `pull-requests: read` (the action lists a PR's commits) and `GITLEAKS_ENABLE_COMMENTS: 'false'`.
- `.github/dependabot.yml`: the toolchain's ecosystem (`npm`, `uv`, `pub`, `cargo`), `pre-commit` when the hooks use it, and `github-actions` — weekly, grouped.

## Claude Code hooks

The `generate` step writes `.claude/hooks/config.json` from `node scripts/toolchains.mjs hook-config <toolchain>`: the formatter and linter run on each edited file, and the `check` task runs when Claude stops. Commands that aren't installed are skipped.
