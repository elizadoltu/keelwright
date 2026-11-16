---
id: playwright
name: Playwright
packages: ["@playwright/test", "playwright", "eslint-plugin-playwright"]
major: 1
researchedAt: 2026-11-16
status: draft
---

# Stack pack: Playwright 1

## Summary

Playwright Test (`@playwright/test`) is the end-to-end test runner from the Playwright project. It drives Chromium, Firefox and WebKit through one API and ships its own runner, assertions, fixtures, trace viewer and HTML report [S1][S3]. This pack covers major 1, researched at 1.65. That release bundles Chromium 158, Firefox 159 and WebKit 27.2, and it no longer tests on Node.js 20. Use Node.js 22, 24 or 26 [S2].

## Project structure

- `playwright.config.ts` sits at the project root and uses `defineConfig` and `devices` from `@playwright/test`. Runner options (`retries`, `workers`, `forbidOnly`) are top-level. Browser options go under `use` [S3].
- Tests live in `tests/`, set by `testDir: 'tests'` and resolved relative to the config file [S3]. The maintainers' `examples/todomvc` project uses the same layout: a root `playwright.config.ts`, a `tests/` folder, and a `specs/` folder for the plans written by the test agents [S16].
- Authentication setup goes in `tests/auth.setup.ts`, matched by a `setup` project (`testMatch: /.*\.setup\.ts/`). Saved browser state goes in `playwright/.auth/user.json`, and that folder is added to `.gitignore` [S4].
- Page objects go in their own files next to the specs or in a `models/` folder. Each page object is one class per part of the application [S8].
- Custom fixtures go in one module that exports the extended `test` and re-exports `expect`. Specs import both from that module, not from `@playwright/test` [S9].
- Visual snapshots are stored next to each spec in a `<spec>-snapshots/` folder and committed to version control [S11].
- Generated output (`playwright-report/`, `test-results/`) is not committed. CI uploads `playwright-report/` as an artifact [S6].

## Naming

- Spec files end in `.spec.ts`, as in the docs' examples (`example.spec.ts`) [S1]. Setup files end in `.setup.ts` so the setup project's `testMatch` picks them up [S4].
- Page object classes are named after the part of the application they model, in PascalCase (`PlaywrightDevPage`, `TodoPage`). Their locators are `readonly` fields with descriptive names (`getStartedLink`) [S8][S9].
- Project names describe the browser or device (`chromium`, `firefox`, `webkit`, `setup`). The project name appears in snapshot file names [S3][S11].
- Snapshot files are named automatically from the test title, the project and the platform, e.g. `example-test-1-chromium-darwin.png`. You can change the pattern with `snapshotPathTemplate` [S11].

## Testing

**What to test.** Test user-visible behaviour, not implementation details such as function names or CSS classes [S1]. Each test is isolated: Playwright gives it its own browser context with separate storage, cookies and data. Shared setup belongs in `test.beforeEach` or fixtures, not in state passed between tests [S1]. Don't test third-party services. Mock them with `page.route(...).fulfill(...)` [S1]. Run against data you control, such as a stable staging environment or data your fixtures seed [S1][S9].

**Locators.** In order of preference: `getByRole`, then text, label, placeholder, alt text and title, then `getByTestId` (defaults to `data-testid`, configurable with `use.testIdAttribute`). CSS and XPath are a last resort because they depend on the DOM structure [S5]. Locators are strict: an action on a locator that matches several elements throws. The docs advise against bypassing this with `first()`, `last()` or `nth()` [S5]. Narrow a match by chaining and `filter({ hasText })` instead [S1].

**Assertions.** Use web-first assertions (`await expect(locator).toBeVisible()`), which retry until they pass or time out. `expect(await locator.isVisible()).toBe(true)` returns immediately and causes flaky tests [S1]. Use `expect.soft()` to collect several failures in one test [S1].

**Timeouts.** By default a test may take 30 s and an assertion 5 s. Actions and navigation have no timeout of their own and `globalTimeout` is unset [S10]. Use `test.slow()` to triple a slow test's timeout instead of raising the global one [S10].

**Fixtures and page objects.** `test.extend()` defines fixtures that set up, `use()` and tear down. Use worker-scoped fixtures (`{ scope: 'worker' }`) for costly per-worker resources such as accounts, and `{ auto: true }` fixtures for cross-cutting work such as attaching logs on failure [S9]. A page object takes the `Page` in its constructor, stores its locators as `readonly` fields and exposes intent-level methods [S8].

