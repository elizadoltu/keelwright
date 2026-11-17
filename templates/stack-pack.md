---
id: <slug, e.g. astro>
name: <Display name, e.g. Astro>
packages: [<primary package first — its npm, PyPI, pub.dev or crates.io name, as keyed in stack.versions>, <related packages, globs allowed, e.g. "@astrojs/*">]
major: <researched major version of the primary package>
researchedAt: YYYY-MM-DD
status: draft            # draft | reviewed
---

# Stack pack: <Name> <major>

<!--
Rules for this document:
- One technology per pack. A project's stack is the set of packs it uses.
- Every rule cites at least one source; a rule may not rest on community sources alone.
- Source priority: official docs and style guides → maintainers' recommended setups →
  well-maintained reference projects → community sources, only to fill gaps.
- Describe the researched major version only; note what changed from the previous major.
- Facts, not opinions: if sources disagree, say so and pick the official position.
- Target length: 1,200–3,000 words including tables. The Rules table is what the generator uses.
-->

## Summary

<!-- 2–3 sentences: what this technology is for in a project, and the researched version. -->

## Project structure

<!-- Recommended folders and files, with the source for each. -->

## Naming

## Testing

<!-- What to test with what; how this technology is tested (unit, component, E2E); test file locations. -->

## Linting and formatting

<!-- Official or maintainer-recommended linters, plugins and configs; formatter setup. -->

## Security

<!-- Defaults to keep, settings to change, common mistakes (secrets, injection, headers, auth). -->

## Performance pitfalls

## CI/CD and release

<!-- Build, cache, preview and deploy patterns; checks worth running in CI. -->

## Conventions

<!-- How Clean Architecture, Atomic Design and Humble Object map onto this technology — or "not applicable" with the reason. -->

## Version notes

<!-- Breaking changes in this major, deprecated APIs to avoid, known compatibility limits with other packages. -->

## Rules

<!-- Concrete, checkable rules for agents and humans. "Enforce with" starts with: lint, format, types, hook, ci, test, config or review. -->

| ID | Rule | Enforce with | Sources |
|---|---|---|---|
| <ID>-01 | <rule> | lint: <tool and rule name> | S1 |

## Sources

<!-- kind: official | maintainer | reference-project | community -->

| ID | Kind | Title | URL |
|---|---|---|---|
| S1 | official | <page title> | https://<url> |
