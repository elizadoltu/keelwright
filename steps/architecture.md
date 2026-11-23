# Step: `architecture`

Choose the stack and describe how the system is built — the tech lead's step (spec 5.7): the stack with versions resolved live, the architecture overview with routes, the C4 model, the data model, the threat model, the AI system design and eval plan, the public API surface, and any further decisions. Only the documents in the chosen document set.

**Reads:** `docs/prd.md`, all ADRs in `docs/decisions/`, `.keelwright/interview.md`, the state (`STATE status --json`: document set and `stack`), the stack rules for the project type (`<plugin root>/reference/<type>-stack.md`: `web`, `mobile`, `game`, `ai`, `library`), `<plugin root>/reference/toolchains.md`, `<plugin root>/reference/catalog.md`, `<plugin root>/reference/security.md` (when `threat-model` is in the set), and the templates `architecture-overview.md`, `c4-workspace.dsl`, `erd.md`, `schema.sql`, `threat-model.md`, `ai-system-design.md`, `ai-eval-plan.md`, `api-surface.md`, `adr.md`. On a re-run: the existing outputs.
**Produces:** the stack in the state; `docs/decisions/0002-<stack decision>.md` (the frontend for web, the app framework, engine, model provider or language for the other types) and one ADR per other deviation from the defaults; and, only those in the document set, `docs/architecture/overview.md`, `docs/architecture/c4/workspace.dsl`, `docs/architecture/erd.md` + `docs/architecture/schema.sql`, `docs/security/threat-model.md`, `docs/ai/system-design.md`, `docs/evals/plan.md` + `evals/data/`, `docs/api-surface.md`, further ADRs (the next free number).
**Gate:** Gate 2, shared with `features` and `design` — each approved by its own owner.

**Who runs it:** a tech lead or a developer. The command refuses it for other roles and hands off.

The approved PRD and accepted ADRs are the source of truth. This step adds the technical decisions; it doesn't change requirements. If a requirement can't be met as written, say so at the gate as a `[NEEDS CLARIFICATION (pm): …]` in the overview — never edit the approved PRD. If an accepted decision doesn't work, write a new ADR that supersedes it and say so at the gate.

This step always runs: even with none of the architecture documents in the set, the stack is chosen here.

## 0. Technical questions

