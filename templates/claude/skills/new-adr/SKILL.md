---
name: new-adr
description: Record an architecture decision as a new ADR in docs/decisions/, including superseding an accepted one. Use when choosing or changing a framework, library, service, data model, hosting or any hard-to-reverse approach, or when asked to change something an accepted ADR decided.
---

# Write an ADR

1. **Number**: the highest number in `docs/decisions/` plus one, four digits. File: `docs/decisions/NNNN-<decision-in-a-few-words>.md`.
2. **Structure**: the same as the existing ADRs (front matter `status`, `date`, `decision-makers`; summary sentence; context; drivers; options; outcome; consequences; confirmation). One decision, one page.
3. **Drivers cite requirements** (`US-`, `FR-`, `NFR-`, `SC-`) — a decision without a requirement behind it is probably not needed.
4. **Status** `proposed` until the user accepts it; then `accepted`.
5. **Superseding**: the new ADR names the ADR it replaces in its context (e.g. "Supersedes ADR-0002"); then change only the old ADR's status line to `superseded by ADR-<new number>` (the guard hook allows exactly that). Never edit an accepted ADR's content.
6. **Index**: add the ADR to the decisions table in `docs/architecture/overview.md`.
