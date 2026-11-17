---
id: git-hooks
name: "Git hooks: Husky, lint-staged, commitlint and gitleaks"
packages: [husky, lint-staged, "@commitlint/cli", "@commitlint/config-conventional", "@commitlint/*"]
major: 9
researchedAt: 2026-11-16
status: draft
---

# Stack pack: Git hooks: Husky, lint-staged, commitlint and gitleaks 9

## Summary

This pack covers the local quality gate that runs before code leaves a developer's machine. Husky 9 installs Git client-side hooks from a versioned `.husky/` folder. lint-staged runs linters and formatters on staged files only. commitlint checks commit messages against Conventional Commits. gitleaks scans staged changes for secrets. Husky is "just 2 kB (gzipped) with no dependencies", runs in about 1 ms, uses Git's `core.hooksPath`, and supports all 13 client-side hooks on macOS, Linux and Windows [S4]. Hooks can always be skipped with `--no-verify` or `HUSKY=0` [S2]. So every check that a hook runs must also run in CI. Hooks give fast feedback. CI is the enforcement.

## Project structure

- **`.husky/`** at the repository root holds one file per hook, named exactly after the Git hook: `pre-commit`, `commit-msg`, `pre-push` and so on [S1][S2]. `npx husky init` creates `.husky/pre-commit` and sets the `prepare` script in `package.json` [S1]. Commit this folder. Husky generates `.husky/_/` itself, and you should not edit it.
- **`package.json` `prepare` script**: `"prepare": "husky"`. This runs after each install, so every clone gets the hooks [S2][S3]. Yarn does not support `prepare`, so Yarn projects use `postinstall` instead. Published (non-private) packages should add `pinst` to `prepack`/`postpack` so consumers do not run Husky [S1][S2].
- **`.husky/pre-commit`** runs `npx lint-staged` [S5]. You can add a gitleaks staged scan to the same file (see Security).
- **`.husky/commit-msg`** runs `npx --no -- commitlint --edit $1`. The file must be named `commit-msg` [S7].
- **lint-staged config**: use the `lint-staged` key in `package.json`, `.lintstagedrc(.json|.yaml|.yml)`, or `lint-staged.config.{js,mjs,cjs}` [S5]. Use a JS config when a task must not receive file names, such as `tsc` [S5].
- **commitlint config**: `commitlint.config.{js,cjs,mjs,ts,cts,mts}`, `.commitlintrc*`, or a `commitlint` key in `package.json`, all resolved with cosmiconfig [S10]. The getting-started guide creates `commitlint.config.js` with `export default { extends: ['@commitlint/config-conventional'] };` [S8].
- **`.gitleaks.toml`** at the repository root holds gitleaks config. Without it, gitleaks uses its built-in default rules [S13]. **`.gitleaksignore`** lists fingerprints of findings you have accepted [S13].
- **Subfolder projects**: Husky does not install into parent directories. If `package.json` lives in `frontend/`, use `"prepare": "cd .. && husky frontend/.husky"` and start each hook with `cd frontend` [S2].
- **Monorepos**: install lint-staged at the root and add a config file per package. Each staged file uses its closest config, and configs are not merged [S5].

## Naming

- Hook files use the exact Git hook name with no extension (`.husky/pre-commit`, `.husky/commit-msg`) [S2][S7]. A hook written in Node needs a thin shell entry file, such as `.husky/pre-commit` containing `node .husky/pre-commit.js` [S2].
- Commit messages follow Conventional Commits: `<type>[optional scope][!]: <description>`, an optional body after a blank line, then optional footers such as `Reviewed-by: …` [S16]. A breaking change is marked with `!` before the colon or a `BREAKING CHANGE:` footer [S16].
- `@commitlint/config-conventional` allows these types: `build`, `chore`, `ci`, `docs`, `feat`, `fix`, `perf`, `refactor`, `revert`, `style`, `test`. The header may be at most 100 characters. The type must be lowercase. The subject must not be empty, must not end with `.`, and must not be sentence-case, start-case, pascal-case or upper-case. Body and footer lines may be at most 100 characters, except lines that contain URLs [S12].
- `fix` maps to a SemVer PATCH, `feat` to a MINOR, and any breaking change to a MAJOR [S16]. This is what makes automated changelogs and releases possible.

## Testing

- To test a hook without making a commit, add `exit 1` to the end of the hook script. Git then aborts the command [S2].
- Test commitlint without the hook: `npx commitlint --from HEAD~1 --to HEAD --verbose`. You can also pipe a message: `echo "feat: add new feature" | npx commitlint`. To test the full path, run `git commit -m "foo: this will fail"`, which should be rejected [S7].
- Test a gitleaks config against the working tree with `gitleaks dir -v .` and against history with `gitleaks git -v` [S13].
- Hooks are not a test runner. Keep slow suites, such as full unit, E2E and whole-project type checks, in CI or in `pre-push`, not in `pre-commit`.

