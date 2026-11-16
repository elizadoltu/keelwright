# Step: `features`

Plan delivery: the feature breakdown as a story map with slices, and the backlog that keeps everything deferred visible.

**Reads:** `docs/prd.md`, `.keelwright/interview.md`, `docs/architecture/overview.md` if it exists (risks and technical debt), the state's document set, `<plugin root>/reference/catalog.md`, and the templates `feature-breakdown.md` and `backlog.md`. On a re-run: the existing outputs.
**Produces:** `docs/features.md` (if `feature-breakdown` is in the document set) and `docs/backlog.md` (always).
**Gate:** Gate 2, shared with `architecture` and `design`.

The PRD's stories and priorities are the source of truth. This step organises them; it doesn't add scope. A feature that no story covers is not invented here — it goes to the backlog's "Ideas" or becomes an open question.

## 1. Feature breakdown (if in the document set)

From `templates/feature-breakdown.md`:

- **Activities (`A-`)** — 3–7 steps of the user's journey, in order, across all audiences. For products with separate audiences, the activities can be per audience (e.g. "Find a ski instructor", "Read the blog") — keep the backbone readable left to right.
- **Features (`F-`)** — each groups stories (`US-`) under one activity. Every PRD story belongs to exactly one feature; every feature has at least one story.
- **Slices:**
  - **Now — walking skeleton (MVP):** the P1 stories. It must let each audience complete its whole journey end to end, thinly — not one activity built fully and others missing.
  - **Next:** P2 stories. **Later:** P3 stories.
  - The outcome of each slice in one sentence: what a user can do at the end of it.
- **Dependencies** — only real ones (a feature needs another to exist first), as a Mermaid flowchart. No diagram if there are none; say so.
- **Feature table** — status `planned` for all, slice from the story priorities, `Depends on` from the dependencies.
- Open questions: any open PRD question that changes slicing.
- At most 1,200 words.

## 2. Backlog (always)

From `templates/backlog.md`:

- **Deferred items (`BL-`)** — everything deliberately not in the MVP: P2 / P3 stories (one item per feature or story), and the PRD's non-goals that are "not now" rather than "never". Each item has its source (`F-` or `US-`), why it was deferred, a concrete **revisit when** trigger (an event or a number, not "later"), and a size S / M / L.
- **Ideas** — things mentioned in the input or interview that no story covers.
- **Known technical debt (`TD-`)** — the risks and debt listed in the architecture overview, plus anything deliberately simplified for the MVP (e.g. no automated content backup). If the overview lists debt without IDs, add the `TD-` IDs to its "Risks and technical debt" lines.
- **Rejected** — PRD non-goals that are "never", with the reason, so they aren't proposed again.

## 3. Check

Run, fix every issue, and run again until it passes (count each failed run with `STATE metric features doccheck-failures +1`):

`node "<plugin root>/scripts/doccheck.mjs" features:docs/features.md docs/backlog.md refs:docs`

Also check by hand: every `US-` in the PRD appears in exactly one feature; the "Now" slice contains exactly the P1 stories.

## 4. Finish

`STATE complete features docs/features.md docs/backlog.md` (and `docs/architecture/overview.md` only if this step added `TD-` IDs to it — otherwise leave it out).

## Gate summary

Show, besides the generic gate content: the slices with their one-line outcomes, and the number of deferred items, ideas, debt items and rejected items.

## On approval

Set `status: approved` in `docs/features.md`. The backlog keeps `status: living`.
