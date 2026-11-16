---
id: supabase
name: Supabase (PostgreSQL)
packages: [@supabase/supabase-js, supabase]
major: 2
researchedAt: 2026-11-16
status: draft
---

# Stack pack: Supabase (PostgreSQL) 2

## Summary

Supabase is a hosted Postgres platform with an auto-generated Data API (REST/GraphQL), Auth, Storage, Realtime and Deno-based Edge Functions. Applications talk to it through `@supabase/supabase-js` (researched: 2.119.0, major 2) and manage schema, local stack, tests, types and deployment with the `supabase` CLI. Because the Data API is reachable directly from browsers, Postgres Row Level Security (RLS) is the real authorization layer [S1][S12].

## Project structure

- `supabase/config.toml` — project settings (Auth providers, storage buckets, per-function settings such as `verify_jwt`), created by `supabase init`; secrets are loaded from `.env` with `env(...)` [S3][S16].
- `supabase/migrations/` — timestamped SQL files created by `supabase migration new <name>`; `supabase db reset` rebuilds the local database from them [S3].
- `supabase/seed.sql` — seed inserts that run on reset [S3].
- `supabase/tests/database/` — pgTAP `.sql` tests run by `supabase test db` [S4].
- `supabase/functions/<function-name>/index.ts` — one folder per Edge Function; shared code in an underscore-prefixed folder such as `supabase/functions/_shared/` (e.g. `supabaseAdmin.ts`, `supabaseClient.ts`, `cors.ts`); unit tests in `supabase/functions/tests/` [S16].
- `database.types.ts` (or `types.gen.ts`) — generated TypeScript types, committed and checked in CI [S5][S7].
- App side, following the maintainers' Next.js starter: a `lib/` folder for client factories and a root `proxy.ts` that refreshes the session; env vars `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` documented in `.env.example` [S14][S6].

## Naming

- Edge Functions: hyphenated names (`function-one`); shared folders start with `_` [S16].
- Function unit tests: function name plus a `-test` suffix (`function-one-test.ts`) [S16].
- Migrations: let the CLI generate the timestamp prefix; describe the change in snake_case, e.g. `create_employees_table` [S3].
- Database tests: `.sql` files in `supabase/tests/database/`, e.g. `hello_world_test.sql` [S4].
- Env vars follow the framework's public prefix (`NEXT_PUBLIC_`, `PUBLIC_`, `NUXT_PUBLIC_`, `VITE_`) for URL and publishable key; server-only frameworks use `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY` [S6]. Secret keys never get a public prefix [S2].

## Testing

- **Database and RLS:** write pgTAP tests in `supabase/tests/database/`. Each test wraps checks in `begin; select plan(n); … select * from finish(); rollback;` and runs with `supabase test db` against the local stack [S4]. Test both allow and deny cases for every policy: assert error `42501` for denied grants and `with check` violations, and `is_empty` for rows filtered by `using` [S1].
- **Application code:** alternatively test through a Supabase client in the app's own test framework against the local stack [S4].
- **Edge Functions:** Deno unit tests in `supabase/functions/tests/` [S16].
- **PL/pgSQL:** `supabase db lint` runs `plpgsql_check`; use `--fail-on error` (default is `none`, which always exits zero) so CI actually fails [S11].

## Linting and formatting

Supabase ships no ESLint plugin or formatter for application code; use the framework's own setup. For the database there are two official linters:

