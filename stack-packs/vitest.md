---
id: vitest
name: Vitest
packages: [vitest, "@vitest/*"]
major: 5
researchedAt: 2026-11-16
status: draft
---

# Stack pack: Vitest 5

## Summary

Vitest is the Vite-native test runner. It handles unit, integration, type-level and (in Browser Mode) component tests, and it reuses the project's Vite config, plugins and transforms [S15]. This pack covers Vitest 5 (researched against 5.1.0). Vitest 5 was released on 2026-09-03 and focuses on performance: shared Vite servers, a persistent module cache and faster coverage [S2]. It requires Vite >= 6.4.0 and Node.js >= 22.12.0 [S1][S15].

## Project structure

- **Config file.** Vitest reads `vite.config.*` by default. A dedicated `vitest.config.{ts,mts,cts,js,mjs,cjs}` takes precedence, and JSON configs are not supported [S16]. Vitest 5 no longer looks for config files in parent directories, so in monorepo sub-packages either pass `--config` or keep a config in the package itself [S1].
- **Config helpers.**
  - Without Vite, import `defineConfig` from `vitest/config`.
  - If you import `defineConfig` from `vite`, add `/// <reference types="vitest/config" />` at the top of the file.
  - To layer test settings on top of an existing Vite config, use `mergeConfig` [S16].
- **Projects.** Use `test.projects` to run different kinds of tests side by side, for example a Node `unit` project and a Browser Mode `component` project [S6].
  - The old `workspace` option has been deprecated since 3.2 and is replaced by `projects` [S6].
  - In Vitest 5, inline projects inherit the root config by default (`extends: true`). Set `extends: false` to opt out [S1][S6].
  - Inline projects also share one Vite server by default (`sharedViteServer`) [S1].
  - Give every inline project a unique `name`; names are never inherited [S6].
  - In project files, `defineProject` gives better type safety than `defineConfig` [S6].
  - Run a single project with `vitest --project unit` [S6].
- **Test files.**
  - The default `include` is `['**/*.{test,spec}.?(c|m)[jt]s?(x)']`, resolved from `root` [S8].
  - Type tests live in `*.test-d.ts` files [S12].
  - Most projects put each test next to its source (`src/foo.ts` → `src/foo.test.ts`). Tests that cross several modules can go in a top-level `test/` folder. The maintainers' `examples/` directory shows `basic`, `projects`, `typecheck` and `in-source-test` layouts [S20].
- **Artifacts.** Vitest 5 writes its reports and artifacts under a single `.vitest/` directory [S1]:
  - attachments go to `.vitest/attachments/`;
  - blob reports go to `.vitest/blob/`;
  - the HTML report goes to `.vitest/index.html`.

  Add `.vitest/` to `.gitignore`.

## Naming

- **Files.** Test files must contain `.test.` or `.spec.` in their name [S15]. Pick one suffix per repository; `.test.` is what the docs use [S15][S8]. Type tests use `.test-d.ts` [S12]. For a split by project, use a second suffix that the project's `include` matches, such as `*.unit.test.ts` and `*.browser.test.ts` [S6].
- **Titles.** `-t` / `testNamePattern` now joins suite and test names with `' > '`, for example `-t 'math > adds'` [S1]. Write `describe` titles as the unit under test and `test` titles as the behaviour, so filtered runs read naturally.
- **Lint rules for titles.** `vitest/valid-title` and `vitest/no-identical-title` are both in the recommended ESLint config [S19].

## Testing

- **Imports.** `globals` defaults to `false` "for explicitness" [S17]. Import `test`, `expect`, `vi` and the hooks from `vitest`. Turn on `globals: true` (with `"types": ["vitest/globals"]`) only when a library needs it for automatic cleanup [S17].
- **Environments.**
  - Use `node` for logic.
  - For DOM tests that tolerate simulation, use `happy-dom` or `jsdom`. `happy-dom` is cheaper to create [S3].
  - For real browser behaviour, use Browser Mode with the `@vitest/browser-playwright` provider. Playwright supports Chromium, Firefox and WebKit and runs in parallel. The default `preview` provider only simulates events, so the docs advise against it even locally [S18].
  - Component tests use the official `vitest-browser-react`, `-vue`, `-svelte` or `-angular` packages [S18]. In Vitest 5, `render` from the Vue and Svelte packages returns a promise and must be awaited [S1].
