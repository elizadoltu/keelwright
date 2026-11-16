# KeelWright

A Claude Code plugin that takes a project from **idea or specs** to project documents, a scaffolded repository and a project-specific Claude setup, with review gates where you edit the documents before the pipeline continues.

> Status: Phase 1 in progress. The pipeline, state and review gates work, and the `interview` and `prd` steps are built for web projects; the remaining steps are being added one by one (see `keelwright-spec.md`, section 9).

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

Pipeline state is kept in `.keelwright/state.json` in your project — commit it.

## Repository layout

| Path | Contents |
|---|---|
| `keelwright-spec.md` | The full specification — the source of truth |
| `.claude-plugin/` | Plugin manifest and marketplace entry |
| `commands/kickoff.md` | The `/kickoff` command: argument handling, the step loop, review gates |
| `steps/` | Instructions for each pipeline step, read by `/kickoff` |
| `scripts/state.mjs` | State CLI — the only way the pipeline reads or changes `state.json` |
| `scripts/lib/` | Pipeline definition and state logic |
| `templates/` | Document templates used by the steps |
| `reference/` | Rules the steps read at runtime (web stack rules, document catalog) |
| `scripts/versions.mjs` | Resolves the latest stable versions from the registries and checks peer compatibility |
| `scripts/doccheck.mjs` | Checks generated documents: length, leftover placeholders, acceptance criteria, ID traceability |
| `tests/` | Tests for the state logic and CLI |

## Development

```bash
npm test
```

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for how the repository fits together, how to build or change a step, and how releases work. Changes are recorded in [CHANGELOG.md](CHANGELOG.md). Please report security issues privately as described in [SECURITY.md](SECURITY.md).

## License

[MIT](LICENSE)
