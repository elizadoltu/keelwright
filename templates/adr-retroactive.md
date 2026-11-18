---
status: proposed         # proposed until gate 2, then accepted
date: YYYY-MM-DD         # the date it was recorded, not when it was decided
decision-makers: <names, or "unknown — recorded from the code">
---

# NNNN. <The decision as it stands, e.g. "Use PostgreSQL through Prisma">

<!--
Rules for this document (spec 5.2.1, `document` step):
- Records a decision ALREADY MADE and visible in the code. It describes; it doesn't re-decide.
- One decision per ADR, from a D- row of `.keelwright/analysis.md`. Target length: half a page.
- Evidence: cite the files that show the decision, in backticks. Every cited file must exist.
- Don't invent the history: who decided, when, and which alternatives were weighed are only written
  when the README, docs, commit messages or the user say so. Otherwise say they weren't recorded.
- File: the project's ADR folder and naming (`docs/decisions/NNNN-title-with-dashes.md` when there
  is none), numbered after the highest existing ADR.
-->

> **In the context of** <the project and what this part of it does>, **the project uses** <the decision>,
> **which gives it** <the benefit the code relies on>, **accepting that** <the cost or limit it brings>.

## Context

Recorded retroactively by KeelWright from the code on YYYY-MM-DD. <What the decision covers and what in the project depends on it.>

## Decision

<The decision as the code shows it, concretely: the technology and version in use, how it is wired in.>

Evidence:
- `<file>` — <what it shows>

## Consequences

- Good: <what the project gets from it, as the code shows>
- Bad: <limits, costs, or what it makes hard to change>

## Alternatives

<Only alternatives the README, docs, commit history or the user name. Otherwise:>
Not recorded — the decision predates this record.

## Confirmation

<How it is kept: the lockfile and manifest, a lint rule, a test, CI, review. Say if nothing enforces it.>