- **Mocking** [S5]:
  - `vi.mock` is hoisted to the top of the file.
  - For partial mocks, use `vi.mock(import('./x.js'), factory)` with `importOriginal()`.
  - Mocks only intercept calls that come from outside the module.
  - Since Vitest 5, `vi.mock`, `vi.unmock` and `vi.hoisted` inside a nested scope throw. Use `vi.doMock` for scoped mocks [S1].
  - `clearMocks` now defaults to `true` [S1]. `restoreMocks` still defaults to `false` [S9].
  - `vi.stubEnv` and `vi.stubGlobal` do not reset unless you enable `unstubEnvs` / `unstubGlobals` [S5].
  - `vi.useFakeTimers` also fakes `Date`, and in v5 it fakes `Temporal` too. `vi.setSystemTime` does not reset itself, so call `vi.useRealTimers()` [S5][S1].
  - Vitest 5 adds `vi.when` for per-argument spy behaviour, with `toHaveBeenExhausted` to check that each behaviour was used [S2].
- **Async assertions.**
  - Unawaited `resolves`, `rejects` and `toMatchFileSnapshot` now fail the test.
  - `expect.poll` rejects on timeout and passes an `AbortSignal` [S1].
  - `toThrow("")` now matches any message [S1].
  - `toHaveTextContent` is exact. Use `toMatchTextContent` for partial or regex matches [S1].
- **Type tests.** Write `expectTypeOf` / `assertType` assertions in `*.test-d.ts` files and run them with `vitest --typecheck`. Vitest runs `tsc --noEmit` (or `vue-tsc --noEmit`) behind the scenes [S12].
- **In-source tests.** You can put tests in an `if (import.meta.vitest)` block of a source file and set `test.includeSource` [S11].
  - Production builds must define `'import.meta.vitest': 'undefined'` so the bundler strips the tests.
  - For TypeScript, add `vitest/importMeta` to `compilerOptions.types`.
  - The docs advise using separate files for component or complex tests [S11].
- **Focused and skipped tests.** `.only` skips every other test in the file [S7]. `allowOnly` defaults to `!process.env.CI`, so a committed `.only` fails CI [S10].

## Linting and formatting

- **ESLint plugin.** The maintained plugin is `@vitest/eslint-plugin` and needs ESLint >= 9 [S19]. Apply it with flat config to test files only:

  ```js
  plugins: { vitest },
  rules: { ...vitest.configs.recommended.rules }
  ```

  The recommended config includes `no-focused-tests`, `no-disabled-tests`, `expect-expect`, `valid-expect`, `no-identical-title`, `valid-title` and `no-standalone-expect` [S19].
- **Opt-in rules.** `prefer-hooks-in-order`, `require-mock-type-parameters` and `consistent-test-filename` are only in the `all` config. Enable them individually if wanted [S19].
- **Formatting.** Vitest has no formatter of its own. Format test files with the project's normal formatter.
- **Custom matchers.** Augment `Matchers<R, T>` in the `vitest` module. Vitest 5 no longer reads `jest.Matchers` [S1].

## Security

- **API and UI server** [S13]:
  - By default it listens only on `localhost`, on port `51204` (or `23315` in Browser Mode).
  - Anyone who can reach an exposed API with `api.allowWrite` and `api.allowExec` enabled "can run arbitrary code on your machine". When `api.host` is anything other than localhost, Vitest sets both to `false`.
  - Do not re-enable them on a networked host.
  - In Vitest 5 the UI requires a token-authenticated URL [S1].
