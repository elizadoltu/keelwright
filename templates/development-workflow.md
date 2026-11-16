<!-- keelwright: status=generated date=YYYY-MM-DD -->
# Contributing to <Project name>

<!--
Generated as CONTRIBUTING.md at the repository root (GitHub links it automatically).
Metadata lives in the hidden comment on the first line, not in YAML front matter,
because GitHub renders front matter as a visible table.
Generated in the `generate` step, together with CLAUDE.md and the hooks, after scaffold,
so every command and gate below matches the real project. Lines that point to something
the project doesn't have (e.g. no E2E tests) are removed, not left as placeholders.
Rules for this document:
- For humans. AI agents follow CLAUDE.md, rules and hooks; all three are generated
  from the same source as this file, so they never disagree.
- Every rule here that can be enforced is enforced by a hook or CI check — the
  "Enforced by" column says where.
- Target length: 1–2 pages.
-->

## Setup

```bash
<package-manager> install
cp .env.example .env.local
<package-manager> dev
```

Requirements: <Node.js LTS version, package manager, Docker if needed>

## Branching

- Model: <GitHub Flow / trunk-based> — `main` is always deployable.
- Short-lived branches from `main`, merged within <1–2 days>.
- Branch names: `<type>/<short-description>`, e.g. `feat/booking-form`, `fix/login-redirect`.

## Commits

[Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<scope>): <description>
```

- Types: `feat`, `fix`, `docs`, `refactor`, `test`, `chore`, `ci`, `perf`
- Breaking changes: `feat!:` or a `BREAKING CHANGE:` footer
- Examples: `feat(blog): add RSS feed`, `docs(adr): record hosting decision`

## Pull requests

- Small and focused: one concern per PR.
- Title follows the commit format (it becomes the squash-merge commit).
- Link the story or requirement: `US-…`, `FR-…`, `BL-…`.
- Merge strategy: <squash and merge>.

**Checklist**
- [ ] Tests added or updated
- [ ] Docs / ADR updated if behaviour or architecture changed
- [ ] UI checked in light and dark mode and on mobile (if UI)
- [ ] No secrets, no `console.log`, no commented-out code

## Quality gates

| Check | When | Enforced by |
|---|---|---|
| Lint + format | pre-commit | Husky + lint-staged |
| Secret scan | pre-commit and CI | gitleaks |
| Commit message format | commit-msg | Husky + commitlint |
| Type check | CI | `tsc --noEmit` |
| Unit tests | pre-push and CI | Vitest |
| E2E tests | CI | Playwright |
| Architecture rules | CI | <e.g. dependency-cruiser / eslint-plugin-boundaries> |
| Build | CI | <framework build> |

## Environments and deployment

| Environment | Trigger | URL |
|---|---|---|
| Preview | every PR | <Vercel preview URL> |
| Production | merge to `main` | <domain> |

## Releases

- Versioning: <SemVer / continuous (no versions)>
- Changelog: generated from commit messages
- Dependency updates: <Renovate / Dependabot>, weekly, grouped by type

## Definition of done

- [ ] Acceptance criteria of the linked story pass
- [ ] All quality gates green
- [ ] Deployed to preview and checked
- [ ] Docs updated

## Working with AI agents

- Agent instructions: `CLAUDE.md`, `.claude/rules/`, `.claude/skills/`
- Decisions: `docs/decisions/` — accepted ADRs are superseded, never edited
- Agents follow the same quality gates; hooks run on their changes too
