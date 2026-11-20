# KeelWright

Claude Code plugin that bootstraps new projects (`/kickoff`) and brings existing ones in (`/adopt`, in progress). The specification is `keelwright-spec.md` — read the relevant sections before changing behaviour, and update the spec in the same change when a decision changes.

## Layout

- `commands/start.md` — the entry point (spec 5.0): routing only, from `analyse.mjs --preflight`'s `route`; it runs `kickoff.md`, `adopt.md` or `doctor.md` and never holds their logic
- `commands/kickoff.md`, `commands/adopt.md` — the commands; orchestrate steps and gates, never hold step logic. They share their state, gate and report sections — change both together
- `steps/<step>.md` — one instruction file per pipeline step; a step not yet built says "Not implemented yet"
- `scripts/state.mjs` + `scripts/lib/` — state CLI; `scripts/lib/pipeline.mjs` is the single definition of both pipelines (steps, order, gates — `/kickoff` and `/adopt`), project types, toolchains and document keys
- `templates/` — document templates; generated documents keep their structure and IDs
- `reference/` — runtime copies of spec rules the steps need (`<type>-stack.md` per project type, `toolchains.md`, `web-scaffold.md`, catalog, `security.md` with the framework editions — `FRAMEWORK_EDITIONS` in `scripts/lib/doccheck.mjs` is its code twin); **keep them in sync with the spec**
- `scripts/versions.mjs` (live version resolution), `scripts/doccheck.mjs` (mechanical document checks) and `scripts/packs.mjs` (stack packs: plan, install, validate, save) — used by steps
- `scripts/lib/toolchains.mjs` — what each toolchain uses (task runner, lockfiles, hooks, ignores, hook commands); preflight, scaffoldcheck and generatecheck read it, and `reference/toolchains.md` is its prose twin — change both together
- `scripts/preflight.mjs`, `scripts/scaffoldcheck.mjs`, `scripts/tokens-to-css.mjs` (+ `scripts/lib/tokens.mjs`, which must stay import-free because the scaffold copies it into projects) — used by the scaffold step
- `templates/claude/` — templates for the generated Claude setup; `templates/claude/hooks/*.mjs` are copied into projects unchanged, so they must stay dependency-free and tested (`tests/hooks.test.mjs`)
- `scripts/generatecheck.mjs` — checks the generated agent setup (the base for `/adopt` audit mode)
- `scripts/analyse.mjs` + `scripts/lib/analyse.mjs` — `/adopt` create mode: the facts about an existing repository (toolchain, locked versions, tasks mapped to the task contract, tooling, docs, gaps), the preflight, the open gaps and the hook config from the project's own tools; read-only and offline. `steps/analyse.md` adds the judgement; `generatecheck` uses it for adopted projects
- `commands/doctor.md` + `scripts/doctor.mjs` + `scripts/lib/doctor.mjs` — the doctor (spec 7.0): health per area from the existing checkers (`generatecheck`, `crosscheck`, `analyse`, packs) and git history; mechanical, read-only except `.keelwright/doctor.{md,json}`. Audit mode builds on it
- `commands/profile.md` + `scripts/profile.mjs` + `scripts/lib/profile.mjs` — the personal profile (spec 5.7) in `~/.keelwright/` (`KEELWRIGHT_HOME` overrides it; tests always set it): roles and their marker tags, working sets, the doctor's order per role. It changes what is shown and asked, never the document set or a committed record
- `scripts/deep.mjs` + `scripts/lib/deep.mjs` + `agents/security-auditor.md` — the deep security review (spec 7.7, costs money): areas, headless read-only review calls and a disproving pass under a hard `--max-cost`; every model call goes through an injectable `invoke`, so tests spend nothing. Never run it in tests or without a limit
- `scripts/audit.mjs` + `scripts/lib/audit.mjs` — `/adopt` audit mode (spec 7.4, `commands/adopt.md` section 9): the doctor's findings as a fix plan by kind, and the decisions on them; `applied` is verified by re-running the doctor. Security decisions go only to `.keelwright/security/`
- `scripts/lib/security.mjs` — the security audit's mechanical checks (spec 7.7), the doctor's application-security area: locked packages from every lockfile → OSV.dev, gitleaks over history, RLS in migrations, safety nets, optional Semgrep, accepted risks. Its record goes to `.keelwright/security/`, which git-ignores itself; finding details must never reach `doctor.md`. Network and tools are injectable — tests stay offline
- `scripts/publish.mjs` + `scripts/lib/publish.mjs` — plans the `publish` step from the documents and `.keelwright/publish.json`; the step itself calls the Atlassian MCP tools
- `stack-packs/` — shipped stack packs, produced with `scripts/research-pack.mjs` (costs money); `shipped.json` lists them

## Rules

- Pipeline state changes only through `scripts/state.mjs`. If the pipeline needs a new transition, add it to `scripts/lib/state.mjs` with tests — don't let commands edit `state.json`.
- When step names, gates or document keys change, update `scripts/lib/pipeline.mjs`, the command (`commands/kickoff.md` or `commands/adopt.md`) and spec 5.1.2 / 5.2.1 / 6.0 together; `tests/state.test.mjs` checks the commands' step tables against the pipelines.
- Step files shared by both pipelines (`research`, `generate`) put what differs for `/adopt` in an **In /adopt** section.
- Scripts use Node.js 22+ built-ins only — no npm dependencies.
- Files under `commands/` refer to plugin files via `${CLAUDE_PLUGIN_ROOT}`; files read at runtime (`steps/`, `templates/`) can't, so they say "plugin root" and the command supplies the path.

## Commands

- Test: `npm test`
- Evals (cost money — always set a limit): `node evals/run.mjs --runs 1 --stop-at 1 --max-cost 10`; see `evals/README.md`
- Try the plugin locally: `claude --plugin-dir .` (run it from a scratch project folder, not this repo; for `/adopt`, a copy of an existing repo)

## Conventions

- Conventional Commits; work on a branch, `main` stays releasable.
- Bump `version` in `.claude-plugin/plugin.json` and `package.json` together.
- Add user-visible changes under **Unreleased** in `CHANGELOG.md`. Contributor-facing process lives in `CONTRIBUTING.md`; keep the two consistent.
