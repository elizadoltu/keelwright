# KeelWright — Specification

| | |
|---|---|
| **Name** | KeelWright (package / plugin id: `keelwright`) |
| **Type** | Claude Code plugin (later: visual app) |
| **Status** | Spec agreed / Phase 1 not started |
| **Commands** | `/kickoff` (greenfield), `/adopt` (brownfield) — invoked as `/keelwright:kickoff` and `/keelwright:adopt`, since plugin commands are namespaced |
| **Last updated** | 2026-11-16 |

> **Context for a new session:** this document is the full specification for a Claude Code plugin that bootstraps projects. The document templates it references live in `templates/` next to this file. Start from section 9 (Roadmap) to begin implementation; sections 5.1.2 (steps and state), 5.3 (generator) and 5.5 (scaffold) define how the pipeline runs.

---

## 1. Problem

- New projects are started often, and each kickoff repeats the same work: writing a PRD, drawing ERD / C4 diagrams, setting up the repository, and configuring Claude (CLAUDE.md, rules, skills, agents, hooks).
- On existing codebases, the Claude setup silently goes stale as the code evolves — nothing breaks, Claude just follows outdated instructions.

## 2. Goals

One command that takes a project from **idea / specs / existing code** to:

1. A complete set of **project documents** — PRD, architecture, data model, decisions.
2. A **project-specific agent workflow** — CLAUDE.md, rules, skills, commands, subagents, hooks.
3. Optionally, a **planned backlog** in Jira and documentation in Confluence.

For existing projects: a way to **audit** the Claude setup and keep it up to date.

### Non-goals (for now)

- A visual / web interface (planned for a later phase).

## 3. Strategy: plugin first, app later

Build as a **Claude Code plugin** first, then wrap it in a **visual app**.

- The value is the workflow itself — interview questions, templates, agent/skill definitions and how they connect. The app is a front end for it.
- Fast feedback: every new project is a test run; after a few runs it's clear which outputs are actually used.
- Plugins already bundle slash commands, skills, subagents, hooks and MCP config — no new format needed.
- The app can later reuse the same engine by running Claude Code headless (`claude -p` / Agent SDK) with the plugin.

**Naming constraint:** do not use `/init` — Claude Code already ships a built-in `/init` that generates CLAUDE.md.

## 4. Default stack and conventions

### 4.1 Stack

| Layer | Default | Alternative |
|---|---|---|
| Frontend | **TanStack Start** (React) + TypeScript + Vitest, rendering mode set per project (4.7) | Astro, Next.js, React Router framework mode, when the selection rules in 4.7 call for them |
| Styling | Tailwind CSS | — |
| Backend | Node.js + TypeScript + Express | — |
| Database | PostgreSQL / Supabase | — |
| CI/CD & hosting | GitHub Actions + Vercel + Docker | — |
| Git hooks | Husky | — |
| Secret scanning | gitleaks | — |
| E2E testing | Playwright | — |

**Docker's role.** Docker is used for local development: the Supabase CLI runs the local database in Docker. Express is deployed to Vercel as functions by default, so no Dockerfile is generated. A Dockerfile is added only when right-sizing (4.3) picks a host other than Vercel, and that choice is recorded in an ADR.

### 4.2 Default architecture & design conventions

Like the stack, these are **defaults**: `/kickoff` selects and adapts them per project (see 4.3). The ones selected are turned into **rules, skills and enforcement** in the generated setup, not just documented:

- **Clean Architecture** — dependency rule (domain ← application ← infrastructure / UI), layered folder structure, no framework imports in the domain layer.
- **Atomic Design** — atoms / molecules / organisms / templates / pages for UI components.
- **Humble Object** — hard-to-test boundaries (UI, DB, HTTP, external services) stay thin; logic lives in testable objects.

Possible generated enforcement:
- Lint rule or hook that checks layer imports.
- Reviewer subagent that knows these patterns.
- Skill for creating a component at the correct atomic level.

### 4.3 Right-sizing per project

Sections 4.1 and 4.2 are a starting point, not a requirement. `/kickoff` decides the actual stack and conventions from the PRD and the interview:

- **Remove** layers the project doesn't need — e.g. a mostly static site may not need Express or a full database (Markdown/MDX content, Supabase only for dynamic features such as forms or bookings).
- **Swap** choices when the requirements call for it — e.g. the frontend framework, chosen by the rules in 4.7.
- **Add** what the defaults don't cover — e.g. a queue, a search engine, auth provider, realtime.
- **Scale conventions to the project** — e.g. full Clean Architecture layering for a backend with real domain logic; for a small static site, Atomic Design and Humble Object may be enough.

Every deviation from the defaults is recorded as an **ADR**, so the reasoning is kept and `/adopt` audit mode can later check the code against the stack and conventions that were actually chosen.

