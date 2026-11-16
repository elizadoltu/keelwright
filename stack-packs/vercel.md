---
id: vercel
name: Vercel
packages: [vercel, "@vercel/config", "@vercel/oidc", "@vercel/related-projects"]
major: 65
researchedAt: 2026-11-16
status: draft
---

# Stack pack: Vercel 65

## Summary

Vercel is the deployment platform for frontend apps, APIs and functions; the `vercel` npm package is its CLI, used to link projects, pull settings and environment variables, build locally or in CI, deploy, promote and roll back [S1]. A project is configured through the dashboard plus exactly one file-based config (`vercel.json`, `vercel.toml` or `vercel.ts`) [S2]. This pack covers CLI major 65 (65.16.0, published 2026-11-14) and the platform behaviour documented alongside it [S19].

## Project structure

- **One config file per project, at the project root:** `vercel.json` (static), `vercel.toml` (static, same properties) or `vercel.ts` (programmatic, runs at build time). "You can only use one configuration file per project" [S2]. `vercel.ts` exports `config` typed as `VercelConfig` from `@vercel/config/v1` and gets typed helpers such as `routes.rewrite`, `routes.redirect` and `routes.cacheControl` [S4]. Use `vercel.ts` only when configuration really has to be computed (env-dependent routes, fetched redirects); otherwise keep the static file.
- **`vercel.json` starts with `"$schema": "https://openapi.vercel.sh/vercel.json"`** for autocomplete and validation [S3].
- **`.vercel/`** is created by `vercel link`: `.vercel/project.json` holds `orgId` and `projectId`; a repository-wide link lives in `.vercel/repo.json` at the repo root [S12, S13]. `vercel build` writes artifacts to `.vercel/output` (Build Output API) [S9]. Both are machine-local state, not source.
- **`.env.local`** is written by `vercel env pull` with Development variables, including a `VERCEL_OIDC_TOKEN` [S5, S15]. It contains secrets and stays out of version control.
- **Functions** live where the framework puts them (`app/api/**/route.ts`, `pages/api/*`, or `api/*` for framework-less projects); per-function settings go in the route file or in the `functions` glob map of `vercel.json` [S14].
- **Monorepos:** one Vercel project per deployable app, each with its own Root Directory; link all of them from the repo root with `vercel link --repo`, and put an app-specific `vercel.json` in that app's folder (e.g. `apps/web/vercel.json`) [S17, S13].

## Naming

- Environment variable names are UPPER_SNAKE_CASE; Vercel reserves the `VERCEL_*` system variables (`VERCEL_ENV`, `VERCEL_TARGET_ENV`, `VERCEL_URL`, `VERCEL_AUTOMATION_BYPASS_SECRET`, `VERCEL_OIDC_TOKEN`) [S5, S6, S11].
- Framework-public prefixes (`NEXT_PUBLIC_*`, `NUXT_ENV_*`) are inlined into client bundles at build time; anything with such a prefix is public [S5, S10].
- Custom environments are referred to by name (`--environment=staging`); in a custom environment `VERCEL_ENV` is `preview`, so branch on `VERCEL_TARGET_ENV` when the name matters [S5, S8].
- Cron secret is `CRON_SECRET`; the protection-bypass secret is `VERCEL_AUTOMATION_BYPASS_SECRET` [S7, S11].
- In monorepos every workspace package needs a unique `name` in its `package.json` so Vercel can build the dependency graph [S17].

## Testing

- **Local:** `vercel dev` replicates the deployment environment and loads Development variables into memory; otherwise run the framework dev server after `vercel env pull` [S1, S5]. Cron routes are plain HTTP endpoints; test them by requesting the path — `vercel dev` does not run schedules [S7].
- **Unit tests** cover the handler logic (auth check on cron routes, idempotency) with the framework's usual test runner; Vercel has no test API of its own.
- **E2E against preview deployments:** previews are protected by default under Standard Protection, so automated tools send the `x-vercel-protection-bypass` header (value from `VERCEL_AUTOMATION_BYPASS_SECRET`) and, for browsers, `x-vercel-set-bypass-cookie: true`. The official Playwright config sets both in `use.extraHTTPHeaders` and throws when the secret is missing [S11]. Ad-hoc checks can use `vercel curl`, which bypasses protection automatically [S1].
- **Before release:** Deployment Checks hold a production deployment until required checks pass. Native checks run the `lint` and `typecheck` (or `type-check`/`check-types`) scripts from `package.json`; GitHub Actions results can be required too; the `vercel.deployment.ready` repository-dispatch event triggers workflows after the deployment exists [S18].
- **Build verification:** `vercel build --prod` locally reproduces the platform build; e.g. a cron that is missing from the dashboard should appear in `.vercel/output/config.json` [S7, S9].

## Linting and formatting

