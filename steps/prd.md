# Step: `prd`

Write the PRD — what the product does and why — and propose the document set. **No technical choices**: the stack is the tech lead's decision, made in the `architecture` step (spec 5.7), so a project manager or business analyst running this step never sees a stack, a framework or a version.

**Reads:** the project input, `.keelwright/interview.md`, `docs/client/brief.md` if it exists (the client brief), `<plugin root>/reference/catalog.md`, and the templates `prd.md` and `adr-0001-record-architecture-decisions.md`. On a re-run: the existing `docs/prd.md`.
**Produces:** `docs/prd.md`, `docs/decisions/0001-record-architecture-decisions.md`; the document set in the state.
**Gate:** Gate 1 — the user confirms the PRD and the document set.

The input and the interview are the source of truth. If the user edited `.keelwright/interview.md`, their version wins. **For a client project, the client brief is the agreement**: its exclusions are non-goals, its deadline shapes the release plan, its sign-off people are stakeholders. The PRD doesn't repeat the commercial frame, and never contradicts the brief — a requirement that goes beyond the agreed scope is an open question for the client, `[NEEDS CLARIFICATION (am): …]`.

## 1. Requirements first

The stack follows from the requirements, so the requirements must be complete enough for the tech lead to choose it — platforms, data, scale, integrations, privacy — without naming any technology:

- **Problem and why now** — only what the input or interview says. Don't invent a backstory, a current pain or evidence; if the input gives none, state the need plainly and add `[NEEDS CLARIFICATION: what prompted this, and how it's handled today]`.
- **Users** — one row per audience. Separate audiences with separate needs get separate stories. Need and context only as far as the input or interview says — don't guess who the visitors are, which devices they use or how often they come; write `—` for what isn't known, or `[NEEDS CLARIFICATION: …]` when it changes a requirement.
- **Goals and success criteria (`SC-`)** — measurable. If the user gave no number, propose a sensible target and list it as "proposed by KeelWright" in the gate summary.
- **User stories (`US-`)** with priorities: **P1 = MVP**, P2 = next, P3 = later. Each P1 story is shippable and testable on its own. Acceptance criteria in `WHEN … THE SYSTEM SHALL …` or Given / When / Then — concrete enough to become an E2E test.
- **Functional requirements (`FR-`)** — each traces to a story.
- **Non-functional requirements (`NFR-`)** — measurable: performance (e.g. LCP < 2.5 s on 4G; app start < 2 s; 60 fps; p95 latency), accessibility (WCAG 2.2 AA), SEO / AI-search (content in the initial HTML, sitemap, metadata), security and privacy (for AI: what data may reach the model provider), compatibility (supported OS, runtime or engine versions). Only those that apply.
- **Non-goals** — the input's out-of-scope items, plus anything the interview ruled out.
- **Assumptions and risks** — labelled as such in their table, each with how to verify or mitigate it; never stated as facts elsewhere in the PRD.
- **Open questions** — every unresolved point as `[NEEDS CLARIFICATION (<role>): …]`, tagged with the role that can answer it (`pm`, `ba`, `am`, `lead`, `design`, `dev`; untagged when anyone can). Technical questions from the interview (hosting, an existing system to integrate with) are tagged `lead`: the tech lead answers them in the `architecture` step.

**Length: 1–3 pages — at most about 1,800 words, tables included.** To stay within it:
- Merge stories that serve the same user goal; 2–4 acceptance criteria per story, the ones a test would check first. Story text is one sentence.
- Functional requirements **don't repeat the acceptance criteria**: one short line per capability, pointing to its story. The acceptance criteria hold the detail.
- Assumptions, risks and open questions: one line each.
- **Every** acceptance criterion is in `WHEN … THE SYSTEM SHALL …` or Given / When / Then form — no plain statements.
- Leave detail that belongs to later documents out: page lists and navigation (architecture / features), field lists, colours and copy (design). Note them as open questions if the user still has to decide.

The PRD says **what and why**. It names no framework, service or version — only constraints that come from the requirements or the user (platforms; "must run on our existing Azure account" if the user said so). Project documents must stand on their own: state a rule in words (e.g. "content-first, mostly static site → Astro") rather than referring to KeelWright rule numbers alone.

## 2. Document set

Apply the conditions in `reference/catalog.md` to this project. For **each** catalog document, decide included or not, with a one-line reason tied to the requirements (e.g. "`erd` — not included: nothing is stored; the contact form sends email (FR-007)"). Optional documents (`jira`, `confluence`, `architecture-requirements`) only if the user asked.

Record it: `STATE set documents <comma-separated keys>` — keep `client-brief` when the `brief` step added it. The same keys go into the PRD's `documents:` front matter.

## 3. Write the documents

Follow the template rules in `reference/catalog.md` (keep structure and IDs; remove instruction comments and placeholder rows).

**`docs/prd.md`** from `templates/prd.md`:
- Front matter: `status: draft`, today's date, `owner` from the profile's name (the command passes it), the input or the interview (else `[NEEDS CLARIFICATION (pm): owner]`), `documents:` = the chosen keys.
- Technical constraints: platforms and the constraints the user gave, nothing else; the stack line says it is chosen in the architecture step (ADR-0002).
- Release plan: MVP = the P1 stories; later releases = P2 / P3. Items deliberately left out go to the backlog in the `features` step — list them under Non-goals or later releases here.

**`docs/decisions/0001-record-architecture-decisions.md`** from `templates/adr-0001-record-architecture-decisions.md`: fill in date, decision-makers and the product name only. Its status is `accepted`.

Before writing a file that already exists (a re-run), read it and keep the user's edits. Accepted ADRs are never edited; supersede them with a new ADR.

## 4. Finish

1. Run the document check and fix every issue it reports, then run it again until it passes:
   `node "<plugin root>/scripts/doccheck.mjs" prd:docs/prd.md adr:docs/decisions/0001-record-architecture-decisions.md`
   It checks length, leftover template placeholders, acceptance-criteria form and that every `FR-` traces to an existing story. To get under the word limit, tighten — merge stories, shorten requirements, cut repetition — never drop requirements or open questions.
   Count each failed run: `STATE metric prd doccheck-failures +1`.
2. `STATE complete prd docs/prd.md docs/decisions/0001-record-architecture-decisions.md` — the files, not the `docs/decisions` folder: later steps add ADRs there, and that must not count as an edit to this step's output.
3. The review gate follows. In the gate summary, besides the generic gate content, show:
   - the document set: included, and excluded with reasons — in plain words for a non-technical reader ("a data model, because bookings are stored"), naming who writes each part (the tech lead, the designer);
   - values KeelWright proposed that the user didn't give (targets, defaults) — so they can confirm or change them.

## On approval

When gate 1 is approved, before `STATE approve 1`:
- Set `status: approved` in `docs/prd.md`.
