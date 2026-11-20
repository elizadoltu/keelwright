---
status: draft            # draft | approved
date: YYYY-MM-DD
owner: <name>
documents:               # document set chosen from the KeelWright catalog (keys = catalog keys, spec 6.0)
  - prd
  - adr
  - backlog
  - development-workflow
---

# PRD: <Product or feature name>

<!--
Rules for this document:
- Describes WHAT and WHY. The HOW (stack, architecture) lives in ADRs and CLAUDE.md.
- Keep IDs stable (SC-, US-, FR-, NFR-). Never renumber; mark removed items as "dropped".
- Every requirement must be testable. Unknowns go in Open questions, not guesses.
- Target length: 1–3 pages.
-->

## Summary

<!-- 2–3 sentences: what is being built, for whom, and the outcome. -->

## Problem and why now

<!-- The problem in the user's terms, evidence for it, and why it matters now. -->

## Goals and success metrics

| ID | Goal | Metric | Target |
|---|---|---|---|
| SC-001 | <outcome> | <how it's measured> | <number / threshold> |

## Non-goals

<!-- Things that could reasonably be goals but are deliberately excluded. -->

- <non-goal>

## Users

| User type | Need | Context |
|---|---|---|
| <who> | <what they need> | <device, frequency, skill level> |

## User stories

<!-- Priority P1 = MVP, P2 = next, P3 = later. Each P1 story must be shippable and testable on its own. -->

### US-1 [P1] <short title>

As a <user>, I want <capability> so that <benefit>.

**Acceptance criteria**
- WHEN <trigger> THE SYSTEM SHALL <response>.
- Given <context>, when <action>, then <result>.

## Functional requirements

| ID | Requirement | Story | Priority |
|---|---|---|---|
| FR-001 | The system shall <behaviour>. | US-1 | P1 |

## Non-functional requirements

| ID | Category | Requirement |
|---|---|---|
| NFR-001 | Performance | <e.g. LCP < 2.5 s on 4G> |
| NFR-002 | Security | <e.g. no secrets in client bundle> |
| NFR-003 | Accessibility | <e.g. WCAG 2.2 AA> |

## Technical constraints

<!-- Constraints only, not design. The recommended stack and its versions go here as a summary, with links to the ADRs that justify them. -->

- Platforms: <web / iOS / Android / desktop>
- Stack: <summary> — see ADR-0002
- Versions resolved on: YYYY-MM-DD

## Assumptions and risks

| Type | Description | Mitigation |
|---|---|---|
| Assumption | <what we believe is true> | <how to verify> |
| Risk | <what could go wrong> | <plan> |

## Open questions

- [NEEDS CLARIFICATION (<dev|pm|ba|am — the role that can answer>): <question>]

## Release plan

<!-- Summary only. If docs/features.md exists, the slices there are the detail; this table links to them. Deferred items go to docs/backlog.md. -->

| Release | Scope |
|---|---|
| MVP | US-1, US-2 |
| Later | US-3 |