Vercel ships no linter for its config. Mechanical checks available from the sources:

- The `$schema` key gives JSON-schema validation of `vercel.json` in editors [S3]; `vercel.ts` is type-checked through `VercelConfig` [S4].
- Native Deployment Checks run the project's own `lint` and `typecheck` scripts on each deployment [S18].
- `vercel doctor` checks the CLI setup without logging in [S1].

## Security

- **Secrets:** choose the **Secret** type (write-only after saving) for passwords, API keys and tokens — `vercel env add NAME --type secret` (or `--sensitive`); **Config** only for non-sensitive values [S6]. Secret values of 32+ characters are redacted from build logs; `VERCEL_AUTOMATION_BYPASS_SECRET` and `VERCEL_OIDC_TOKEN` are always redacted [S6]. The team policy "Separate Production Secret Values" forces Production to use a different value than other environments [S6]. `env` / `build.env` in `vercel.json` are discouraged; define variables in project settings [S3].
- **CLI tokens:** in CI authenticate with the `VERCEL_TOKEN` environment variable; the docs recommend it over `--token` because arguments show up in process lists and logs [S1]. The maintainer GitHub Actions guide still passes `--token=${{ secrets.VERCEL_TOKEN }}` [S21]; follow the official position. Deploy authentication itself does not support OIDC, so a token remains required [S21].
- **Cloud credentials:** use OIDC federation instead of long-lived AWS/GCP/Azure keys; Vercel issues `VERCEL_OIDC_TOKEN` in builds and the `x-vercel-oidc-token` header in functions; Team issuer mode is recommended; read the token through `getVercelOidcToken()` from `@vercel/oidc` and don't cache it [S15].
- **Deployment Protection:** Standard Protection (all deployments except production domains) is recommended for most projects; All Deployments protects production too [S10]. With protection on, `VERCEL_URL`/`VERCEL_BRANCH_URL` are not publicly reachable: fetch with relative paths client-side and with the request's own origin server-side [S10]. Bypass secrets go in headers, not hardcoded URLs; regenerating one invalidates older deployments until redeployed [S11].
- **Cron endpoints** are public URLs: set `CRON_SECRET` (16+ random characters, header-safe) and reject requests whose `Authorization` header isn't `Bearer ${CRON_SECRET}`, including when the variable is unset [S7].
- **Headers:** add security headers via `headers` in `vercel.json` (e.g. `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`) [S3].
- `builds` restricts the deployment to build outputs "as a security precaution" but is legacy; don't reintroduce it [S3].

## Performance pitfalls

- **Function duration:** with Fluid compute (default) the default and Hobby maximum is 300 s; Pro/Enterprise go to 800 s, and up to 1800 s in beta when set per function [S14]. Set `maxDuration` deliberately per function; long-running work belongs in Workflows or queues, not one request [S14]. Memory cannot be set in `vercel.json` with Fluid compute; it is a dashboard setting [S3].
- **Glob specificity:** a `functions` glob like `app/api/**/*` matches everything under the path; narrow it (`app/api/**/*.ts`) and remember order matters [S14].
- **Cron overlap:** a job that outlives its interval can run twice concurrently; delivery is best effort and may duplicate or skip runs; Vercel never retries a failed run [S7].
- **Cron redirects:** cron invocations don't follow 3xx; `trailingSlash` redirects silently stop the job [S7].
- **Uploads:** for prebuilt deployments with thousands of files use `--archive=tgz` to avoid file-count limits [S8].
- **Monorepos:** Vercel skips unaffected projects automatically when workspaces are declared correctly; an Ignored Build Step still uses build slots, so prefer the built-in skipping and use filtered installs (`pnpm install --filter web...`) [S17].
- **Regions:** functions default to `iad1`; put them next to the data with `regions` [S3].

## CI/CD and release

- **Git integration (default):** every push to a non-production branch makes a Preview deployment, the production branch makes a Production deployment [S5]. Branch-scoped Preview variables override general Preview ones [S5].
- **CI-owned deploys** (GitHub Actions, GitLab, etc.): `vercel pull --yes --environment=preview|production` → `vercel build [--prod]` → `vercel deploy --prebuilt [--prod]` [S21, S9, S8]. Omitting `--prebuilt` rebuilds on Vercel and doubles build minutes [S21]. With `--prebuilt`, System Environment Variables are missing at build time, so frameworks that need them should use Git deployments [S8]. Store `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID` as CI secrets; with the two IDs set, no `vercel link` is needed [S13, S21]. Set `"git": { "deploymentEnabled": false }` so each commit isn't deployed twice [S21, S16].
- **Outputs:** `vercel deploy` prints the deployment URL on stdout (JSON with `--json` / non-interactive) and a non-zero exit code on failure — use them to chain E2E jobs or `vercel alias` [S8].
- **Staged releases:** `vercel deploy --prod --skip-domain` builds production without moving domains, then `vercel promote` releases it [S8, S1]. `vercel rollback` and `vercel rolling-release` handle recovery and gradual rollout [S1]. Deployment Checks block promotion until checks pass [S18].
- **Env var changes** apply only to new deployments; redeploy after editing [S5]. A rollback restores the target deployment's copy of variables such as `CRON_SECRET` [S7].
- **Skip work:** per-branch `git.deploymentEnabled` with minimatch patterns (`"internal-*": false`) and `ignoreCommand` (exit 0 skips, 1 builds) [S16, S3].