**Authentication.** Log in once in a setup project, save `storageState`, and point the browser projects at it with `storageState` and `dependencies: ['setup']` [S1][S4].

**Parallelism.** Test files run in parallel. Tests in one file run in order unless `fullyParallel: true` or `test.describe.configure({ mode: 'parallel' })` is set [S1][S3].

## Linting and formatting

- Use TypeScript and ESLint. Turn on `@typescript-eslint/no-floating-promises` to catch a missing `await` on a Playwright call [S1].
- Playwright doesn't type-check. It runs tests even with non-critical TypeScript errors, so run `npx tsc -p tsconfig.json --noEmit` before `npx playwright test` in CI [S13]. The runner only reads a few tsconfig options, including `paths`, `baseUrl`, `jsx`, `useDefineForClassFields`, `references` and `extends` [S13].
- `eslint-plugin-playwright` is a community plugin, not maintained by the Playwright team. It provides `playwright.configs['flat/recommended']` for the test file globs [S15]. Its recommended set includes `missing-playwright-await`, `no-focused-test`, `no-skipped-test`, `no-wait-for-timeout`, `no-page-pause`, `no-networkidle`, `no-element-handle`, `no-eval`, `no-force-option`, `no-conditional-in-test`, `expect-expect`, `prefer-locator` and `prefer-web-first-assertions`. `no-raw-locators` is not in the recommended set, so turn it on explicitly to enforce the official locator guidance [S5][S15].
- None of the sources recommends a formatter. Use the project's formatter.

## Security

- `playwright/.auth/*.json` can hold session cookies and headers "that could be used to impersonate you". Never commit it: add `playwright/.auth` to `.gitignore` [S4]. If the state doesn't need to persist between runs, write it under the project's `outputDir`, which is cleaned before each run [S4].
- Keep credentials for the setup project in environment variables or CI secrets, never in spec files. The docs' setup example reads them in `auth.setup.ts` [S4].
- In Docker, running as root disables the Chromium sandbox. That is acceptable for trusted end-to-end tests. When browsing untrusted sites, use a non-root user (`pwuser`) together with the provided seccomp profile [S12].
- Since 1.65, proxy credentials are no longer sent to websites, and cookie matching follows RFC 6265 [S2].
- Headless runs isolate the clipboard from the operating system (1.62) [S2].

## Performance pitfalls

- Hard waits (`page.waitForTimeout`) slow tests down and make them flaky. Rely on auto-waiting locators and web-first assertions [S1][S15].
- `trace: 'on'` for every test is expensive. Use `trace: 'on-first-retry'` [S1][S3].
- Logging in through the UI in every test is slow. Reuse `storageState` from a setup project [S1][S4].
- Installing every browser in CI wastes time. Install only the ones your projects use (`npx playwright install chromium --with-deps`) [S1].
- The docs don't recommend caching browser binaries in CI: restoring the cache takes about as long as downloading them, and OS dependencies can't be cached [S7].
- For large suites, shard across CI jobs (`--shard=1/3`) instead of raising workers on a small runner. The official config uses `workers: 1` on CI for stability [S1][S3][S7].
- In Docker, run Chromium with `--ipc=host` so it doesn't run out of memory, and with `--init` to avoid zombie processes [S12].

## CI/CD and release

- Run on every push and pull request on Linux [S1]. The official GitHub Actions workflow runs `npm ci`, `npx playwright install --with-deps` and `npx playwright test`, then uploads `playwright-report/` with `actions/upload-artifact` under `if: ${{ !cancelled() }}`, keeping it for 30 days [S6].
- In the config: `forbidOnly: !!process.env.CI`, `retries: process.env.CI ? 2 : 0`, `workers: process.env.CI ? 1 : undefined`, `reporter: 'html'` and `globalTimeout` [S3]. Set `globalTimeout` in the config rather than a job-level timeout, so the reporters still produce a report when the run times out [S6].
- `webServer` starts the app before the tests. Set `reuseExistingServer: !process.env.CI` so CI always starts a fresh server [S3].
- Optional flags: `--fail-on-flaky-tests` to treat flakiness as failure, `--only-changed` for fast pull-request runs, `--repeat-each` and `--shuffle` to find order-dependent tests [S14]. Since 1.65, a shard that matches no tests fails unless `--pass-with-no-tests` is given [S2][S14].
- Pin the Docker image to the project's Playwright version (e.g. `mcr.microsoft.com/playwright:v1.65.1-noble`). If the versions differ, Playwright can't find its browsers [S7][S12].
- Upgrade with `npm install -D @playwright/test@latest` followed by `npx playwright install`, and read the release notes before upgrading [S1].