- **In-source tests.** Without the `define` replacement, test code and test-only imports ship to production [S11].
- **Coverage ignore hints.** A `-- @preserve` hint can survive into production builds [S4]. Keep ignore hints rare.
- **Environment stubs.** Leaked `vi.stubEnv` values can make later tests pass against the wrong config. Enable `unstubEnvs` [S5].

## Performance pitfalls

- **Pools** [S3]:
  - The default pool is `forks`. `threads` can be faster in large projects. `vmThreads` gives every file a fresh context but cannot turn off isolation.
  - `isolate: false` with `threads` is the fastest setup, but only when tests don't rely on side effects. Turn isolation off per project rather than globally.
- **Find faster settings.** Run `vitest doctor`. It times alternative configs (including `isolate: false`) against a passing baseline and recommends one [S3][S14].
- **Read the summary.** The `Duration` line shows which phase dominates: environment, import, transform, tests or setup [S3].
- **Caches.** `fsModuleCache` is on by default (it was `experimental.fsModuleCache` before v5). It persists transforms across reruns [S2][S3]. `NODE_COMPILE_CACHE=<dir>` adds Node's compile cache [S3].
- **Large suites.** Split test files across machines with `--shard` and `--reporter=blob`. On high-core machines, cap workers with `VITEST_MAX_WORKERS` [S3].
- **Static listing.** Since Vitest 5, `vitest list` parses files statically by default [S14].

## CI/CD and release

- **Run mode.** Bare `vitest` already runs once in CI or on a non-TTY [S14]. Still, use `vitest run` in scripts so the intent is explicit [S14][S15].
- **Changed files.** Use `vitest related --run <files>` in lint-staged. Use `--changed [since]` for test runs scoped to a PR [S14].
- **Coverage.**
  - Install `@vitest/coverage-v8` and set `coverage.provider: 'v8'`. This is the recommended provider unless the runtime is not V8.
  - Set `coverage.include` (for example `'src/**/*.{ts,tsx}'`) so untested files show 0% [S4].
  - Since Vitest 5, glob entries in `coverage.thresholds` no longer inherit `perFile`, and `coverage.include` / `exclude` patterns are root-relative [S1].
- **Sharding** [S3]:
  - Run each shard with `vitest run --reporter=blob --shard=1/3`.
  - Merge the shards with `vitest run --merge-reports`.
  - Set `VITEST_BLOB_LABEL` per environment.
- **Reporters and artifacts.**
  - The `json` and `junit` reporters now write files by default; use `stdout: true` to print them instead.
  - Upload `.vitest/` as the CI artifact [S1].
  - The HTML reporter's `singleFile: true` option suits CI artifacts [S2].
- **Type tests.** Add `--typecheck` to the CI run when the repository has `*.test-d.ts` files [S12].
- **Browser Mode.** Use the Playwright provider in CI. `browser.headless` defaults to true in CI [S18].

## Conventions

- **Clean Architecture.**
  - Tests follow the dependency rule. Entities and use cases are tested in a `node` project with no DOM and no module mocks; their ports are replaced with fakes passed as arguments.
  - Adapters (HTTP, DB, framework) get integration tests that mock only the outer boundary.
  - With `test.projects`, each layer can get its own project, such as `domain` (node), `adapters` (node) and `ui` (browser), so dependency leaks show up as failing environment assumptions [S6].
  - `vi.mock` of a domain module from a domain test is a smell: it means the layer reaches out instead of receiving a port [S5].
- **Atomic Design.**
  - Atoms and molecules get Browser Mode component tests next to the component (`Button.tsx` / `Button.test.tsx`), using `vitest-browser-*` [S18].
  - Organisms and templates get fewer, interaction-level tests.
  - Pages are left to E2E tools outside Vitest.
  - Strict locators (`browser.locators.exact` is `true` in v5) reward precise accessible names at the atom level [S1].
- **Humble Object.**
  - Keep components, route handlers and CLI entry points thin, and move decisions into plain functions or hooks that are tested in the `node` project. Those tests are the cheapest and fastest [S3].
  - The humble shell gets one smoke or component test.
  - In-source tests suit small private helpers, not boundaries [S11].

## Version notes