## Conventions

- **Clean Architecture:** Vercel is an outer-ring detail (infrastructure and delivery). Keep `vercel.json`/`vercel.ts`, `@vercel/*` SDK calls (OIDC, related projects) and reads of `VERCEL_*` variables in the infrastructure/adapter layer; domain and use-case code receive plain config values or ports and never import `@vercel/*` or read `process.env.VERCEL_*` directly. Route handlers and cron routes are interface adapters that call use cases [S4, S15].
- **Atomic Design:** not applicable — Vercel deploys whatever UI the framework builds and has no component model.
- **Humble Object:** function and cron route files stay thin — verify `CRON_SECRET`, parse the request, call a testable service, map the result to a `Response`. The service carries the idempotency and locking logic and is unit-tested without Vercel [S7]. Likewise, wrap `getVercelOidcToken()` behind a credentials port so tests inject a fake [S15].

## Version notes

- CLI majors move fast (60 → 65 between 2026-09-24 and 2026-10-20) [S19]. Notable breaking changes [S20]:
  - **65.0.0:** `vercel traces inspect --json` reports each span's `status.code` as its OpenTelemetry status name.
  - **64.0.0:** `vercel logs` returns individual runtime log entries by default; `vercel traces search --json` emits typed JSON Lines.
  - **63.0.0:** the CLI always detects and upgrades the `vercel` package for package-manager installations.
  - **61.0.0:** Node.js 20 or later is required; Node.js 18 is no longer supported.
  - **60.0.0:** `vercel usage` matches the dashboard Usage page and defaults to the current billing cycle.
- Scripts that parse `vercel logs` or `vercel traces` JSON written for majors before 64/65 must be updated.
- `vercel alerts rules` is deprecated in favour of `vercel monitors` [S1]. `--visibility` on `vercel env add` is a deprecated alias for `--type` [S5].
- Config: `public` is no longer supported and fails deployments; `builds`, `env`, `build.env`, `github.enabled`, `github.silent` are legacy [S3, S16]. `now.json` support was scheduled for removal on 2026-03-31 [S2]. Cron Jobs are a legacy feature to be migrated to Schedules [S3, S7].
- Environment variables now use Config/Secret types; the "Enforce Sensitive Environment Variables" policy is deprecated, and Secrets are now allowed in Development [S6].

## Rules

