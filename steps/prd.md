# Step: `prd`

> **Not implemented yet.** This step is added in Phase 1 build step 3 (spec section 9). Tell the user, don't change the state, and stop.

## Purpose

Propose the document set from the catalog and write the PRD, including the stack recommendation (right-sized defaults for web, frontend selection rules, 2–3 candidates for other types) with versions resolved live from the registries. Seed ADR-0001 and write the stack ADR.

## Produces

- `docs/prd.md`
- `docs/decisions/0001-record-architecture-decisions.md`
- `docs/decisions/0002-<stack decision>.md` and an ADR for every deviation from the defaults
- Document set recorded with `STATE set documents <keys>`; resolved versions with `STATE set stack '<json>'`

## Gate

Gate 1 — the user confirms the PRD, the document set and the stack.

## Spec

4.1–4.7, 5.1, 6.0, 6.1
