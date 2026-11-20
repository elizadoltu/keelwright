# Step: `document`

`/adopt` create mode (spec 5.2.1): record the project **as built** — an architecture overview, a threat model when there is something to attack, ADR-0001 when the project has no decision record yet, and an ADR recorded retroactively for each main decision already in the code — so people and agents can find why the project is the way it is.

**Reads:** `.keelwright/analysis.md` (approved at gate 1: the user's corrections are the truth), the state (`STATE status --json`: `stack`, `projectType`, `documents`), the existing ADRs, `docs/`, the README, and the files the analysis cites; `<plugin root>/reference/catalog.md`; `<plugin root>/reference/security.md`; the templates `architecture-overview.md`, `c4-workspace.dsl`, `threat-model.md`, `adr-0001-record-architecture-decisions.md` and `adr-retroactive.md`. On a re-run: the existing outputs.
**Produces:** `docs/architecture/overview.md`; `docs/architecture/c4/workspace.dsl` when there is more than one deployable; `docs/security/threat-model.md` when there is something to attack; ADR-0001 when there are no ADRs yet; one retroactive ADR per decision without one.
**Gate:** 2 — shared with `research`.

**Describe, don't decide.** Everything here is already true of the code. No new decisions, no recommendations, no PRD. Where the analysis marked something **mixed** and the user said which way is the standard at gate 1, describe that standard and name the departures as debt.

## 1. Where documents go

- **ADR folder:** the project's own when it has one (`analysis` → Existing documents; `analyse.mjs --json` → `docs.adrDirs`), with its file naming and numbering; otherwise `docs/decisions/` with `NNNN-title-with-dashes.md`.
- **Existing ADRs are kept as they are** — never renumbered, reworded or re-statused. New ones are numbered after the highest existing number.
- **Existing architecture docs** (a `docs/architecture.md`, an arc42 folder, a design doc): the overview links to them for detail and doesn't restate them. If one already covers what the overview would say, ask the user (AskUserQuestion) whether to write the overview anyway (linking to it) or record the existing document as the overview — then skip writing one and note it at the gate.

## 2. The document set

- More than one deployable (e.g. a web app and an API, a worker, a separately deployed database migration job) → add `c4`. A workspace repo usually has one container per deployable workspace (shared packages are not containers; they appear in the code structure).
- Something to attack (`reference/security.md`: a backend, logins, stored personal data, an API others call, an LLM with tools or user data, a published package) → add `threat-model`. Almost every adopted service has one; a static site or a local script doesn't.
- Then `STATE set documents adr,architecture-overview,development-workflow[,c4][,threat-model]`.

ERD, API surface and the AI documents aren't written by `/adopt` yet; mention one at the gate when the project clearly has what it would describe (a schema, a public API, model calls).

## 3. ADRs

**ADR-0001** (from `templates/adr-0001-record-architecture-decisions.md`) only when the project has no ADRs. Use the project's ADR folder and naming. Date: today; decision-makers: "recorded by KeelWright" unless the user named people.

**One retroactive ADR per row** of the analysis's "Decisions in the code" whose Existing ADR column is empty, from `templates/adr-retroactive.md`:

- The title says the decision as it stands ("Use Express for the HTTP API").
- Context starts with "Recorded retroactively by KeelWright from the code on <today>." Then what it covers and what depends on it.
- Decision: the technology and the **version in use** (locked, from the analysis), how it is wired in, and **Evidence** — the files that show it, in backticks. Open each file you cite.
- **Alternatives, decision-makers and the date of the original decision are not invented.** Write them only when the README, docs, commit messages (`git log` on the file that introduced it) or the user's notes (`.keelwright/input.md`) say so; otherwise "Not recorded — the decision predates this record" and "unknown — recorded from the code".
- Consequences: what the code gets from it and what it makes hard to change — from what you saw, not generic pros and cons.
- Confirmation: what keeps it in place (the lockfile, a lint rule, a test, CI), or "nothing enforces it".
- Status `proposed`; it becomes `accepted` when gate 2 is approved.

Decisions too small for an ADR (a formatter, a utility library) stay in the overview's stack table.

## 4. The overview

`docs/architecture/overview.md` from `templates/architecture-overview.md`, following the catalog's rules, describing the system **as built**:

- Front matter: `status: draft`, today's date, owner: the user's name if known, else leave the marker `[NEEDS CLARIFICATION: owner]`.
- **Quality goals:** only the qualities the code or docs show it cares about (a performance budget in CI, strict types, an accessibility test suite, a stated SLA in the README), each with the evidence as its scenario. The NFR column is "—": `/adopt` writes no PRD. If nothing shows any, write one line saying so and leave a marker for the user.
- **Constraints:** what the code and config fix in place (hosting config, runtime pins, a target platform).
- **Stack:** one row per layer with the **locked** version and the ADR for it (retroactive or existing). Replace "Versions resolved on" with "Versions in use (locked) on <today>".
- **System context and containers:** from the code and config; point to the C4 workspace when there is one.
- **Routes** (web) / screens / commands / endpoints: from the router or route folders, with the rendering mode where the framework shows it. The Story column is "—". For a large app, group by area rather than listing every route.
- **Code structure:** the real tree, one comment per folder, matching the analysis's Structure and Architecture — including where the code departs from its own style. In a workspace repo, one subsection per workspace, and how they depend on each other (a shared package, HTTP between them, shared types).
- **Key flows:** 1–3 sequence diagrams for flows that cross a container or where things go wrong (auth, a write path, a background job), traced through real files.
- **Data:** what is stored and where (schema or migration files); "Nothing is stored" when nothing is.
- **Cross-cutting concerns:** only the ones the code has, with the approach it actually uses (cite the error handler, the logger, the config loader).
- **Deployment:** from CI and hosting config; unknowns are markers.
- **Decisions:** index of **every** ADR — existing and new — with its status.
- **Risks and technical debt:** EOL versions and other gaps from the analysis, the mixed conventions, departures from the code's own style. No backlog IDs (`/adopt` writes no backlog).
- At most 2 pages.

## 4a. The threat model (as built)

`docs/security/threat-model.md` (if `threat-model` is in the set) from `templates/threat-model.md`, following `reference/security.md`, describing the system **as it is**:

- `framework:` the edition for the project type, exactly as named in `reference/security.md`.
- Assets, roles, entry points: from the code — the tables in the migrations or schema, the auth middleware and its roles, the router. Cite the files.
- Risks: for each table with personal data, each entry point and each external integration, what can go wrong and **what the code does about it today**, citing the file that enforces it (the RLS policy, the middleware, the validation schema, the test). Status `mitigated` when the code enforces it — open each file you cite; `open` when nothing does. Never write a mitigation the code doesn't have, and never fix one: an `open` risk is recorded, not repaired.
- Sensitive paths: globs over the real folders.
- `doccheck threat-model` checks that every file a `mitigated` or `open` risk cites exists.

**C4 workspace** (if `c4` is in the set) from `templates/c4-workspace.dsl`: context and container views, the same containers and external systems as the overview, every relationship labelled; technology names without versions.

## 5. Check

Run from the project root, fix every issue and run again until it passes (count each failed run with `STATE metric document doccheck-failures +1`):

`node "<plugin root>/scripts/doccheck.mjs" overview:docs/architecture/overview.md threat-model:docs/security/threat-model.md adr:<ADR-0001, if written> adr-retro:<each retroactive ADR> c4:docs/architecture/c4/workspace.dsl refs:docs`

(Leave out targets that don't apply.) `refs:docs` also reads the project's own documents: an issue in a file this step didn't write (a broken link in an old doc) is **not** fixed — list it at the gate and don't count it as a failure. `adr-retro` checks that each retroactive ADR says so, has an Alternatives section, and cites files that exist.

## 6. Finish

`STATE complete document <each file this step wrote>` — files, not folders: `docs/` holds the project's own documents too.

## Gate content

Gate 2 is shared with `research`. Show, besides the gate's standard content:
- the containers in one line each, and the ADR folder used;
- the ADRs written — number, title, and its evidence in a few words — and the existing ADRs kept;
- what the ADRs leave as "Not recorded" (alternatives, decision-makers): the user can fill these in now — they know the history;
- the threat model's risks in one line each, the `open` ones first — they're what the code doesn't protect yet (`/keelwright:doctor security` checks the dependencies and secrets once the setup is in place);
- documents not written that the project might want (ERD, API surface).

## On approval

Set `status: approved` in the overview and the threat model. Set every ADR this step wrote that is still `proposed` to `accepted` (or `rejected` if the user rejected it — then remove it from the overview's index). Existing ADRs are not touched.