- `supabase db lint` — `plpgsql_check` over all schemas (or `-s` for a list), with `--level <warning|error>` and `--fail-on <none|warning|error>`; `--local`/`--linked` are deprecated in favour of `--remote` [S11].
- `supabase db advisors` (also Studio's Security/Performance Advisors and MCP `get_advisors`) — the splinter lints, e.g. `0013_rls_disabled_in_public`, `0010_security_definer_view`, `0011_function_search_path_mutable`, `0024_permissive_rls_policy`, `0003_auth_rls_initplan`, `0001_unindexed_foreign_keys`, `0006_multiple_permissive_policies` [S8]. Some findings may be intentional; review them against your access model [S8].

## Security

- **RLS on every table in an exposed schema.** Policies don't remove grants: revoke defaults from `anon` and `authenticated`, then grant the minimum [S1].
- **Policies:** one per operation (`select`, `insert`, `update`, `delete`) instead of `for all`; always name the role with `to`; check `auth.uid() is not null` explicitly because it is `null` for anonymous requests [S1].
- **Never authorize on `user_metadata`** — users can change it; use `raw_app_meta_data` [S1].
- **`security definer` functions:** set `search_path = ''`, schema-qualify every name, and don't create them in exposed schemas. Use them to break policy recursion (`42P17`) [S1]. Advisors flag exposed ones (`0028`, `0029`) [S8].
- **Views:** on Postgres 15+ set `security_invoker = true` so the view respects the tables' RLS [S1]; `0010_security_definer_view` is an ERROR-level advisor [S8].
- **Keys:** the publishable key (`sb_publishable_…`, role `anon`/`authenticated`) is safe in public code; the secret key (`sb_secret_…`, role `service_role` with `BYPASSRLS`) is backend-only, never in a browser (even localhost; it returns 401), never in source control or CI scripts, and one per backend component [S2]. Legacy `anon` and `service_role` JWT keys are deprecated by the end of 2026 [S2].
- **Server-side auth:** use `getClaims()` (verifies the JWT signature) to protect pages and data. "Never trust `supabase.auth.getSession()` inside server code such as Proxy" — the cookie can be forged [S6]. Responses that set session cookies must not be cached by CDNs/ISR [S6]. Route guards don't protect server functions; check claims inside each one [S6].
- **Production:** follow the production security checklist (RLS, SSL and network restrictions, Auth settings, CAPTCHA on auth endpoints), use your own SMTP, and know the default Auth rate limits [S15].

## Performance pitfalls

- Bare `auth.uid()` in a policy runs once per row; write `(select auth.uid())` so the planner caches it (advisor `0003_auth_rls_initplan`) [S1][S8].
- Index every column a policy filters on; a composite primary key only indexes its leading column [S1]. Index foreign keys (`0001_unindexed_foreign_keys`) and drop unused/duplicate indexes (`0005`, `0009`) [S8].
- Several permissive policies on one table cost extra (`0006_multiple_permissive_policies`) [S8].
- Serverless and edge workloads should connect through the Supavisor transaction pooler on port 6543, with prepared statements turned off (`prepare: false` for Postgres.js and Drizzle); use the direct connection for persistent backends and migrations [S12].
- Use `pg_stat_statements` to find slow queries and load-test on staging before launch; enable PITR for databases over 4 GB [S15].
- Prefer few "fat" Edge Functions over many small ones [S16].

## CI/CD and release

The official flow maps branches to databases: feature branch → local, `develop` → staging, `main` → production [S7].

- **CI on pull requests** (`supabase/setup-cli@v1`): `supabase db start`, `supabase db diff --strict-coverage` (pg-delta engine), and `supabase gen types typescript > types.gen.ts` followed by `git diff --ignore-space-at-eol --exit-code --quiet types.gen.ts` to fail on stale types [S7]. Add `supabase test db` [S4], `supabase db lint --fail-on error` [S11] and `supabase db advisors` [S8].
- **Deploy:** `supabase link --project-ref $SUPABASE_PROJECT_ID` then `supabase db push --yes --remote`, with `SUPABASE_ACCESS_TOKEN`, `SUPABASE_DB_PASSWORD` and `SUPABASE_PROJECT_ID` from repository secrets [S7]. Run `supabase db pull --remote` first if the remote has drifted [S3]. Functions deploy with `supabase functions deploy <name>` [S3].
- Schema changes made in the Dashboard must be captured with `supabase db diff` into a migration file, never left only in the remote [S3].

## Conventions

- **Clean Architecture:** Supabase is infrastructure. Keep `createClient`/`createServerClient` factories and queries in an adapter layer (e.g. `lib/supabase/` plus repository modules) and let domain code depend on interfaces, not on `SupabaseClient` [S14]. In the browser, create a single client and share it [S9]. The generated `Database` type belongs to that adapter; map rows to domain types at the boundary [S5]. Authorization rules live in the database (RLS migrations), the innermost enforcement point for data reached through the Data API [S1].
- **Atomic Design:** not applicable — Supabase has no UI components.
- **Humble Object:** Edge Function `index.ts` files and Next.js proxy/route handlers stay thin (parse request, verify claims, call a function); business logic goes in `_shared/` or app modules that are unit-testable without the network [S16][S6]. Database logic is tested directly with pgTAP rather than through the HTTP layer [S4].

## Version notes

- **v1 → v2:** `signIn()` split into `signInWithPassword`, `signInWithOtp`, `signInWithOAuth`; `session()`/`user()` became `getSession()`/`getUser()`; `update()` became `updateUser()`; `setAuth()` was replaced by a `global.headers` `Authorization` header; `setAuthCookie`/`getUserByCookie` removed. `createClient` options moved under `db` and `auth`. `insert/upsert/update/delete` no longer return rows unless you chain `.select()`. Realtime uses `channel(...).on('postgres_changes', …)` and `supabase.removeChannel()` [S13].
- **Within v2:** Node.js 18 support was dropped in 2.79.0 (last: 2.78.0); only Active LTS or Maintenance Node versions are supported, and EOL versions are dropped in minor releases [S10]. The SDK is a monorepo (`auth-js`, `postgrest-js`, `realtime-js`, `storage-js`, `functions-js`) [S10].
- **Keys:** publishable/secret keys replace `anon`/`service_role`, which are deprecated by the end of 2026; in Edge Functions read `SUPABASE_SECRET_KEYS`, not `SUPABASE_SERVICE_ROLE_KEY` [S2].
- **SSR:** `@supabase/ssr` replaces the removed cookie helpers; `getClaims()` is the server-side verification method; Next.js 16 uses `proxy.ts`, and Next.js 15 and earlier never call it, so sessions don't refresh there [S6].
- **CLI:** `--local`, `--linked`, `--project-ref`, `--db-url` still work in CLI v3 but are deprecated in favour of `--remote` and will be removed in v4 [S11]. `db diff --strict-coverage` needs the pg-delta engine [S7].

## Rules

| ID | Rule | Enforce with | Sources |
|---|---|---|---|
| SUPABASE-01 | Enable RLS on every table in an exposed schema (including `public`), and revoke default grants from `anon`/`authenticated` before granting the minimum. | ci: supabase db advisors (0013_rls_disabled_in_public) | S1, S8 |
| SUPABASE-02 | Client-side code uses only the publishable key; secret (`sb_secret_…`) and `service_role` keys appear only in server code and Edge Functions and never under a public env prefix. | review | S2, S6 |
| SUPABASE-03 | Never commit secret keys, including in CI scripts; load them from secrets or `.env` via `env(...)` in `config.toml`. | review | S2, S3 |
| SUPABASE-04 | New code uses publishable/secret keys, not the deprecated legacy `anon`/`service_role` JWT keys; Edge Functions read `SUPABASE_SECRET_KEYS`. | review | S2 |
| SUPABASE-05 | Write one policy per operation (no `for all`), name the role with `to`, and check `auth.uid() is not null` explicitly. | review | S1 |
| SUPABASE-06 | In policies, call auth helpers as `(select auth.uid())`, not bare `auth.uid()`. | ci: supabase db advisors (0003_auth_rls_initplan) | S1, S8 |
| SUPABASE-07 | Never base authorization on `user_metadata`; use `raw_app_meta_data` or tables. | review | S1 |
| SUPABASE-08 | `security definer` functions set `search_path = ''`, schema-qualify every name, and live outside exposed schemas. | ci: supabase db advisors (0011_function_search_path_mutable) | S1, S8 |
| SUPABASE-09 | Views over RLS tables are created with `security_invoker = true`. | ci: supabase db advisors (0010_security_definer_view) | S1, S8 |
| SUPABASE-10 | Index every column used in an RLS policy filter and every foreign key. | ci: supabase db advisors (0001_unindexed_foreign_keys) | S1, S8 |
| SUPABASE-11 | Every schema change is a file in `supabase/migrations/` created with `supabase migration new`; Dashboard changes are captured with `supabase db diff`. | ci: supabase db diff --strict-coverage | S3, S7 |
| SUPABASE-12 | Pass the generated `Database` type to `createClient<Database>()`, and fail CI when regenerated types differ from the committed file. | ci: supabase gen types typescript + git diff --exit-code | S5, S7 |
| SUPABASE-13 | Server code (proxy, route handlers, server functions) verifies the user with `getClaims()`; never trust `getSession()` on the server. | review | S6 |
| SUPABASE-14 | Use `createServerClient` from `@supabase/ssr`, created per request with `getAll`/`setAll` cookies, on the server; `createBrowserClient` in the browser. Check claims inside every server function that touches private data. | review | S6, S14 |
| SUPABASE-15 | Every RLS policy has pgTAP tests in `supabase/tests/database/` covering allow and deny cases (`42501`, `is_empty`). | test: supabase test db | S1, S4 |
| SUPABASE-16 | Lint PL/pgSQL in CI with a failing exit code. | ci: supabase db lint --fail-on error | S11 |
| SUPABASE-17 | Serverless/edge Postgres connections use the transaction pooler (port 6543) with prepared statements disabled. | config: Postgres.js / Drizzle prepare: false | S12 |
| SUPABASE-18 | Chain `.select()` after `insert`/`upsert`/`update`/`delete` whenever the returned rows are used; use v2 auth method names (`signInWithPassword`, `signInWithOtp`, `signInWithOAuth`). | review | S13 |
| SUPABASE-19 | Run `@supabase/supabase-js` 2.79+ only on Node.js versions in Active LTS or Maintenance (Node 18 is pinned to 2.78.0). | review | S10 |

## Sources

| ID | Kind | Title | URL |
|---|---|---|---|
| S1 | official | Row Level Security | https://supabase.com/docs/guides/database/postgres/row-level-security |
| S2 | official | Understanding API keys | https://supabase.com/docs/guides/api/api-keys |
| S3 | official | Local development with schema migrations | https://supabase.com/docs/guides/local-development/overview |
| S4 | official | Testing your database | https://supabase.com/docs/guides/database/testing |
| S5 | official | Generating TypeScript types | https://supabase.com/docs/guides/api/rest/generating-types |
| S6 | official | Creating a Supabase client for SSR | https://supabase.com/docs/guides/auth/server-side/creating-a-client |
| S7 | official | Managing environments | https://supabase.com/docs/guides/deployment/managing-environments |
| S8 | official | Database advisors | https://supabase.com/docs/guides/database/database-advisors |
| S9 | official | JavaScript reference: Initializing | https://supabase.com/docs/reference/javascript/initializing |
| S10 | maintainer | supabase-js README | https://github.com/supabase/supabase-js/blob/master/README.md |
| S11 | official | CLI reference: supabase db lint | https://supabase.com/docs/reference/cli/supabase-db-lint |
| S12 | official | Connect to your database | https://supabase.com/docs/guides/database/connecting-to-postgres |
| S13 | official | Upgrade to supabase-js v2 | https://supabase.com/docs/reference/javascript/v1/upgrade-guide |
| S14 | maintainer | Next.js and Supabase Starter Kit (with-supabase) | https://github.com/vercel/next.js/tree/canary/examples/with-supabase |
| S15 | official | Production checklist | https://supabase.com/docs/guides/deployment/going-into-prod |
| S16 | official | Edge Functions development tips | https://supabase.com/docs/guides/functions/development-tips |
