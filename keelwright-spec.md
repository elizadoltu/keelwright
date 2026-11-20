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

For every project with something to attack: a **security reviewer** tailored to its risks (5.3), and a **security audit** of its code and dependencies that can be run again and again (7.7).

One entry point works out which of these a folder needs (5.0), and each person sees the work through their role (5.7).

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

**Toolchains.** How a project is built and checked is a second axis, independent of its type: an Expo app and a TypeScript library are both `node`; a Python AI service and a Python library are both `python`. The toolchains are `node`, `python`, `dart` (Flutter), `rust`, `godot` and `editor` (engines and IDEs whose projects are created in their editor: Unity, Unreal, native Xcode / Android Studio apps). Each defines its task runner, manifest and lockfile, git hooks, Dependabot ecosystem and the commands the Claude Code hooks run (5.5); the `prd` step records it with the stack.

### 4.5 Stack recommendation

For anything outside the defaults, `/kickoff` **recommends** a stack instead of assuming one:

- 2–3 candidate stacks, compared against the PRD's requirements (platforms, performance, team skills, cost, hosting, ecosystem maturity).
- One recommended option, with the reasoning.
- The choice is written into the **PRD** (technical constraints section) and recorded as an **ADR**. The data model in the ERD is then built for the chosen database.

Each project type has its own rules for the **main decision**, kept in the plugin's `reference/<type>-stack.md` and checked in order like the web frontend rules (4.7), stopping at the first match:

| Type | Main decision | Candidates, in order (the last is the default) |
|---|---|---|
| Web | Frontend framework | The frontend rules (4.7): Astro, Next.js, TanStack Start (one app, SSR, or SPA mode) |
| Mobile | App framework | Native (SwiftUI / Jetpack Compose) for one-platform apps built on platform-only features or by a native team → Flutter for pixel-identical custom UI or a Dart team → **Expo (React Native) + TypeScript** |
| Game | Engine | Unreal for consoles / high-end 3D → Unity for its ecosystem or a C# team → Phaser 4 + TypeScript for browser-first games → **Godot 4 with GDScript** |
| AI / LLM | Language and model provider | TypeScript when it lives in a TypeScript product or team → **Python**; the provider and model compared on quality for the task, cost, latency, context, tool use and data handling, looked up live |
| Library / CLI / API | Language and distribution | The users' language for a library → Rust for a single-binary CLI → TypeScript for an `npx` CLI → Python for data-work CLIs → Node.js + Express (or FastAPI) for a standalone HTTP API |

ADR-0002 is always this main decision, naming the rule that matched and the alternatives compared. Each type's rules also give its default layers, conventions, document set, version specs and stack pack ids.

### 4.6 Version policy: latest stable

Every project starts on the **latest stable version** of each part of its stack.