## Conventions

- **Clean Architecture:** applies at the test-code level. The dependency rule runs from specs to fixtures to page objects to the Playwright API. Specs describe behaviour through fixtures and page-object methods and don't build selectors themselves. Page objects know the UI but nothing about test scenarios [S8][S9]. Test code never imports application internals: it tests through the browser, the way a user does [S1]. The application's own layering is outside this pack's scope.
- **Atomic Design:** not applicable to E2E specs, which test whole user flows, not component levels. The one useful mapping: page objects can be built from smaller component objects (header, list item) that mirror the app's organisms, composed with chained locators [S1][S8].
- **Humble Object:** keep specs thin. Data setup, login and teardown live in fixtures (`test.extend`, setup projects). UI interaction lives in page objects. The spec keeps only the steps and the assertions. Logic that can be checked without a browser, such as test-data builders, can be plain functions with their own unit tests [S4][S9].

## Version notes

- **1.65:** TypeScript class fields follow `useDefineForClassFields`, so a field initializer that reads a constructor parameter property now fails. Assign locators in the constructor body [S2][S13]. Actions wait for elements to stop being inert. Inert and non-rendered text no longer counts toward accessible names. Empty shards fail. Node.js 20 is no longer tested [S2].
- **1.64:** JSX follows `tsconfig.json`. `--update-snapshots=missing` now passes the run. Elements inside hidden iframes count as hidden [S2].
- **1.60 removed:** `Locator.ariaRef()`, the `videosPath`/`videoSize` context options, and the `logger` option on `connect`/`connectOverCDP` [S2].
- **1.59 removed:** `@playwright/experimental-ct-svelte`. The experimental `ct-react`/`ct-vue` packages haven't been updated since 1.63 [S2].
- **1.58 removed:** the `_react`/`_vue` selectors, the `:light` suffix and the `devtools` launch option [S2].
- **1.57 removed:** `page.accessibility`. Use `page.ariaSnapshot()` and aria snapshots instead [S2].
- **1.52:** URL glob patterns no longer support `?` and `[]` [S2].
- **1.54:** Node.js 16 removed and Node.js 18 deprecated [S2].
- **Deprecated:** `consoleMessage.location().lineNumber`/`columnNumber` (use `line`/`column`) [S2].

## Rules