### 4.4 Project types

The plugin is not limited to web projects. `/kickoff` first identifies the **project type**, which decides the stack candidates, the documents produced and the conventions researched:

| Project type | Example stack candidates | Type-specific outputs |
|---|---|---|
| Web app / site | Defaults in 4.1 | ERD, C4, routes / page map |
| Mobile app | React Native / Expo, Flutter, native (Swift / Kotlin) | ERD, C4, screen flow, offline / sync strategy, store release checklist |
| Game | Unity, Godot, Unreal, Phaser / web | Game design document (core loop, mechanics), scene / state diagram, asset pipeline; ERD only if there is persistent data |
| AI / LLM project | Python or TypeScript, model provider SDKs, vector DB, eval framework | Model & data flow diagram, prompt / agent design, evaluation plan, cost & latency budget, data / privacy notes |
| Library / CLI / API | Language-specific | Public API surface, versioning & release policy |

Where each type-specific output lives — most are folded into existing documents rather than getting their own:

| Output | Lives in | Catalog key |
|---|---|---|
| Routes / page map | Architecture overview (web) | `architecture-overview` |
| Screen flow | `docs/design/screen-flow.md` | `screen-flow` |
| Offline / sync strategy | An ADR | `adr` |
| Store release checklist | `docs/release-checklist.md` | `release-checklist` |
| Core loop, mechanics, scene / state diagram | GDD (`docs/gdd.md`) | `game-design-document` |
| Asset pipeline | `design/asset-pipeline.md` (GDD one-pager) | `asset-pipeline` |
| Model & data flow, prompt / agent design | `docs/ai/system-design.md` | `ai-system-design` |
| Evaluation plan, cost & latency budget | Eval plan (`EV-` criteria for cost and latency) | `ai-eval-plan` |
| Data / privacy notes | PRD NFRs + provider ADR; summarised in the AI system design | `prd`, `adr` |
| Public API surface, versioning & release policy | `docs/api-surface.md` | `api-surface` |

Documents that don't fit a project type are skipped rather than forced (e.g. no ERD for a game with no saved data).

### 4.5 Stack recommendation

For anything outside the defaults, `/kickoff` **recommends** a stack instead of assuming one:

- 2–3 candidate stacks, compared against the PRD's requirements (platforms, performance, team skills, cost, hosting, ecosystem maturity).
- One recommended option, with the reasoning.
- The choice is written into the **PRD** (technical constraints section) and recorded as an **ADR**. The data model in the ERD is then built for the chosen database.

### 4.6 Version policy: latest stable

Every project starts on the **latest stable version** of each part of its stack.

- **Resolved live on every run.** Versions are looked up from the package registries or official release channels at kickoff time, never from memory, templates or a cached stack pack. The plugin's `scripts/versions.mjs` does this for npm packages, the Node.js LTS line and GitHub releases, and reports peer-dependency conflicts across the set.
- **Stable only.** No alpha, beta, RC, canary or nightly releases. For runtimes with release lines (e.g. Node.js), use the latest **LTS** release, not the "Current" line.
- **Compatible as a set.** The newest version of one package may not yet support the newest version of another (e.g. a plugin lagging behind a major framework release). In that case, use the newest set that works together and record the held-back package and the reason in an ADR.
- **Pinned and recorded.** Exact versions are written to the manifest and lockfile, and listed with the lookup date in the PRD's technical section.
- **Kept current afterwards.** The generated CI includes automated dependency updates (Renovate or Dependabot), and `/adopt` audit mode flags outdated versions (7.1).
- **Docs match the version.** The research step (5.4) checks that each stack pack matches the resolved major version; if the pack was researched for an older major version, it is refreshed before generating rules.

### 4.7 Frontend selection rules (web projects)

The deciding question is not the framework name but: **must the first HTML response already contain the content?** Pages that need to rank on Google or be cited by AI search need server-rendered or prerendered HTML — AI crawlers (GPTBot, ClaudeBot, PerplexityBot) fetch raw HTML and don't run JavaScript, and Google still recommends server rendering or prerendering. Pages behind a login don't.

**Default: TanStack Start.** It runs on Vite, renders routes on the server by default, can turn SSR off per route (selective SSR), has a full client-only SPA mode, and supports static prerendering. So one framework covers public pages, logged-in apps and mixed products — `/kickoff` only changes how it is configured.

`/kickoff` checks these rules in order and stops at the first match. Rules 1–2 are the exceptions where another framework fits better; rules 3–5 configure the default.

