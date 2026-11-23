<p align="center"><img src="assets/logo.svg" alt="KeelWright logo" width="96" height="96"></p>

# KeelWright

A Claude Code plugin that takes a project from **idea or specs** to project documents, a scaffolded repository and a project-specific Claude setup, with review gates where you edit the documents before the pipeline continues.

> Status: Phases 1–3 complete (version 0.3.0). `/kickoff` takes web, mobile, game, AI / LLM and library / CLI / API projects from an idea to documents, a scaffold and a Claude setup; `/adopt` brings existing repositories in and, in audit mode, fixes what the doctor finds; `/doctor` checks a project's health and security; `/start` picks the right one; `/profile` tailors it to your role. Each was validated on real projects (`evals/runs/`). Next: a visual app for people who don't use a terminal (spec section 9, Phase 4).

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

### Start here: `/start`

`/keelwright:start` looks at the folder and picks the route: an empty folder, or one with only notes, specs or a PRD, gets a kickoff (the notes are its input); existing code without a Claude setup is adopted; a project with a Claude setup gets the doctor; a pipeline in progress continues. It says what it found, which route and why, and what that route will produce, then runs it. When the folder is unclear — a fresh scaffold with a few commits, code only in a subfolder — it asks. `/kickoff` and `/adopt` below override its choice.

### New projects: `/kickoff`

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

### Existing projects: `/adopt`

Run in the root of an existing repository that has no Claude setup yet (`/keelwright:adopt`). It describes the project as it is — stack and versions in use, tasks, architecture, conventions with the files that show them, gaps — and stops for your corrections at gate 1; then it records the architecture as built and ADRs for the decisions already in the code, researches conventions for the versions you use, and stops at gate 2. Then it offers each missing safety net (secret scanning, hooks, CI, dependency updates) as a diff you approve or decline, and generates the Claude setup from the project's own commands and conventions. It never changes application code or dependency versions.

| Command | Does |
|---|---|
| `/adopt [notes]` | Starts (or continues) adopting the project; notes are kept as input for the analysis |
| `/adopt status`, `/adopt report`, `/adopt <step>` | As for `/kickoff` |

### Who you are: `/profile`

`/keelwright:profile` records your name and role — developer, tech lead, designer, project manager, business analyst or account manager — and optional defaults (Jira project, Confluence space, language) in `~/.keelwright/profile.json`, never in the repository. KeelWright asks once, on your first run. The role never changes which documents the project gets, but it decides **who produces each part**: a project manager, business analyst or account manager runs the interview (product questions only), the PRD and the feature breakdown, and is never asked a technical question or shown a stack; the stack, architecture, diagrams, data model, scaffold and Claude setup belong to the tech lead (or a developer); the visual identity and screens to the designer (or the tech lead, on a team without one). When the next step is someone else's, KeelWright stops and says who is next — they continue with `/keelwright:start` in the same folder. A developer or tech lead can run every step. The role also decides which documents are shown to you in full at review gates and rated in the report, which open questions you're asked (each is tagged with the role that can answer it, e.g. `[NEEDS CLARIFICATION (pm): launch date?]` — the rest wait for the right person), and how the doctor's results are ordered and worded. A project manager is offered [pm-skills](https://github.com/phuryn/pm-skills) workflows when it is installed.

### Fixing what the doctor finds: audit mode

On a project that already has a Claude setup, `/keelwright:adopt` (or `/keelwright:adopt audit`, or `/keelwright:start`) runs the doctor and then goes through its findings as fixes: a leaked secret first (you rotate it; it never rewrites history), then each failure and warning — a diff to a rule or document that drifted, a missing safety net, a dependency upgrade within its major, a KeelWright step to re-run. Each is applied only when you approve it, and only recorded as applied once the doctor no longer finds it. Declined fixes are kept with your reason in `.keelwright/audit.md` and not offered again; a security risk can be accepted for at most 90 days. Nothing is committed.

### Health check: `/doctor`

Run in any project with a Claude setup (`/keelwright:doctor`), made by KeelWright or by hand. It checks the project as it is today — the Claude setup against the code (commands, paths, settings), the documents against the code (cited files that were deleted, broken references, open questions), the stack packs against the versions in use, the tooling gaps, the application's security, and the git history (commit style, hooks not installed) — and names the fix for each finding. It changes nothing but its own record, `.keelwright/doctor.md`, which keeps a history so you can see the trend. The checks are mechanical: no model calls, no cost.

`/keelwright:doctor security` runs only the security audit: every locked dependency checked against OSV.dev for known vulnerabilities, gitleaks over the whole git history, row-level security on Supabase tables, `.env` and CI hygiene, and Semgrep when it's installed. Only package names and versions leave your machine (`--offline` skips that). The findings go to `.keelwright/security/audit.md`, which git-ignores itself so open vulnerabilities are never committed; `doctor.md` keeps only the counts. Findings you decide to live with go in `.keelwright/security-accepted.json` with a reason and an end date, at most 90 days away. It is not a penetration test.

`/keelwright:doctor security --deep --max-cost <usd>` adds a review of the code itself by a model — **it costs money**, so the limit is required and hard. The code is reviewed area by area, sensitive areas from the threat model first, by the project's own `security-reviewer` agent (or KeelWright's read-only `security-auditor`), and a second, independent pass tries to disprove every finding before it is reported. `--plan` shows the areas for free; `--area <name>` reviews just one. The findings join the security audit and are fixed in audit mode; with Jira connected, critical and high ones can become issues when you ask.

Pipeline state is kept in `.keelwright/state.json` and run metrics in `.keelwright/metrics.json` in your project — commit both. Metrics never leave your machine.

## Repository layout

| Path | Contents |
|---|---|
| `keelwright-spec.md` | The full specification — the source of truth |
| `.claude-plugin/` | Plugin manifest and marketplace entry |
| `scripts/audit.mjs` | Audit mode: the doctor's findings as a fix plan, and the decisions on them |
| `commands/profile.md`, `scripts/profile.mjs` | The personal profile: role, name, defaults; working sets and role-tagged questions |
| `commands/start.md` | The entry point: picks the route from `analyse.mjs --preflight` and runs that command |
| `commands/kickoff.md`, `commands/adopt.md` | The commands: argument handling, the step loop, review gates |
| `steps/` | Instructions for each pipeline step, read by `/kickoff` and `/adopt` |
| `scripts/state.mjs` | State CLI — the only way the pipeline reads or changes `state.json` |
| `scripts/lib/` | Pipeline definition and state logic |
| `templates/` | Document templates used by the steps |
| `reference/` | Rules the steps read at runtime: stack rules per project type, toolchains, web scaffold, document catalog |
| `scripts/versions.mjs` | Resolves the latest stable versions from the registries and checks peer compatibility |
| `scripts/doctor.mjs` | The doctor's checks: health per area, with a history in `.keelwright/doctor.md` |
| `scripts/lib/security.mjs` | The security audit's checks (dependencies, secrets, row-level security, hygiene, Semgrep), recorded in `.keelwright/security/` (not committed) |
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