| ID | Rule | Enforce with | Sources |
|---|---|---|---|
| PLAYWRIGHT-01 | Await every Playwright API call and every `expect(locator)` assertion. | lint: @typescript-eslint/no-floating-promises | S1, S15 |
| PLAYWRIGHT-02 | Assert with web-first assertions (`await expect(locator).toBeVisible()`), never `expect(await locator.isVisible()).toBe(true)`. | lint: eslint-plugin-playwright playwright/prefer-web-first-assertions | S1, S15 |
| PLAYWRIGHT-03 | Locate elements with `getByRole`, then label, text, placeholder, alt text or title, then `getByTestId`. No CSS or XPath selectors tied to DOM structure or classes. | lint: eslint-plugin-playwright playwright/no-raw-locators | S1, S5, S15 |
| PLAYWRIGHT-04 | Don't use `first()`, `last()` or `nth()` to get past locator strictness. Narrow the locator with chaining or `filter()`. | review | S1, S5 |
| PLAYWRIGHT-05 | No hard waits: never call `page.waitForTimeout()`. Rely on auto-waiting and assertions. | lint: eslint-plugin-playwright playwright/no-wait-for-timeout | S1, S15 |
| PLAYWRIGHT-06 | `playwright.config.ts` sets `forbidOnly: !!process.env.CI` so a stray `test.only` fails CI. | config: playwright.config.ts forbidOnly: !!process.env.CI | S3, S14 |
| PLAYWRIGHT-07 | Retry only on CI (`retries: process.env.CI ? 2 : 0`) and record traces with `trace: 'on-first-retry'`, never `'on'` for all tests. | config: playwright.config.ts retries and use.trace 'on-first-retry' | S1, S3 |
| PLAYWRIGHT-08 | CI runs `npx tsc -p tsconfig.json --noEmit` before `npx playwright test`. | ci: npx tsc -p tsconfig.json --noEmit | S1, S13 |
| PLAYWRIGHT-09 | Log in once in a `setup` project (`tests/auth.setup.ts`) and share `storageState` through `dependencies: ['setup']`. No UI login in each test. | config: playwright.config.ts projects[].dependencies ['setup'] and storageState | S1, S4 |
| PLAYWRIGHT-10 | `playwright/.auth` is listed in `.gitignore`. Saved storage state is never committed. | config: .gitignore playwright/.auth | S4 |
| PLAYWRIGHT-11 | Each test is independent: no state shared between tests and no dependence on test order. Shared setup goes in `beforeEach` or fixtures. | ci: npx playwright test --shuffle | S1, S14 |
| PLAYWRIGHT-12 | Mock third-party services with `page.route(...).fulfill(...)`. Tests never call external APIs the team doesn't own. | review | S1 |
| PLAYWRIGHT-13 | Specs import `test` and `expect` from the project's fixtures module. Page objects take `Page` in the constructor, assign `readonly` `Locator` fields in the constructor body (not in field initializers, because of `useDefineForClassFields`) and expose intent-level methods. | review | S2, S8, S9, S13 |
| PLAYWRIGHT-14 | Set a `globalTimeout` in the config rather than relying on a CI job timeout. Use `test.slow()` for single slow tests instead of raising the global test timeout. | config: playwright.config.ts globalTimeout | S3, S6, S10 |
| PLAYWRIGHT-15 | CI installs only the browsers the projects use, with OS dependencies (`npx playwright install <browser> --with-deps`). Browser binaries are not cached. | ci: npx playwright install --with-deps | S1, S6, S7 |
| PLAYWRIGHT-16 | CI uploads `playwright-report/` as an artifact under `if: ${{ !cancelled() }}`. | ci: actions/upload-artifact path playwright-report/ | S6 |
| PLAYWRIGHT-17 | Pin the Playwright Docker image tag to the exact `@playwright/test` version (e.g. `v1.65.1-noble`), and run it with `--init` and `--ipc=host`. | review | S7, S12 |
| PLAYWRIGHT-18 | Generate visual snapshot baselines in the same environment as CI (Linux), commit the `-snapshots` folders, and update them only with `npx playwright test --update-snapshots`. | review | S1, S11, S14 |
| PLAYWRIGHT-19 | No `page.pause()` or `test.only` in committed tests. | lint: eslint-plugin-playwright playwright/no-page-pause and playwright/no-focused-test | S3, S14, S15 |

## Sources

| ID | Kind | Title | URL |
|---|---|---|---|
| S1 | official | Best Practices | https://playwright.dev/docs/best-practices |
| S2 | official | Release notes | https://playwright.dev/docs/release-notes |
| S3 | official | Test configuration | https://playwright.dev/docs/test-configuration |
| S4 | official | Authentication | https://playwright.dev/docs/auth |
| S5 | official | Locators | https://playwright.dev/docs/locators |
| S6 | official | Setting up CI | https://playwright.dev/docs/ci-intro |
| S7 | official | Continuous Integration | https://playwright.dev/docs/ci |
| S8 | official | Page object models | https://playwright.dev/docs/pom |
| S9 | official | Fixtures | https://playwright.dev/docs/test-fixtures |
| S10 | official | Timeouts | https://playwright.dev/docs/test-timeouts |
| S11 | official | Visual comparisons | https://playwright.dev/docs/test-snapshots |
| S12 | official | Docker | https://playwright.dev/docs/docker |
| S13 | official | TypeScript | https://playwright.dev/docs/test-typescript |
| S14 | official | Command line | https://playwright.dev/docs/test-cli |
| S15 | community | eslint-plugin-playwright | https://github.com/playwright-community/eslint-plugin-playwright |
| S16 | maintainer | microsoft/playwright examples/todomvc | https://github.com/microsoft/playwright/tree/main/examples/todomvc |