## Linting and formatting

- **lint-staged** passes the matched staged files to each command as absolute paths. `--relative` passes them relative to the working directory instead [S5]. Globs use picomatch. A pattern without a slash matches the basename in any directory, so `*.js` matches `/foo/bar/test.js`. A pattern with a slash matches paths [S5].
- lint-staged "will automatically add any modifications to the commit as long as there are no errors", so tasks must not call `git add` [S5]. Before it runs tasks, lint-staged makes a backup stash and hides unstaged changes in partially staged files. If a task fails, it reverts the task's changes [S5]. Keep these defaults. Do not set `--no-stash` or `--no-revert` in a shared hook.
- Tasks for different globs run concurrently by default. Commands in an array run in sequence. Overlapping globs that edit the same files can race, so use negation patterns or array syntax to avoid this [S5].
- **ESLint**: use `eslint --max-warnings=0 --no-warn-ignored` so warnings fail the commit. With flat config on ESLint 8.51.0 or later, this also keeps "File ignored" warnings out of the output [S5].
- **TypeScript**: never pass file names to `tsc`, because it then ignores `tsconfig.json`. Use a function task that returns `'tsc --noEmit'`, so lint-staged does not append files [S5].
- **Formatters** such as Prettier run with `--write` on the staged files, and lint-staged re-stages the result [S1][S5].
- **commitlint** extends `@commitlint/config-conventional` [S8]. Add project rules on top, such as `scope-enum` or `subject-case` from the rules reference [S11]. Rule levels and `always`/`never` are set per rule [S11]. `defaultIgnores` (default `true`) skips merge, revert and auto-merge commits [S10].

## Security

- **Secret scanning before commit.** gitleaks scans staged changes with `gitleaks git --pre-commit --redact --staged --verbose`, the command its own pre-commit hook uses [S14]. `--redact` keeps secret values out of the terminal and logs [S13][S14]. gitleaks is a Go binary and does not come from npm. Developers install it themselves, or the hook runs through the pre-commit framework [S13][S14]. The old `gitleaks protect --staged` command was deprecated in v8.19.0 [S13]. Some upstream scripts still use it, but new hooks should use `gitleaks git --staged`.
- **Configuration**: in `.gitleaks.toml`, set `useDefault = true` under `[extend]` to keep the built-in rules, and add your own rules and allowlists on top. `disabledRules` turns off rules that are noisy for your project [S13]. Allowlists can apply to one rule (`[[rules.allowlists]]`) or to all rules (`[[allowlists]]`) [S13].
- **Suppressions** must be narrow and reviewable. Add a finding's fingerprint to `.gitleaksignore`, or put a `gitleaks:allow` comment on the line [S13]. For an existing repository, create a baseline report and scan with `--baseline-path`, so only new leaks fail the build [S13].
- **CI is the real gate.** Anyone can bypass a hook with `git commit --no-verify` or `HUSKY=0`, and with `SKIP=gitleaks` when using the pre-commit framework [S2][S13]. Run gitleaks in CI on every push and pull request. Use `gitleaks/gitleaks-action@v3` with `fetch-depth: 0`. Organization-owned repositories need a free `GITLEAKS_LICENSE` key [S15]. v2 of the action is deprecated and stops working on 2026-09-16 [S15].
- **Hooks run your code on every developer's machine.** Review changes to `.husky/*`, the lint-staged config and `prepare` with the same care as CI workflow changes.
- gitleaks says it is "feature complete" and will receive security patches only [S13]. Pin its version, for example as the pre-commit `rev` [S13].

## Performance pitfalls

- Never run whole-project commands in `pre-commit`, such as the full test suite, `eslint .` or full builds. Run them through lint-staged on staged files only [S5]. The one exception is `tsc --noEmit` through a function task, which must check the whole project to be correct [S5]. Move it to `pre-push` or CI if it is slow.
- Overlapping lint-staged globs that write to the same files can race [S5].
- Git GUIs and IDEs do not load nvm or similar version managers, so hooks fail with "command not found". Put the manager's setup in `~/.config/husky/init.sh`, which Husky sources before every hook [S2]. Do not hard-code machine paths in `.husky/*`.
- In Git 2.36, lint-staged's output in hooks was broken. Git 2.37 fixed this [S5]. lint-staged 17 checks for Git 2.32.0 or later [S6].

## CI/CD and release

