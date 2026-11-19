# KeelWright

A Claude Code plugin that takes a project from **idea or specs** to project documents, a scaffolded repository and a project-specific Claude setup, with review gates where you edit the documents before the pipeline continues.

> Status: Phase 1 complete. The whole `/kickoff` pipeline is built — from the interview to an optional publish to Jira and Confluence — for web, mobile, game, AI / LLM and library / CLI / API projects, and was validated on a real web project (`evals/runs/`). In progress: `/adopt` for existing projects — the whole create-mode pipeline is built and being validated (see `keelwright-spec.md`, 5.2.1 and section 9).

## Requirements

- Claude Code
- Node.js 22 or newer (the plugin's state CLI and version lookups use it)

## Install

From GitHub:

```
/plugin marketplace add elizadoltu/keelwright
/plugin install keelwright@keelwright
```

For local development, load the plugin straight from a checkout:

```bash
claude --plugin-dir /path/to/keelwright
```

## Usage

Run in an empty folder (or the root of a new repository):

Plugin commands are namespaced, so the command is `/keelwright:kickoff` (shown as `/kickoff` below for short).

| Command | Does |
|---|---|
| `/kickoff <description or file>` | Starts a kickoff from a project description or a specs file |
| `/kickoff` | Continues where the pipeline stopped (e.g. after you edited documents at a review gate) |
| `/kickoff status` | Shows each step, the next action, files you edited and open questions |
| `/kickoff <step>` | Re-runs one step: `interview`, `prd`, `architecture`, `features`, `design`, `research`, `scaffold`, `generate`, `publish` |
| `/kickoff research --refresh` | Re-researches the stack packs |
| `/kickoff report` | Shows how the run went (time, re-runs, how much you edited each document) and asks you to rate each document |

### Existing projects: `/adopt` (in progress)

Run in the root of an existing repository that has no Claude setup yet (`/keelwright:adopt`). It describes the project as it is — stack and versions in use, tasks, architecture, conventions with the files that show them, gaps — and stops for your corrections at gate 1; then it records the architecture as built and ADRs for the decisions already in the code, researches conventions for the versions you use, and stops at gate 2. Then it offers each missing safety net (secret scanning, hooks, CI, dependency updates) as a diff you approve or decline, and generates the Claude setup from the project's own commands and conventions. It never changes application code or dependency versions.

| Command | Does |
|---|---|
| `/adopt [notes]` | Starts (or continues) adopting the project; notes are kept as input for the analysis |
| `/adopt status`, `/adopt report`, `/adopt <step>` | As for `/kickoff` |

### Health check: `/doctor`

Run in any project with a Claude setup (`/keelwright:doctor`), made by KeelWright or by hand. It checks the project as it is today — the Claude setup against the code (commands, paths, settings), the documents against the code (cited files that were deleted, broken references, open questions), the stack packs against the versions in use, the tooling gaps, and the git history (commit style, hooks not installed) — and names the fix for each finding. It changes nothing but its own record, `.keelwright/doctor.md`, which keeps a history so you can see the trend. The checks are mechanical: no model calls, no cost.

Pipeline state is kept in `.keelwright/state.json` and run metrics in `.keelwright/metrics.json` in your project — commit both. Metrics never leave your machine.

## Repository layout

| Path | Contents |
|---|---|
| `keelwright-spec.md` | The full specification — the source of truth |
| `.claude-plugin/` | Plugin manifest and marketplace entry |
| `commands/kickoff.md`, `commands/adopt.md` | The commands: argument handling, the step loop, review gates |
| `steps/` | Instructions for each pipeline step, read by `/kickoff` and `/adopt` |
| `scripts/state.mjs` | State CLI — the only way the pipeline reads or changes `state.json` |
| `scripts/lib/` | Pipeline definition and state logic |
| `templates/` | Document templates used by the steps |
| `reference/` | Rules the steps read at runtime: stack rules per project type, toolchains, web scaffold, document catalog |
| `scripts/versions.mjs` | Resolves the latest stable versions from the registries and checks peer compatibility |
| `scripts/doctor.mjs` | The doctor's checks: health per area, with a history in `.keelwright/doctor.md` |
| `scripts/doccheck.mjs` | Checks generated documents: length, leftover placeholders, acceptance criteria, ID traceability |
| `scripts/packs.mjs` | Stack packs: decides reuse or research, installs packs into a project, validates them |
| `scripts/preflight.mjs` | Checks the machine can build the project (Node.js, git, gitleaks, Supabase CLI) before scaffolding |
| `scripts/scaffoldcheck.mjs` | Checks a scaffolded project: exact versions, scripts, hooks, pinned CI actions, theme in sync |
| `scripts/tokens-to-css.mjs` | Generates the Tailwind theme from the design tokens (copied into projects) |
| `scripts/generatecheck.mjs` | Checks a generated agent setup: CLAUDE.md, rules coverage, agents, skills, settings, hooks |
| `stack-packs/` | Researched conventions per technology, shipped with the plugin |
| `tests/` | Unit tests |
| `evals/` | Evaluation suite — see `evals/README.md` |

## Development

```bash
npm test
```

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for how the repository fits together, how to build or change a step, and how releases work. Changes are recorded in [CHANGELOG.md](CHANGELOG.md). Please report security issues privately as described in [SECURITY.md](SECURITY.md).

## License

[MIT](LICENSE)
