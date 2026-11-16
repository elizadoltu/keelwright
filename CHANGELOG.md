# Changelog

All notable changes to KeelWright are recorded here.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added

- Plugin skeleton: manifest, marketplace entry, MIT license.
- `/keelwright:kickoff` command with the pipeline loop, review gates, edit detection after approval and single-step re-runs.
- State CLI (`scripts/state.mjs`) for `.keelwright/state.json`.
- Step instruction stubs for all nine pipeline steps (not implemented yet).
- Document templates: PRD, ADR (and fixed ADR-0001), backlog, development workflow, architecture overview, C4 workspace, ERD + SQL schema, feature breakdown, visual identity, screen flow, store release checklist, GDD, asset pipeline, AI system design, AI eval plan, public API surface.
- Specification (`keelwright-spec.md`).
- CI: tests on Node.js 22 / 24 / 26 and plugin validation on every pull request; Dependabot for GitHub Actions.
- Contributor documentation: contributing guide, code of conduct, security policy, issue and pull request templates.

[Unreleased]: https://github.com/elizadoltu/keelwright/commits/main
