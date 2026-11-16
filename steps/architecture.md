# Step: `architecture`

Describe how the system is built: the architecture overview with routes, the C4 model, the data model, and any further decisions. Only the documents in the chosen document set.

**Reads:** `docs/prd.md`, all ADRs in `docs/decisions/`, `.keelwright/interview.md`, the state (`STATE status --json`: document set and `stack`), `<plugin root>/reference/web-stack.md`, `<plugin root>/reference/catalog.md`, and the templates `architecture-overview.md`, `c4-workspace.dsl`, `erd.md`, `schema.sql`, `adr.md`. On a re-run: the existing outputs.
**Produces** (only those in the document set): `docs/architecture/overview.md`, `docs/architecture/c4/workspace.dsl`, `docs/architecture/erd.md` + `docs/architecture/schema.sql`, new ADRs from 0003 on (or the next free number).
**Gate:** Gate 2, shared with `features` and `design`.

The approved PRD and accepted ADRs are the source of truth. This step adds detail; it doesn't change decisions. If it finds that an accepted decision doesn't work, it writes a new ADR that supersedes it and says so at the gate.

If none of `architecture-overview`, `c4` and `erd` is in the document set and no new decision is needed, run `STATE skip architecture --reason "<why>"` and stop.

## 1. Work out the structure

From the PRD, the ADRs and `stack` in the state:

- **Containers** — every separately deployed or separately running part: the site or app, server functions or an API, databases, managed services that store data (e.g. Supabase). Static files on a CDN are one container. External services (email, anti-spam, analytics, payments) are external systems, not containers.
- **Routes** (web) — every page or endpoint that a P1 or P2 story needs, with how it is rendered: `static` (prerendered at build time), `server` (on request), `client` (SPA). Mark language variants the way the i18n ADR decided.
- **Key flows** — the 1–3 flows where something can go wrong or crosses a container boundary (e.g. submitting a form, publishing content). Not every page view.
- **Code structure** — map the conventions the PRD / ADRs chose (Clean Architecture, Atomic Design, Humble Object) onto real folders **for this framework**. Scale them to the project: a static site needs no domain / application layers; keep logic out of hard-to-test boundaries (Humble Object) and UI in atomic levels.
- **Cross-cutting concerns** — only those that apply: auth, error handling, logging, configuration and secrets (gitleaks is always on), testing (Vitest for logic, Playwright for the acceptance criteria), i18n, SEO, privacy.
- **Data** — whether anything is stored; if so, which entities, with the stories that need them.

New decisions the PRD step didn't make (e.g. how content collections are structured, how the form is protected against spam if not already decided) get an ADR **only** if they are hard to reverse or span components; small choices go into the overview.

## 2. Write the documents

Follow the template rules in `reference/catalog.md`.

**`docs/architecture/overview.md`** (if `architecture-overview` is in the set) from `templates/architecture-overview.md`:
- Front matter `status: draft`, today's date, owner from the PRD.
- Quality goals: the top 3–5 NFRs, each with a concrete scenario and its `NFR-` ID.
- Stack: one row per layer with the version from `stack.versions` and the ADR that decided it; "Versions resolved on" = `stack.resolvedAt`.
- System context and containers: one sentence each, pointing to the C4 workspace — don't redraw the diagram here.
- Routes: the table from step 1.
- Code structure: the real folder tree for this framework, with one comment per folder.
- Key flows: one Mermaid sequence diagram per key flow.
- Data: point to the ERD, or say "Nothing is stored" with the reason (and the ADR).
- Decisions: index of **every** ADR in `docs/decisions/`, with its status.
- Risks and technical debt: one line each; the `features` step turns debt into `TD-` items in the backlog.
- At most 2 pages.

**`docs/architecture/c4/workspace.dsl`** (if `c4` is in the set) from `templates/c4-workspace.dsl`: system context and container views only; the same containers and external systems as the overview; every relationship labelled with what it does and the protocol; technology names without versions.

**`docs/architecture/erd.md` + `docs/architecture/schema.sql`** (if `erd` is in the set) from their templates: real table names, every table linked to the stories that need it, business rules with where they are enforced, row-level security policies when the database is exposed through an API (e.g. Supabase).

**New ADRs** from `templates/adr.md`, status `proposed`, numbered after the highest existing ADR.

## 3. Check

Run, fix every issue, and run again until it passes (count each failed run with `STATE metric architecture doccheck-failures +1`):

`node "<plugin root>/scripts/doccheck.mjs" overview:docs/architecture/overview.md c4:docs/architecture/c4/workspace.dsl erd:docs/architecture/erd.md adr:<each new ADR> refs:docs`

(Leave out the targets for documents not in the set.) `refs:docs` checks that every ID referenced anywhere in `docs/` is defined and every local link resolves — for example that each route's story exists.

## 4. Finish

`STATE complete architecture <each file this step wrote>` — list files, not folders (other steps also write to `docs/`).

## Gate summary

Show, besides the generic gate content:
- the containers and external systems in one line each;
- the routes table (web);
- any new ADRs, and any accepted decision this step found problematic.

## On approval

Set `status: approved` in the overview and the ERD; set every ADR this step wrote that is still `proposed` to `accepted` (or `rejected` if the user rejected it).