| # | If the project… | Choose |
|---|---|---|
| 1 | Is content-first and mostly static (blog, docs, landing page, portfolio) | **Astro** (React islands where interactivity is needed) |
| 2 | Is public and dynamic **and** specifically needs Next.js (existing Next.js code or team, Next-only features or ecosystem) | **Next.js** — on Vercel, an adapter-supported host, or a Node server |
| 3 | Has public pages **and** a logged-in app | **TanStack Start, one app**: SSR or prerendering for public routes, `ssr: false` on the app routes. If the public part is large and content-heavy, split into two apps instead: Astro for the public site, TanStack Start in SPA mode for the app |
| 4 | Is public, SEO / AI-search relevant and dynamic | **TanStack Start** with SSR (the default) |
| 5 | Is entirely behind a login and calls an existing API | **TanStack Start in SPA mode** (client-only, static hosting) |

Any choice other than the default is recorded in an ADR with the rule that matched.

Guard rules:
- **Mixing SPA and prerendered routes in TanStack Start:** keep SSR on as the default and switch it off per route for app routes. Setting `defaultSsr: false` globally stops route-level prerendering from working (by design), which makes "SPA app + prerendered blog" setups fragile.
- **Next.js without a server:** `output: 'export'` produces static files for any host, but disables middleware, Server Actions, ISR, redirects / rewrites / headers, cookies, request-dependent route handlers and default image optimisation. Use it only when none of these are needed; otherwise fall back to Astro or React Router prerendering.
- **Next.js hosting:** since the stable Adapter API (Next.js 16.2), Next.js is no longer tied to Vercel. Running multiple self-hosted instances still requires cache sync and revalidation work.
- **Public SPA routes:** if any public page is client-rendered (e.g. SPA mode), it must use real `<a href>` links with History API routing (no `#` routes), correct soft-404 handling and fingerprinted asset filenames.

These rules are themselves researched content: they are re-checked when the web stack pack is refreshed (5.4).

## 5. Architecture: two entry points, one pipeline

```
 New project (idea + specs)            Existing codebase
          │                                   │
     /kickoff                              /adopt
          │                                   │
  Interview → PRD → Architecture      Analyse code, docs, specs
  (C4, ERD, ADRs) → Stack → Scaffold  → infer current architecture
          │                                   │  & conventions
          └───────────────┬───────────────────┘
                          ▼
              Shared generator step
     CLAUDE.md · rules · skills · subagents · hooks
          (optional) Jira epics · Confluence pages
```

### 5.1 `/kickoff` — greenfield

Each stage has a step name (in backticks), used to re-run it on its own (5.1.2).

1. `interview` — take the project description and specs as input, identify the **project type** (4.4), and **interview** to close gaps: users, platforms, scale, constraints, non-goals, integrations, content sources, dynamic features, languages, SEO / performance priorities.
2. `prd` — propose the **document set** from the catalog (6.0) and write the **PRD**, including the **stack recommendation** (4.5) with versions resolved live (4.6); write ADR-0001 and the stack ADR. → **Gate 1** (the user confirms the PRD, the document set and the stack)
3. Produce the remaining documents selected from the catalog (6.0), in three steps that share one gate:
   - `architecture` — ADRs, architecture overview, C4, ERD + `schema.sql`, AI system design, AI eval plan, public API surface
   - `features` — feature breakdown, backlog
   - `design` — visual identity + tokens, screen flow, GDD, asset pipeline, store release checklist

   → **Gate 2**
4. `research` — research conventions and best practices for the chosen stack and produce or refresh its stack packs (5.4). → **Gate 3**
5. `scaffold` — create the repository (5.5).
6. `generate` — the shared generator step (5.3).
7. `publish` — optional: Jira and Confluence output, only when asked for.

### 5.1.1 Editable documents and review gates

All documents are plain Markdown / DSL files in the repository, so the user can edit them directly.

- At each **review gate**, the pipeline pauses; the user reviews and edits the documents, then continues.
- On continue, the pipeline **re-reads the edited files** and treats them as the source of truth — it never overwrites user edits with its own earlier version.
- If an edit changes an upstream decision (e.g. the stack in the PRD), the downstream steps are regenerated and any affected ADRs are updated.
- Each step can also be re-run on its own (e.g. `/kickoff architecture`) after later edits.
- Accepted ADRs are never edited, even when an upstream change affects them: a new ADR supersedes them.
- Approving a gate finalises its documents: the PRD becomes `approved` and the ADRs written for it become `accepted` (each step defines what its gate approval changes).

### 5.1.2 Steps and state

**Step order**

```
interview → prd → { architecture, features, design } → research → scaffold → generate → publish
```

