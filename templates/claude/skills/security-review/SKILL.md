---
name: security-review
description: Security review of a change to <Product name> against its threat model (docs/security/threat-model.md) and <framework edition>. Use when a change touches <sensitive areas, e.g. "auth, RLS policies, API handlers or migrations">, adds or upgrades a dependency, adds an LLM tool, or when asked for a security review.
---

<!-- Generated only when docs/security/threat-model.md exists (spec 5.3). Fill in the real
sensitive paths, the commands, and the risks by ID. Remove this comment. -->

# Security review

1. **Scope.** `git diff <base>...HEAD --stat`. A security review is needed when a changed file matches a sensitive path (<globs>), a dependency was added or upgraded (<the manifest and lockfile>), a migration was added, or an LLM tool changed. Otherwise say so and stop.
2. **Read the threat model** (`docs/security/threat-model.md`): the roles, the personal data, the entry points and the `SEC-` risks whose "Where" overlaps the change.
3. **Follow the input.** For every entry point the change touches: where untrusted input comes in, what it reaches (a query, a shell, HTML, a file path, a model prompt, a tool), and what checks it on the way. Read the code — don't infer from names.
4. **Check the risks** that apply: each one's mitigation is still in place and still enforced (<e.g. "the RLS policy in the migration, the test that proves it">). Then the checks in `.claude/rules/security.md`.
5. **Dependencies.** A new dependency: maintained, widely used, no known advisory (`<the project's audit command, e.g. "npm audit --omit=dev">`), no install script it doesn't need.
6. **New surface.** An entry point, table, role, container or tool the threat model doesn't mention → a finding for the `docs-keeper`, with the risk it adds.
7. **Report** at most 5 findings, most severe first: `file:line` · `SEC-` ID or framework category · severity (critical, high, medium, low) · evidence: what input reaches what · the fix. Say **Approve** when there are none. No speculative findings — each names the path an attack takes.

Never paste a secret you find into a finding: name the file and line, and say to rotate it first.