Breaking changes in Vitest 5 [S1]:

- **Requirements and packaging.**
  - Vite >= 6.4 and Node >= 22.12 are required.
  - `vite` is now a required peer dependency; Yarn users must add it explicitly.
  - `vitest` no longer depends on `@vitest/expect`.
  - `@vitest/runner` and `@vitest/ws-client` are deprecated.
- **Config defaults.** `clearMocks: true`; `extends: true` and a shared Vite server for inline projects; `browser.locators.exact: true`.
- **Removed APIs.**
  - `test.sequential`, `describe.sequential` and the `sequential` option are removed. Use `concurrent: false`.
  - Nested `vi.mock` / `vi.hoisted` now throw.
- **Assertions.** Unawaited async assertions fail. `toHaveTextContent` is exact. Assertion types take `<R, T>`.
- **Benchmarks.** `bench` is no longer a top-level import; it comes from the test context. `bench.skip`/`only`/`todo`, `benchmark.reporters`, `benchmark.outputFile`, `--compare` and `--outputJson` are removed.
- **Removed entry points.** `vitest/coverage`, `vitest/reporters`, `vitest/environments`, `vitest/snapshot`, `vitest/runners`, `vitest/suite` and `vitest/mocker` are gone. Use `vitest/node` or the `vitest` exports instead.
- **Artifacts and reporters.** Artifacts move to `.vitest/`. The HTML reporter option changes from `outputFile` to `outputDir`. Worker and pool IDs start at 1.
- **Config lookup.** Config files are no longer found in parent directories.
- **Browser Mode.** `browser.api` and `browser.isolate` are deprecated in favour of the top-level `api` and `isolate`. Automocked modules return `undefined`.
- **Other packages.** `@vitest/browser-webdriverio` moved to the vitest-community organisation.
- **Workspace.** The `workspace` option has been deprecated since 3.2 [S6].

## Rules

