---
id: typescript
name: TypeScript with ESLint and Prettier
packages: [typescript, typescript-eslint, eslint, prettier]
major: 7
researchedAt: 2026-11-16
status: draft
---

# Stack pack: TypeScript with ESLint and Prettier 7

## Summary

TypeScript adds static types to JavaScript. In this pack, `tsc` type-checks the code (and emits it where no bundler does), ESLint with typescript-eslint catches likely bugs that the compiler allows, and Prettier owns all formatting. The researched version is TypeScript 7.0 (7.0.2). It is a native port of the compiler, "often about 10 times faster" than 6.0, with type-checking logic that is structurally identical to 6.0 [S1][S2]. Its biggest practical limit is that it ships **without a programmatic API**, so typescript-eslint still has to run on the TypeScript 6 API [S1][S6]. The other researched versions are ESLint 10.x [S18] and Prettier 3.x [S15].

## Project structure

- `tsconfig.json` sits at the project root. TypeScript 7 changes two defaults that affect layout. `rootDir` now defaults to `./`, so a project with sources in `src/` must set `"rootDir": "./src"`. `types` now defaults to `[]`, so global declaration packages have to be listed, e.g. `"types": ["node"]` [S1].
- Output goes to `outDir` (commonly `dist`), never next to the sources. Libraries need `rootDir: "src"` / `outDir: "dist"`. Without them, extension substitution makes consumers load the `.ts` files instead of the `.d.ts` files [S4].
- Larger codebases split into several `tsconfig.json` projects that use `composite` and project references and are built with `tsc --build`. `composite` makes `declaration` and `incremental` default to `true` and requires every implementation file to match `include`/`files` [S3]. `--builders` controls how many referenced projects build at once [S1].
- `eslint.config.mjs` sits at the root as a flat config, exported through `defineConfig()` from `eslint/config`. Use `globalIgnores()` for build output. `eslint.config.ts` is also supported, but on Node.js it needs `jiti` ≥ 2.2.0 [S18].
- `.prettierrc` (even just `{}`) and `.prettierignore` (e.g. `build`, `coverage`) sit at the root. They tell editors and tools that the project uses Prettier [S15].

## Naming

- Source files are `.ts` (`.tsx` for JSX). `.mts`/`.cts` force ESM/CJS. In bundler projects, don't set `"type": "module"` or use `.mts`, because TypeScript can't model some bundlers' interop under `"moduleResolution": "bundler"` [S4].
- Type-only imports are written `import type { X }`. With `verbatimModuleSyntax`, any import without `type` is kept in the output and any import with `type` is dropped [S3]. `@typescript-eslint/consistent-type-imports` can autofix this style (`fixStyle: "separate-type-imports"` by default) [S5].
- Type test files are named `*.test-d.ts` [S17].
- In Node.js (`nodenext`) and library code, relative imports carry the runtime extension (`./utils.js`). Extensionless imports work under `bundler` resolution but fail in Node.js with `ERR_MODULE_NOT_FOUND` [S4].

## Testing

- The type checker is the first test layer. Run `tsc --noEmit` when a bundler or another tool emits the JavaScript [S3].
- Runtime tests use the project's test runner, which has its own pack. Exported generic or utility types can be tested with Vitest type tests. These use `expectTypeOf(...).toEqualTypeOf<...>()` or `assertType` in `*.test-d.ts` files and run with `vitest --typecheck`, which runs `tsc --noEmit` and parses the result [S17].
- Use `// @ts-expect-error <reason>` in type tests to assert that something must not compile. typescript-eslint's `ban-ts-comment` allows `@ts-expect-error` only with a description (minimum length 3, or 10 in `strict`) and always reports `@ts-ignore` and `@ts-nocheck` [S12].

## Linting and formatting

**ESLint + typescript-eslint.** Use the flat config with `js.configs.recommended` and typescript-eslint's shared configs [S8][S9]:

```js
// eslint.config.mjs
import js from '@eslint/js';
import { defineConfig, globalIgnores } from 'eslint/config';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';

export default defineConfig(
  globalIgnores(['dist/']),
  {
    files: ['**/*.{js,ts}'],
    extends: [js.configs.recommended, tseslint.configs.recommendedTypeChecked],
    languageOptions: { parserOptions: { projectService: true } },
  },
  { files: ['**/*.js'], extends: [tseslint.configs.disableTypeChecked] },
  prettier,
);
```

