# Step: `scaffold`

> **Not implemented yet.** This step is added in Phase 1 build step 6 (spec section 9). Tell the user, don't change the state, and stop.

## Purpose

Create a working repository for the chosen stack with the resolved versions, git hooks, CI, dependency updates and passing smoke tests.

## Produces

- The application source, manifests and lockfile
- Husky + lint-staged, commitlint, gitleaks; GitHub Actions CI; Renovate or Dependabot
- First migration from `docs/architecture/schema.sql` (when a database is used)
- `.env.example`

## Gate

None.

## Spec

5.5
