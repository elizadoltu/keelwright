---
id: tailwind
name: Tailwind CSS
packages: [tailwindcss, "@tailwindcss/*"]
major: 4
researchedAt: 2026-11-16
status: draft
---

# Stack pack: Tailwind CSS 4

## Summary

Tailwind CSS is a utility-first CSS framework: you style elements by combining single-purpose classes directly in markup, and Tailwind generates only the CSS for the classes it finds in your source files [S1][S2]. This pack covers Tailwind CSS 4 (researched at 4.3.5), which moved configuration from `tailwind.config.js` into CSS (`@theme`, `@source`, `@utility`, `@custom-variant`), ships a rewritten engine, first-party Vite/PostCSS/CLI integrations, and targets modern browsers only (Safari 16.4+, Chrome 111+, Firefox 128+) [S3][S4][S5].

## Project structure

- **One CSS entry point** that starts with `@import "tailwindcss";` — this replaces the v3 `@tailwind base/components/utilities` directives [S3][S6]. Typical locations: `src/style.css` (Vite) or `app/globals.css` (Next.js) [S6][S7].
- **Build integration** — pick one, per the official install guides:
  - Vite: `tailwindcss` + `@tailwindcss/vite`, registered as `tailwindcss()` in `vite.config.ts`; the docs recommend the Vite plugin over PostCSS where available [S6][S3][S4].
  - PostCSS (e.g. Next.js): `tailwindcss` + `@tailwindcss/postcss` + `postcss`, with `postcss.config.mjs` containing `plugins: { "@tailwindcss/postcss": {} }` [S7][S3]. `postcss-import` and `autoprefixer` are no longer needed — imports and vendor prefixing are built in [S3].
  - CLI: `npx @tailwindcss/cli -i input.css -o output.css` [S3]. Since 4.3.4 there are also `@tailwindcss/webpack` and `@tailwindcss/turbopack` loaders [S8].
- **No `tailwind.config.js` by default.** Design tokens live in `@theme` blocks in CSS [S5][S9]. A JS config is only loaded if you opt in with `@config "./tailwind.config.js"`, a compatibility feature [S3][S10].
- **Shared tokens in their own file.** For monorepos or multiple apps, put `@theme { ... }` in e.g. `packages/brand/theme.css` and `@import` it after `tailwindcss` in each app's stylesheet [S9].
- **Source detection is automatic.** Tailwind scans every file except `.gitignore`d files, `node_modules`, binaries, CSS files and lockfiles; add others with `@source "../node_modules/@acme/ui"`, exclude with `@source not "..."`, set the base with `@import "tailwindcss" source("../src")` [S2].

## Naming

- **Theme variables follow namespaces**: `--color-*` → `bg-*`/`text-*`, `--font-*` → `font-*`, `--breakpoint-*` → responsive variants, `--spacing-*`, `--radius-*`, `--shadow-*`, `--ease-*`, `--animate-*` [S9]. Name tokens semantically within those namespaces (e.g. `--color-brand-500`) so the utility name follows.
- **`@theme` vs `:root`**: "Use `@theme` when you want a design token to map directly to a utility class, and use `:root` for defining regular CSS variables that shouldn't have corresponding utility classes" [S9]. Theme variables must be top-level, not nested in selectors or media queries [S9].
- **Custom utilities** are declared with `@utility name { ... }`; functional ones use `--value()` (e.g. `@utility tab-* { tab-size: --value(integer); }`) [S11]. **Custom variants** use `@custom-variant name (selector)` [S11].
- **v4 class-name changes**: the scale shifted (`shadow-sm`→`shadow-xs`, `shadow`→`shadow-sm`, same for `rounded`, `blur`, `drop-shadow`, `backdrop-blur`), `outline-none`→`outline-hidden`, `ring`→`ring-3`; the important modifier goes at the end (`bg-red-500!`); CSS-variable shorthand uses parentheses (`bg-(--brand-color)`); prefixes are variant-style (`tw:flex`) [S3].
- **Variant order**: stacked variants now apply left to right (`*:first:pt-0`, not `first:*:pt-0`) [S3].

## Testing

Tailwind produces CSS, so there is little to unit-test. Test what matters at the right level:

- **Class detection** is the main source of silent breakage: a class built by string interpolation is never generated [S2]. Lint for it (see below) rather than test for it.
- **Visual regression** with Playwright `await expect(page).toHaveScreenshot()` catches real styling regressions; update baselines with `npx playwright test --update-snapshots`, and generate/compare baselines in the same environment because rendering differs across OS and browser versions [S12].
- **Component tests** should assert behaviour and accessible output, not class strings; checking that a variant prop maps to a complete class name is reasonable where variants are a lookup table [S2].
- Test in every browser you target; v4 depends on `@property` and `color-mix()` and some utilities (`field-sizing`, `@starting-style`) have narrower support [S4].