The interview leaves technical questions to the tech lead: the `(lead)` and `(dev)` questions in `.keelwright/interview.md`'s open questions and the PRD's open questions (hosting, an existing system to integrate with, the team's skills). Ask the ones that change a decision below in one round (AskUserQuestion, at most 4), with a recommended option first. Record the answers in `.keelwright/interview.md` under a new round headed "Technical questions (architecture)". The PRD's markers stay as they are — it's approved; the answer goes into the ADR that uses it.

## 1. Stack

Follow the stack rules for the project type — `reference/<type>-stack.md`:

1. **The main decision** — web: the frontend (selection rules); mobile: the app framework; game: the engine; ai: the language and the model provider; library: the language and distribution. Go through the candidates in order and stop at the first match. Note the rule number and why it matched, and why the earlier rules didn't. For every type except web, also **compare 2–3 candidates** against the requirements (platforms, performance, team skills, cost, hosting or distribution, ecosystem maturity) and recommend one with the reasoning — this goes into ADR-0002 and the gate summary.
2. **Right-size every layer** of the type's defaults: keep / remove / swap / add, each with a reason that cites requirement IDs. A small dynamic feature (a contact form, a newsletter) is handled inside the chosen framework or by a service — compare at least two options and recommend one.
3. **Conventions:** say which of Clean Architecture, Atomic Design and Humble Object apply and at what scale (the type's rules say which usually do).
4. **Toolchain:** from the main decision (`reference/toolchains.md`): `node`, `python`, `dart`, `rust`, `godot` or `editor`.
5. **Resolve versions** for everything the scaffold will install directly, with the specs the type's rules list:
   `node "<plugin root>/scripts/versions.mjs" <runtime> <packages…> github:gitleaks/gitleaks`
   (runtimes: `node`, `python`, `flutter`, `rust`, `godot`, `unity`; packages: `npm:`, `pypi:`, `crates:`, `pub:`; tools released on GitHub: `github:<owner>/<repo>`). Handle the compatibility report as `reference/web-stack.md` describes ("Versions": conflict → hold back with an ADR; missing → add it or note it; unknown → check by hand); it covers npm peers, `engines.node`, `requires-python`, a crate's `rust-version` and a Dart package's SDK constraint. Re-run until there are no conflicts. Never write a version that didn't come from the script — except for software with no machine-readable release feed (Unreal Engine, Xcode, Android Studio): look it up on the official release notes and write the URL next to the version.
6. Record the stack: `STATE set stack '<json>'` with `resolvedAt`, `toolchain`, `primary` (`{ "choice", "rule", "compared": [<alternatives>] }`), `layers` (`{ layer: { "decision": "keep|remove|swap|add", "choice", "reason" } }`) and `versions` (`{ name: version }`, keyed by package name). For web, `primary.choice` is the frontend framework.

If an open question blocks a stack decision (e.g. whether a form must store submissions), choose the option that keeps the most doors open at the lowest cost, write the question as `[NEEDS CLARIFICATION (pm): …]` in the ADR, and say there what changes if the answer goes the other way.

**`docs/decisions/0002-<stack-decision>.md`** from `templates/adr.md`, e.g. `0002-use-astro-for-the-website.md`, `0002-use-expo-for-the-app.md`, `0002-use-godot-4.md`, `0002-use-claude-for-answers.md`:
- Status `proposed`. Drivers cite requirement IDs. Considered options: the chosen option and the 1–2 strongest alternatives from the rules, compared on the criteria above. The outcome names the rule that matched.
- Confirmation: how the decision is checked later (e.g. "build output is static HTML for every public route"; "the eval plan's EV- thresholds pass with this model").

**One ADR per other deviation from the defaults**, numbered on from 0003, same template, status `proposed` — e.g. no custom backend, no database, how the contact form is handled, a held-back package version. Keep each to the decision; don't repeat the PRD.

## 2. Work out the structure

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

Further decisions (e.g. how content collections are structured, how the form is protected against spam if not already decided) get an ADR **only** if they are hard to reverse or span components; small choices go into the overview.

## 3. Write the documents

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

## 4. Check

Run, fix every issue, and run again until it passes (count each failed run with `STATE metric architecture doccheck-failures +1`):

`node "<plugin root>/scripts/doccheck.mjs" overview:docs/architecture/overview.md c4:docs/architecture/c4/workspace.dsl erd:docs/architecture/erd.md threat-model:docs/security/threat-model.md ai-system-design:docs/ai/system-design.md ai-eval-plan:docs/evals/plan.md api-surface:docs/api-surface.md adr:<each ADR this step wrote> refs:docs`

(Leave out the targets for documents not in the set.) `refs:docs` checks that every ID referenced anywhere in `docs/` is defined and every local link resolves — for example that each route's story exists.

## 5. Finish

Check by hand that every version in the overview and the ADRs matches the script output.

`STATE complete architecture <each file this step wrote>` — list files, not folders (other steps also write to `docs/`); ADR-0002 and the other ADRs individually.

## Gate summary

Show, besides the generic gate content:
- the stack in one line per layer (keep / remove / swap / add), the rule that matched for the main decision and the alternatives it was compared with, and the toolchain;
- the answers to the technical questions (section 0);
- the containers and external systems in one line each;
- the routes table (web); for AI: the prompts and tools (with the ones that need confirmation) and the `EV-` thresholds including cost and latency; for libraries: the public items and their stability;
- the threat model's risks in one line each (`SEC-` ID, where, mitigation), and the framework edition;
- any new ADRs, and any accepted decision this step found problematic.

## On approval

Set `status: approved` in the overview, the ERD, the threat model, the AI system design, the eval plan and the API surface (those that exist); set every ADR this step wrote that is still `proposed` to `accepted` (or `rejected` if the user rejected it).