- typescript-eslint "strongly recommend[s]" type-aware linting [S8]. `recommendedTypeChecked` includes `recommended`. The type-checked variants *replace* their untyped versions rather than being added next to them [S8][S9].
- `strict`, `strictTypeChecked` and `disableTypeChecked` are **not semver-stable**, so their rules can change outside major releases. The docs suggest `strict` only when a substantial share of the team is highly proficient in TypeScript [S9]. `recommended*` and `stylistic*` are stable [S9].
- Key rules: `no-floating-promises` (type-aware, in `recommended-type-checked`) together with `no-misused-promises` [S10]; `no-explicit-any` (in `recommended`) together with the `no-unsafe-*` family [S11]; `ban-ts-comment` [S12].
- Typed linting makes TypeScript build the project first. Editors hide most of that cost, but pre-push hooks and CI pay it in full [S8].

**Prettier.** Install it pinned (`npm install --save-dev --save-exact prettier`), because even patch releases can change output [S15]. Format with `prettier . --write` and check with `prettier . --check` [S15]. ESLint must not format. Neither ESLint core nor typescript-eslint enables formatting rules in its recommended presets. Put `eslint-config-prettier` **last** to turn off any formatting rules that third-party configs enable [S13][S14]. `eslint-plugin-prettier` (Prettier run inside ESLint) is "generally not recommended" because it clutters the editor, runs slower and adds a layer that can break [S14]. For a pre-commit hook, use `husky` + `lint-staged`, running ESLint before `prettier --write --ignore-unknown` [S15].

## Security

- Keep `strict` on. It is the default in 7.0 [S1]. Turning off its members re-opens null and `any` holes. Note that a future version may add new checks under `strict` [S3].
- Treat `any` as "a dangerous escape hatch" and use `unknown` plus narrowing for untrusted input such as JSON, request bodies and environment values [S11]. `no-unsafe-*` rules flag `any` that leaks into calls, assignments and returns [S11].
- Floating promises swallow rejections, including failed auth or validation checks. `no-floating-promises` and `no-misused-promises` catch them [S10].
- `noUncheckedSideEffectImports` now defaults to `true`, so a mistyped side-effect import (`import "./polyfill"`) is an error instead of passing silently [S1].
- Types are erased at runtime. Never treat a type annotation as validation of external data. Validate at the boundary and only then assign a typed value (see Conventions).

## Performance pitfalls

- `--checkers` (default 4) sets the number of type-checker workers. Higher values use more memory, and the results can occasionally depend on order, so pin one value across environments. `--checkers` multiplies with `--builders`. `--singleThreaded` turns parallelism off [S1].
- `skipLibCheck` skips checking `.d.ts` files. The TSConfig reference recommends it, at the cost of possibly hiding conflicting declarations [S3]. `incremental` stores `.tsbuildinfo` to speed up rebuilds [S3].
- Typed linting is the slow part of the toolchain [S8]. ESLint `--cache` does not track dependencies between files, so type-aware rules can report stale results. Don't rely on the cache where accuracy matters [S16]. ESLint 10 offers `--concurrency auto` [S16].
- Running Prettier through ESLint (`eslint-plugin-prettier`) is slower than running Prettier directly [S13][S14].

## CI/CD and release

Run these as separate steps so each failure is easy to read:

1. `tsc --noEmit` (or `tsc --build`) with the TypeScript 7 compiler and a fixed `--checkers` value [S1].
2. `eslint . --max-warnings 0 --report-unused-disable-directives-severity error`. Exit code 1 means lint errors (or too many warnings) and 2 means a configuration error [S16].
3. `prettier . --check` [S15].
4. Tests (including `vitest --typecheck` where type tests exist) [S17].

Libraries publish `.d.ts` files (`declaration: true`), set `target` to the lowest ECMAScript version they support, and ship `declarationMap`/`sourceMap` only if they also ship the `.ts` sources [S4].

## Conventions

- **Clean Architecture.** TypeScript can enforce the dependency rule mechanically. Put each layer (e.g. `domain`, `application`, `infrastructure`) in its own `composite` project, and list only the allowed inner layers in `references`. An import from a project that isn't referenced then fails to resolve under `tsc --build` [S3]. Domain types are plain `interface`/`type` declarations with no framework imports. Ports are interfaces defined in the inner layer and implemented in the outer one.
- **Atomic Design.** Not applicable. TypeScript itself has no component model, so component levels belong to the UI framework's pack. TypeScript only supplies prop types.
- **Humble Object.** Keep boundaries thin. HTTP handlers, CLI entry points and adapters parse `unknown` input into domain types and call pure, fully typed functions. That logic is unit-tested without I/O, and the boundary code only wires things together. `erasableSyntaxOnly` (no `enum`, namespaces or parameter properties) keeps modules runnable under Node.js type stripping [S3].