| Step | Produces | Gate after it |
|---|---|---|
| `interview` | Project type, interview notes (`.keelwright/interview.md`) | — |
| `prd` | PRD, document set, stack recommendation, resolved versions, ADR-0001, stack ADR | Gate 1 |
| `architecture` | Remaining ADRs, architecture overview, C4, ERD + `schema.sql`, AI system design, AI eval plan, public API surface | Gate 2 (shared with `features` and `design`) |
| `features` | Feature breakdown, backlog | Gate 2 |
| `design` | Visual identity + `design/tokens.json`, screen flow, GDD, asset pipeline, store release checklist | Gate 2 |
| `research` | Stack packs for the chosen stack (5.4) | Gate 3 |
| `scaffold` | Repository, manifests, lockfile, git hooks, CI, dependency updates, smoke tests (5.5) | — |
| `generate` | CLAUDE.md, rules, skills, subagents, hooks, CONTRIBUTING.md (5.3) | Final summary for the user (not blocking) |
| `publish` | Jira epics and stories, Confluence pages | Optional, only when asked for |

Each step only produces the documents in the chosen document set; a step with nothing to produce is skipped.

**Commands**

| Command | Does |
|---|---|
| `/kickoff` | Starts a new run, or resumes from the current step |
| `/kickoff <step>` | Re-runs one step and marks every step after it as `stale` |
| `/kickoff status` | Shows each step's status, open gates, and files changed since they were approved |
| `/kickoff research --refresh` | Re-researches the stack packs even if they are current |
| `/kickoff report` | Shows the run metrics as a scorecard and records the user's rating of each document (8.2) |

**State file**

The pipeline state is kept in `.keelwright/state.json` in the generated project. It is committed, so a teammate or a later run sees the same state, and `/adopt` can read which documents and stack packs the project was built with.

```json
{
  "keelwright": "0.1.0",
  "projectType": "web",
  "currentStep": "architecture",
  "documents": ["prd", "adr", "backlog", "development-workflow", "architecture-overview", "c4", "erd"],
  "steps": {
    "interview": { "status": "done", "at": "2026-11-16T10:02:00Z" },
    "prd": {
      "status": "approved",
      "at": "2026-11-16T10:40:00Z",
      "outputs": { "docs/prd.md": "sha256:…", "docs/decisions/0002-stack.md": "sha256:…" }
    },
    "architecture": { "status": "awaiting_review" }
  },
  "stack": {
    "resolvedAt": "2026-11-16",
    "versions": { "node": "<x.y.z>", "@tanstack/react-start": "<x.y.z>" },
    "packs": { "web-tanstack-start": "2026-11-16" }
  }
}
```

- The state is changed only through the plugin's state CLI (`scripts/state.mjs`), never by editing the JSON; the CLI is the single place that knows the step order, gates and valid transitions. The plugin needs Node.js 22 or newer for it.
- Step statuses: `pending` · `in_progress` · `awaiting_review` · `approved` (or `done` for steps without a gate) · `skipped` (nothing to produce, with a reason) · `stale`.
- `outputs` stores a hash of every file a step produced, recorded when the step is approved.
- **Edit detection:** on every call, the pipeline re-hashes the outputs of approved steps. If a file changed, the edited file is the source of truth (5.1.1); the pipeline lists the downstream steps that will be regenerated and asks before regenerating them.

### 5.2 `/adopt` — brownfield

- **Create mode** — no Claude setup exists: analyse the codebase, docs and specs; infer architecture and conventions; hand off to the generator.
- **Audit mode** — a Claude setup exists: check its quality and whether it is up to date (section 7).

### 5.3 Shared generator step

Generates an agent workflow **tailored to the project** — derived from its PRD and architecture, never copied boilerplate:

- `CLAUDE.md`
- `.claude/rules`
- Project-specific **skills** (e.g. the Atomic Design component skill, fed by the visual identity tokens)
- **Subagents** (below)
- **Hooks** (e.g. lint/test on edit, block secrets with gitleaks — Husky pre-commit plus a GitHub Actions step)
- `CONTRIBUTING.md` — generated here, after scaffold, from the same choices as `CLAUDE.md` and the hooks, so all of them use the real commands and never disagree (6.0)
- Optional (`publish` step): **Jira** epics/stories and **Confluence** pages via the Atlassian integration

Rules, skills and hooks are built from the stack packs (5.4). The generator never references something it didn't create: a line in a template that points to a missing part (e.g. E2E tests in a project without them) is removed, not left as a placeholder.

**Generated subagents**

| Subagent | Tools | Role |
|---|---|---|
| `reviewer` | Read, Grep, Glob, Bash (read-only commands) | Reviews changes against the chosen conventions (Clean Architecture, Atomic Design, Humble Object), the accepted ADRs and the PRD IDs. Never writes. |
| `tester` | Read, Grep, Glob, Edit, Write, Bash | Turns acceptance criteria (`WHEN … SHALL`, Given / When / Then) and success criteria (`SC-`) into Vitest and Playwright tests named after their IDs. |
| `docs-keeper` | Read, Grep, Glob, Edit, Write | Keeps the ERD, `schema.sql`, architecture overview, backlog and ADR index in sync with the code. Writes new ADRs; never edits accepted ones. |