- **Disable hook installation in CI and Docker**: set `HUSKY=0` in the environment [S2]. When only production `dependencies` are installed, `"prepare": "husky"` fails because the binary is missing. Use `"prepare": "husky || true"`, or use a `.husky/install.mjs` that exits when `NODE_ENV === 'production'` or `CI === 'true'`, with `"prepare": "node .husky/install.mjs"` [S2].
- **Commit messages in CI**: check out with `fetch-depth: 0`. On `push`, run `npx commitlint --last --verbose`. On `pull_request`, run `npx commitlint --from ${{ github.event.pull_request.base.sha }} --to ${{ github.event.pull_request.head.sha }} --verbose` [S9]. On GitLab, set `GIT_DEPTH: 0` [S9].
- **Secrets in CI**: use `gitleaks/gitleaks-action@v3` on `push` and `pull_request`, and optionally on a daily `schedule` [S15]. On pull requests the action lists the PR's commits through the GitHub API, so when the workflow restricts `permissions` the gitleaks job needs `pull-requests: read` besides `contents: read`; set `GITLEAKS_ENABLE_COMMENTS: 'false'` unless the job may write PR comments (found in a real run, 2026-11-17: a 403 on every pull request).
- **Lint and format in CI**: run the same linters over the whole repository, because lint-staged only sees staged files.
- Conventional Commits let release tooling derive the version bump from `fix`, `feat` and breaking changes [S16].

## Conventions

- **Clean Architecture**: not applicable to the hooks themselves, because they are tooling outside the application's layers. They can enforce the dependency rule indirectly by running the project's lint rules, such as import boundaries, on staged files.
- **Atomic Design**: not applicable. This pack has no UI components.
- **Humble Object**: applies directly. Each `.husky/<hook>` file stays a thin POSIX shell entry that calls one tool, such as `npx lint-staged` or `npx --no -- commitlint --edit $1` [S5][S7]. Logic lives in a testable config or script (`lint-staged.config.js`, `commitlint.config.js`, `.gitleaks.toml`, or `node .husky/pre-commit.js` for anything more complex) [S2]. Hooks must be POSIX `sh`. Husky runs them with `sh` even if a shebang is set [S3], and some Windows users have no `bash` [S2].

## Version notes

- **Husky 8 → 9** [S3]:
  - `husky install` was removed. Use `husky`, or `husky some/dir`, so the script becomes `"prepare": "husky"`.
  - Remove the `#!/usr/bin/env sh` and `. "$(dirname -- "$0")/_/husky.sh"` lines from hook files.
  - `husky add` was replaced by creating the hook file directly.
  - `HUSKY_DEBUG=1` became `HUSKY=2`.
  - `~/.huskyrc` moved to `~/.config/husky/init.sh`.
  - Node 14 and 16 are no longer supported.
  - The module API is ESM only (`import husky from 'husky'`).
  - A missing `.git` now gives a warning instead of an error.
  - v9 is backward compatible with v8 hooks, so you can upgrade first and migrate the hook files afterwards.
- **lint-staged** [S6]:
  - v17 requires Node 22.22.1 or later and Git 2.32.0 or later. `yaml` is now an optional dependency, so install it if you use a YAML config.
  - v16 removed `--shell`. Use a script or a function task instead. v16 also spawns processes with `nano-spawn`, so Node scripts may need an explicit `node` prefix, especially on Windows.
  - v15 dropped Node 16.
- **gitleaks** [S13]: `detect` and `protect` were deprecated in v8.19.0 in favor of `git`, `dir` and `stdin`.
- **commitlint**: `.ts`, `.mts` and `.cts` config files are supported [S10]. The getting-started example config uses ESM `export default` [S8].

## Rules

