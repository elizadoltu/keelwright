# Step: `prd`

Propose the document set, choose and right-size the stack with versions resolved live, and write the PRD and the first ADRs.

**Reads:** the project input, `.keelwright/interview.md`, `<plugin root>/reference/catalog.md`, `<plugin root>/reference/web-stack.md`, and the templates `prd.md`, `adr.md`, `adr-0001-record-architecture-decisions.md`. On a re-run: the existing `docs/prd.md` and `docs/decisions/`.
**Produces:** `docs/prd.md`, `docs/decisions/0001-record-architecture-decisions.md`, `docs/decisions/0002-<frontend decision>.md`, one ADR per other deviation from the defaults; the document set and stack in the state.
**Gate:** Gate 1 — the user confirms the PRD, the document set and the stack.

The input and the interview are the source of truth. If the user edited `.keelwright/interview.md`, their version wins.

## 1. Requirements first

Draft the PRD's content in your head before choosing anything technical — the stack must follow from the requirements, not the other way round:

- **Users** — one row per audience. Separate audiences with separate needs get separate stories.
- **Goals and success criteria (`SC-`)** — measurable. If the user gave no number, propose a sensible target and list it as "proposed by KeelWright" in the gate summary.
- **User stories (`US-`)** with priorities: **P1 = MVP**, P2 = next, P3 = later. Each P1 story is shippable and testable on its own. Acceptance criteria in `WHEN … THE SYSTEM SHALL …` or Given / When / Then — concrete enough to become an E2E test.
- **Functional requirements (`FR-`)** — each traces to a story.
- **Non-functional requirements (`NFR-`)** — measurable: performance (e.g. LCP < 2.5 s on 4G), accessibility (WCAG 2.2 AA), SEO / AI-search (content in the initial HTML, sitemap, metadata), security and privacy. Only those that apply.
- **Non-goals** — the input's out-of-scope items, plus anything the interview ruled out.
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

Follow `reference/web-stack.md`:

1. **Frontend:** go through the selection rules in order and stop at the first match. Note the rule number and why it matched; note why the earlier rules didn't.
2. **Right-size every layer** of the defaults: keep / remove / swap / add, each with a reason that cites requirement IDs. Dynamic features in a mostly static site (a contact form, a newsletter) are handled inside the chosen framework (server endpoints / functions) or by a service — compare at least two options for each and recommend one.
3. **Conventions:** say which of Clean Architecture, Atomic Design and Humble Object apply and at what scale.
4. **Resolve versions** for everything the scaffold will install directly:
   `node "<plugin root>/scripts/versions.mjs" node <npm packages…> github:gitleaks/gitleaks`
   Handle the peer report as `reference/web-stack.md` describes; re-run until there are no conflicts. Never write a version that didn't come from the script.
5. Record the stack: `STATE set stack '<json>'` with `resolvedAt`, `frontend` (`{ "choice", "rule" }`), `layers` (`{ layer: { "decision": "keep|remove|swap|add", "choice", "reason" } }`) and `versions` (`{ name: version }`).

If an open question blocks a stack decision (e.g. whether a form must store submissions), choose the option that keeps the most doors open at the lowest cost, write the question as `[NEEDS CLARIFICATION: …]`, and say in the ADR what changes if the answer goes the other way.

## 4. Write the documents

Follow the template rules in `reference/catalog.md` (keep structure and IDs; remove instruction comments and placeholder rows).

**`docs/prd.md`** from `templates/prd.md`:
- Front matter: `status: draft`, today's date, `owner` from the input or interview (else `[NEEDS CLARIFICATION: owner]`), `documents:` = the chosen keys.
- Technical constraints: platforms; a one-paragraph stack summary linking the ADRs; a table of every resolved package and version; "Versions resolved on: <date>".
- Release plan: MVP = the P1 stories; later releases = P2 / P3. Items deliberately left out go to the backlog in the `features` step — list them under Non-goals or later releases here.

**`docs/decisions/0001-record-architecture-decisions.md`** from `templates/adr-0001-record-architecture-decisions.md`: fill in date, decision-makers and the product name only. Its status is `accepted`.

**`docs/decisions/0002-<frontend-decision>.md`** from `templates/adr.md`, e.g. `0002-use-astro-for-the-website.md`:
- Status `proposed`. Drivers cite requirement IDs. Considered options: the chosen framework and the 1–2 strongest alternatives from the rules. The outcome names the rule that matched.
- Confirmation: how the decision is checked later (e.g. "build output is static HTML for every public route").

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
   - the recommended stack in one line per layer (keep / remove / swap / add), and the frontend rule that matched;
   - the document set: included, and excluded with reasons;
   - values KeelWright proposed that the user didn't give (targets, defaults) — so they can confirm or change them.

## On approval

When gate 1 is approved, before `STATE approve 1`:
- Set `status: approved` in `docs/prd.md`.
- Set `status: accepted` in every ADR this step wrote that is still `proposed`, unless the user rejected it (then `rejected`, and the PRD and stack are updated first).