| ID | Rule | Enforce with | Sources |
|---|---|---|---|
| VERCEL-01 | Keep exactly one project config file (`vercel.json`, `vercel.toml` or `vercel.ts`); use `vercel.ts` only when values must be computed at build time. | review | S2, S4 |
| VERCEL-02 | `vercel.json` declares `"$schema": "https://openapi.vercel.sh/vercel.json"`; `vercel.ts` types its export as `VercelConfig` from `@vercel/config/v1`. | config: vercel.json "$schema" | S3, S4 |
| VERCEL-03 | Do not use `public`, `builds`, `env`, `build.env`, `github.enabled` or `github.silent` in config; use `functions`, project-settings env vars and `git.deploymentEnabled` instead. | review | S3, S16 |
| VERCEL-04 | Keep `.vercel/` and `.env*.local` (written by `vercel link`, `vercel build`, `vercel env pull`) out of version control. | config: .gitignore entries `.vercel` and `.env*.local` | S5, S9, S12, S15 |
| VERCEL-05 | In CI authenticate with the `VERCEL_TOKEN` environment variable from the CI secret store, not the `--token` flag, and supply `VERCEL_ORG_ID`/`VERCEL_PROJECT_ID` as secrets. | review | S1, S13, S21 |
| VERCEL-06 | CI deploys run `vercel pull --yes --environment=<env>`, then `vercel build` (with `--prod` for production), then `vercel deploy --prebuilt` (with `--prod`); never deploy a CI-built project without `--prebuilt`. | ci: vercel pull / vercel build / vercel deploy --prebuilt | S8, S9, S21 |
| VERCEL-07 | When CI owns deployments, set `"git": { "deploymentEnabled": false }` so commits are not deployed twice. | config: vercel.json "git.deploymentEnabled": false | S16, S21 |
| VERCEL-08 | Store passwords, API keys and tokens as Secret-type variables (`vercel env add NAME --type secret`); never put secrets behind a framework public prefix such as `NEXT_PUBLIC_`. | review | S5, S6 |
| VERCEL-09 | Cron route handlers reject any request whose `Authorization` header is not `Bearer ${CRON_SECRET}`, returning 401 also when `CRON_SECRET` is unset. | test: unit test of the cron handler's 401 path | S7 |
| VERCEL-10 | Cron jobs are idempotent and reconciliation-based, guard against overlapping runs with a lock, and do not rely on retries. | review | S7 |
| VERCEL-11 | Cron `path` values must not redirect (match `trailingSlash` and the real route) and must exist in the deployment. | review | S7 |
| VERCEL-12 | Set `maxDuration` explicitly for long-running functions, in the route file or a narrow `functions` glob in `vercel.json`; do not set `memory` in `vercel.json` with Fluid compute. | config: vercel.json "functions" maxDuration | S3, S14 |
| VERCEL-13 | Keep Deployment Protection at Standard Protection or All Deployments; never disable it for previews, and use relative or request-origin URLs instead of `VERCEL_URL` for self-requests. | review | S10 |
| VERCEL-14 | E2E tests against protected deployments send `x-vercel-protection-bypass` from `VERCEL_AUTOMATION_BYPASS_SECRET` (plus `x-vercel-set-bypass-cookie` for browsers) and fail fast if the secret is missing; never hardcode the secret. | test: Playwright `use.extraHTTPHeaders` | S11 |
| VERCEL-15 | Access AWS, GCP or Azure from functions through OIDC federation (`getVercelOidcToken()` from `@vercel/oidc`, Team issuer mode) instead of long-lived keys, and don't cache the token. | review | S15 |
| VERCEL-16 | Gate production promotion with Deployment Checks backed by `lint` and `typecheck` scripts in `package.json` (and required GitHub checks where CI runs E2E). | ci: Vercel Deployment Checks (Native Lint, Typecheck) | S18 |
| VERCEL-17 | Run the Vercel CLI on Node.js 20 or later, and update scripts that parse `vercel logs` / `vercel traces --json` to the v64+ output formats. | config: CI node-version >= 20 | S20 |
| VERCEL-18 | In monorepos create one Vercel project per app with its Root Directory, link from the repo root with `vercel link --repo`, give every workspace package a unique `name` and declare internal dependencies so unaffected projects are skipped. | review | S13, S17 |

## Sources

| ID | Kind | Title | URL |
|---|---|---|---|
| S1 | official | Vercel CLI Overview | https://vercel.com/docs/cli |
| S2 | official | Project Configuration | https://vercel.com/docs/project-configuration |
| S3 | official | Static configuration with vercel.json | https://vercel.com/docs/project-configuration/vercel-json |
| S4 | official | Programmatic Configuration with vercel.ts | https://vercel.com/docs/project-configuration/vercel-ts |
| S5 | official | Environment variables | https://vercel.com/docs/environment-variables |
| S6 | official | Config and Secret environment variables | https://vercel.com/docs/environment-variables/sensitive-environment-variables |
| S7 | official | Managing Cron Jobs | https://vercel.com/docs/cron-jobs/manage-cron-jobs |
| S8 | official | vercel deploy | https://vercel.com/docs/cli/deploy |
| S9 | official | vercel build | https://vercel.com/docs/cli/build |
| S10 | official | Deployment Protection on Vercel | https://vercel.com/docs/deployment-protection |
| S11 | official | Protection Bypass for Automation | https://vercel.com/docs/deployment-protection/methods-to-bypass-deployment-protection/protection-bypass-automation |
| S12 | official | Linking Projects with Vercel CLI | https://vercel.com/docs/cli/project-linking |
| S13 | official | vercel link | https://vercel.com/docs/cli/link |
| S14 | official | Configuring Maximum Duration for Vercel Functions | https://vercel.com/docs/functions/configuring-functions/duration |
| S15 | official | OpenID Connect (OIDC) Federation | https://vercel.com/docs/oidc |
| S16 | official | Git Configuration | https://vercel.com/docs/project-configuration/git-configuration |
| S17 | official | Using Monorepos | https://vercel.com/docs/monorepos |
| S18 | official | Deployment Checks | https://vercel.com/docs/deployment-checks |
| S19 | official | Vercel CLI Release Notes | https://vercel.com/docs/cli/release-notes |
| S20 | official | vercel CLI CHANGELOG.md (vercel/vercel repository) | https://raw.githubusercontent.com/vercel/vercel/refs/heads/main/packages/cli/CHANGELOG.md |
| S21 | maintainer | How can I use GitHub Actions with Vercel? (Vercel Knowledge Base) | https://vercel.com/kb/guide/how-can-i-use-github-actions-with-vercel |