| ID | Rule | Enforce with | Sources |
|---|---|---|---|
| GITHOOKS-01 | Install Husky through `"prepare": "husky"` in `package.json` (use `postinstall` for Yarn). Never use the removed `husky install`. | config: package.json "prepare": "husky" | S2, S3 |
| GITHOOKS-02 | Commit hook files as `.husky/<exact git hook name>`. Keep them POSIX `sh`, with no shebang and no `_/husky.sh` sourcing line. | review | S2, S3 |
| GITHOOKS-03 | Each hook file is a thin entry that calls one tool. Put logic in a config file or in a script run with `node .husky/<hook>.js`. | review | S2, S5 |
| GITHOOKS-04 | `.husky/pre-commit` runs `npx lint-staged`. Do not run whole-repository lint, test or build commands in pre-commit. | hook: .husky/pre-commit npx lint-staged | S1, S5 |
| GITHOOKS-05 | lint-staged tasks never call `git add`. lint-staged re-stages task changes itself. Do not use `--no-stash` or `--no-revert` in the shared hook. | review | S5 |
| GITHOOKS-06 | ESLint tasks in lint-staged use `eslint --max-warnings=0 --no-warn-ignored`. | config: lint-staged "eslint --max-warnings=0 --no-warn-ignored" | S5 |
| GITHOOKS-07 | `tsc` runs only as a function task (`() => 'tsc --noEmit'`), never with appended file names. | config: lint-staged.config.js function task | S5 |
| GITHOOKS-08 | `.husky/commit-msg` runs `npx --no -- commitlint --edit $1`. | hook: .husky/commit-msg commitlint --edit | S7 |
| GITHOOKS-09 | The commitlint config extends `@commitlint/config-conventional`. Messages use an allowed lowercase type, a subject without a trailing `.`, and a header of at most 100 characters. | lint: commitlint @commitlint/config-conventional (type-enum, subject-full-stop, header-max-length) | S8, S12, S16 |
| GITHOOKS-10 | Mark breaking changes with `!` before the colon or a `BREAKING CHANGE:` footer, never with a header that starts with `BREAKING CHANGE:`. | lint: commitlint header-breaking-change | S12, S16 |
| GITHOOKS-11 | CI checks commit messages: `npx commitlint --from <base sha> --to <head sha> --verbose` on pull requests and `--last` on push, with `fetch-depth: 0`. | ci: npx commitlint --from ... --to ... --verbose | S9 |
| GITHOOKS-12 | pre-commit scans staged changes with `gitleaks git --pre-commit --redact --staged --verbose`. Do not use the deprecated `gitleaks protect`. | hook: .husky/pre-commit gitleaks git --pre-commit --redact --staged | S13, S14 |
| GITHOOKS-13 | CI runs `gitleaks/gitleaks-action@v3` with `fetch-depth: 0` on push and pull_request. Do not use the deprecated v2. | ci: gitleaks/gitleaks-action@v3 | S15 |
| GITHOOKS-14 | `.gitleaks.toml` sets `[extend] useDefault = true`. Suppress findings only with a fingerprint in `.gitleaksignore` or a `gitleaks:allow` comment, never by disabling scanning. | config: .gitleaks.toml [extend] useDefault = true | S13 |
| GITHOOKS-15 | CI and production installs set `HUSKY=0`, or use `.husky/install.mjs` that skips when `CI` or `NODE_ENV=production` is set. | ci: env HUSKY=0 | S2 |
| GITHOOKS-16 | Do not hard-code Node or version-manager paths in hook files. Developers put that setup in `~/.config/husky/init.sh`. | review | S2 |
| GITHOOKS-17 | Every check a hook runs also runs in CI, because hooks can be bypassed with `--no-verify` or `HUSKY=0`. | ci: same lint, commitlint and gitleaks commands as the hooks | S2, S9, S15 |
| GITHOOKS-18 | Use Node and Git versions that the hook tools support: Node 22.22.1 or later and Git 2.32.0 or later for lint-staged 17. Husky 9 does not run on Node 14 or 16. | config: package.json "engines" | S3, S6 |

## Sources

| ID | Kind | Title | URL |
|---|---|---|---|
| S1 | official | Husky — Get started | https://typicode.github.io/husky/get-started.html |
| S2 | official | Husky — How To | https://typicode.github.io/husky/how-to.html |
| S3 | official | Husky v9.0.1 release notes | https://github.com/typicode/husky/releases/tag/v9.0.1 |
| S4 | official | Husky — Introduction | https://typicode.github.io/husky/ |
| S5 | official | lint-staged README | https://github.com/lint-staged/lint-staged |
| S6 | official | lint-staged MIGRATION.md | https://raw.githubusercontent.com/lint-staged/lint-staged/main/MIGRATION.md |
| S7 | official | commitlint — Local setup | https://commitlint.js.org/guides/local-setup.html |
| S8 | official | commitlint — Getting started | https://commitlint.js.org/guides/getting-started.html |
| S9 | official | commitlint — CI setup | https://commitlint.js.org/guides/ci-setup.html |
| S10 | official | commitlint — Configuration | https://commitlint.js.org/reference/configuration.html |
| S11 | official | commitlint — Rules | https://commitlint.js.org/reference/rules.html |
| S12 | official | @commitlint/config-conventional | https://github.com/conventional-changelog/commitlint/tree/master/%40commitlint/config-conventional |
| S13 | official | gitleaks README | https://github.com/gitleaks/gitleaks |
| S14 | official | gitleaks .pre-commit-hooks.yaml | https://raw.githubusercontent.com/gitleaks/gitleaks/master/.pre-commit-hooks.yaml |
| S15 | official | gitleaks-action | https://github.com/gitleaks/gitleaks-action |
| S16 | official | Conventional Commits 1.0.0 | https://www.conventionalcommits.org/en/v1.0.0/ |
