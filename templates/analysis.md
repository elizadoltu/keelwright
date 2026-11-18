---
status: draft            # draft | approved
date: YYYY-MM-DD
mode: adopt
---

# Analysis: <Project name>

<!--
Rules for this document (spec 5.2.1):
- It describes the project AS IT IS. The code is the source of truth; nothing here is a plan.
- Facts come from `scripts/analyse.mjs`; judgement (type, architecture, conventions, decisions) from reading the code.
- Every convention (C-) cites at least one file that shows it, and says whether the code follows it
  consistently or mixed. Every cited file must exist. A convention you can't point to is left out.
- Nothing is invented: what can't be told from the code or docs is a [NEEDS CLARIFICATION: …] marker.
- The user strikes out anything wrong at gate 1; struck-out conventions never become rules.
- Max ~4 pages.
-->

## Summary

<!-- 2–4 sentences: what the project does and for whom, from the README and the code. Cite the README. -->

## Project

| | |
|---|---|
| Type | <web / mobile / game / ai / library> — <why, one line> |
| Toolchain | <node / python / dart / rust / godot / editor> (<package manager>) |
| Runtime | <e.g. Node.js 20 (`.nvmrc`)> |
| Repository | <single project / workspace repo: each workspace and what it is, e.g. "`frontend/` — React SPA; `backend/` — Express API"> |

## Stack

<!-- The versions IN USE (locked), not the latest. -->

<!-- Workspace repo: name the workspace in the Layer column (e.g. "frontend: UI"). -->

| Layer | Technology | Version in use | Evidence |
|---|---|---|---|
| <e.g. backend> | <e.g. Express> | <4.21.2> | `package.json`, `src/app.ts` |

## Tasks

<!-- The project's real commands, mapped to the task contract. Missing ones are gaps. -->

| Task | Command |
|---|---|
| lint | <e.g. `pnpm lint`> |
| test | <…> |
| typecheck | <…> |
| check | <… or "none"> |

## Structure

<!-- The folders that matter and what each holds; entry points. -->

| Path | Holds |
|---|---|
| `src/routes/` | <…> |

## Architecture

<!-- The style the code actually has (e.g. layered: routes → services → repositories; feature folders;
Clean Architecture; MVC), the main flow of a request or of the program, external systems.
Cite files. Say where the code departs from its own style. -->

## Conventions

<!-- What the code actually does, area by area: naming, structure, components, data access, errors,
validation, logging, configuration, testing, styling. One row each; concrete enough to become a rule. -->

| ID | Area | Convention | Evidence | Followed |
|---|---|---|---|---|
| C-01 | <e.g. errors> | <e.g. route handlers throw `HttpError`; one error middleware formats responses> | `src/errors.ts`, `src/app.ts` | consistent |

## Enforced by tooling

<!-- What the existing tools already enforce (from analyse.mjs), so the generated rules don't repeat it. -->

| Tool | Enforces | Config |
|---|---|---|
| <e.g. ESLint> | <…> | `eslint.config.js` |

## Existing documents

<!-- README, ADRs, docs/, CONTRIBUTING — linked, not rewritten. Other tools' instructions (AGENTS.md,
.cursorrules, Copilot instructions): what they ask for, to be carried into the Claude setup. -->

## Decisions in the code

<!-- The main decisions already made (framework, database, hosting, auth, anything the code depends on
heavily). The `document` step records each as a retroactive ADR. Existing ADRs: link, don't repeat. -->

| ID | Decision | Evidence | Existing ADR |
|---|---|---|---|
| D-01 | <e.g. PostgreSQL through Prisma> | `prisma/schema.prisma` | — |

## Gaps

<!-- From analyse.mjs plus end-of-life checks. The `gaps` step proposes a fix for each, one by one. -->

| ID | Gap | Proposed fix |
|---|---|---|
| G-01 | <e.g. no secret scanning> | <e.g. gitleaks in the existing Husky pre-commit hook and in CI> |

## Open questions

- [NEEDS CLARIFICATION: …]