The subagent definitions are tailored to the project (its conventions, commands and paths), not copied boilerplate. For other project types the `tester` uses the stack's test tools (e.g. the eval runner for AI projects).

The step ends with a short summary of everything generated, for the user to review.

### 5.4 Research step: conventions per stack

Rules, skills and commands are based on **researched, current** practices for the chosen stack — not on fixed templates.

- **What is researched:** project structure, naming, testing strategy, linting / formatting config, security practices, performance pitfalls, CI/CD and release patterns, and how the chosen conventions (4.2) map onto that stack.
- **Sources, in priority order:** official documentation and style guides → framework maintainers' recommended setups → well-maintained reference projects → community sources, only to fill gaps.
- **Output — a "stack pack":** a versioned file per stack containing the findings, with source links and a research date. The generator builds rules, skills, commands and hooks from it.
- **Reuse:** stack packs are cached and reused across projects. This keeps runs fast and results consistent, and makes the reasoning behind each rule traceable.
- **Storage:** packs shipped with the plugin live in `keelwright/stack-packs/`. Packs refreshed during a run are written to `~/.keelwright/stack-packs/`, because the installed plugin folder is replaced on plugin updates. When both exist, the newer pack wins. Each project records the pack and research date it used in `.keelwright/state.json`.
- **Shipped first:** the default web stack (TanStack Start, Express, Supabase / PostgreSQL, Tailwind, Vitest, Playwright, Vercel) and Astro. All other stacks are researched the first time a project needs them.
- **Refresh policy:** a stack pack is re-researched when it is older than **90 days**, when the resolved major version of the stack changes (4.6), or on demand with a `--refresh` flag.
- **Review:** like the other documents, the stack pack is editable and goes through a review gate before generation.

### 5.5 Scaffold step

Creates a working repository for the chosen stack, using the versions resolved in the `prd` step (4.6).

**Web projects** get:
- The app, created with the framework's official generator and configured per the frontend rules (4.7), with the folder structure for the chosen conventions (4.2).
- Exact versions in the manifest and a committed lockfile.
- Tailwind theme generated from `design/tokens.json` (when visual identity is in the document set).
- Husky with lint-staged, commitlint (Conventional Commits) and a gitleaks pre-commit hook.
- GitHub Actions CI: lint, type check, unit tests, build, gitleaks, Playwright.
- Renovate or Dependabot configuration.
- A Vitest unit test and a Playwright smoke test that pass out of the box.
- When a database is used: Supabase local setup, with `docs/architecture/schema.sql` copied into the first migration (6.0, data model lifecycle).
- `.env.example`; no secrets are ever written.

**Other project types** are scaffolded only where an official command-line generator exists (e.g. Expo, Flutter, Godot, npm / uv / cargo packages). For engines whose projects are created through their editor (e.g. Unity, Unreal), the step produces written setup instructions instead, and the documents and Claude setup are generated as usual.

## 6. Document catalog

KeelWright doesn't produce a fixed set of documents. It has a **catalog**, and `/kickoff` proposes a set from it based on the project type (4.4) and the interview. At the first review gate the user can add or remove documents before anything is written; the chosen set is listed in the PRD's front matter so later runs and `/adopt` know what the project is meant to have.

### 6.0 Catalog

Each document has a **key** — the name of its template — used in the PRD's `documents:` front matter and in `.keelwright/state.json`.

**Always**

| Key | Document | Path in the generated project | Template |
|---|---|---|---|
| `prd` | PRD (includes MVP scope and release plan) | `docs/prd.md` | `templates/prd.md` |
| `adr` | ADRs (ADR-0001 plus at least the stack decision) | `docs/decisions/NNNN-title.md` | `templates/adr.md`; ADR-0001 from `templates/adr-0001-record-architecture-decisions.md` |
| `backlog` | Deferred backlog (or a link to Jira) | `docs/backlog.md` | `templates/backlog.md` |
| `development-workflow` | Development workflow | `CONTRIBUTING.md` (generated in the `generate` step) | `templates/development-workflow.md` |

**Conditional**