- **Resolved live on every run.** Versions are looked up from the package registries or official release channels at kickoff time, never from memory, templates or a cached stack pack. The plugin's `scripts/versions.mjs` does this for npm, PyPI, crates.io and pub.dev packages, the Node.js LTS line, CPython, Flutter (with its Dart SDK), Rust, Godot, Unity LTS and GitHub releases, and reports conflicts across the set: npm peers and `engines.node`, `requires-python`, a crate's `rust-version` and a Dart package's SDK constraint. Software without a machine-readable release feed (Unreal Engine, Xcode, Android Studio) is looked up on its official release notes, and the URL is recorded next to the version.
- **Stable only.** No alpha, beta, RC, canary or nightly releases. For runtimes with release lines (e.g. Node.js), use the latest **LTS** release, not the "Current" line.
- **Compatible as a set.** The newest version of one package may not yet support the newest version of another (e.g. a plugin lagging behind a major framework release). In that case, use the newest set that works together and record the held-back package and the reason in an ADR.
- **Pinned and recorded.** Exact versions are written to the manifest and lockfile, and listed with the lookup date in the PRD's technical section. Two exceptions follow the ecosystem's convention: a **library** declares what its users install as a range with the resolved version as the lower bound (exact pins would conflict with the users' own dependencies), and **Dart and Rust** manifests use caret requirements with the lockfile as the exact record.
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

## 5. Architecture: one entry point, three routes

### 5.0 `/start` — one command that works out what is needed

`/keelwright:start` looks at the folder and picks the route; `/kickoff` and `/adopt` stay as **overrides** for when the guess is wrong (an empty-looking folder that is really a template, an existing repo the user wants to restart).

| The folder has | Route |
|---|---|
| `.keelwright/state.json` | Continue that pipeline, in its mode |
| Nothing, or only notes, specs or a PRD | `/kickoff` (the notes are its input) |
| Code, no Claude setup | `/adopt` create mode (5.2.1) |
| Code with a Claude setup | Doctor (7.0), then audit mode's fixes (7.4) |
| Unclear (a fresh scaffold with a few commits, code in a subfolder only) | Ask, showing what was found |

- The decision comes from the same facts script as `/adopt`'s preflight (`ANALYSE --preflight`, extended with the kickoff and doctor cases); the blockers (`monorepo`, `toolchain`) still stop with their explanation.
- **Inside the route it also says what it will produce and why** before starting: the document set and the steps it will skip (no ADR-0001 when ADRs exist, no `c4` for one deployable, no `publish` without Confluence or Jira).
- The pipelines stay separate inside (`scripts/lib/pipeline.mjs`, one per mode); `/start` is a routing layer, not a merge.


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
| `architecture` | Remaining ADRs, architecture overview, C4, ERD + `schema.sql`, threat model, AI system design, AI eval plan, public API surface | Gate 2 (shared with `features` and `design`) |
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
    "toolchain": "node",
    "primary": { "choice": "TanStack Start", "rule": 4, "compared": ["Next.js"] },
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

`/adopt` picks the mode itself: a `CLAUDE.md` or `.claude/` folder means audit mode (Phase 3, built on the doctor, 7.0; until then it says so and stops). Instruction files of other tools (`AGENTS.md`, `.cursorrules`, `.github/copilot-instructions.md`) don't count as a Claude setup — they are read as input.

### 5.2.1 Create mode

The code is the source of truth. Create mode **describes** the project as it is and builds the agent setup on top of it; it never changes application code, folder structure or dependency versions.

**Steps**

```
analyse → { document, research } → gaps → generate → publish
```

| Step | Produces | Gate after it |
|---|---|---|
| `analyse` | `.keelwright/analysis.md`: project type and toolchain, stack and the versions in use, tasks, structure, conventions, existing docs, what tooling already enforces, gaps | Gate 1 |
| `document` | Architecture overview (as built), threat model (as built), ADR-0001 and ADRs **recorded retroactively** for the main existing decisions | Gate 2 (shared with `research`) |
| `research` | Stack packs for the stack in use, at the **major versions in use** (5.4) | Gate 2 |
| `gaps` | Fixes for missing tooling, each shown as a diff and applied only when the user approves it | — |
| `generate` | CLAUDE.md, rules, skills, subagents, hooks, CONTRIBUTING.md (5.3) | Final summary |
| `publish` | Jira and Confluence (5.6), only when asked for | Optional |

**`analyse`.** A script (`scripts/analyse.mjs`) collects the facts mechanically; the step adds what needs judgement.

- *Facts (script):* toolchain and package manager; runtime pins; direct dependencies with the **locked** versions; frameworks and the stack packs that cover them; tasks (npm scripts, poe, just, Makefile targets) mapped to the task contract (`lint`, `test`, `typecheck`, …); tooling present (linters, formatters, type checking, test runners, git hooks, gitleaks, CI, dependency updates); the folder structure; existing docs (README, ADR folders, `docs/`, CONTRIBUTING, other tools' instruction files); test files; monorepo markers.
- *Judgement (step):* project type; architecture style and layers; conventions the code actually follows — naming, structure, error handling, testing, data access — each **citing the files that show it** and marked *consistent* or *mixed*; the main existing decisions.
- *Gaps:* no secret scanning, no git hooks, no CI or CI that doesn't run the checks, no test or lint task, no dependency updates, runtime or major versions past end-of-life (4.6), personal settings committed.
- At gate 1 the user corrects the analysis. A convention they strike out is never turned into a rule.

**`document`.** The architecture overview follows its template, describing the system as built (with C4 context and container diagrams when there is more than one deployable): locked versions, real routes and folders, flows traced through real files, the departures from the code's own style as debt; no NFR or story IDs, since there is no PRD. Retroactive ADRs (template `adr-retroactive.md`) record decisions already made — framework, database, hosting, auth, anything the code depends on heavily — one per "Decisions in the code" row without an ADR. Each says "Recorded retroactively by KeelWright from the code" with the date it was recorded, cites the files that show the decision, and leaves alternatives and decision-makers as "Not recorded" unless the docs, commit history or the user say otherwise — they are never invented. They are `proposed` until gate 2 and `accepted` after. `doccheck adr-retro` checks the note, the Alternatives section and that every cited file exists. Existing ADRs are kept in their own folder, naming and numbering, and new ones are numbered after them; ADR-0001 is written only when there are none. Existing docs are linked, not rewritten. No PRD. The threat model (6.0) is written as built too: the trust boundaries, entry points and data the code has, each mitigation citing the files that enforce it, and a risk with no mitigation in the code marked `open` — recorded, never fixed by the step. `/adopt` doesn't run the security audit (7.7); its final summary suggests `/keelwright:doctor security` once the setup is in place.

**`research`.** As in 5.4, but for the major versions in use: a project on React 18 gets React 18 conventions, from the documentation for that major. Packs are chosen from the analysis, not from stack rules; the locked version of each pack's primary package is recorded in the state so a cached pack is reused only for the same major. A pack rule that contradicts a convention the analysis recorded is flagged at gate 2, and the project's convention wins unless the user decides otherwise. Newer majors are reported as gaps, never upgraded.

**`gaps`.** For each gap the step shows the fix as a diff — e.g. a gitleaks pre-commit hook, a CI workflow that runs the project's own checks, Dependabot, a single `check` task — and applies it only when the user approves it, one by one, in an order where later fixes can use earlier ones (secrets and hygiene, then tasks, hooks, CI, dependency updates). It uses the project's existing tools (its package manager, its hook manager, its CI system, its task runner) and never replaces them; a new tool comes in only where the project has none, and then the toolchain's default. It never changes application code or the version of an existing dependency; end-of-life runtimes and majors behind are recorded, not upgraded. A committed `.env` is removed from the index with a plain warning to rotate its secrets — history is the user's call. Protected files (`.husky/`, `.pre-commit-config.yaml`) are shown for the user to create when a write is refused. Every decision — applied, applied by the user, declined with the reason, recorded — goes to `.keelwright/gaps.md` as it's made, so a stopped run resumes and the generator doesn't refer to declined fixes; `analyse.mjs --gaps` confirms the applied ones are gone. Nothing is committed by the step.

**`generate`.** The shared generator (5.3), reading `.keelwright/analysis.md`, the overview, the ADRs and `.keelwright/gaps.md` instead of the PRD and `.keelwright/scaffold.md`. Commands are the project's real ones (`pnpm test`, `make lint`); `generatecheck` accepts only those in an adopted project and looks for its own ADR folder. Rules come from the conventions the user kept at gate 1 (citing `C-NN` and their evidence) plus the packs' review rules; a pack rule that contradicts a kept convention is set aside in `.keelwright/generate.md`. The hook config comes from the tools the project already has (`analyse.mjs --hook-config`), and the stop check is its own `check` task — off when it has none. An `implement-change` skill replaces `implement-story` (there are no story IDs). CLAUDE.md links to the existing docs and lists the recorded gaps as known limits; an existing `CONTRIBUTING.md` is kept and extended, not replaced; other tools' instruction files are carried over, never deleted. The rules the existing tooling enforces need no prose, as in 5.3.

**Workspace repos and monorepos.** A repository whose few workspaces make up one product — npm, pnpm or yarn workspaces (Turborepo on top is fine), one lockfile at the root, shared hooks, CI and docs at the root, every nested project a Node.js workspace, at most six — is adopted as **one project from the root** (e.g. `frontend/` and `backend/`). Each workspace gets its own dependencies with locked versions, frameworks, tasks run from the root (`npm run lint --workspace backend`, `pnpm --filter web dev`) and tests; gaps look across them, the analysis and overview describe each workspace and how they connect, rules are scoped to their workspace's folders, and the edit hook runs each workspace's formatter and linter from its folder. Other monorepos (Nx, Lerna, Rush, Cargo or uv workspaces, mixed toolchains, more than six workspaces) aren't supported yet: `analyse` says why and offers to adopt one package, with that folder as the project root. Adopting a single workspace of a workspace repo is not offered: its tooling lives at the root, so the analysis would report false gaps.

**Before it starts.** `/adopt` checks the repository before it creates any state (`analyse.mjs --preflight`) and stops, changing nothing, on an existing Claude setup (audit mode), a monorepo (run it from the package's folder), a toolchain KeelWright doesn't support, or a folder with no project. On a dirty git tree it says so and offers a `keelwright-adopt` branch, so the documents and tooling fixes don't mix with unfinished work. Text passed to `/adopt` is kept in `.keelwright/input.md` as the user's notes about the project; they outrank what the analysis infers.

**State.** The same `.keelwright/state.json` with `"mode": "adopt"`, changed through the same state CLI (`state.mjs init --mode adopt`); a state without `mode` is a kickoff. `status`, `report` and the run metrics work as for `/kickoff`. The document set starts with `adr`, `architecture-overview` and `development-workflow` (no PRD, no backlog). `/kickoff` in a folder that is being adopted sends the user to `/adopt`, and in a folder that already holds a project it offers `/adopt` first.

**Publish.** Confluence only: the documents in `docs/` (the project's own included, unless the user leaves them out), titled with the project's name from the analysis. Jira isn't offered — its plan comes from the PRD's stories and the backlog, which `/adopt` doesn't write.

| Command | Does |
|---|---|
| `/adopt` | Starts create mode (or audit mode, later), or resumes |
| `/adopt <step>` | Re-runs one step and marks every step after it as `stale` |
| `/adopt status`, `/adopt report` | As for `/kickoff` |

### 5.3 Shared generator step

Generates an agent workflow **tailored to the project** — derived from its PRD and architecture, never copied boilerplate:

- `CLAUDE.md`
- `.claude/rules`
- Project-specific **skills** (e.g. the Atomic Design component skill, fed by the visual identity tokens)
- **Subagents** (below)
- **Hooks** (e.g. lint/test on edit, block secrets with gitleaks — Husky pre-commit plus a GitHub Actions step)
- `CONTRIBUTING.md` — generated here, after scaffold, from the same choices as `CLAUDE.md` and the hooks, so all of them use the real commands and never disagree (6.0)
- Optional (`publish` step, 5.6): **Jira** epics/stories and **Confluence** pages via the Atlassian Rovo MCP server

Rules, skills and hooks are built from the stack packs (5.4). The generator never references something it didn't create: a line in a template that points to a missing part (e.g. E2E tests in a project without them) is removed, not left as a placeholder.

**How pack rules are used.** Rules the scaffold already enforces through config, lint, types, CI or hooks (recorded in `.keelwright/scaffold.md`) need no prose — CLAUDE.md only says never to disable those checks. Rules of kind `review` (and any `hook`, `ci` or `test` rule the scaffold couldn't apply) become `.claude/rules/*.md`: one file per area, scoped with `paths` front matter so it loads only when matching files are touched, plus one project-wide architecture file. Duplicates across packs become one rule citing every ID; rules marked not applicable are left out. The mapping is recorded in `.keelwright/generate.md`.

**CLAUDE.md** stays under 200 lines (Claude Code's guidance): what the project is, where the documents are, the commands, the stack, the structure, a few concrete working rules, the workflow and the agents — linking instead of repeating.

**Skills:** `implement-story` (acceptance criteria → tests → code → checks → review → docs) and `new-adr` (numbering, superseding) always; `security-review` when there is a threat model (below); `new-component` (Atomic Design level, theme tokens only) when there is a UI; `new-migration` when there is a database; `change-prompt` (prompt or tool by its `P-` / `T-` ID, eval cases, the `EV-` thresholds) for AI projects; `change-public-api` (breaking or not, the API surface, deprecation, the commit type that sets the version bump) for libraries.

**Claude Code hooks** (scripts shipped with the plugin, copied unchanged into `.claude/hooks/`):
- `guard-files` (before Edit / Write): blocks changes to accepted ADRs except superseding their status, edits to generated files (the theme), and new content gitleaks flags as a secret.
- `format-on-edit` (after Edit / Write): the toolchain's formatter and linter on the file (Prettier and ESLint; Ruff; `dart format` and `dart analyze`; rustfmt; gdformat and gdlint); remaining lint errors go back to Claude.
- `check-on-stop` (Stop): the `check` task when files changed; failures go back to Claude, once per stop.

The hooks read which commands to run from `.claude/hooks/config.json`, which the generator writes for the project's toolchain (without it they use the Node.js defaults), so the same scripts serve every toolchain.

**Settings:** `.claude/settings.json` allows only the project's own tasks and read-only git commands, denies force-push, `--no-verify` commits and reading `.env` files; `.claude/settings.local.json` is git-ignored.

**Checked:** the step passes the project's own `check` task and `scripts/generatecheck.mjs` — CLAUDE.md size, commands that exist and use the project's task runner, paths that exist, no placeholders, the three agents with explicit tools and a read-only reviewer, a read-only `security-reviewer` naming the framework edition and only `SEC-` IDs that exist in the threat model (when there is one), skill descriptions, rule front matter, every applicable review rule covered and no unknown rule IDs, safe permissions, hook scripts present, `.gitignore`, the hook configuration for the toolchain, and CONTRIBUTING.md agreeing with the Conventional Commits check (commitlint or the pre-commit commit-msg hook).

**Generated subagents**

| Subagent | Tools | Role |
|---|---|---|
| `reviewer` | Read, Grep, Glob, Bash (read-only commands); `disallowedTools: Write, Edit, MultiEdit, NotebookEdit` | Reviews changes against the chosen conventions (Clean Architecture, Atomic Design, Humble Object), the accepted ADRs and the PRD IDs. Never writes. |
| `tester` | Read, Grep, Glob, Edit, Write, Bash | Turns acceptance criteria (`WHEN … SHALL`, Given / When / Then) and success criteria (`SC-`) into Vitest and Playwright tests named after their IDs. |
| `docs-keeper` | Read, Grep, Glob, Edit, Write | Keeps the ERD, `schema.sql`, architecture overview, threat model, backlog and ADR index in sync with the code. Writes new ADRs; never edits accepted ones. |
| `security-reviewer` (when there is a threat model) | Read, Grep, Glob, Bash (read-only commands); `disallowedTools: Write, Edit, MultiEdit, NotebookEdit` | Reviews changes against the threat model's `SEC-` risks, the security framework for the project type at the edition in `reference/security.md` (7.7), and the stack packs' security rules. Approves unless there is a real issue; at most 5 findings, each with `file:line`, the `SEC-` or framework ID, the evidence and a concrete fix. Never writes. |

The subagent definitions are tailored to the project (its conventions, commands and paths), not copied boilerplate. For other project types the `tester` uses the stack's test tools (e.g. the eval runner for AI projects).

**Security reviewer.** Generated when the document set has a threat model (6.0) — that is, when there is something to attack. Its definition names the project's own risks, not a generic checklist: the `SEC-` risks with the paths, routes, tables or tools where each can happen, the roles and what each may do, the data classes marked personal, and the framework edition. The `security-review` skill is its procedure: which paths are security-sensitive (from the threat model), the checks per risk, how findings are reported. `implement-story` (and `implement-change`) runs the `security-reviewer` after the `reviewer` when a change touches a sensitive path, adds or upgrades a dependency, adds a migration, or adds an LLM tool; otherwise the `reviewer` carries a short security section (secrets, input at boundaries, dependencies). The packs' security rules of kind `review` go to `.claude/rules/security.md`, scoped to the sensitive paths, so both agents read the same rules. A project without a threat model (a static site with no forms, an offline game) gets no `security-reviewer`; its `reviewer` keeps the short section, plus headers and third-party scripts for web.

The step ends with a short summary of everything generated, for the user to review.

### 5.4 Research step: conventions per stack

Rules, skills and commands are based on **researched, current** practices for the chosen stack — not on fixed templates.

- **What is researched:** project structure, naming, testing strategy, linting / formatting config, security practices, performance pitfalls, CI/CD and release patterns, and how the chosen conventions (4.2) map onto that stack.
- **Sources, in priority order:** official documentation and style guides → framework maintainers' recommended setups → well-maintained reference projects → community sources, only to fill gaps.
- **Output — "stack packs":** one Markdown file **per technology** (e.g. `astro`, `tailwind`, `vitest`), so packs are reusable across stacks; a project's stack is the set of packs it uses. Each pack has front matter (`id`, `packages`, researched `major`, `researchedAt`, `status`), one section per research topic, a **Rules** table — each rule concrete, with how it is enforced (`lint`, `format`, `types`, `hook`, `ci`, `test`, `config` or `review`, naming the exact tool and rule) and the sources it rests on — and a **Sources** table with each source's kind. The generator builds rules, skills, commands and hooks from the Rules tables. Template: `templates/stack-pack.md`; procedure: `steps/research-pack.md`.
- **Security section:** names the framework item each rule guards against when there is one (e.g. `A01` from the OWASP Top 10, 7.7), so the generator can route the rules to `.claude/rules/security.md` and the `security-reviewer`, and the audit can tie a finding back to a rule.
- **Checked:** `scripts/packs.mjs validate` enforces the structure: every rule cites a source, no rule rests on community sources alone, at least one official source, rule IDs `<ID>-NN`, known enforcement kinds.
- **Reuse:** stack packs are cached and reused across projects. This keeps runs fast and results consistent, and makes the reasoning behind each rule traceable.
- **Storage:** packs shipped with the plugin live in `keelwright/stack-packs/` (listed in `stack-packs/shipped.json`, produced and refreshed by the maintainer script `scripts/research-pack.mjs`). Packs researched during a run are saved to `~/.keelwright/stack-packs/` after gate 3, because the installed plugin folder is replaced on plugin updates. When both exist, the newer pack for the project's major wins; the cache keeps one file per pack and major (`<id>@<major>.md`), so a pack researched for an older major (for `/adopt`) sits next to the current one instead of replacing it. The packs a project uses are copied into `<project>/.keelwright/stack-packs/`, where they are reviewed and edited at gate 3 — edits there apply to that project only. Each project records the pack ids and research dates in `.keelwright/state.json`.
- **Shipped first:** the default web stack (TanStack Start, Express, Supabase / PostgreSQL, Tailwind, Vitest, Playwright, Vercel) and Astro. All other stacks are researched the first time a project needs them.
- **Refresh policy:** a stack pack is re-researched when it is older than **90 days**, when the resolved major version of the stack changes (4.6), or on demand with a `--refresh` flag.
- **Review:** like the other documents, the stack packs are editable and go through a review gate (gate 3) before generation. Rules that contradict an accepted ADR are kept but flagged as not applicable to the project.
- **Frontend rules re-checked:** when a framework pack is researched, the step compares its findings with the frontend selection rules (4.7) and reports contradictions at the gate; the rules themselves are updated in the plugin, not by a project run.

### 5.5 Scaffold step

Creates a working repository for the chosen stack, using the versions resolved in the `prd` step (4.6).

**Before anything is created**, a preflight (`scripts/preflight.mjs`) checks the machine: the local Node.js must satisfy every resolved package's `engines.node` (required), should be the resolved LTS (recommended), and git, gitleaks and — with a database — the Supabase CLI and Docker must be installed. A missing requirement stops the step with instructions; a recommendation only warns.

**Web projects** get (details in `reference/web-scaffold.md`):
- The app, created with the framework's official generator pinned to its resolved version, non-interactive, then shaped to the architecture overview's code structure. It is a **walking skeleton**: every P1 route exists with its layout, title, `lang` and a placeholder heading; features come later.
- npm by default (unless the user or an ADR chooses otherwise); exact versions in the manifest and a committed lockfile; `.nvmrc` pins the LTS, `engines.node` the strictest requirement of the installed packages. Tools the stack packs require (lint plugins, configs) are resolved at this point and added to the recorded versions.
- Standard npm script names — `dev`, `build`, `preview`, `lint`, `format`, `format:check`, `typecheck`, `test`, `test:e2e`, `tokens`, `check` — which CONTRIBUTING.md, CLAUDE.md, the hooks and CI all rely on.
- Configuration applying every stack-pack rule of kind `config`, `lint`, `format` and `types` that gate 3 left applicable; each applied (or skipped) rule is recorded in `.keelwright/scaffold.md` for the generator and for audits.
- Tailwind theme generated from `design/tokens.json` by a script copied into the project (`scripts/tokens-to-css.mjs`), with a drift check in `npm run check`.
- Husky with lint-staged, commitlint (Conventional Commits) and a gitleaks pre-commit hook.
- GitHub Actions CI — check, build, Playwright, gitleaks, commitlint — with every action pinned to a commit SHA (`scripts/versions.mjs` resolves release tags to SHAs).
- Dependabot for npm and GitHub Actions (Renovate when chosen instead).
- A Vitest unit test of a real helper and a Playwright smoke test over the P1 routes, passing out of the box.
- When a database is used: `docs/architecture/schema.sql` copied into the first migration (6.0, data model lifecycle) — with the Supabase CLI's local setup when the database is Supabase, otherwise with the migration tool the ADRs chose (plain SQL in `migrations/` until one is chosen).
- A package that installing forces below its resolved version gets a hold-back ADR from the scaffold itself (a new file, so not an edit to an earlier step).
- `.env.example`; no secrets are ever written.

The step must pass `npm run check`, `npm run build`, `npm run test:e2e` and `scripts/scaffoldcheck.mjs` (exact versions, scripts, hooks with gitleaks, pinned actions, dependency updates, theme in sync, migration present) before it completes. It records configuration files as its outputs, not source folders, so ordinary feature work doesn't count as an edit to the scaffold. It never commits for the user.

**Other project types** follow the same steps with their toolchain's tools (details in `reference/toolchains.md`; the mechanical parts are in `scripts/lib/toolchains.mjs`, shared by preflight, `scaffoldcheck` and `generatecheck`):

- **Generator:** the official one, pinned and non-interactive — `create-expo-app` (with `--no-agents-md`, since the generator owns the agent files), `flutter create --empty`, `uv init --app|--lib`, `cargo new`. Where no non-interactive generator exists, an official template pinned to a commit (Phaser) or the minimal files by hand (Godot's `project.godot`, an npm library).
- **The task contract:** the same task names in every project — `dev`, `build`, `lint`, `format`, `format:check`, `typecheck`, `test`, `test:e2e`, `tokens`, `eval` (AI projects: offline evals, which cost money and are never part of `check`), `check` — run as npm scripts, poethepoet tasks (`uv run poe <task>`) or `just` recipes (`just <task>`; dashes instead of colons).
- **Git hooks:** Husky for Node.js projects; the pre-commit framework for the others, with gitleaks and a Conventional Commits commit-msg hook, revisions pinned to commit SHAs.
- **Walking skeleton per type:** mobile — every P1 screen of the screen flow; game — the GDD's scenes wired from start to quit and one game rule with a test; AI — one prompt file per `P-` ID, typed tool stubs per `T-` ID, the model adapter and the `eval` task over the seed dataset; library — the P1 `API-` items as typed stubs, `--help` / `--version` for a CLI, and the package build.
- **Theme:** `design/tokens.json` also generates a TypeScript object (React Native / Expo) or a Dart constants class (Flutter); the output file's extension picks the target.
- **Editor-based engines** (Unity, Unreal, native IDE apps) have no command-line generator for KeelWright to run, so the step writes `docs/setup.md` (engine version, how to create the project in this folder, packages, where code goes, how to run tests) and still creates everything that doesn't need the engine: `.gitignore`, Git LFS patterns, git hooks, CI with gitleaks, Dependabot. The documents and the Claude setup are generated as usual.

### 5.6 Publish step: Jira and Confluence

Optional, and only when the user asks for it (the `jira` and `confluence` catalog keys). It runs through the **Atlassian Rovo MCP server** with the user's own Atlassian login, so KeelWright never holds Atlassian credentials.

**The repository stays the source of truth.** Requirements, decisions and documents are edited in `docs/` and published again; Jira holds the work's progress (status, assignee, sprint), which KeelWright never touches.

- **Jira:** each feature (`F-`) becomes an epic; each story (`US-`) a story under its feature's epic, with the story sentence, the acceptance criteria and the functional requirements that trace to it; deferred backlog items (`BL-`) that no story covers, and technical debt (`TD-`), become tasks, if the user wants them. Labels: `keelwright`, `kw-<id>` (to find an item again) and `slice-now` / `slice-next` / `slice-later`.
- **Confluence:** every Markdown file in `docs/` becomes a page, under one root page per project, with one parent page per folder (e.g. Decisions). Each page names its source file; links between documents point to their pages; Mermaid diagrams stay as code (Confluence doesn't render them).
- **Re-runnable:** `scripts/publish.mjs` plans the publish from the documents and the record `.keelwright/publish.json` (the site, project and space, and per item its Jira key or page id and a hash of what was sent): new items are created, changed ones updated, unchanged ones left alone. Nothing is ever deleted: an item that is no longer in the documents is reported for the user to close or archive.
- **Asked, not assumed:** before anything is written, the step shows the plan (how many epics, stories, tasks and pages to create or update, where) and waits for the user's go-ahead. An update overwrites only the summary / title and description / body; if a page was edited in Confluence since the last publish, the step asks before overwriting it.

### 5.7 Profiles — who is running it

Different roles work with different documents. A personal profile (`~/.keelwright/profile.json`, set with `/keelwright:profile` and asked once on the first run) holds the person's **name**, **role** (developer, project manager, business analyst, account manager) and defaults (Jira project, Confluence space, language). It never holds an email address, and it is not in the repository: several people with different roles work on one project.

**The project's document set doesn't depend on who runs it** — a project kicked off by a PM still gets its architecture and Claude setup, because the next person needs them. The role decides:

- **The working set** — the documents the person owns: shown in full at gates, rated in the report, listed first by the doctor. The rest are summarised in a line each and stay open to them.

  | Role | Working set |
  |---|---|
  | Developer | architecture overview, ADRs, C4, ERD, threat model, API surface, development workflow, stack packs, the tooling gaps, the Claude setup |
  | Project manager | PRD (goals, scope, release plan), feature breakdown and backlog, release checklist, Jira |
  | Business analyst | PRD requirements and acceptance criteria, user stories, ERD (the data, not the SQL), screen flow, test scenarios |
  | Account manager | open — to be defined (10) |

- **The questions they're asked.** Every open question carries the role that can answer it: `[NEEDS CLARIFICATION (dev): …]`. A gate asks the person only the questions for their role; the others stay open for the right person and are listed as waiting on them.
- **How results are shown** — a developer sees diffs, versions and files; a PM sees scope, risks and what is blocked; a BA sees requirements, criteria and data gaps.
- **Defaults** — the name fills `owner` and `decision-makers` instead of a marker; the Jira project and Confluence space prefill `publish`.
- **Extras on request** — documents only one role needs are offered, never part of the default set. For product work KeelWright **uses [pm-skills](https://github.com/phuryn/pm-skills)** (MIT) rather than copying it: when it is installed, the PM profile is offered its workflows on the project's documents (OKRs, outcome roadmap, pre-mortem, PRD red-team, stakeholder map, release notes); when it isn't, KeelWright says how to install it. KeelWright's own PRD stays the engineering-facing one that the architecture is built from.

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
| `threat-model` | Threat model: assets and data classes (personal data marked), roles and what each may do, trust boundaries and entry points (from the C4 containers), `SEC-` risks — each with where it can happen (paths, routes, tables, tools), its mitigation, how that is enforced (RLS policy, test, lint rule, review) and a status | there is something to attack: a backend (including a managed one), user accounts, stored personal data, an API others call, an LLM with tools or user data, or a package or binary others install | `docs/security/threat-model.md` (1–2 pages) | `templates/threat-model.md` |
| `feature-breakdown` | Feature breakdown | more than ~5 features, or delivery in several slices | `docs/features.md` | `templates/feature-breakdown.md` |
| `visual-identity` | Visual identity | the project has a user-facing UI — for a game only when its UI is built with a UI framework | `docs/design/visual-identity.md` + `design/tokens.json` | `templates/visual-identity.md` |
| `screen-flow` | Mobile screen flow | project type is mobile | `docs/design/screen-flow.md` | `templates/screen-flow.md` |
| `release-checklist` | Store release checklist | project type is mobile and ships to app stores | `docs/release-checklist.md` | `templates/release-checklist.md` |
| `game-design-document` | Game design document (incl. scene / state diagram) | project type is game | `docs/gdd.md` + `design/<system>.md` one-pagers | `templates/game-design-document.md` |
| `asset-pipeline` | Asset pipeline | project type is game | `design/asset-pipeline.md` | `templates/asset-pipeline.md` |
| `ai-system-design` | AI system design (model & data flow, prompts, tools, guardrails) | the project calls an LLM or ML model | `docs/ai/system-design.md` | `templates/ai-system-design.md` |
| `ai-eval-plan` | AI / LLM evaluation plan (incl. cost & latency budget) | the project calls an LLM or ML model | `docs/evals/plan.md` + `evals/data/` | `templates/ai-eval-plan.md` |
| `api-surface` | Public API surface, versioning & release policy | project type is library / CLI / API, or the project exposes an API that other systems or teams call | `docs/api-surface.md` | `templates/api-surface.md` |

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
- **Stable IDs.** `SC-001` (success criteria), `US-1` (user stories), `FR-001` / `NFR-001` (requirements), `ADR-NNNN`, `A-1` / `F-01` (activities / features), `BL-001` / `TD-001` (backlog / tech debt), `EV-001` (eval criteria), `S-01` (screens), `P-01` / `T-01` (prompts / tools in the AI system design), `API-001` (public API items), `SEC-01` (threat model risks). IDs are never renumbered, so agents and other documents can reference them.
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

## 7. Doctor and audit mode: health, drift and quality

### 7.0 Doctor — is the project healthy now?

`/keelwright:doctor` checks a project at any time, on any project with a Claude setup (made by KeelWright or not). It differs from `report` (8.2): the report looks back at one run of KeelWright; the doctor looks at the project as it is today and is meant to be run again and again.

| Area | Checks |
|---|---|
| Claude setup | drift and quality (7.1, 7.2): commands, paths, hooks and skills still match the project |
| Docs vs code | ADR versions vs the lockfile, the overview's routes and containers vs the code, `schema.sql` vs migrations, broken references, old open questions |
| Stack | a new major since the packs were researched, end-of-life dates within six months, security advisories |
| Tooling and security | the open gaps again (`ANALYSE --gaps`), gaps declined earlier worth another look, 7.3 |
| Application security | the security audit (7.7): known vulnerabilities in the locked dependencies, secrets in the tree and history, data access (RLS), the threat model against the code; judgement review with `--deep` |
| Delivery | PRD requirements with no story, stories with no test, Jira status vs what the code has (when Jira is linked) |
| Process | commits follow the project's style, CI pass rate, hooks skipped (`--no-verify` in history) |

- **Output:** pass / warn / fail per area; each finding names its evidence and the command that fixes it (`/adopt research --refresh`, `/adopt gaps`, a document's step). Results go to `.keelwright/doctor.md` with a dated history, so a trend shows: getting healthier or not. The profile (5.7) orders the areas and sets the language; an account manager's view is a short status per area.
- **Free by default:** the first version runs only mechanical checks (the existing `generatecheck`, `doccheck`, `analyse`, `packs` and `versions` scripts, plus git and CI history) — no model calls, so it is fast and costs nothing. Judgement checks (does the overview still describe the code?) come later behind `--deep`, with a cost limit.
- **Read-only:** the doctor never changes a file except its own record. Fixing is audit mode (7.4).


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

### 7.3 Security & hygiene of the Claude setup

The setup itself; the project's code and dependencies are the security audit (7.7).

- Secrets or internal URLs in CLAUDE.md, rules, skills or settings — scanned with **gitleaks**, across the working tree and git history (a secret removed in a later commit is still leaked).
- Missing secret scanning: no gitleaks pre-commit hook or CI step in the project.
- Overly broad permission allowlists (e.g. `Bash(*)`).
- Personal settings (`settings.local.json`) committed, or shared settings left local.

### 7.4 Output

- The doctor's report (7.0) with a score per area.
- Fixes as **reviewable diffs**, approved one by one — never silently rewritten, since some unusual rules are intentional.

### 7.5 Build order

1. **Doctor, mechanical checks** first — comparisons against real files, reliable and free.
2. **Audit fixes** — the doctor's findings as diffs, approved one by one.
3. **Quality and judgement checks** next (`--deep`) — refined over time.

### 7.6 Extensions

- Run drift checks in **CI** or as a hook after large merges.
- Audit `/kickoff` output a few weeks into a project; recurring findings feed back into the generator.

### 7.7 Security audit — the project's code and dependencies

`/keelwright:doctor security` runs only this area; every doctor run includes its mechanical checks. Like the rest of the doctor it is read-only, mechanical and free by default, with judgement behind `--deep`.

**Frameworks per project type.** The editions live in `reference/security.md` and are updated in the plugin (like the frontend rules, 4.7), never looked up per run; the generated `security-reviewer` names the same edition.

| Project type | Framework |
|---|---|
| Web | OWASP Top 10 (2025), with ASVS 5.0 level 1 as the checklist behind it |
| Mobile | OWASP MASVS 2 |
| AI / LLM | OWASP Top 10 for LLM Applications (2025), plus the web or API list for the rest of the system |
| Library / CLI / API | OWASP API Security Top 10 (2023) for an API; for a library or CLI: input handling, unsafe defaults and supply chain (what the published package contains, install scripts, pinned release workflow) |
| Game | The API list for an online backend; otherwise the mechanical checks only |

**Mechanical checks (free, default)**

| Check | How |
|---|---|
| Known vulnerabilities | Every **locked** dependency version (direct and transitive) queried against OSV.dev — one API for npm, PyPI, crates.io, pub.dev and more, Node.js built-ins only; severity from the advisory, the fixed version named. Offline or rate-limited: "not checked", never a pass. |
| Secrets | gitleaks over the working tree and the whole git history; a secret found only in history still fails (rotate it — removing the commit isn't enough). |
| Safety nets | The security gaps from `ANALYSE --gaps`: secret scanning in hooks and CI, dependency updates, CI actions pinned to a SHA, `.env*` git-ignored, lockfile committed. |
| Data access | When the database is exposed through an API (e.g. Supabase): every table in the migrations has row-level security enabled and at least one policy; tables holding personal data per the threat model are named in the finding. |
| Threat model vs code | `SEC-` mitigations whose enforcing file, policy or test no longer exists; containers, routes, tables or LLM tools added since the threat model's date that it doesn't mention. |
| Static analysis (optional) | Semgrep, when installed, with its default ruleset; findings limited to the project's own code. Not installed: a note saying how to install it (not a warning — it is optional). |

The only data that leaves the machine is the locked packages' names and versions, sent to OSV.dev (and Semgrep's ruleset download); `--offline` skips both, and the dependencies are then "not checked".

**Judgement review (`--deep`, costs money, `--max-cost` required).** The project's `security-reviewer` — or a read-only `security-auditor` shipped with the plugin when the project has none — reviews the whole codebase area by area, in the order of the threat model's trust boundaries, against the framework and the `SEC-` risks: access control on every route and handler, injection, authentication and sessions, input validation at boundaries, secrets and personal data in logs and errors, SSRF, unsafe deserialisation; for AI projects prompt injection reaching tools, unchecked model output and excessive agency. Every finding cites `file:line`, the framework or `SEC-` ID, the evidence and a concrete fix. A second, independent pass tries to disprove each finding before it is reported; findings it disproves or whose cited code doesn't exist are dropped.

**Output**

- **Findings:** severity (critical, high, medium, low), status (`open`, `accepted`), evidence, fix and a stable fingerprint, in `.keelwright/security/audit.md` (and `audit.json`) with a dated history. The folder **git-ignores itself** (its own `.gitignore` is `*`), so the doctor never has to edit the project's `.gitignore` — open findings in a committed file disclose the vulnerabilities, worst of all in a public repository. `.keelwright/doctor.md` keeps only the counts per severity, so the trend is still committed. One secret carried through several commits is one finding.
- **Accepted risks:** `.keelwright/security-accepted.json` (committed) holds each accepted finding's fingerprint, the reason, who accepted it, when, and an end date at most 90 days later (a later one is cut to 90 days), after which it comes back as `open`.
- **Area result:** fail on any open critical or high finding or any leaked secret; warn on medium or low findings or a check that couldn't run (Semgrep missing excepted); pass otherwise.
- **Fixes** go through audit mode (7.4) as diffs approved one by one; dependency upgrades follow the version policy (4.6, an ADR for a new major). With Jira linked (5.6), critical and high findings become Jira issues when the user asks, labelled `security`; they are never published to Confluence.
- **Limits:** the report says plainly that it is not a penetration test and doesn't cover the deployed infrastructure.

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
| Time per step and time at each gate | step started / completed, gate approved | Where the run is slow or the review is heavy. When every output was written before the step was started, the time is reported as "not measured" and `complete` warns |
| **Edit size per document at each gate** — lines added / removed between what the step generated and what the user approved | gate approved (compared with a snapshot taken at completion; the front-matter `status:` line that approval itself sets is left out) | **The main quality signal**: how much the user had to rewrite |
| Open `[NEEDS CLARIFICATION]` markers at review and at approval | step completed, gate approved | Open questions left, and how many the gate resolved |
| Edits accepted after approval, and steps regenerated because of them | accept-changes | Upstream decisions that didn't hold |
| Step-specific counters (e.g. questions asked, interview rounds, document-check failures before passing) | reported by the step | Step behaviour worth tracking |

Snapshots for the edit comparison live in `.keelwright/snapshots/` only until the gate is approved.

**Report.** `/kickoff report` summarises the metrics as a scorecard and asks the user to rate each generated document: **used as-is**, **small edits**, **rewritten**, or **deleted**. The report is written to `.keelwright/report.md`.

**Follow-up.** A few weeks into the project, the user re-rates the documents (still current and used, or stale / ignored) — the same check `/adopt` audit mode later automates (7.6).

### 8.3 Evaluation suite

An automated suite in the plugin's `evals/` folder (`node evals/run.mjs`; details in `evals/README.md`):

- **Runner:** each run starts a headless Claude Code session (`claude -p`) with the plugin, in a temporary folder outside the repository; it answers the interview from the case and approves gates up to the case's stop gate.
- **Cases:** a project description, scripted interview answers, a stop gate and the expected results. The first three cover frontend rules 1, 3 and 5: the personal website test project, a SaaS app with logins and stored data, and an internal dashboard behind a login. One case per other project type follows — a mobile app with offline use, a browser game, an AI assistant with tools, and a command-line tool — each checking the type, the main decision, the toolchain and the type-specific documents.
- **Runs per case:** 3 by default, because outputs vary between runs; each grader's score is its pass rate, compared with a threshold (default 67%).
- **Code graders (deterministic):** `doccheck` passes for every document; the expected project type, main stack decision and rule, toolchain and document set; listed documents are written; ADRs cite requirement IDs; versions are stable, published on the toolchain's registry and either the newest or explained in an ADR; the run reached its stop gate.
- **Model judges (one pass / fail question each, 3 votes, majority wins):** invented facts in the PRD; interview questions the input already answered. Earlier results can be re-graded without new runs (`--regrade`), so grader changes cost only the judge calls.
- **Why a custom runner, not `claude plugin eval`:** at Claude Code 2.1.325 `claude plugin eval` runs a single prompt and has no script or exit-code grader, while KeelWright needs several turns (interview answers, gate approvals) and deterministic graders. A no-plugin baseline arm through `claude plugin eval` can be added later.

**When it runs** — runs cost money (about $1.60 per run to gate 1), so the suite is tiered:

| When | What |
|---|---|
| Every pull request | Unit tests only (free) |
| Pull requests with the `evals` label | Smoke: every case once, to gate 1. CI suggests the label when steps, templates, reference rules, document checks or eval cases changed |
| Weekly, on `main` | Full suite — catches drift from model updates and registry changes even when the code didn't change |
| Before a release | Full suite, recorded in `evals/scoreboard.md` |

Every run has a cost limit (`--max-cost`); CI needs `ANTHROPIC_API_KEY` or `CLAUDE_CODE_OAUTH_TOKEN` as a secret and skips the evals without one.

### 8.4 The improvement loop

1. Each real run gets a record in `evals/runs/YYYY-MM-DD-<project>.md`: the report, the ratings and the findings.
2. Each finding becomes a GitHub issue.
3. Each fix adds a check: a `doccheck` rule when it can be checked mechanically, otherwise an eval case or judge — so the same problem can't return unnoticed.
4. Scores per release are tracked in `evals/scoreboard.md`.

Examples from building the steps:
- Three runs produced PRDs of 2,950, 2,450 and 2,350 words against a 1–3 page target; prose guidance didn't fix it, so the length limit became a `doccheck` rule the step must pass (1,798 words on the next run).
- The first eval run's invented-facts judge caught the PRD inventing a backstory for the problem statement; the `prd` step now takes the problem only from the input and marks missing evidence as an open question.
- The judges then caught invented user context in 2 of 3 cases ("mostly desktop, a few sessions per month") — the template's Context column invited guessing; the `prd` step now fills it only from the input and writes `—` otherwise. The next run passed.
- A single judge vote once concluded "pass" in its reasoning but returned "fail"; judges now reason first and vote three times.

## 9. Roadmap

| Phase | Scope |
|---|---|
| **1 — MVP** | The complete `/kickoff` pipeline (5.1): all steps, review gates and the state file (5.1.2); every project type (4.4) with stack recommendation (4.5) and live version resolution (4.6); the full document catalog (6.0); research step with stack packs, shipping the default web stack and Astro first (5.4); scaffold (5.5); generator with CLAUDE.md, rules, skills, hooks, CONTRIBUTING.md and the three subagents (5.3); optional Jira / Confluence output. Run metrics and the evaluation suite (8.2–8.4). Validated by a run on one real project (8.1). |
| **2** | `/adopt` create mode. |
| **3** | The doctor (7.0) with the security audit (7.7); the threat model and the generated `security-reviewer` (5.3); `/start` (5.0) with audit mode (7.4) as its route for projects with a Claude setup; profiles (5.7). |
| **4** | Visual app on top of the plugin engine (headless Claude Code / Agent SDK); the doctor's history is its first view. |

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
10. Run on the real test project; record it in `evals/runs/` and feed the findings back (8.4). Done: `evals/runs/2026-11-17-portfolio-26.md`.

**Phase 2 build order** (`/adopt` create mode, 5.2.1)

1. `analyse`: the facts script (`scripts/analyse.mjs`) with tests, the step and the analysis template.
2. `/adopt` entry point: mode detection, the adopt pipeline in the state CLI, gates, status and report.
3. `document` and `research` for existing projects.
4. `gaps`, and `generate` reading the analysis (the project's own commands and conventions); `publish` (Confluence) for adopted projects.
   - 4.1 Workspace repos adopted as one project (found preparing the real run: the target repository is a `frontend/` + `backend/` npm workspace repo).
5. Evaluation cases on fixture repositories, including a grader that every cited file exists: `adopt-orders-api`, `adopt-etl-python`, `adopt-workspace-app` (`evals/README.md`), with graders for cited files, untouched code, planted conventions and gaps, versions in use, the ADR folder, retroactive ADRs and pack majors.
6. Run on a real repository without a Claude setup; record it in `evals/runs/` and feed the findings back. Done: `evals/runs/2026-11-18-esn-fm.md`.

**Phase 3 build order**

1. Doctor, mechanical checks only: `scripts/doctor.mjs` reusing the existing checkers, `.keelwright/doctor.md` with history, `/keelwright:doctor`; tested on the esn-fm adoption and on a project with a hand-made Claude setup.
   - Built first: setup, docs vs code, stack (offline: pack majors vs the lockfile, pack age, end of life as recorded by `gaps`), tooling and security, process (commit style, hooks installed). Next: delivery (PRD requirements without stories, stories without tests), stack checks against the registries (`versions.mjs`, a new major, end-of-life dates), CI pass rate.
   - 1.1 The security audit's mechanical checks (7.7): OSV lookup of the locked versions, gitleaks over history, the security gaps, RLS in migrations, the optional Semgrep run; `/keelwright:doctor security`; `.keelwright/security/` git-ignoring itself and `security-accepted.json` with expiry. Built first: all of these; the threat model vs code check comes with the threat model (step 2).
2. Security reviewer: the `threat-model` catalog key and template, written by `architecture` (`/kickoff`) and `document` (`/adopt`, as built) with a `doccheck threat-model` (length, `SEC-` IDs, every cited file exists); `reference/security.md` with the framework editions; the `security-reviewer` agent, `security-review` skill and `.claude/rules/security.md` in `generate`, the hand-off from `implement-story` / `implement-change`; `generatecheck` checks for them. Changes `scripts/lib/pipeline.mjs`, both commands and 5.1.2 / 5.2.1 / 6.0 together. Built, with the threat model vs code check of 7.7; `doccheck threat-model` requires existing files only for `mitigated` and `open` risks, since `/kickoff` writes its risks as `planned` before the code exists.
3. `/start`: the routing in the preflight, the command, `/kickoff` and `/adopt` kept as overrides.
4. Audit mode: the doctor's findings as fixes, approved one by one (7.4); `/start`'s route for a project with a Claude setup.
5. The security audit's judgement review (`--deep`, 7.7): area-by-area review, the disproving second pass, the plugin's `security-auditor` for projects without a `security-reviewer`, Jira issues for critical and high findings on request.
6. Profiles: `/keelwright:profile`, role-tagged questions, working sets at gates, in the report and in the doctor; pm-skills offered to the PM profile.
7. Evaluation cases for routing, the doctor (planted drift), role-tagged questions and security: a fixture repository with planted vulnerabilities (an injectable query, a table without RLS, a hard-coded key in history, a dependency with a known advisory, a route missing its role check), graded on each one found, no finding citing missing code, and the threat model naming the planted surface; a run on a real repository with a Claude setup.

## 10. Open questions

- **Account manager profile** — what they need from KeelWright (being researched with account managers).
- **Static analysis** — Semgrep as an optional tool (7.7), or also offered as a gap for projects without one; its community rules' licence allows local use, to be confirmed for anything hosted (Phase 4).
- **Security findings at gates** — whether an open critical finding should block `/kickoff publish` or only be shown.

Name decided: **KeelWright** — a wright is a builder; a keel is what keeps a vessel stable and on course.
