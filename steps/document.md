# Step: `document`

`/adopt` create mode (spec 5.2.1): record the project as built — the architecture overview, ADR-0001 and ADRs recorded retroactively for the main decisions already in the code.

**Reads:** `.keelwright/analysis.md` (approved at gate 1), the existing ADRs and docs.
**Produces:** `docs/architecture/overview.md`, `docs/decisions/0001-record-architecture-decisions.md` (unless the project already records decisions), one ADR per decision in the analysis's "Decisions in the code" that has none.
**Gate:** 2 — shared with `research`.

Not implemented yet (Phase 2, build step 3).
