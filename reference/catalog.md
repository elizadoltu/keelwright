# Document catalog

<!--
Runtime copy of spec sections 6.0 and 6.1, read by the `prd` step (to propose the document set)
and by the document steps. Keep it in sync with keelwright-spec.md and scripts/lib/pipeline.mjs.
-->

Templates live in `<plugin root>/templates/`. Keys are used in the PRD's `documents:` front matter and in `STATE set documents`.

## Always

| Key | Document | Path | Step |
|---|---|---|---|
| `prd` | PRD (MVP scope and release plan) | `docs/prd.md` | `prd` |
| `adr` | ADRs: ADR-0001 + at least the stack decision (frontend, app framework, engine, model provider or language); for mobile also the offline / sync strategy | `docs/decisions/NNNN-title.md` | `prd`, `architecture` |
| `backlog` | Deferred backlog | `docs/backlog.md` | `features` |
| `development-workflow` | `CONTRIBUTING.md` | `CONTRIBUTING.md` | `generate` |

## Conditional

Include a document only when its condition holds; give the reason either way when proposing the set.

| Key | Included when… | Path | Step |
|---|---|---|---|
| `architecture-overview` | more than one container or service, or a backend exists — including a managed backend (e.g. Supabase) or serverless functions | `docs/architecture/overview.md` | `architecture` |
| `c4` | same as `architecture-overview` | `docs/architecture/c4/workspace.dsl` | `architecture` |
| `erd` | the project stores data (in a database it owns or a managed one) | `docs/architecture/erd.md` + `docs/architecture/schema.sql` | `architecture` |
| `feature-breakdown` | more than ~5 features, or delivery in several slices | `docs/features.md` | `features` |
| `visual-identity` | the project has a user-facing UI — for a game only when its UI is built with a UI framework (a game's look is otherwise the GDD's art direction) | `docs/design/visual-identity.md` + `design/tokens.json` | `design` |
| `screen-flow` | project type is mobile | `docs/design/screen-flow.md` | `design` |
| `release-checklist` | mobile, shipped to app stores | `docs/release-checklist.md` | `design` |
| `game-design-document` | project type is game | `docs/gdd.md` | `design` |
| `asset-pipeline` | project type is game | `design/asset-pipeline.md` | `design` |
| `ai-system-design` | the project calls an LLM or ML model | `docs/ai/system-design.md` | `architecture` |
| `ai-eval-plan` | the project calls an LLM or ML model | `docs/evals/plan.md` + `evals/data/` | `architecture` |
| `api-surface` | project type is library / CLI / API, or the project exposes an API that other systems or teams call (e.g. an AI service behind another product) | `docs/api-surface.md` | `architecture` |

## Optional — only when the user asks

| Key | Document |
|---|---|
| `jira` | Backlog as Jira epics and stories |
| `confluence` | `docs/` mirrored to Confluence |
| `architecture-requirements` | Standalone architecture requirements (large projects only) |

## Template principles

- **Short.** PRD 1–3 pages, ADR one page, GDD max 2 pages.
- **Stable IDs**, never renumbered: `SC-001` success criteria, `US-1` user stories, `FR-001` / `NFR-001` requirements, `ADR-NNNN`, `A-1` / `F-01` activities / features, `BL-001` / `TD-001` backlog / tech debt, `EV-001` eval criteria, `S-01` screens, `P-01` / `T-01` prompts / tools, `API-001` public API items. Removed items are marked "dropped", not deleted.
- **Testable.** Acceptance criteria use `WHEN … THE SYSTEM SHALL …` or Given / When / Then.
- **What vs how.** The PRD says what and why; stack and architecture live in ADRs.
- **Explicit non-goals and a `status`** in every document.
- **Unknowns are marked, not guessed:** `[NEEDS CLARIFICATION: …]`, resolved at review gates.
- **ADRs are immutable once accepted**; a new ADR supersedes the old one.
- **Writing a document from its template:** keep the structure, front matter and IDs; fill every section; delete the template's instruction comments, placeholder rows and sections marked "delete if not applicable" that don't apply.
