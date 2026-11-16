# Changelog

All notable changes to KeelWright are recorded here.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added

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

[Unreleased]: https://github.com/elizadoltu/keelwright/commits/main