| Key | Document | Included when… | Path | Template |
|---|---|---|---|---|
| `architecture-overview` | Architecture overview | more than one container or service, or a backend exists — including a managed backend such as Supabase | `docs/architecture/overview.md` | `templates/architecture-overview.md` |
| `c4` | C4 diagrams | same as architecture overview | `docs/architecture/c4/workspace.dsl` (Structurizr DSL) | `templates/c4-workspace.dsl` |
| `erd` | ERD + SQL DDL | the project stores data | `docs/architecture/erd.md` (Mermaid `erDiagram`) + `docs/architecture/schema.sql` | `templates/erd.md`, `templates/schema.sql` |
| `feature-breakdown` | Feature breakdown | more than ~5 features, or delivery in several slices | `docs/features.md` | `templates/feature-breakdown.md` |
| `visual-identity` | Visual identity | the project has a user-facing UI | `docs/design/visual-identity.md` + `design/tokens.json` | `templates/visual-identity.md` |
| `screen-flow` | Mobile screen flow | project type is mobile | `docs/design/screen-flow.md` | `templates/screen-flow.md` |
| `release-checklist` | Store release checklist | project type is mobile and ships to app stores | `docs/release-checklist.md` | `templates/release-checklist.md` |
| `game-design-document` | Game design document (incl. scene / state diagram) | project type is game | `docs/gdd.md` + `design/<system>.md` one-pagers | `templates/game-design-document.md` |
| `asset-pipeline` | Asset pipeline | project type is game | `design/asset-pipeline.md` | `templates/asset-pipeline.md` |
| `ai-system-design` | AI system design (model & data flow, prompts, tools, guardrails) | the project calls an LLM or ML model | `docs/ai/system-design.md` | `templates/ai-system-design.md` |
| `ai-eval-plan` | AI / LLM evaluation plan (incl. cost & latency budget) | the project calls an LLM or ML model | `docs/evals/plan.md` + `evals/data/` | `templates/ai-eval-plan.md` |
| `api-surface` | Public API surface, versioning & release policy | project type is library / CLI / API | `docs/api-surface.md` | `templates/api-surface.md` |

**Optional** (only when asked for)

| Key | Document | Format |
|---|---|---|
| `jira` | Backlog in Jira | Epics & stories created from the feature breakdown and PRD |
| `confluence` | Published docs | Confluence pages mirrored from `docs/` |
| `architecture-requirements` | Standalone architecture requirements | Only for larger projects; normally covered by the PRD's non-functional requirements and the overview's quality goals |

Diagrams are kept **as code** in the repository, versioned with the project. All templates ship with the plugin.

**Visual identity → code.** The tokens file uses the W3C Design Tokens (DTCG) format, whose first stable version (2025.10) shipped in October 2025. The Tailwind theme (`@theme` in CSS, Tailwind v4) is generated from it, so colours, fonts and spacing are defined once. The document explains intent; the tokens file holds the values.

**Data model lifecycle.** The ERD explains meaning and rules; `schema.sql` holds the exact DDL. Entity names in the diagram are the real table names, so the ERD, `schema.sql` and the migrations can be compared mechanically. Before scaffold, `schema.sql` is the source of truth and is edited at Gate 2. The scaffold step copies it into the first migration (e.g. `supabase/migrations/<timestamp>_init.sql`). From then on the migrations are the source of truth, and the `docs-keeper` subagent updates `schema.sql` and the ERD when a migration changes the schema; `/adopt` audit mode flags them when they fall behind (7.1).

**Development workflow → agent setup.** `CONTRIBUTING.md` is for humans; `CLAUDE.md`, rules and hooks are for agents. All are generated from the same choices (branching model, Conventional Commits, quality gates) in the same step, so they never disagree, and `/adopt` audit mode checks them against each other. `CONTRIBUTING.md` keeps its metadata in a hidden first-line comment (`<!-- keelwright: status=… date=… -->`) instead of YAML front matter, because GitHub renders front matter as a visible table.

### 6.1 Template principles

All templates follow the same rules, based on research into PRD, ADR, GDD, eval and screen-flow best practice:

- **Short.** PRD 1–3 pages, ADR one page, GDD max 2 pages. Small documents stay current; large ones go stale.
- **Stable IDs.** `SC-001` (success criteria), `US-1` (user stories), `FR-001` / `NFR-001` (requirements), `ADR-NNNN`, `A-1` / `F-01` (activities / features), `BL-001` / `TD-001` (backlog / tech debt), `EV-001` (eval criteria), `S-01` (screens), `P-01` / `T-01` (prompts / tools in the AI system design), `API-001` (public API items). IDs are never renumbered, so agents and other documents can reference them.
- **Testable.** Acceptance criteria use `WHEN … THE SYSTEM SHALL …` or Given / When / Then, so they convert directly into tests.
- **What vs how.** The PRD describes what and why; the stack and architecture live in ADRs and CLAUDE.md.
- **Explicit non-goals and status.** Every document template has non-goals (or a cut list) where they apply and a `status` field in its front matter (`CONTRIBUTING.md` uses a hidden comment instead, see 6.0). Code-format templates (`schema.sql`, `workspace.dsl`) carry their rules in a header comment instead.
- **Unknowns are marked, not guessed.** Open points are written as `[NEEDS CLARIFICATION: …]` and resolved at the review gates.
- **Checked, not just requested.** The mechanical rules (length limits, leftover template placeholders, acceptance-criteria form, ID traceability) are enforced by the plugin's `scripts/doccheck.mjs`; a step must pass it before it completes.
- **ADRs are immutable once accepted.** Changes are made by a new ADR that supersedes the old one. The `prd` step seeds `0001-record-architecture-decisions.md` from its fixed template, and the generator tells agents in CLAUDE.md where ADRs live.

