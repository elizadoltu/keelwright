# Step: `prd`

Propose the document set, choose and right-size the stack with versions resolved live, and write the PRD and the first ADRs.

**Reads:** the project input, `.keelwright/interview.md`, `<plugin root>/reference/catalog.md`, the stack rules for the project type (`<plugin root>/reference/<type>-stack.md`: `web`, `mobile`, `game`, `ai`, `library`), `<plugin root>/reference/toolchains.md`, and the templates `prd.md`, `adr.md`, `adr-0001-record-architecture-decisions.md`. On a re-run: the existing `docs/prd.md` and `docs/decisions/`.
**Produces:** `docs/prd.md`, `docs/decisions/0001-record-architecture-decisions.md`, `docs/decisions/0002-<stack decision>.md` (the frontend for web, the app framework, engine, model provider or language for the other types), one ADR per other deviation from the defaults; the document set and stack in the state.
**Gate:** Gate 1 — the user confirms the PRD, the document set and the stack.

The input and the interview are the source of truth. If the user edited `.keelwright/interview.md`, their version wins.

## 1. Requirements first

Draft the PRD's content in your head before choosing anything technical — the stack must follow from the requirements, not the other way round:

- **Problem and why now** — only what the input or interview says. Don't invent a backstory, a current pain or evidence; if the input gives none, state the need plainly and add `[NEEDS CLARIFICATION: what prompted this, and how it's handled today]`.
- **Users** — one row per audience. Separate audiences with separate needs get separate stories. Need and context only as far as the input or interview says — don't guess who the visitors are, which devices they use or how often they come; write `—` for what isn't known, or `[NEEDS CLARIFICATION: …]` when it changes a requirement.
- **Goals and success criteria (`SC-`)** — measurable. If the user gave no number, propose a sensible target and list it as "proposed by KeelWright" in the gate summary.
- **User stories (`US-`)** with priorities: **P1 = MVP**, P2 = next, P3 = later. Each P1 story is shippable and testable on its own. Acceptance criteria in `WHEN … THE SYSTEM SHALL …` or Given / When / Then — concrete enough to become an E2E test.
- **Functional requirements (`FR-`)** — each traces to a story.
- **Non-functional requirements (`NFR-`)** — measurable: performance (e.g. LCP < 2.5 s on 4G; app start < 2 s; 60 fps; p95 latency), accessibility (WCAG 2.2 AA), SEO / AI-search (content in the initial HTML, sitemap, metadata), security and privacy (for AI: what data may reach the model provider), compatibility (supported OS, runtime or engine versions). Only those that apply.
- **Non-goals** — the input's out-of-scope items, plus anything the interview ruled out.
- **Assumptions and risks** — labelled as such in their table, each with how to verify or mitigate it; never stated as facts elsewhere in the PRD.
- **Open questions** — every unresolved point as `[NEEDS CLARIFICATION: …]`. An open question that blocks a stack decision is called out at the gate.

**Length: 1–3 pages — at most about 1,800 words, tables included.** To stay within it:
- Merge stories that serve the same user goal; 2–4 acceptance criteria per story, the ones a test would check first. Story text is one sentence.
- Functional requirements **don't repeat the acceptance criteria**: one short line per capability, pointing to its story. The acceptance criteria hold the detail.
- Assumptions, risks and open questions: one line each.
- **Every** acceptance criterion is in `WHEN … THE SYSTEM SHALL …` or Given / When / Then form — no plain statements.
- Leave detail that belongs to later documents out: page lists and navigation (architecture / features), field lists, colours and copy (design). Note them as open questions if the user still has to decide.

The PRD says **what and why**; frameworks and services appear only in "Technical constraints", with links to ADRs. Project documents must stand on their own: state a rule in words (e.g. "content-first, mostly static site → Astro") rather than referring to KeelWright rule numbers alone.

## 2. Document set

Apply the conditions in `reference/catalog.md` to this project. For **each** catalog document, decide included or not, with a one-line reason tied to the requirements (e.g. "`erd` — not included: nothing is stored; the contact form sends email (FR-007)"). Optional documents (`jira`, `confluence`, `architecture-requirements`) only if the user asked.

Record it: `STATE set documents <comma-separated keys>`. The same keys go into the PRD's `documents:` front matter.

## 3. Stack

Follow the stack rules for the project type — `reference/<type>-stack.md`:

1. **The main decision** — web: the frontend (selection rules); mobile: the app framework; game: the engine; ai: the language and the model provider; library: the language and distribution. Go through the candidates in order and stop at the first match. Note the rule number and why it matched, and why the earlier rules didn't. For every type except web, also **compare 2–3 candidates** against the requirements (platforms, performance, team skills, cost, hosting or distribution, ecosystem maturity) and recommend one with the reasoning — this goes into ADR-0002 and the gate summary.
2. **Right-size every layer** of the type's defaults: keep / remove / swap / add, each with a reason that cites requirement IDs. A small dynamic feature (a contact form, a newsletter) is handled inside the chosen framework or by a service — compare at least two options and recommend one.
3. **Conventions:** say which of Clean Architecture, Atomic Design and Humble Object apply and at what scale (the type's rules say which usually do).
4. **Toolchain:** from the main decision (`reference/toolchains.md`): `node`, `python`, `dart`, `rust`, `godot` or `editor`.
5. **Resolve versions** for everything the scaffold will install directly, with the specs the type's rules list:
   `node "<plugin root>/scripts/versions.mjs" <runtime> <packages…> github:gitleaks/gitleaks`
   (runtimes: `node`, `python`, `flutter`, `rust`, `godot`, `unity`; packages: `npm:`, `pypi:`, `crates:`, `pub:`; tools released on GitHub: `github:<owner>/<repo>`). Handle the compatibility report as `reference/web-stack.md` describes ("Versions": conflict → hold back with an ADR; missing → add it or note it; unknown → check by hand); it covers npm peers, `engines.node`, `requires-python`, a crate's `rust-version` and a Dart package's SDK constraint. Re-run until there are no conflicts. Never write a version that didn't come from the script — except for software with no machine-readable release feed (Unreal Engine, Xcode, Android Studio): look it up on the official release notes and write the URL next to the version.
6. Record the stack: `STATE set stack '<json>'` with `resolvedAt`, `toolchain`, `primary` (`{ "choice", "rule", "compared": [<alternatives>] }`), `layers` (`{ layer: { "decision": "keep|remove|swap|add", "choice", "reason" } }`) and `versions` (`{ name: version }`, keyed by package name). For web, `primary.choice` is the frontend framework.

If an open question blocks a stack decision (e.g. whether a form must store submissions), choose the option that keeps the most doors open at the lowest cost, write the question as `[NEEDS CLARIFICATION: …]`, and say in the ADR what changes if the answer goes the other way.

## 4. Write the documents

Follow the template rules in `reference/catalog.md` (keep structure and IDs; remove instruction comments and placeholder rows).

**`docs/prd.md`** from `templates/prd.md`:
- Front matter: `status: draft`, today's date, `owner` from the input or interview (else `[NEEDS CLARIFICATION: owner]`), `documents:` = the chosen keys.
- Technical constraints: platforms; a one-paragraph stack summary linking the ADRs; a table of every resolved package and version; "Versions resolved on: <date>".
- Release plan: MVP = the P1 stories; later releases = P2 / P3. Items deliberately left out go to the backlog in the `features` step — list them under Non-goals or later releases here.

**`docs/decisions/0001-record-architecture-decisions.md`** from `templates/adr-0001-record-architecture-decisions.md`: fill in date, decision-makers and the product name only. Its status is `accepted`.

**`docs/decisions/0002-<stack-decision>.md`** from `templates/adr.md`, e.g. `0002-use-astro-for-the-website.md`, `0002-use-expo-for-the-app.md`, `0002-use-godot-4.md`, `0002-use-claude-for-answers.md`:
- Status `proposed`. Drivers cite requirement IDs. Considered options: the chosen option and the 1–2 strongest alternatives from the rules, compared on the criteria above. The outcome names the rule that matched.
- Confirmation: how the decision is checked later (e.g. "build output is static HTML for every public route"; "the eval plan's EV- thresholds pass with this model").

**One ADR per other deviation from the defaults**, numbered on from 0003, same template, status `proposed` — e.g. no custom backend, no database, how the contact form is handled, a held-back package version. Keep each to the decision; don't repeat the PRD.

Before writing a file that already exists (a re-run), read it and keep the user's edits. Accepted ADRs are never edited; supersede them with a new ADR.

## 5. Finish

1. Run the document check and fix every issue it reports, then run it again until it passes:
   `node "<plugin root>/scripts/doccheck.mjs" prd:docs/prd.md adr:<each ADR file>`
   It checks length, leftover template placeholders, acceptance-criteria form and that every `FR-` traces to an existing story. To get under the word limit, tighten — merge stories, shorten requirements, cut repetition — never drop requirements or open questions.
   Count each failed run: `STATE metric prd doccheck-failures +1`.
   Then check by hand: every version in the PRD matches the script output, and every ADR linked from the PRD exists.
2. `STATE complete prd docs/prd.md docs/decisions/0001-record-architecture-decisions.md <every other ADR file this step wrote>` — list the ADR files individually, not the `docs/decisions` folder: later steps add ADRs there, and that must not count as an edit to this step's output.
3. The review gate follows. In the gate summary, besides the generic gate content, show:
   - the recommended stack in one line per layer (keep / remove / swap / add), the rule that matched for the main decision and the alternatives it was compared with, and the toolchain;
   - the document set: included, and excluded with reasons;
   - values KeelWright proposed that the user didn't give (targets, defaults) — so they can confirm or change them.

## On approval

When gate 1 is approved, before `STATE approve 1`:
- Set `status: approved` in `docs/prd.md`.
- Set `status: accepted` in every ADR this step wrote that is still `proposed`, unless the user rejected it (then `rejected`, and the PRD and stack are updated first).
