# Changelog

All notable changes to KeelWright are recorded here.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added — `/adopt` create mode (in progress)

- Spec 5.2.1: how `/adopt` describes an existing project and builds the Claude setup on top of it — `analyse → { document, research } → gaps → generate → publish`, two gates, never changing application code or dependency versions; the Phase 2 build order.
- `scripts/analyse.mjs`: the facts about an existing repository — toolchain and package manager (npm, pnpm, yarn, bun, uv, Poetry, pip, Cargo, Flutter), runtime pins, dependencies with their locked versions, frameworks and matching stack packs, tasks (npm scripts, poe, just, Make, tox, nox) mapped to the task contract with the project's own runner, the tooling in place, what CI runs, docs and other tools' instruction files, monorepo markers, and gaps.
- `steps/analyse.md` and `templates/analysis.md` (not yet reachable: the `/adopt` command comes next).
- `doccheck` type `analysis`: every convention cites a file that exists and says whether the code follows it consistently.

### Fixed

From the first real run (`evals/runs/2026-11-17-portfolio-26.md`):

- Web scaffold: the `check` script runs the framework's type generation first (`astro sync`), so CI passes on a fresh checkout; `scaffoldcheck` reports an Astro `check` that doesn't.
- Web scaffold: folders of the code structure that the skeleton leaves empty get a `.gitkeep`; `generatecheck` reports an empty folder named in `CLAUDE.md` or the rules, since git wouldn't keep it.
- Generated `tokens.css`: dark colours also apply under `[data-theme='dark']`, and the system setting is ignored under `[data-theme='light']`, so a Dark / Light toggle works without hand-written CSS.
- CI: the gitleaks job gets `pull-requests: read` when the workflow restricts permissions (it failed with a 403 on pull requests); `scaffoldcheck` reports it.
- Run metrics: the `status:` line that approval sets is no longer counted as a user edit; a step whose work happened before `STATE start` is reported as "not measured" instead of a near-zero time, and `complete` warns.

### Added

- `publish` step: features become Jira epics, stories become stories under them (with acceptance criteria and requirements), deferred items and technical debt optionally become tasks; every document in `docs/` becomes a Confluence page under one root page. Through the Atlassian Rovo MCP server (v2) with the user's own login; the plan is shown and approved before anything is written; re-runs update instead of duplicating, and nothing is deleted.
- `scripts/publish.mjs` (plan, config, record, status) and the record `.keelwright/publish.json`.

