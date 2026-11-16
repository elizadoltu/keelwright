# Step: `generate`

> **Not implemented yet.** This step is added in Phase 1 build step 7 (spec section 9). Tell the user, don't change the state, and stop.

## Purpose

Generate the project-specific agent workflow from the documents and the stack packs.

## Produces

- `CLAUDE.md`, `.claude/rules/`, `.claude/skills/`
- `.claude/agents/reviewer.md`, `tester.md`, `docs-keeper.md`
- Hooks (Claude Code hooks and Husky / CI enforcement)
- `CONTRIBUTING.md`
- A short summary of everything generated, for the user

## Gate

None (final summary only).

## Spec

5.3, 6.0
