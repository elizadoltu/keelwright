# <Product name>

<!--
Template for the generated CLAUDE.md. Rules for this document:
- Under 200 lines. Always loaded, so every line must earn its place: concrete instructions, not
  principles ("run npm run check before finishing", not "write clean code").
- Facts about this project only, taken from the PRD, ADRs, architecture overview, scaffold record
  and stack packs. Link to documents instead of repeating them.
- Detailed, path-specific conventions go into .claude/rules/*.md (loaded when matching files are
  touched); multi-step procedures go into skills.
- Every command must exist in package.json; every path must exist.
- Delete these comments and every section that doesn't apply.
-->

<one or two sentences: what this is, for whom — from the PRD summary>

## Documents

- Product: `docs/prd.md` — stories `US-`, requirements `FR-` / `NFR-`
- Architecture: `docs/architecture/overview.md` — routes, code structure, key flows
- Decisions: `docs/decisions/` — accepted ADRs are never edited; a change is a new ADR that supersedes the old one (use the `new-adr` skill)
- Backlog: `docs/backlog.md`; features and slices: `docs/features.md`
- Design: `docs/design/visual-identity.md`; values live only in `design/tokens.json`

## Commands

| Command | When |
|---|---|
| `npm run dev` | <…> |
| `npm run check` | Before finishing any change: lint, format check, type check, unit tests, theme drift |
| `npm run test:e2e` | <…> |

## Stack

<one line per layer with the version, linking the ADR — from the overview's stack table>

## Code structure

<the top-level folders and what goes where, 5–10 lines — from the overview's code structure>

## Working rules

<!-- 5–12 project-wide rules. Each concrete and checkable; say what enforces it when something does. -->

- <rule>

## Workflow

- One story at a time (`implement-story` skill): acceptance criteria → tests → code → `npm run check`.
- Branches `<type>/<short-description>`; commits follow Conventional Commits (enforced by commitlint).
- Hooks run on your edits: formatting and lint fixes after each edit, `npm run check` when you finish, and accepted ADRs, generated files and secrets are protected.

## Agents

- `reviewer` — reviews a change against the conventions, ADRs and requirements; read-only
- `tester` — turns acceptance criteria into Vitest and Playwright tests
- `docs-keeper` — keeps docs, ERD, backlog and the ADR index in sync with the code
