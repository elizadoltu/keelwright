# Contributing to KeelWright

Thanks for helping build KeelWright. This guide covers how the repository is organised, how to change it, and how releases work.

## Before you start

- **The spec is the source of truth.** `keelwright-spec.md` describes what KeelWright does and why. Read the sections your change touches. If your change alters a decision in the spec, update the spec in the same pull request.
- **Bigger changes start with an issue.** For a new step, a new project type, a new document in the catalog or anything that changes the pipeline, open an issue first so the design can be agreed before you write it.
- Be kind and constructive — see the [Code of Conduct](CODE_OF_CONDUCT.md).

## Setup

Requirements: Claude Code and Node.js 22 or newer. There are no npm dependencies to install.

```bash
git clone https://github.com/elizadoltu/keelwright.git
cd keelwright
npm test
```

To try the plugin, run Claude Code with it loaded **from a scratch folder**, not from this repository:

```bash
mkdir -p /tmp/kw-try && cd /tmp/kw-try
claude --plugin-dir /path/to/keelwright
# then: /keelwright:kickoff A small portfolio site with a contact form
```

## How the repository fits together

| Path | Contents |
|---|---|
| `keelwright-spec.md` | Specification |
| `commands/kickoff.md` | The `/kickoff` command: arguments, step loop, review gates, edit handling |
| `steps/<step>.md` | Instructions for one pipeline step, read by `/kickoff` at runtime |
| `scripts/state.mjs` | State CLI — the only code that reads or writes `.keelwright/state.json` |
| `scripts/lib/pipeline.mjs` | Single definition of steps, order, gates, project types and document keys |
| `scripts/lib/state.mjs` | State transitions, edit detection, markers |
| `templates/` | Document templates used by the steps |
| `reference/` | Runtime copies of spec rules the steps read (stack rules, catalog) — keep in sync with the spec |
| `scripts/versions.mjs` | Live version resolution and peer check |
| `scripts/doccheck.mjs` | Mechanical document checks that steps must pass |
| `tests/` | Tests for the state logic and CLI (`node:test`) |

## Making changes

### Rules that keep the plugin consistent

- **State changes go through the state CLI.** If the pipeline needs a new transition, add it to `scripts/lib/state.mjs` with tests. Commands and steps never edit `state.json` directly.
- **One definition of the pipeline.** When step names, gates, project types or document keys change, update `scripts/lib/pipeline.mjs`, `commands/kickoff.md` and spec sections 5.1.2 / 6.0 together.
- **No runtime dependencies.** Scripts use Node.js built-ins only, so the plugin works without an install step.
- **Plugin paths.** Files under `commands/` refer to plugin files with `${CLAUDE_PLUGIN_ROOT}`. Files read at runtime (`steps/`, `templates/`) can't — they say "plugin root" and the command supplies the path.

### Building or changing a step

1. Replace the "Not implemented yet" notice in `steps/<step>.md` with the step's instructions: what to read, what to produce, when to ask the user, and how to finish (`STATE complete …` or `STATE skip …`).
2. Keep the rules in `commands/kickoff.md` ("Rules for every step") — a step adds detail, it doesn't override them.
3. Enforce what can be checked mechanically: add it to `scripts/lib/doccheck.mjs` (with tests) and have the step run the check before completing, rather than only asking for it in prose.
4. Try the step end to end in a scratch folder (see Setup), including a review gate with an edited document and a re-run of the step. Run it more than once — outputs vary between runs.

To test a later step without running the real earlier ones, copy the plugin to a scratch folder and replace the earlier `steps/*.md` with short test doubles that write a fixed file and complete the step.

### Changing a template

Templates follow the principles in spec 6.1: short, stable IDs, testable criteria, explicit non-goals and a `status`, unknowns marked as `[NEEDS CLARIFICATION: …]`. Keep existing IDs and section names stable — generated projects and `/adopt` rely on them. A new template also needs a catalog key (spec 6.0) and an entry in `scripts/lib/pipeline.mjs`.

## Tests

```bash
npm test
claude plugin validate .
```

Both must pass before a pull request is merged; CI runs them on every pull request (tests on Node.js 22, 24 and 26). New state logic needs tests; behaviour that lives in Markdown (commands, steps) is checked by running it as described above — say in the pull request what you ran.

## Branches, commits and pull requests

- Branch from `main`; `main` is always releasable. Branch names: `<type>/<short-description>`, e.g. `feat/interview-step`.
- Commits follow [Conventional Commits](https://www.conventionalcommits.org/): `feat`, `fix`, `docs`, `refactor`, `test`, `chore`, `ci`. Use a scope where it helps: `feat(kickoff): …`, `docs(spec): …`, `feat(templates): …`.
- Keep pull requests focused on one change. Fill in the pull request template.
- Add a line under **Unreleased** in `CHANGELOG.md` for any user-visible change.

## Releases

KeelWright follows [Semantic Versioning](https://semver.org/). Before 1.0.0, minor versions may contain breaking changes.

A **breaking change** is anything that breaks an existing project or user habit: renaming or removing a step, command or argument; changing the state file format in a way older state can't be read; renaming a catalog key, template section or stable ID prefix.

To release:

1. Move the **Unreleased** entries in `CHANGELOG.md` under the new version with today's date.
2. Bump `version` in **both** `.claude-plugin/plugin.json` and `package.json`.
3. Merge to `main`, then tag: `git tag vX.Y.Z && git push origin vX.Y.Z`.
4. Create a GitHub release from the tag with the changelog entries.

## Reporting bugs and security issues

- Bugs and ideas: open an issue using the templates.
- Security vulnerabilities: **don't** open a public issue — see [SECURITY.md](SECURITY.md).

By contributing, you agree that your contributions are licensed under the [MIT License](LICENSE).