- Every project type: mobile, game, AI / LLM and library / CLI / API, alongside web. Each has stack rules in `reference/<type>-stack.md` (the main decision checked in order and compared with 2–3 alternatives — Expo / Flutter / native; Godot / Phaser / Unity / Unreal; Python or TypeScript with a model provider comparison; the users' language for libraries, Rust for single-binary CLIs), type-specific interview topics, and its documents: screen flow, store release checklist and an offline / sync ADR for mobile; GDD and asset pipeline for games; AI system design and eval plan (with cost and latency budgets) for AI; public API surface for libraries.
- Toolchains (`node`, `python`, `dart`, `rust`, `godot`, `editor`): `reference/toolchains.md` and `scripts/lib/toolchains.mjs` define the task runner (npm scripts, poethepoet, just), lockfiles, runtime pins, git hooks (Husky, or pre-commit with gitleaks and Conventional Commits), Dependabot ecosystems and hook commands. Scaffolding for each, with written setup instructions (`docs/setup.md`) for editor-based engines.
- `scripts/versions.mjs`: PyPI, crates.io and pub.dev packages, CPython, Flutter (with its Dart SDK), Rust, Godot and Unity LTS; checks `requires-python`, a crate's `rust-version` and a Dart package's SDK constraint.
- `scripts/toolchains.mjs`: required tasks and hook configuration per toolchain.
- `doccheck` types for the type-specific documents: screen flow (screens and a navigation diagram), GDD (core loop, cut list), AI system design (prompts; tools with side effects need confirmation), AI eval plan (thresholds, cost and latency budgets), API surface (items, versioning), with word limits.
- The theme from `design/tokens.json` can also be a TypeScript object (React Native / Expo) or a Dart class (Flutter).
- Skills for generated projects: `change-prompt` (AI) and `change-public-api` (libraries).
- Eval cases for each new type: `habit-tracker-mobile`, `roguelite-game`, `support-assistant-ai`, `csv-validator-cli`; graders for the toolchain and expected ADRs; the versions grader checks the toolchain's registry.

- `generate` step: CLAUDE.md (under 200 lines), path-scoped `.claude/rules/` from the stack packs' review rules (duplicates merged, not-applicable rules left out), the `reviewer` (read-only), `tester` and `docs-keeper` subagents, the `implement-story`, `new-adr` and `new-component` skills, Claude Code hooks and settings, and CONTRIBUTING.md — all from the same facts.
- Claude Code hook scripts for generated projects: `guard-files` (accepted ADRs, generated files, secrets via gitleaks), `format-on-edit` (Prettier + ESLint fix), `check-on-stop` (`npm run check`).
- `scripts/generatecheck.mjs` and `templates/claude/`.
- `scaffold` step (web): preflight, the framework's official generator pinned and non-interactive, exact versions, configuration from stack-pack rules (recorded in `.keelwright/scaffold.md`), theme from tokens, Husky + lint-staged + commitlint + gitleaks, CI with SHA-pinned actions, Dependabot, passing unit and E2E smoke tests.
- `scripts/preflight.mjs`, `scripts/scaffoldcheck.mjs`, `scripts/tokens-to-css.mjs`; `reference/web-scaffold.md` with the standard npm script names.
- `scripts/versions.mjs` resolves GitHub release tags to commit SHAs (and uses `GITHUB_TOKEN` when set).
- `research` step and gate 3: one stack pack per technology, reused when fresh (under 90 days, same major version) or researched live with sources; packs are installed into the project for review and saved to `~/.keelwright/stack-packs/` after approval.
- `scripts/packs.mjs` (plan, install, validate, save), `templates/stack-pack.md`, `steps/research-pack.md`.
- `scripts/research-pack.mjs` and the first shipped packs in `stack-packs/`: the default web stack and Astro.
- Evaluation suite (`evals/`): three cases (frontend rules 1, 3 and 5), a runner that drives headless Claude sessions through the interview and gates, code graders and two model judges, pass rates per grader, cost limit.
- CI: `Evals` workflow (smoke on PRs labelled `evals`, full suite weekly and on demand) and a reminder when a PR changes files the evals cover.

- `architecture` step (web): architecture overview with routes, C4 workspace, ERD + schema when data is stored, further ADRs.
- `features` step: story-map feature breakdown with a walking-skeleton MVP slice, and the deferred backlog (`BL-`, `TD-`).
- `design` step: visual identity and W3C DTCG design tokens with light and dark modes.
- `doccheck` checks for design tokens (structure, references, WCAG AA contrast), cross-document IDs and links, and the C4 workspace.
- Architecture overview template: a Routes section for web projects.
- Run metrics recorded automatically in `.keelwright/metrics.json`: runs and time per step, open questions at each gate, how much of each document the user edited at review, edits after approval, step counters.
- `/keelwright:kickoff report`: scorecard and per-document ratings, written to `.keelwright/report.md`.
- Spec section 8: test projects and evaluation (run metrics, evaluation suite, improvement loop).
- `interview` step (web): project type detection, gap analysis against the input, short rounds of questions, `.keelwright/interview.md`.
- `prd` step (web): document set from the catalog, frontend selection and right-sizing, live version resolution, PRD, ADR-0001 and stack ADRs; gate 1 approval finalises their status.
- `scripts/versions.mjs`: latest stable versions from npm, Node.js LTS and GitHub releases, with a peer-dependency check across the set.
- `scripts/doccheck.mjs`: document checks (length, placeholders, acceptance-criteria form, FR→story traceability) that steps must pass.
- `reference/`: web stack rules and document catalog for the steps to read at runtime.
- Plugin skeleton: manifest, marketplace entry, MIT license.
- `/keelwright:kickoff` command with the pipeline loop, review gates, edit detection after approval and single-step re-runs.
- State CLI (`scripts/state.mjs`) for `.keelwright/state.json`.
- Step instruction stubs for all nine pipeline steps (not implemented yet).
- Document templates: PRD, ADR (and fixed ADR-0001), backlog, development workflow, architecture overview, C4 workspace, ERD + SQL schema, feature breakdown, visual identity, screen flow, store release checklist, GDD, asset pipeline, AI system design, AI eval plan, public API surface.
- Specification (`keelwright-spec.md`).
- CI: tests on Node.js 22 / 24 / 26 and plugin validation on every pull request; Dependabot for GitHub Actions.
- Contributor documentation: contributing guide, code of conduct, security policy, issue and pull request templates.

### Changed

- The Claude Code hooks read `.claude/hooks/config.json` for the formatter, linter and check command, so the same scripts serve every toolchain (without it they keep the Node.js defaults).
- `scaffoldcheck`, `preflight` and `generatecheck` check each toolchain's own files, tasks and tools; libraries may declare ranges for runtime dependencies.
- The stack's main decision is recorded as `stack.primary` (was `stack.frontend`); the eval grader is now `primary` and still reads older runs.

- `STATE set stack` merges nested objects (versions, packs, layers) key by key.
- `prd` step: the problem statement comes only from the input and interview; assumptions and risks stay in their table. Version hold-back ADRs are named `NNNN-hold-<package>-at-<version>.md`.

[Unreleased]: https://github.com/elizadoltu/keelwright/commits/main
