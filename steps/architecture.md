# Step: `architecture`

Describe how the system is built: the architecture overview with routes, the C4 model, the data model, the threat model, the AI system design and eval plan, the public API surface, and any further decisions. Only the documents in the chosen document set.

**Reads:** `docs/prd.md`, all ADRs in `docs/decisions/`, `.keelwright/interview.md`, the state (`STATE status --json`: document set and `stack`), the stack rules for the project type (`<plugin root>/reference/<type>-stack.md`), `<plugin root>/reference/catalog.md`, `<plugin root>/reference/security.md` (when `threat-model` is in the set), and the templates `architecture-overview.md`, `c4-workspace.dsl`, `erd.md`, `schema.sql`, `threat-model.md`, `ai-system-design.md`, `ai-eval-plan.md`, `api-surface.md`, `adr.md`. On a re-run: the existing outputs.
**Produces** (only those in the document set): `docs/architecture/overview.md`, `docs/architecture/c4/workspace.dsl`, `docs/architecture/erd.md` + `docs/architecture/schema.sql`, `docs/security/threat-model.md`, `docs/ai/system-design.md`, `docs/evals/plan.md` + `evals/data/`, `docs/api-surface.md`, new ADRs from 0003 on (or the next free number).
**Gate:** Gate 2, shared with `features` and `design`.

The approved PRD and accepted ADRs are the source of truth. This step adds detail; it doesn't change decisions. If it finds that an accepted decision doesn't work, it writes a new ADR that supersedes it and says so at the gate.

If none of `architecture-overview`, `c4`, `erd`, `threat-model`, `ai-system-design`, `ai-eval-plan` and `api-surface` is in the document set and no new decision is needed, run `STATE skip architecture --reason "<why>"` and stop.

## 1. Work out the structure

From the PRD, the ADRs and `stack` in the state:

- **Containers** — every separately deployed or separately running part: the site or app, server functions or an API, databases, managed services that store data (e.g. Supabase). Static files on a CDN are one container. External services (email, anti-spam, analytics, payments) are external systems, not containers.
- **Routes** (web) — every page or endpoint that a P1 or P2 story needs, with how it is rendered: `static` (prerendered at build time), `server` (on request), `client` (SPA). Mark language variants the way the i18n ADR decided. Mobile apps list their screens in the screen flow (`design` step) instead; games their scenes in the GDD; libraries their public items in the API surface.
- **Key flows** — the 1–3 flows where something can go wrong or crosses a container boundary (e.g. submitting a form, publishing content). Not every page view.
- **Code structure** — map the conventions the PRD / ADRs chose (Clean Architecture, Atomic Design, Humble Object) onto real folders **for this framework**. Scale them to the project: a static site needs no domain / application layers; keep logic out of hard-to-test boundaries (Humble Object) and UI in atomic levels.
- **Cross-cutting concerns** — only those that apply: auth, error handling, logging, configuration and secrets (gitleaks is always on), testing (Vitest for logic, Playwright for the acceptance criteria), i18n, SEO, privacy.
- **Data** — whether anything is stored; if so, which entities, with the stories that need them. For a mobile app also where: on the device, on the server, or both.
- **Offline and sync** (mobile) — online-only, cached reads, or offline-first with sync; for sync, the conflict rule (e.g. last write wins per field, server wins). This is always an ADR.
- **Model and data flow** (AI) — what goes into each model call (inputs, retrieved context, tools), what comes out, where it is validated, and what data reaches the provider.
- **Public surface** (library / CLI / API) — the exported functions, types, commands or endpoints the P1 stories need, and their stability.

New decisions the PRD step didn't make (e.g. how content collections are structured, how the form is protected against spam if not already decided) get an ADR **only** if they are hard to reverse or span components; small choices go into the overview.

## 2. Write the documents

Follow the template rules in `reference/catalog.md`. Files that later steps create (prompt files, source folders) are written as paths in backticks, not as links — a link to a file that doesn't exist yet fails the check.

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