### 6.2 Linked outputs

Documents are generated from each other, so they stay consistent:

- The chosen stack becomes an ADR with its one-sentence summary.
- PRD success criteria (`SC-`) and acceptance criteria become E2E tests (written by the `tester` subagent) or rows in the eval plan.
- `schema.sql` becomes the first migration; afterwards the migrations drive the ERD and `schema.sql`.
- Prompt and tool IDs (`P-`, `T-`) in the AI system design become prompt files and tool names in code.
- Screen IDs (`S-`) become route / component names.
- The feature breakdown's slices drive the PRD release plan; anything outside the current slice goes to the backlog with a reason and a revisit trigger.
- Visual identity tokens become the Tailwind theme and feed the Atomic Design component skill.
- The architecture overview indexes the ADRs and links the C4 workspace and ERD instead of repeating them.
- Feature breakdown and backlog IDs (`F-`, `BL-`) map to Jira epics and issues when Jira output is on.

## 7. Audit mode: quality & drift

### 7.1 Drift — is the setup out of date?

- Commands in CLAUDE.md that no longer exist in `package.json` / Makefile / CI (e.g. `npm test` → `pnpm vitest`).
- References to renamed or deleted paths, folders, modules.
- Wrong stack or versions (e.g. Express vs Fastify, Node 18 vs 22).
- Dependencies behind their latest stable version, especially major versions and versions that are past end-of-life (see 4.6).
- Rules describing conventions the code doesn't follow — or clear conventions in the code no rule mentions.
- Hooks calling scripts or linters that no longer exist.
- New areas without coverage (new service, migrations folder, infra directory).
- Documents listed in the PRD's document set that are missing or stale (e.g. an ERD or `schema.sql` that no longer matches the migrations, a tokens file out of sync with the Tailwind theme).
- `CONTRIBUTING.md` and `CLAUDE.md` / hooks disagreeing (e.g. different commit format or test command).

### 7.2 Quality — is the setup well written?

- CLAUDE.md too long or vague ("write clean code"); short, concrete instructions work better.
- Contradictions across CLAUDE.md, rules and skills.
- Skill descriptions too vague to trigger, or so broad they trigger constantly.
- Subagents with excessive tool access (e.g. a reviewer that can write) or overlapping roles.
- Requirements only **requested** in text that should be **enforced** by a hook.
- Hooks that are risky, slow, or fail silently.

### 7.3 Security & hygiene

- Secrets or internal URLs in CLAUDE.md, rules, skills or settings — scanned with **gitleaks**, across the working tree and git history (a secret removed in a later commit is still leaked).
- Missing secret scanning: no gitleaks pre-commit hook or CI step in the project.
- Overly broad permission allowlists (e.g. `Bash(*)`).
- Personal settings (`settings.local.json`) committed, or shared settings left local.

### 7.4 Output

- Short report with a score per area.
- Fixes as **reviewable diffs**, approved one by one — never silently rewritten, since some unusual rules are intentional.

### 7.5 Build order

1. **Drift checks** first — mechanical comparisons against real files, reliable.
2. **Quality & security checks** next — judgment-based, refined over time.

### 7.6 Extensions

- Run drift checks in **CI** or as a hook after large merges.
- Audit `/kickoff` output a few weeks into a project; recurring findings feed back into the generator.

## 8. Test projects and evaluation

KeelWright is improved by running it on real projects and measuring how well each step does. Two loops feed each other: **real runs** show where users have to correct the output; the **evaluation suite** turns each finding into a repeatable check, so it stays fixed.

### 8.1 Test-case criteria

The first Phase 1 run uses a project that is:

- Small enough to complete end to end in a short time.
- Mostly static with a few optional dynamic features — to test stack right-sizing (4.3).
- UI-centric — to exercise Atomic Design, Playwright and Vercel deployment.
- Documented through the PRD and ADR templates.

The first test project is a personal website with a professional page and a ski instructor page (`test-project-personal-website.md`, kept outside the plugin repository).

### 8.2 Run metrics

