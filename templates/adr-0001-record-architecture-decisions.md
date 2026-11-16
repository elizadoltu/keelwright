---
status: accepted
date: YYYY-MM-DD
decision-makers: <names>
---

# 0001. Record architecture decisions in ADRs

<!--
Seeded by KeelWright as docs/decisions/0001-record-architecture-decisions.md in every project.
Fill in the date and decision-makers only; the content is fixed.
-->

> **In the context of** starting <Product name>, **facing** the need to keep the reasoning behind
> important decisions available to people and AI agents, **we decided for** Architecture Decision
> Records in the repository **and against** a wiki or no record **to achieve** decisions that are
> versioned with the code and easy to find, **accepting that** writing them takes a little time.

## Context and problem statement

Decisions about the stack, architecture and deviations from defaults are made at the start of the
project and later. Without a record, the reasons are lost, decisions get re-argued, and AI agents
follow outdated assumptions.

## Decision outcome

We record architecture decisions as Markdown ADRs in `docs/decisions/`, following the KeelWright
ADR template (based on MADR).

- File name: `NNNN-title-with-dashes.md`. Numbers are sequential and never reused.
- Write an ADR for decisions that are hard to reverse or span components (framework, database,
  auth, hosting) and for every deviation from the default stack or conventions. Skip trivial ones.
- Statuses: `proposed`, `accepted`, `rejected`, `deprecated`, `superseded by ADR-NNNN`.
- **An accepted ADR is never edited.** To change a decision, write a new ADR that supersedes it and
  update the old one's status only.
- The architecture overview (`docs/architecture/overview.md`) keeps an index of all ADRs.

### Consequences

- Good: the reasoning behind each decision is versioned, reviewable in PRs and readable by agents.
- Bad: each significant decision takes a short write-up.

### Confirmation

- `CLAUDE.md` tells agents where ADRs live and that accepted ADRs are immutable.
- The `docs-keeper` subagent writes new ADRs and keeps the index in the architecture overview current.
- The `reviewer` subagent flags changes that contradict an accepted ADR.
