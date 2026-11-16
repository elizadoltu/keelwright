---
status: draft            # draft | approved
date: YYYY-MM-DD
owner: <name>
---

# Public API surface: <Library / CLI / API name>

<!--
Rules for this document:
- The public surface is everything listed here. Anything not listed is internal and may change
  without notice.
- IDs: API-001…. Never renumber; mark removed items as "removed in vX".
- Every change to a listed item is classified as breaking or not using the rules in "Versioning".
- For HTTP APIs, the OpenAPI file is the source of truth for detail; this file lists endpoints
  and policy, not schemas.
- Target length: 1–2 pages.
-->

## Consumers

| Consumer | How they use it | Constraints |
|---|---|---|
| <e.g. app developers> | <imports the package / runs the CLI / calls the API> | <runtimes, environments> |

## Surface

<!-- Kind: function | class | type | CLI command | CLI flag | env var | config key | exit code | HTTP endpoint | event -->

| ID | Kind | Name / signature | Stability | Since |
|---|---|---|---|---|
| API-001 | function | `<parse(input: string, opts?: Options): Result>` | stable | 1.0.0 |
| API-002 | CLI command | `<tool build [--watch]>` | experimental | 1.2.0 |

Stability: `stable` (SemVer guarantees apply) · `experimental` (may change in a minor release) · `deprecated` (see below)

## CLI conventions

<!-- Delete if there is no CLI. -->

- Output: human-readable to stdout, errors and logs to stderr, `--json` for machine-readable output
- Exit codes: `0` success, `1` error, `2` invalid usage, <others>
- Configuration precedence: flags > env vars > config file > defaults

## HTTP API

<!-- Delete if there is no HTTP API. -->

- Specification: `<openapi.yaml>`
- Base URL and versioning: <e.g. /v1 in the path>
- Authentication: <…>
- Errors: <format, e.g. RFC 9457 problem details>

## Errors

| Error | When | Consumer should |
|---|---|---|
| <ErrorName / code> | <…> | <…> |

## Versioning

- Scheme: Semantic Versioning
- **Breaking** (major): removing or renaming a stable item, changing a signature or default,
  changing output format or exit codes, dropping a supported runtime version
- **Not breaking** (minor / patch): adding items or optional parameters, fixing behaviour that
  contradicts the documentation
- Supported runtimes: <e.g. Node.js active LTS versions>

## Deprecation policy

- A stable item is deprecated for at least <one minor release / N months> before removal.
- Deprecated items emit a warning that names the replacement.
- Removal only in a major release, listed in the changelog with a migration note.

## Release process

- Tooling: <e.g. changesets / release-please / semantic-release>
- Changelog: generated from Conventional Commits
- Published to: <npm / PyPI / crates.io / container registry>, with provenance where supported
- Pre-releases: <tag, e.g. next>

## Non-goals

- <things this library / CLI / API deliberately does not do>

## Open questions

- [NEEDS CLARIFICATION: <question>]