Every `/kickoff` run records metrics automatically in `.keelwright/metrics.json`, through the state CLI — the steps don't have to remember to do it. Nothing leaves the project folder.

| Metric | Recorded when | What it shows |
|---|---|---|
| Runs per step (first run + re-runs) | step started | Steps the user had to redo |
| Time per step and time at each gate | step started / completed, gate approved | Where the run is slow or the review is heavy |
| **Edit size per document at each gate** — lines added / removed between what the step generated and what the user approved | gate approved (compared with a snapshot taken at completion) | **The main quality signal**: how much the user had to rewrite |
| Open `[NEEDS CLARIFICATION]` markers at review and at approval | step completed, gate approved | Open questions left, and how many the gate resolved |
| Edits accepted after approval, and steps regenerated because of them | accept-changes | Upstream decisions that didn't hold |
| Step-specific counters (e.g. questions asked, interview rounds, document-check failures before passing) | reported by the step | Step behaviour worth tracking |

Snapshots for the edit comparison live in `.keelwright/snapshots/` only until the gate is approved.

**Report.** `/kickoff report` summarises the metrics as a scorecard and asks the user to rate each generated document: **used as-is**, **small edits**, **rewritten**, or **deleted**. The report is written to `.keelwright/report.md`.

**Follow-up.** A few weeks into the project, the user re-rates the documents (still current and used, or stale / ignored) — the same check `/adopt` audit mode later automates (7.6).

### 8.3 Evaluation suite

An automated suite in the plugin's `evals/` folder, run with `claude plugin eval`:

- **Cases:** a project description plus scripted interview answers, run against one or more steps. Start with the test project, then add deliberately different ones (a SaaS app with logins, a dashboard behind a login, a docs site, and later the other project types).
- **Runs per case:** at least 3, because outputs vary between runs; the score is the pass rate.
- **Code graders (deterministic):** `doccheck` passes; the expected frontend rule and document set for the case; versions match the registries; valid state transitions; cross-document IDs resolve.
- **LLM judges (binary, one failure mode each):** invented facts (every claim traceable to the input or interview); interview questions the input already answered; ADRs justified by requirement IDs.
- **Baseline arm:** the same case without the plugin, to show what KeelWright adds.
- **When it runs:** before each release and on pull requests that change steps, templates or reference rules — not on every pull request, because runs cost money.

### 8.4 The improvement loop

1. Each real run gets a record in `evals/runs/YYYY-MM-DD-<project>.md`: the report, the ratings and the findings.
2. Each finding becomes a GitHub issue.
3. Each fix adds a check: a `doccheck` rule when it can be checked mechanically, otherwise an eval case or judge — so the same problem can't return unnoticed.
4. Scores per release are tracked in `evals/scoreboard.md`.

Example from building the `prd` step: three runs produced PRDs of 2,950, 2,450 and 2,350 words against a 1–3 page target; prose guidance didn't fix it, so the length limit became a `doccheck` rule the step must pass (1,798 words on the next run).

## 9. Roadmap

| Phase | Scope |
|---|---|
| **1 — MVP** | The complete `/kickoff` pipeline (5.1): all steps, review gates and the state file (5.1.2); every project type (4.4) with stack recommendation (4.5) and live version resolution (4.6); the full document catalog (6.0); research step with stack packs, shipping the default web stack and Astro first (5.4); scaffold (5.5); generator with CLAUDE.md, rules, skills, hooks, CONTRIBUTING.md and the three subagents (5.3); optional Jira / Confluence output. Run metrics and the evaluation suite (8.2–8.4). Validated by a run on one real project (8.1). |
| **2** | `/adopt` create mode. |
| **3** | `/adopt` audit mode — drift checks, then quality & security; CI integration. |
| **4** | Visual app on top of the plugin engine (headless Claude Code / Agent SDK). |

**Phase 1 build order**

1. Plugin skeleton, loadable locally (`claude --plugin-dir`), with the repository under git.
2. `/kickoff` entry point, state file, step order and review gates.
3. `interview` and `prd` — web first, including the frontend rules (4.7) and version resolution.
   - 3.1 Run metrics and `/kickoff report` (8.2).
4. `architecture`, `features`, `design` for web.
   - 4.1 Evaluation suite (8.3), starting with cases for `interview` through `design`.
5. `research` and the first stack packs.
6. `scaffold` for web.
7. `generate`.
8. Other project types: type detection, stack recommendation, type-specific documents and scaffolding.
9. `publish` (Jira / Confluence).
10. Run on the real test project; record it in `evals/runs/` and feed the findings back (8.4).

## 10. Open questions

None at the moment.

Name decided: **KeelWright** — a wright is a builder; a keel is what keeps a vessel stable and on course.
