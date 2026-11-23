# Library / CLI / API stack rules

<!--
Runtime copy of spec 4.4–4.6 for libraries, command-line tools and standalone APIs, read by the
`architecture` step (the stack is the tech lead's choice). Keep it in sync with keelwright-spec.md.
-->

The users of a library are developers, and **their ecosystem decides the language**. A CLI's users decide how it is installed. An HTTP API's consumers decide its contract, not its implementation language.

## Deciding questions

1. Who uses it and from what: a language (TypeScript / JavaScript, Python, Rust, Dart), a terminal, HTTP?
2. How is it installed: npm, PyPI, crates.io, pub.dev, a single binary, a container?
3. Which runtimes and versions must it support (Node.js versions, browsers, Python versions)?
4. How often will it change, and who depends on its stability?

## Candidates

Check in order; **stop at the first match**.

| # | If it is… | Choose | Toolchain |
|---|---|---|---|
| 1 | A library for one language's users | **That language**: TypeScript → npm; Python → PyPI; Rust → crates.io; Dart → pub.dev | `node` / `python` / `rust` / `dart` |
| 2 | A CLI that must start fast and install as one binary, with no runtime on the user's machine | **Rust** (clap) | `rust` |
| 3 | A CLI for developers who have Node.js (run with `npx`) | **TypeScript** on Node.js | `node` |
| 4 | A CLI around data work or Python libraries | **Python** (installed with `uv tool install` / `pipx`) | `python` |
| 5 | A standalone HTTP API | **Node.js + TypeScript + Express** (the web backend default), or **Python + FastAPI** when the team or the domain is Python | `node` / `python` |

## Defaults

| | TypeScript (npm) | Python (PyPI) | Rust (crates.io) |
|---|---|---|---|
| Build | tsdown (ESM, with `.d.ts`), `exports` map | `uv build` (uv's build backend) | `cargo build` |
| Package checks | `publint`, `@arethetypeswrong/cli` | `uv build` + `twine check` | `cargo package` |
| Tests | Vitest | pytest | `cargo test` |
| Lint / format / types | ESLint + Prettier, `tsc` | Ruff, pyright | clippy, rustfmt |
| CLI parsing | the built-in `node:util` `parseArgs`, or a library when subcommands need it | `argparse`, or Typer / Click when an ADR needs it | clap |
| Publishing | npm trusted publishing from GitHub Actions (OIDC) | PyPI trusted publishing | crates.io (trusted publishing where available, else a token secret) |

**Releases:** Semantic Versioning; Conventional Commits (already enforced) drive the changelog and the version bump — release-please by default (one release PR per release), changesets when the project is a monorepo of packages.

**HTTP APIs:** OpenAPI document checked in (`docs/api/openapi.yaml`), generated from or checked against the code; versioning in the URL or header as the API surface says.

## Right-sizing

A library has no database, no visual identity, no deployment — unless it is an HTTP API. Keep dependencies few: each runtime dependency is a cost for every user.

## Conventions

- **Clean Architecture** for APIs and larger libraries: the public API is a thin layer over the domain; adapters at the edges.
- **Humble Object** for CLIs: argument parsing and output formatting stay thin; the commands are plain functions tested directly.
- The public API surface is the contract: every exported item has an `API-` ID in `docs/api-surface.md`; anything not listed is internal.

## Documents

Always: `api-surface` (items with `API-` IDs and stability, CLI conventions or HTTP API, errors, versioning, deprecation, release process). `architecture-overview` and `c4` only for an HTTP API or a library with several components. `erd` only for an API that stores data.

## Versions

Runtime dependencies as **ranges with the resolved version as the lower bound**; development tools exact; the lockfile committed (see `reference/toolchains.md`). Resolve: `node` / `python` / `rust`, the build and test tools (`npm:tsdown`, `npm:publint`, `npm:@arethetypeswrong/cli`, `npm:vitest`; `pypi:ruff`, `pypi:pyright`, `pypi:pytest`, `pypi:poethepoet`; `crates:clap`), the release tool (`github:googleapis/release-please-action`), and the support range of the runtime (the oldest supported Node.js / Python version the library promises).

## Stack packs

| Technology | Pack id | Packages |
|---|---|---|
| npm library tooling | `npm-library` | `tsdown`, `publint`, `@arethetypeswrong/cli` |
| Python packaging and tooling | `python-tooling` | `ruff`, `pyright`, `pytest`, `poethepoet` |
| Rust | `rust` | `rust` |
| clap | `clap` | `clap` |
| release-please | `release-please` | `release-please` |
| Shared | `typescript`, `vitest`, `express`, `fastapi`, `git-hooks`, `pre-commit` | as in the other stack files |

## ADRs

- **ADR-0002 is the language and distribution decision** (rule matched; for a library, the supported runtime versions).
- One ADR each for: the release tool, a CLI framework if not the default, the HTTP framework for an API, a held-back version.