| ID | Rule | Enforce with | Sources |
|---|---|---|---|
| VITEST-01 | Name runtime test files `*.test.ts(x)` (matching the default `include`) and type tests `*.test-d.ts`; never rely on other suffixes without updating `include`. | config: vitest `test.include` (default matches `*.test.*` and `*.spec.*`) | S8, S12, S15 |
| VITEST-02 | Never commit `.only`; keep `allowOnly` at its default `!process.env.CI` so CI fails on focused tests. | lint: @vitest/eslint-plugin vitest/no-focused-tests | S10, S19 |
| VITEST-03 | Apply `vitest.configs.recommended` from `@vitest/eslint-plugin` (ESLint >= 9 flat config) to all test files. | lint: @vitest/eslint-plugin configs.recommended | S19 |
| VITEST-04 | Import `test`, `expect`, `vi` and hooks from `vitest`; keep `globals: false` unless a library requires globals. | config: vitest `test.globals: false` | S17 |
| VITEST-05 | Await every `resolves`, `rejects`, `toMatchFileSnapshot` and `expect.poll` assertion. | lint: @vitest/eslint-plugin vitest/valid-expect | S1, S19 |
| VITEST-06 | Every test contains at least one assertion. | lint: @vitest/eslint-plugin vitest/expect-expect | S19 |
| VITEST-07 | Call `vi.mock`, `vi.unmock` and `vi.hoisted` only at module top level; use `vi.doMock` for scoped mocks. | test: vitest run (nested `vi.mock` throws in Vitest 5) | S1, S5 |
| VITEST-08 | Keep the default `clearMocks: true` and set `restoreMocks: true`, `unstubEnvs: true` and `unstubGlobals: true` so no mock, env or global stub leaks between tests. | config: vitest `test.restoreMocks`, `test.unstubEnvs`, `test.unstubGlobals` | S1, S5, S9 |
| VITEST-09 | Run coverage with `@vitest/coverage-v8` and set `coverage.include` to the source globs so untested files appear at 0%. | config: vitest `coverage.provider: 'v8'` and `coverage.include` | S4 |
| VITEST-10 | CI runs tests with `vitest run --coverage`, adding `--typecheck` when `*.test-d.ts` files exist. | ci: vitest run --coverage --typecheck | S4, S12, S14 |
| VITEST-11 | Use `test.projects` (not `workspace`) to separate environments, give every inline project a unique `name`, and use `defineProject` in project files. | config: vitest `test.projects` | S6 |
| VITEST-12 | Browser Mode uses the `@vitest/browser-playwright` provider, not the default `preview` provider. | config: vitest `browser.provider` | S18 |
| VITEST-13 | Projects with in-source tests define `'import.meta.vitest': 'undefined'` in the production build config. | config: vite `define: { 'import.meta.vitest': 'undefined' }` | S11 |
| VITEST-14 | Never expose the Vitest API/UI server beyond localhost with `api.allowWrite` or `api.allowExec` enabled. | config: vitest `api.host`, `api.allowWrite: false`, `api.allowExec: false` | S13 |
| VITEST-15 | Do not use APIs removed in Vitest 5: `test.sequential`/`describe.sequential` (use `concurrent: false`), top-level `bench` import, or the `vitest/coverage`, `vitest/reporters`, `vitest/environments`, `vitest/snapshot`, `vitest/runners`, `vitest/suite`, `vitest/mocker` entry points. | types: tsc --noEmit | S1 |
| VITEST-16 | Custom matchers augment `Matchers<R, T>` in the `vitest` module, not `jest.Matchers`. | types: tsc --noEmit | S1 |
| VITEST-17 | Shard large suites with `vitest run --reporter=blob --shard=<i>/<n>`, merge them with `vitest run --merge-reports`, and upload `.vitest/` as the CI artifact. | ci: vitest run --reporter=blob --shard / vitest run --merge-reports | S1, S3 |
| VITEST-18 | Disable isolation (`isolate: false`) only per project, and only after `vitest doctor` shows the suite passes with it. | review | S3, S14 |
| VITEST-19 | Restore real timers after fake-timer tests (`vi.useRealTimers()` in `afterEach`); `vi.setSystemTime` does not reset automatically. | review | S5 |
| VITEST-20 | Ignore `.vitest/` (Vitest 5 reports and artifacts) in version control. | review | S1 |

## Sources

| ID | Kind | Title | URL |
|---|---|---|---|
| S1 | official | Migration Guide (Migrating to Vitest 5.0) | https://vitest.dev/guide/migration |
| S2 | official | Vitest 5 is out (release blog) | https://vitest.dev/blog/vitest-5 |
| S3 | official | Improving Performance | https://vitest.dev/guide/improving-performance |
| S4 | official | Coverage | https://vitest.dev/guide/coverage |
| S5 | official | Mocking | https://vitest.dev/guide/mocking |
| S6 | official | Test Projects | https://vitest.dev/guide/projects |
| S7 | official | Test Filtering | https://vitest.dev/guide/filtering |
| S8 | official | Config: include | https://vitest.dev/config/include |
| S9 | official | Config: restoreMocks | https://vitest.dev/config/restoremocks |
| S10 | official | Config: allowOnly | https://vitest.dev/config/allowonly |
| S11 | official | In-Source Testing | https://vitest.dev/guide/in-source |
| S12 | official | Testing Types | https://vitest.dev/guide/testing-types |
| S13 | official | Config: api | https://vitest.dev/config/api |
| S14 | official | Command Line Interface | https://vitest.dev/guide/cli |
| S15 | official | Getting Started | https://vitest.dev/guide/ |
| S16 | official | Configuring Vitest | https://vitest.dev/config/ |
| S17 | official | Config: globals | https://vitest.dev/config/globals |
| S18 | official | Browser Mode | https://vitest.dev/guide/browser/ |
| S19 | maintainer | @vitest/eslint-plugin (vitest-dev/eslint-plugin-vitest) | https://github.com/vitest-dev/eslint-plugin-vitest |
| S20 | maintainer | vitest-dev/vitest examples | https://github.com/vitest-dev/vitest/tree/main/examples |