**`docs/security/threat-model.md`** (if `threat-model` is in the set) from `templates/threat-model.md`, written **after** the overview, ERD and AI system design so it uses their real names:
- `framework:` the edition for the project type, exactly as written in `reference/security.md` (an AI assistant with a dashboard: the LLM list as the framework, `A01` etc. in the Category column for the web parts).
- Assets and data: what is stored and where (the ERD's tables), personal data marked, the PRD's privacy NFRs by ID.
- Roles: from the PRD's personas and stories — what each may and may not do. Anonymous visitors count.
- Trust boundaries and entry points: from the containers and routes — every route or endpoint that takes input, every form, upload, webhook, LLM tool.
- Risks: `SEC-01`… for what can go wrong **in this project** — each with where (real tables, routes, folders, tools), the framework category, the mitigation, how it is enforced (an RLS policy in the ERD, a test, a lint rule, CI, or "review"), and status `planned` (nothing is built yet). Typical sources: every table with personal data (access control), every entry point (injection, validation, rate limits), auth, secrets, every LLM tool with side effects (excessive agency), third-party scripts. 5–12 risks; no generic ones that don't name a place.
- Sensitive paths: globs over the real folders from the code structure — auth, migrations and policies, API handlers, prompt and tool code, payment, uploads.
- At most 1,000 words.

**`docs/ai/system-design.md`** (if `ai-system-design` is in the set) from `templates/ai-system-design.md`: the task and scope from the PRD; a Mermaid flow of one request; the models (as the provider ADR decided — names looked up, not invented); every prompt with a `P-` ID and its file (`prompts/P-01-<name>.md`); every tool with a `T-` ID, its side effects and whether it needs confirmation (anything that writes, sends or spends does, unless the row says why not); context and retrieval (or "none" with the reason); guardrails; the data sent to providers, matching the PRD's privacy NFRs; failure handling; budgets pointing to the eval plan's `EV-` criteria. At most 1,500 words.

**`docs/evals/plan.md` + `evals/data/`** (if `ai-eval-plan` is in the set) from `templates/ai-eval-plan.md`: `EV-` criteria, each with a metric and a **threshold** — always including a **latency** (p95) and a **cost** budget; a failure taxonomy; the datasets (write a first `evals/data/<name>.jsonl` with 5–10 cases built only from examples the input or interview gave — mark it as a seed to grow, never invent domain facts); graders per criterion (code first, a model judge only where code can't decide); how offline evals run in CI (the `eval` task, on demand — they cost money); online monitoring. At most 1,200 words.

**`docs/api-surface.md`** (if `api-surface` is in the set) from `templates/api-surface.md`: consumers; every public item with an `API-` ID, its signature (or command / endpoint) and stability; CLI conventions (exit codes, output formats, stdin/stdout) or the HTTP API section — delete what doesn't apply; errors; versioning (SemVer, what counts as breaking); deprecation policy; the release process (the release tool from the ADRs). At most 1,300 words.

**New ADRs** from `templates/adr.md`, status `proposed`, numbered after the highest existing ADR — including the **offline / sync strategy** for every mobile app.

## 3. Check

Run, fix every issue, and run again until it passes (count each failed run with `STATE metric architecture doccheck-failures +1`):

`node "<plugin root>/scripts/doccheck.mjs" overview:docs/architecture/overview.md c4:docs/architecture/c4/workspace.dsl erd:docs/architecture/erd.md threat-model:docs/security/threat-model.md ai-system-design:docs/ai/system-design.md ai-eval-plan:docs/evals/plan.md api-surface:docs/api-surface.md adr:<each new ADR> refs:docs`

(Leave out the targets for documents not in the set.) `refs:docs` checks that every ID referenced anywhere in `docs/` is defined and every local link resolves — for example that each route's story exists.

## 4. Finish

`STATE complete architecture <each file this step wrote>` — list files, not folders (other steps also write to `docs/`).

## Gate summary

Show, besides the generic gate content:
- the containers and external systems in one line each;
- the routes table (web); for AI: the prompts and tools (with the ones that need confirmation) and the `EV-` thresholds including cost and latency; for libraries: the public items and their stability;
- the threat model's risks in one line each (`SEC-` ID, where, mitigation), and the framework edition;
- any new ADRs, and any accepted decision this step found problematic.

## On approval

Set `status: approved` in the overview, the ERD, the threat model, the AI system design, the eval plan and the API surface (those that exist); set every ADR this step wrote that is still `proposed` to `accepted` (or `rejected` if the user rejected it).