## Version notes

- **Native compiler, no API.** 7.0 ships its own `tsc` in the `typescript` package, and nightlies use `typescript@next` [S1]. There is no programmatic API until 7.1, which will introduce a *different* API [S1][S2]. Tools that embed TypeScript must stay on 6.0, and so must API-dependent plugins such as webpack loaders and Volar-based tooling. Editor features for Vue, MDX, Astro, Svelte and Angular templates also still need 6.0 [S1].
- **typescript-eslint is not compatible with TS 7.** Its supported range is `typescript >=4.8.4 <6.1.0` (ESLint `^8.57.0 || ^9.0.0 || ^10.0.0`) [S7]. The maintainers say: "typescript-eslint isn't compatible with TS 7 at this time, because there is no TS 7 API" [S6]. Run TypeScript 6 side by side through the official aliases [S1]:

  ```json
  { "devDependencies": {
      "@typescript/native": "npm:typescript@^7.0.2",
      "typescript": "npm:@typescript/typescript6@^6.0.2" } }
  ```

  ESLint then imports the 6.0 API, while `@typescript/native` provides the 7.0 `tsc` for checking and builds [S1][S6].
- **New defaults:** `strict: true`, `module: esnext`, `target` = the ES version just before `esnext`, `noUncheckedSideEffectImports: true`, `libReplacement: false`, `stableTypeOrdering: true` (cannot be turned off), `rootDir: ./`, `types: []` [S1][S2].
- **Now hard errors:** `target: es5`, `downlevelIteration`, `moduleResolution` `node`/`node10`/`classic`, `module` `amd`/`umd`/`systemjs`/`none`, `baseUrl` (rewrite `paths` relative to the project root), `esModuleInterop`/`allowSyntheticDefaultImports`/`alwaysStrict` set to `false`, the `module` keyword for namespaces, and `asserts` on imports (use `with`) [S1][S2]. With a `tsconfig.json` present, file paths on the command line need `--ignoreConfig` [S2].
- **Behaviour changes:** template literal inference keeps Unicode code points intact, which breaks utilities that rely on UTF-16 code units. JavaScript/JSDoc checking now matches `.ts` analysis (`@enum` is no longer special, Closure-style function types are gone) [S1][S2].
- **Migration path:** move to 6.0 first and clear its deprecations, set `rootDir` and `types` explicitly, remove the removed options, keep `tsc6` or a 6.0 alias for API consumers, and wait for 7.1 if you depend on API plugins [S1].
- **Editors:** in VS Code, install the `TypeScriptTeam.native-preview` extension. Any editor that speaks LSP works [S1].

## Rules