## Linting and formatting

- **Formatting:** `prettier-plugin-tailwindcss` (official) sorts classes into Tailwind's recommended order [S13][S14]. For v4 set `tailwindStylesheet` to the CSS entry point; add `tailwindFunctions` (e.g. `["clsx", "cn", "tw"]`) and `tailwindAttributes` for class strings outside `class`/`className` [S13]. It must be listed **last** in Prettier's `plugins` [S13].
- **Editor:** the official IntelliSense extension (`bradlc.vscode-tailwindcss`) provides autocomplete, hover previews and linting [S14]. Useful lint settings: `tailwindCSS.lint.cssConflict` (classes on one element applying the same property), `tailwindCSS.lint.invalidApply`, `tailwindCSS.lint.suggestCanonicalClasses`, `tailwindCSS.lint.recommendedVariantOrder` [S15]. Associate CSS files with `"files.associations": { "*.css": "tailwindcss" }` so `@theme`/`@utility` aren't flagged [S15]; use `tailwindCSS.classFunctions` for helpers like `clsx` [S15].
- **ESLint:** Tailwind ships no official ESLint plugin. The maintained community plugin `eslint-plugin-better-tailwindcss` supports v4 with correctness rules `no-unknown-classes`, `no-conflicting-classes`, `no-concatenated-classes` and stylistic rules `no-deprecated-classes`, `enforce-canonical-classes`, `no-duplicate-classes`, `enforce-consistent-class-order` [S16]. If Prettier sorts classes, leave `enforce-consistent-class-order` off to avoid two sorters fighting.

## Security

- **Do not use the Play CDN in production.** The `@tailwindcss/browser@4` script "is designed for development purposes only, and is not intended for production" [S17]; it also requires loading and running third-party script at runtime.
- **Never put user input into class names.** Classes must be complete literals for detection anyway [S2]; user-controlled values belong in inline styles or CSS variables (`style={{ "--bg-color": value }}` + `bg-(--bg-color)`), which the docs recommend for values from a database or API [S1]. Validate such values (e.g. a color) before writing them into `style`.
- **Keep `.env` and secrets out of scanned sources.** Tailwind scans all non-ignored files as plain text [S2]; keep secret files in `.gitignore` (the upgrade tool also ignores `.env` files since 4.2.3 [S8]).
- Third-party CSS pulled in via `@source`/`@import` from `node_modules` is part of your output; only add sources you trust [S2].

## Performance pitfalls

- **Dynamic class names** (`` `bg-${color}-600` ``) produce no CSS; map props to complete class strings in a lookup object instead [S2].
- **CSS modules and component `<style>` blocks** are each processed separately: "if you have 50 CSS modules in a project, Tailwind needs to run 50 separate times" [S4]. Prefer utilities in markup; where a separate stylesheet is unavoidable, use plain `var(--color-*)` (lets Tailwind skip the file) or `@reference "../app.css"` before `@apply` — never `@import` the full stylesheet there, which duplicates CSS [S4][S10].
- **Over-scanning**: exclude large directories that contain no Tailwind classes with `@source not`, and use `source(none)` plus explicit `@source` when you build several stylesheets [S2].
- **Safelisting** with `@source inline("...")` and brace ranges can generate many classes; keep the list minimal [S2].
- **Preprocessors** (Sass, Less, Stylus) are not supported in v4 — "Think of Tailwind CSS itself as your preprocessor" [S4][S3].
- **Use the Vite plugin** where possible; it is the first-party, faster path compared with PostCSS [S5][S3].
- `@theme` emits only the variables you use; `@theme static` forces all of them — use it only when runtime JS needs every token [S9].

## CI/CD and release

- Build CSS with the project's bundler (`vite build`, `next build`) or `@tailwindcss/cli`; no separate purge step exists — output contains only detected classes [S2][S3].
- Run `prettier --check` with the Tailwind plugin, plus ESLint/IntelliSense-equivalent checks, in CI [S13][S16].
- Run Playwright visual tests in a pinned container so baselines are stable [S12].
- When upgrading from v3, run `npx @tailwindcss/upgrade` (requires Node.js 20+) on a branch, review the diff and check the result in the browser [S3]. Pin `tailwindcss` and `@tailwindcss/*` to the same version — they release together [S8].

## Conventions

