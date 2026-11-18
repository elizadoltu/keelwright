# Step: `gaps`

`/adopt` create mode (spec 5.2.1): close the tooling gaps the analysis found — for each, show the fix as a diff that uses the project's **existing** tools, and apply it only when the user approves it, one by one. Declined fixes are recorded so the generated setup never refers to them.

**Reads:** `.keelwright/analysis.md` (approved: the Gaps table, with the user's corrections), `node "<plugin root>/scripts/analyse.mjs" --json` (tooling, tasks, CI files, package manager), `.keelwright/stack-packs/*.md` (approved at gate 2: `git-hooks` / `pre-commit` and the toolchain packs), `<plugin root>/reference/toolchains.md` (Git hooks, CI and dependency updates), `<plugin root>/stack-packs/git-hooks.md`; on a re-run, `.keelwright/gaps.md`.
**Produces:** the approved fixes in the project; `.keelwright/gaps.md`.
**Gate:** none — every fix is approved on its own.

`ANALYSE` below means `node "<plugin root>/scripts/analyse.mjs"` (run in the project root).

## Rules

- **Only tooling.** A fix adds or changes hooks, CI, dependency-update config, task scripts, ignore rules or a runtime pin. It never changes application code, folder structure, or the version of an existing dependency. End-of-life runtimes and frameworks behind by a major are **recorded, not fixed** — an upgrade is a project of its own.
- **The project's own tools.** Extend what is there: its package manager, hook manager (Husky, Lefthook, pre-commit, simple-git-hooks), CI system (GitHub Actions, GitLab CI, …) and task runner (npm scripts, Make, just, poe, tox). Introduce a new tool only when the project has none for that job, and then the toolchain's default from `reference/toolchains.md`.
- **New dev tools** (e.g. Husky, lint-staged) are added at the current version (`node "<plugin root>/scripts/versions.mjs" <specs>`), with the project's package manager, so its lockfile changes the way it always does. Say so in the proposal.
- **Shown before applied.** A unified diff for every changed file, the full content of every new file, and every command that will run (installs, `git rm --cached`).
- **Protected paths.** Claude Code asks before writing `.husky/`, `.pre-commit-config.yaml` and similar files, and a session that can't ask can't write them. Never work around that. If a write is refused, show the file and its path for the user to create, ask them to say when it's done, and record it as **applied by the user**.
- **Nothing is committed** by this step. The user commits when they're ready (the summary suggests the commits).

## 1. The gaps, in order

Take the Gaps table from the approved analysis — the user may have removed some or added their own — and confirm it against the current state with `ANALYSE --gaps` (gaps fixed since the analysis are dropped; say so). Work through them in this order, because later fixes call earlier ones (hooks and CI run the tasks):

1. `env-committed` — a committed `.env` file
2. `hygiene` — e.g. `node_modules` tracked, `.claude/settings.local.json` not ignored
3. `secrets` — no secret scanning
4. `lockfile`, `runtime-pin`
5. `tasks`, `check-task`, `lint`
6. `hooks`
7. `ci`, `ci-checks`
8. `dependency-updates`
9. end-of-life and major-version gaps — recorded only

## 2. One gap at a time

For each gap:

1. **Explain** in one line what is missing and what it risks, citing the analysis (`G-NN`).
2. **Propose the fix** — the diff, the new files, the commands — following the fix guide below.
3. **Ask** (AskUserQuestion): **Apply** · **Skip** (ask why in one line — "we use X instead" is useful to `generate`) · **Stop here** (the step stays `in_progress`; the next `/adopt` continues from the first undecided gap in `.keelwright/gaps.md`).
4. **Apply** exactly what was shown. Then **verify**: run what the fix added (the new task, `npx --no gitleaks version`, the hook on a dry run, `actionlint` when available) and report the result in one line. A fix that fails its own check is fixed or reverted, never left half-done.
5. **Record** the decision in `.keelwright/gaps.md` immediately, so a stopped run can resume.

## 3. Fix guide

- **`env-committed`.** `git rm --cached <file>`, add it to `.gitignore`, and add an `.env.example` with the same keys and empty values. Tell the user plainly: the values are still in the git history — **rotate every secret in it**; rewriting history is their call, not this step's.
- **`hygiene`.** `node_modules` tracked: `git rm -r --cached node_modules` and ignore it. Add `.claude/settings.local.json` to `.gitignore` (personal Claude Code settings).
- **`secrets`.** gitleaks in the existing hook manager (Husky: `gitleaks git --staged --redact --no-banner` in `.husky/pre-commit`; pre-commit: the `gitleaks` hook with a frozen SHA; Lefthook: a `pre-commit` command) **and** in CI (GitHub: the `gitleaks/gitleaks-action` job as in the `git-hooks` pack, with `pull-requests: read` when `permissions` are restricted and `GITLEAKS_ENABLE_COMMENTS: 'false'`; GitLab: a job running the gitleaks container). With no hook manager yet, do the CI half here and the hook half with `hooks`. Contributors install the gitleaks binary — `CONTRIBUTING.md` will say so.
- **`lockfile`.** Run the project's package manager install to create it (`npm install`, `pnpm install`, `uv lock`, `poetry lock`, `cargo generate-lockfile`) — this records what resolves today; show the resolved versions of the direct dependencies before committing to it. Remove a lockfile pattern from `.gitignore` if that's why it was missing.
- **`runtime-pin`.** `.nvmrc` / `.python-version` with the version the project already runs on — from CI, `engines`, `requires-python`, a Dockerfile, or the user. Never a newer one.
- **Workspace repos.** Fixes live at the root and cover every workspace: one hook config, one CI workflow (or the project's per-workspace workflows, extended in their style), one Dependabot entry per ecosystem with `directory: /` (npm workspaces share the root lockfile). A missing task in one workspace is added to **that** workspace's `package.json`, built from its own tools. The root `check` runs every workspace's checks (`npm run lint --workspaces --if-present && npm run test --workspaces --if-present`, `pnpm -r lint && pnpm -r test`, or `turbo run lint test` when the project uses Turborepo).
- **`tasks`, `check-task`.** Add the missing task to the project's task runner, built from commands it already runs (its CI steps, README, existing scripts). `check` runs the existing lint, format check, type check and unit tests in one command (`"check": "pnpm lint && pnpm typecheck && pnpm test"`; a Make target `check: lint typecheck test`). The Claude stop hook and CI will run it.
- **`lint`.** No linter at all: propose the toolchain default (`reference/toolchains.md`) with its recommended config and a `lint` task. Run it first and report how many issues the existing code has; offer to add it as a task and a hook on **changed files only** until those are fixed — never fix application code here.
- **`hooks`.** The toolchain's hook manager (`node`: Husky + lint-staged; others: pre-commit — `reference/toolchains.md`), running the project's own formatter and linter on staged files, gitleaks, and the commit-message check when the history shows Conventional Commits (look at `git log --oneline -30`; don't impose them otherwise). Add the `prepare` script (Husky) or the install line for `CONTRIBUTING.md`.
- **`ci`.** One workflow on the project's host (`.git/config` remote: GitHub → Actions, GitLab → `.gitlab-ci.yml`): checkout, the runtime from the pin, install with the lockfile, the `check` task (or lint, typecheck and test), `build` when it builds; actions pinned to commit SHAs (`versions.mjs github:<owner>/<repo>`). Unknown host: show the steps and ask.
- **`ci-checks`.** Add only the missing steps to the existing workflow, in its style; never rewrite it.
- **`dependency-updates`.** GitHub: `.github/dependabot.yml` with the project's ecosystems (`npm` for npm / pnpm / yarn, `uv`, `pip`, `cargo`, `pub`), `pre-commit` when used, and `github-actions` — weekly, grouped. Elsewhere: Renovate (`renovate.json`) and say the app must be installed.
- **End of life / majors behind.** Nothing to apply: record the gap with the version in use, the current one and the end-of-life date, as **recorded**.

## 4. `.keelwright/gaps.md`

```markdown
# Gaps

| ID | Gap | Decision | Files | Note |
|---|---|---|---|---|
| G-01 | no secret scanning | applied | `.husky/pre-commit`, `.github/workflows/ci.yml` | gitleaks 8.x in the hook and CI |
| G-02 | no Dependabot | declined | — | "we use Renovate on the GitLab mirror" |
| G-03 | Node.js 18 is past end of life | recorded | — | 18.20.4 in use; 24 is current LTS |
```

Decisions: `applied`, `applied by the user` (a protected file), `declined` (with the reason), `recorded` (end of life, majors behind), `already fixed`.

## 5. Check

1. `ANALYSE --gaps` — every gap marked applied must be gone. One still listed means the fix didn't take; fix it.
2. The project's `check` task (or its lint and test tasks) — the fixes mustn't break the build. Count failed runs with `STATE metric gaps check-failures +1`.
3. Count the decisions: `STATE metric gaps applied <n>`, `STATE metric gaps declined <n>`.

## 6. Finish

`STATE complete gaps .keelwright/gaps.md` — only the record: the files the fixes touched (`package.json`, the CI workflow) belong to the project and change often.

Tell the user, in a few lines: what was applied, declined and recorded; the commands contributors now need (e.g. install gitleaks); and suggested commits, one per fix (`ci: scan for secrets with gitleaks`, `chore: add Dependabot`).
