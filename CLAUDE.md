# KeelWright

Claude Code plugin that bootstraps projects (`/kickoff`, later `/adopt`). The specification is `keelwright-spec.md` — read the relevant sections before changing behaviour, and update the spec in the same change when a decision changes.

## Layout

- `commands/kickoff.md` — the command; orchestrates steps and gates, never holds step logic
- `steps/<step>.md` — one instruction file per pipeline step; a step not yet built says "Not implemented yet"
- `scripts/state.mjs` + `scripts/lib/` — state CLI; `scripts/lib/pipeline.mjs` is the single definition of steps, order, gates, project types and document keys
- `templates/` — document templates; generated documents keep their structure and IDs
- `reference/` — runtime copies of spec rules the steps need (stack rules, catalog); **keep them in sync with the spec**
- `scripts/versions.mjs` (live version resolution), `scripts/doccheck.mjs` (mechanical document checks) and `scripts/packs.mjs` (stack packs: plan, install, validate, save) — used by steps
- `stack-packs/` — shipped stack packs, produced with `scripts/research-pack.mjs` (costs money); `shipped.json` lists them

## Rules

- Pipeline state changes only through `scripts/state.mjs`. If the pipeline needs a new transition, add it to `scripts/lib/state.mjs` with tests — don't let commands edit `state.json`.
- When step names, gates or document keys change, update `scripts/lib/pipeline.mjs`, `commands/kickoff.md` and spec 5.1.2 / 6.0 together.
- Scripts use Node.js 22+ built-ins only — no npm dependencies.
- Files under `commands/` refer to plugin files via `${CLAUDE_PLUGIN_ROOT}`; files read at runtime (`steps/`, `templates/`) can't, so they say "plugin root" and the command supplies the path.

## Commands

- Test: `npm test`
- Evals (cost money — always set a limit): `node evals/run.mjs --runs 1 --stop-at 1 --max-cost 10`; see `evals/README.md`
- Try the plugin locally: `claude --plugin-dir .` (run it from a scratch project folder, not this repo)

## Conventions

- Conventional Commits; work on a branch, `main` stays releasable.
- Bump `version` in `.claude-plugin/plugin.json` and `package.json` together.
- Add user-visible changes under **Unreleased** in `CHANGELOG.md`. Contributor-facing process lives in `CONTRIBUTING.md`; keep the two consistent.