- **Clean Architecture:** Tailwind is presentation-only and sits entirely in the UI/framework layer. Design tokens (`@theme` files) are UI configuration; domain and application code must not import class strings or tokens. The dependency rule is satisfied by keeping all class names inside UI components and passing semantic props (`variant="danger"`), not class strings, from outer code [S1].
- **Atomic Design:** maps cleanly. *Tokens* = `@theme` variables (shared `theme.css`) [S9]; *atoms* = components that own their utility classes (Button, Input) and expose variant props rather than accepting arbitrary `className` overrides, as the docs recommend for component libraries [S1]; *molecules/organisms* compose atoms and add only layout utilities (`flex`, `grid`, `gap-*`). Repetition is solved by components/partials, not by `@apply` classes [S1].
- **Humble Object:** keep the class-choice logic (variant → class string maps, state → class) in plain functions or constant objects that can be tested without rendering; the rendering component stays a thin shell that applies the result [S2]. Theme reads in JS should go through CSS variables (`var(--color-blue-500)`, `getComputedStyle`) instead of a resolved JS config [S9][S3].

## Version notes

Breaking changes from v3 [S3]:

- `@tailwind` directives → `@import "tailwindcss"`; `tailwindcss` PostCSS plugin → `@tailwindcss/postcss`; CLI → `@tailwindcss/cli`.
- JS config not auto-detected (use `@config`); `corePlugins`, `safelist`, `separator` unsupported; `resolveConfig` removed; `theme()` deprecated in favour of CSS variables. `@config`, `@plugin` and `theme()` exist only for v3 compatibility [S10].
- `@layer utilities`/`@layer components` no longer register utilities — use `@utility` [S3].
- Removed: `*-opacity-*` (use `/50` modifiers), `flex-shrink-*`, `flex-grow-*`, `overflow-ellipsis`, `decoration-slice/clone`. Renamed scale (`shadow`, `rounded`, `blur`, `drop-shadow`, `backdrop-blur`), `outline-none`→`outline-hidden`, `ring`→`ring-3`.
- Defaults changed: border/divide color is `currentColor`; ring is 1px `currentColor`; placeholder is 50% current color; buttons use `cursor: default`; `hidden` attribute wins over display utilities.
- `space-*`/`divide-*` selectors changed (`> :not(:last-child)`); prefer `gap`.
- `hover:` only applies under `@media (hover: hover)`.
- `transform-none` no longer resets `rotate/scale/translate`; arbitrary grid values need `_` not `,`; `bg-[--var]` → `bg-(--var)`; variants stack left to right; `!` goes at the end.
- Sass/Less/Stylus unsupported; Vue/Svelte/Astro `<style>` blocks and CSS modules need `@reference` for `@apply` [S3][S4].

Minor releases: 4.3 added `scrollbar-*`, `zoom-*`, `tab-*` utilities and stacked/compound `@variant`, and made `--value()` mandatory in functional `@utility` [S8]. 4.3.1 simplified spacing output; 4.3.4 added `@tailwindcss/turbopack` [S8]. Dark mode defaults to `prefers-color-scheme`; switch with `@custom-variant dark (&:where(.dark, .dark *));` [S18]. Ecosystem: `tailwind-merge` v3 supports Tailwind 4.0–4.3 (v2 is for Tailwind 3) [S19]; shadcn/ui maps its CSS variables into Tailwind with `@theme inline` and replaced `tailwindcss-animate` with `tw-animate-css` [S20].

## Rules

