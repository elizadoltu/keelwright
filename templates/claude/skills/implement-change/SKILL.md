---
name: implement-change
description: Implement one change to <project> end to end — understand it, test first, build, pass the project's checks, review, update the docs. Use when asked to fix a bug, add a feature, or work on an issue or ticket.
---

<!-- /adopt variant of implement-story: an adopted project has no PRD or story IDs. Fill in the
project's tracker (if the analysis or README names one), commands, test locations and conventions. -->

# Implement a change

1. **Understand it.** Read the issue or request; if it names a ticket (<the tracker, e.g. "GitHub issues", "Jira ORD-123">), read it. Find the code involved with the architecture overview (`docs/architecture/overview.md`) before searching. If the expected behaviour is unclear, ask before building.
2. **Check the decisions**: the ADRs in `<ADR folder>` that apply. If the change needs a different decision, stop and propose a new ADR (`new-adr` skill).
3. **Tests first** where the project has tests for this area (<test locations and runner>): a failing test that shows the bug or the new behaviour. Run it and see it fail.
4. **Build** the smallest change that makes it pass, following `.claude/rules/` for the files you touch and the code around it — this project's conventions win over general advice.
5. **Check**: <the project's check command, or its lint, typecheck and test commands> pass.
6. **Review**: ask the `reviewer` agent to review the change; fix what it finds. <only with a threat model:> When the change touches a sensitive path (<globs from `docs/security/threat-model.md`>), adds or upgrades a dependency, adds a migration or an LLM tool, then ask the `security-reviewer` agent (the `security-review` skill); fix what it finds.
7. **Docs**: if structure, routes, data or decisions changed, ask the `docs-keeper` agent to update the overview and ADRs (and the threat model, when there is one and an entry point, table, role or tool was added).
8. **Commit** <in the project's commit style, e.g. "a Conventional Commit: `fix(orders): reject negative quantities (#142)`">.
