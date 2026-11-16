---
status: proposed         # proposed | accepted | rejected | deprecated | superseded by ADR-NNNN
date: YYYY-MM-DD
decision-makers: <names>
---

# NNNN. <Problem and chosen solution, e.g. "Use Astro for the public site">

<!--
Rules for this document:
- One decision per ADR. Target length: one page.
- Write one for decisions that are hard to reverse or span components
  (framework, database, auth, hosting, deviations from the default stack).
  Skip trivial ones (formatter, small libraries).
- File: docs/decisions/NNNN-title-with-dashes.md. Numbers are sequential and never reused.
- Once accepted, never edit. To change a decision, write a new ADR that supersedes this one.
-->

> **In the context of** <situation>, **facing** <concern>, **we decided for** <option>
> **and against** <alternatives> **to achieve** <benefit>, **accepting that** <drawback>.

## Context and problem statement

<!-- The forces at play: requirements (link PRD IDs), constraints, what triggered the decision. -->

## Decision drivers

- <driver, e.g. "content must be in the initial HTML (FR-004)">

## Considered options

1. <option A>
2. <option B>
3. <option C>

## Decision outcome

Chosen option: **<option>**, because <reason tied to the drivers>.

### Consequences

- Good: <benefit>
- Bad: <cost or limitation>

### Confirmation

<!-- How compliance is checked: lint rule, hook, test, code review, audit check. -->

## Pros and cons of the options

<!-- Optional. Keep to a few bullets per option. -->

### <option A>
- Good: <…>
- Bad: <…>

## More information

<!-- Links, related ADRs, and when to re-evaluate (e.g. "revisit if traffic exceeds X"). -->