| ID | Rule | Enforce with | Sources |
|---|---|---|---|
| TAILWIND-01 | The CSS entry point uses `@import "tailwindcss";`; never `@tailwind base/components/utilities`. | review | S3, S6 |
| TAILWIND-02 | Integrate via `@tailwindcss/vite` in Vite projects and `@tailwindcss/postcss` otherwise; do not add `autoprefixer` or `postcss-import` alongside it. | config: vite.config `plugins: [tailwindcss()]` / postcss.config.mjs `"@tailwindcss/postcss": {}` | S3, S6, S7 |
| TAILWIND-03 | Define design tokens in `@theme` (top level, in a shared CSS file if several apps use them); do not create a new `tailwind.config.js`, and use `@config` only for unmigrated v3 configs. | review | S3, S9, S10 |
| TAILWIND-04 | Always write complete, literal class names; never build them by string concatenation or interpolation — map props to full class strings in a lookup object. | lint: eslint-plugin-better-tailwindcss no-concatenated-classes | S2, S16 |
| TAILWIND-05 | Do not use v3-removed or deprecated classes (`*-opacity-*`, `flex-grow-*`, `flex-shrink-*`, `overflow-ellipsis`, leading `!important` modifier, `bg-[--var]`); use their v4 replacements. | lint: eslint-plugin-better-tailwindcss no-deprecated-classes | S3, S16 |
| TAILWIND-06 | Never put two classes that set the same CSS property on one element; choose one conditionally. | lint: eslint-plugin-better-tailwindcss no-conflicting-classes | S1, S15, S16 |
| TAILWIND-07 | Every class used must be a known Tailwind utility or a custom `@utility`; unknown classes are reported (Tailwind silently discards tokens that map to no utility). | lint: eslint-plugin-better-tailwindcss no-unknown-classes | S2, S16 |
| TAILWIND-08 | Sort classes with `prettier-plugin-tailwindcss`, configured with `tailwindStylesheet` pointing to the CSS entry and listed last in `plugins`. | format: prettier-plugin-tailwindcss | S13, S14 |
| TAILWIND-09 | Declare custom utilities with `@utility`, not as classes in `@layer utilities`; reserve `@layer components` for rare cases where a component/partial is too heavy. | review | S1, S3, S11 |
| TAILWIND-10 | Remove duplication with components or template partials, not with `@apply` classes; components expose variant props instead of accepting arbitrary class overrides. | review | S1 |
| TAILWIND-11 | Avoid CSS modules and component `<style>` blocks; where one is unavoidable, use `var(--…)` theme variables or `@reference` the main stylesheet before `@apply` — never `@import "tailwindcss"` there. | lint: IntelliSense tailwindCSS.lint.invalidApply | S4, S10, S15 |
| TAILWIND-12 | Do not use Sass, Less or Stylus with Tailwind 4; use native CSS (variables, nesting, `color-mix()`). | review | S3, S4 |
| TAILWIND-13 | Pass runtime values (from APIs, users, databases) via inline styles or CSS variables (`style="--x: …"` + `bg-(--x)`), never by inserting them into class names; validate them first. | review | S1, S2 |
| TAILWIND-14 | Do not ship the Play CDN (`@tailwindcss/browser`) script in production builds. | review | S17 |
| TAILWIND-15 | Use arbitrary values (`[...]`) only for genuine one-offs; repeated values become `@theme` tokens. | review | S11, S9 |
| TAILWIND-16 | Read theme values in JS through CSS variables (`var(--color-*)`, `getComputedStyle`); do not import `tailwindcss/resolveConfig` or a JS config at runtime. | review | S3, S9 |
| TAILWIND-17 | Configure class-based dark mode only with `@custom-variant dark (...)` in CSS, and set the class before first paint to avoid a flash. | review | S18 |
| TAILWIND-18 | Keep `tailwindcss` and all `@tailwindcss/*` packages on the same exact version; upgrade majors with `npx @tailwindcss/upgrade` on a branch. | review | S3, S8 |
| TAILWIND-19 | Prefer canonical class forms (e.g. `text-[red]` over `[color:red]/100`) as suggested by the tooling. | lint: eslint-plugin-better-tailwindcss enforce-canonical-classes | S15, S16 |

## Sources

| ID | Kind | Title | URL |
|---|---|---|---|
| S1 | official | Styling with utility classes | https://tailwindcss.com/docs/styling-with-utility-classes |
| S2 | official | Detecting classes in source files | https://tailwindcss.com/docs/detecting-classes-in-source-files |
| S3 | official | Upgrade guide (v3 → v4) | https://tailwindcss.com/docs/upgrade-guide |
| S4 | official | Compatibility | https://tailwindcss.com/docs/compatibility |
| S5 | official | Tailwind CSS v4.0 release post | https://tailwindcss.com/blog/tailwindcss-v4 |
| S6 | official | Installing Tailwind CSS with Vite | https://tailwindcss.com/docs/installation/using-vite |
| S7 | official | Install Tailwind CSS with Next.js | https://tailwindcss.com/docs/installation/framework-guides/nextjs |
| S8 | official | tailwindcss GitHub releases | https://github.com/tailwindlabs/tailwindcss/releases |
| S9 | official | Theme variables | https://tailwindcss.com/docs/theme |
| S10 | official | Functions and directives | https://tailwindcss.com/docs/functions-and-directives |
| S11 | official | Adding custom styles | https://tailwindcss.com/docs/adding-custom-styles |
| S12 | maintainer | Playwright: Visual comparisons | https://playwright.dev/docs/test-snapshots |
| S13 | maintainer | prettier-plugin-tailwindcss README | https://github.com/tailwindlabs/prettier-plugin-tailwindcss |
| S14 | official | Editor setup | https://tailwindcss.com/docs/editor-setup |
| S15 | maintainer | Tailwind CSS IntelliSense README | https://github.com/tailwindlabs/tailwindcss-intellisense/blob/main/packages/vscode-tailwindcss/README.md |
| S16 | community | eslint-plugin-better-tailwindcss README | https://github.com/schoero/eslint-plugin-better-tailwindcss |
| S17 | official | Play CDN | https://tailwindcss.com/docs/installation/play-cdn |
| S18 | official | Dark mode | https://tailwindcss.com/docs/dark-mode |
| S19 | reference-project | tailwind-merge README (widely used class-merging library, tracks Tailwind versions) | https://github.com/dcastil/tailwind-merge |
| S20 | reference-project | shadcn/ui: Tailwind v4 (widely used component collection built on Tailwind 4) | https://ui.shadcn.com/docs/tailwind-v4 |
