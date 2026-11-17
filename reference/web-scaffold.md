# Web scaffold rules

<!--
Runtime rules for the `scaffold` step on web projects (spec 5.5). `scripts/scaffoldcheck.mjs`
enforces the mechanical parts; keep the two in sync.
-->

## Package manager

**npm** by default — it ships with Node.js, so contributors need nothing extra. Use pnpm or another manager only when the user or an accepted ADR asks for it.

- `.npmrc`: `save-exact=true` (and `engine-strict=true`).
- `.nvmrc`: the major version of the resolved Node.js LTS (e.g. `26`).
- `package.json` `engines.node`: the strictest `engines.node` among the installed packages (e.g. `>=22.23.4`), so contributors on an older supported Node.js aren't blocked — `.nvmrc` recommends the LTS.
- The lockfile is committed.

## Versions

- Every dependency is an **exact** version. Versions resolved in the `prd` step (`stack.versions`) are used as they are.
- Packages the stack packs require that weren't resolved yet (lint plugins, configs, generators) are resolved now with `scripts/versions.mjs`, checked for peer conflicts, and added with `STATE set stack '{"versions": {…}}'` (nested objects merge, so only the new ones are needed).
- GitHub Actions are pinned to a commit SHA: `scripts/versions.mjs github:<owner>/<repo>` prints the tag and its SHA. Write `uses: <owner>/<repo>@<sha> # <tag>`.

## npm scripts

These names are the contract for CONTRIBUTING.md, CLAUDE.md, the hooks and CI — use exactly these:

| Script | Does |
|---|---|
| `dev` | Development server |
| `build` | Production build |
| `preview` | Serve the production build locally (what E2E tests run against) |
| `lint` | ESLint |
| `format` | Prettier, writing changes |
| `format:check` | Prettier, checking only |
| `typecheck` | The framework's type check (e.g. `astro check`, `tsc --noEmit`) |
| `test` | Unit tests (Vitest), single run |
| `test:e2e` | Playwright |
| `tokens` | Regenerate the theme from `design/tokens.json` (only when the project has tokens) |
| `check` | Everything fast, in order: `lint`, `format:check`, `typecheck`, `test`, and the tokens drift check |
| `prepare` | `husky` |

## Files

| Area | Files |
|---|---|
| Application | From the framework's official generator, then shaped to the architecture overview's code structure |
| Config | Framework config, `tsconfig.json`, `eslint.config.*`, Prettier config, Vitest config, `playwright.config.*` — each applying the stack packs' `config`, `lint`, `format` and `types` rules |
| Theme | `scripts/tokens-to-css.mjs` + `scripts/lib/tokens.mjs` copied from the plugin; the generated CSS (e.g. `src/styles/tokens.css`) imported by the global stylesheet |
| Hooks | `.husky/pre-commit` (lint-staged, then gitleaks on staged changes), `.husky/commit-msg` (commitlint), `commitlint.config.*`, lint-staged config |
| CI | `.github/workflows/ci.yml`: `npm ci` → `npm run check` → `npm run build` → Playwright (installing only the browsers it uses) → gitleaks; commitlint on pull requests |
| Dependency updates | `.github/dependabot.yml`: `npm` and `github-actions`, weekly, grouped |
| Environment | `.env.example` with every variable the code reads and no values for secrets; `.gitignore` covering `node_modules`, build output, `.env*` except `.env.example`, `.keelwright/snapshots/`, `.claude/settings.local.json` |
| Database | When `docs/architecture/schema.sql` exists and the database is Supabase (the web default): `supabase init`, then the schema copied into the first migration `supabase/migrations/<timestamp>_init.sql`. Another PostgreSQL: see the scaffold step, "Database" |
| Tests | One Vitest unit test of a real helper the skeleton needs (not `1 + 1`); one Playwright smoke test: every P1 route returns 200, has one `<h1>` and the right `lang` |

## The skeleton

The scaffold is a **walking skeleton**, not the features: every P1 route from the architecture overview exists with its layout, title, `lang` and a placeholder heading, the theme is applied, and every check passes. Feature code comes later, story by story.
