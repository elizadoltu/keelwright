---
name: implement-story
description: Implement one user story (US-n) end to end — acceptance criteria to tests to code to passing checks. Use when asked to build, implement or start a story, feature or requirement from docs/prd.md.
---

# Implement a story

1. **Read the story** in `docs/prd.md`: its acceptance criteria, the `FR-` / `NFR-` it traces to, and its feature and slice in `docs/features.md`. If a criterion is ambiguous or marked `[NEEDS CLARIFICATION]`, ask before building.
2. **Check the decisions**: the routes and code structure in `docs/architecture/overview.md`, and any ADR that applies. If the story needs a different decision, stop and propose a new ADR (`new-adr` skill).
3. **Tests first**: one test per acceptance criterion, named after it (see the `tester` agent's rules). Run them and see them fail.
4. **Build** the smallest change that makes them pass, following `.claude/rules/` for the files you touch. <project-specific: e.g. "UI components with the new-component skill">
5. **Check**: `npm run check` and `npm run test:e2e` pass.
6. **Review**: ask the `reviewer` agent to review the change; fix what it finds. <only with a threat model:> When the change touches a sensitive path (<globs from `docs/security/threat-model.md`>), adds or upgrades a dependency, adds a migration or an LLM tool, then ask the `security-reviewer` agent (the `security-review` skill); fix what it finds.
7. **Docs**: if routes, data or decisions changed, ask the `docs-keeper` agent to update the documents (the threat model too, when there is one and an entry point, table, role or tool was added); set the feature's status in `docs/features.md`.
8. **Commit** with a Conventional Commit that names the story, e.g. `feat(ski): send lesson enquiries (US-3)`.