| ID | Rule | Enforce with | Sources |
|---|---|---|---|
| TYPESCRIPT-01 | Keep `strict` enabled (the 7.0 default); never set it or any of its member checks to `false`. | config: tsconfig "strict": true | S1, S3 |
| TYPESCRIPT-02 | Set `rootDir` (e.g. `"./src"`) and `types` (e.g. `["node"]`) explicitly in every `tsconfig.json`; don't rely on the 7.0 defaults `./` and `[]`. | config: tsconfig "rootDir" and "types" | S1 |
| TYPESCRIPT-03 | Don't use options removed in 7.0: `baseUrl`, `moduleResolution` `node`/`node10`/`classic`, `target: es5`, `downlevelIteration`, `module` `amd`/`umd`/`systemjs`/`none`; write `paths` relative to the project root. | types: tsc (hard errors in 7.0) | S1, S2 |
| TYPESCRIPT-04 | Pick module settings by project kind: bundled apps use `"module": "esnext"` + `"moduleResolution": "bundler"` + `noEmit`; Node.js apps use `"module": "nodenext"`; libraries use `"module": "node18"` with `declaration`, `rootDir: "src"` and `outDir: "dist"`. | config: tsconfig "module" / "moduleResolution" | S4 |
| TYPESCRIPT-05 | Enable `verbatimModuleSyntax` and write type-only imports as `import type`. | config: tsconfig "verbatimModuleSyntax": true | S3, S4, S5 |
| TYPESCRIPT-06 | Run typescript-eslint against the TypeScript 6 API through the `"typescript": "npm:@typescript/typescript6@^6.0.2"` alias, and run type-checking and builds with the TS 7 `tsc` (`"@typescript/native": "npm:typescript@^7.0.2"`) until typescript-eslint supports TS 7. | config: package.json devDependencies aliases | S1, S6, S7 |
| TYPESCRIPT-07 | Use a flat `eslint.config.mjs` built with `defineConfig` from `eslint/config`, extending `js.configs.recommended` and `tseslint.configs.recommendedTypeChecked`, with `parserOptions.projectService: true`. | config: eslint.config.mjs | S8, S9, S18 |
| TYPESCRIPT-08 | Turn type-aware rules off for plain JavaScript files with `tseslint.configs.disableTypeChecked` on `**/*.js`. | config: eslint.config.mjs tseslint.configs.disableTypeChecked | S9 |
| TYPESCRIPT-09 | Every promise is awaited, returned, or handled with `.catch`; never pass a promise where a non-promise is expected (e.g. an `if` condition). | lint: @typescript-eslint/no-floating-promises, @typescript-eslint/no-misused-promises | S10 |
| TYPESCRIPT-10 | Don't write `any`; use `unknown` and narrow it, or a precise type. | lint: @typescript-eslint/no-explicit-any | S11 |
| TYPESCRIPT-11 | Don't let `any` values flow into calls, assignments, member access or returns. | lint: @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-argument | S11 |
| TYPESCRIPT-12 | Suppress a type error only with `// @ts-expect-error <reason>`; never use `@ts-ignore` or `@ts-nocheck`. | lint: @typescript-eslint/ban-ts-comment | S12 |
| TYPESCRIPT-13 | ESLint does no formatting: put `eslint-config-prettier` last in the config and don't use `eslint-plugin-prettier`. | config: eslint-config-prettier | S13, S14 |
| TYPESCRIPT-14 | Install Prettier with `--save-exact` and keep a `.prettierrc` and `.prettierignore` at the root. | config: package.json exact prettier version | S15 |
| TYPESCRIPT-15 | CI runs `prettier . --check`. | ci: prettier . --check | S15 |
| TYPESCRIPT-16 | CI runs ESLint with zero warnings allowed and reports unused disable directives as errors, without `--cache`. | ci: eslint . --max-warnings 0 --report-unused-disable-directives-severity error | S16 |
| TYPESCRIPT-17 | CI type-checks with the TypeScript 7 compiler and a pinned `--checkers` value so results are the same everywhere. | ci: tsc --noEmit --checkers | S1 |
| TYPESCRIPT-18 | Test exported generic and utility types with `expectTypeOf` in `*.test-d.ts` files, run with `vitest --typecheck`. | test: vitest --typecheck | S17 |

## Sources

| ID | Kind | Title | URL |
|---|---|---|---|
| S1 | official | Announcing TypeScript 7.0 | https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/ |
| S2 | official | Announcing TypeScript 7.0 RC | https://devblogs.microsoft.com/typescript/announcing-typescript-7-0-rc/ |
| S3 | official | TSConfig Reference | https://www.typescriptlang.org/tsconfig/ |
| S4 | official | Modules – Choosing Compiler Options | https://www.typescriptlang.org/docs/handbook/modules/guides/choosing-compiler-options.html |
| S5 | official | typescript-eslint: consistent-type-imports | https://typescript-eslint.io/rules/consistent-type-imports/ |
| S6 | maintainer | typescript-eslint issue #12518: TypeScript 7.0.2 Support | https://github.com/typescript-eslint/typescript-eslint/issues/12518 |
| S7 | official | typescript-eslint: Dependency Versions | https://typescript-eslint.io/users/dependency-versions |
| S8 | official | typescript-eslint: Linting with Type Information | https://typescript-eslint.io/getting-started/typed-linting |
| S9 | official | typescript-eslint: Shared Configs | https://typescript-eslint.io/users/configs |
| S10 | official | typescript-eslint: no-floating-promises | https://typescript-eslint.io/rules/no-floating-promises/ |
| S11 | official | typescript-eslint: no-explicit-any | https://typescript-eslint.io/rules/no-explicit-any/ |
| S12 | official | typescript-eslint: ban-ts-comment | https://typescript-eslint.io/rules/ban-ts-comment/ |
| S13 | official | typescript-eslint: What About Formatting? | https://typescript-eslint.io/users/what-about-formatting |
| S14 | official | Prettier: Integrating with Linters | https://prettier.io/docs/integrating-with-linters |
| S15 | official | Prettier: Install | https://prettier.io/docs/install |
| S16 | official | ESLint: Command Line Interface Reference | https://eslint.org/docs/latest/use/command-line-interface |
| S17 | maintainer | Vitest: Testing Types | https://vitest.dev/guide/testing-types |
| S18 | official | ESLint: Configuration Files | https://eslint.org/docs/latest/use/configure/configuration-files |
