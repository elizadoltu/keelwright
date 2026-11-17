# Step: `scaffold`

Create a working repository for the chosen stack: the application skeleton, exact versions, configuration from the stack packs, the generated theme, git hooks with secret scanning, CI, dependency updates and tests that pass. For engines whose projects are created in their editor (Unity, Unreal, native IDE apps — toolchain `editor`), write setup instructions instead and create everything else.

**Reads:** the state (`stack` with `toolchain`, `documents`, `projectType`), `docs/architecture/overview.md` (code structure, routes, deployment), the ADRs, `.keelwright/stack-packs/*.md` (approved at gate 3), `design/tokens.json`, `docs/architecture/schema.sql`, the type-specific documents that name things the skeleton needs (`docs/design/screen-flow.md` screens, `docs/gdd.md` scenes, `docs/ai/system-design.md` prompts and tools, `docs/api-surface.md` public items, `design/asset-pipeline.md` LFS patterns), `<plugin root>/reference/toolchains.md`, and for web projects `<plugin root>/reference/web-scaffold.md`.
**Produces:** the repository files; `.keelwright/scaffold.md` (what was created and which pack rules were applied where).
**Gate:** none — continues to `generate`.

This step runs package installs and creates many files. Tell the user what it is about to do (one short paragraph) before starting, and keep them informed with one line per stage.

**Toolchain rules:** `reference/toolchains.md` for the project's `stack.toolchain` — the generator, the task contract (`node "<plugin root>/scripts/toolchains.mjs" tasks <toolchain> <project type>` lists the tasks this project must have), versions, git hooks, CI, ignores. Where this file says `npm`, Husky or Playwright, it means the toolchain's equivalent there. Web projects follow `reference/web-scaffold.md` as well.

Claude Code asks for approval before writing some paths, such as `.husky/`, `.npmrc` and `.vscode/`; tell the user to expect those prompts. If a write is refused or can't be approved (e.g. a headless run), use the tool's own command where one exists (e.g. `npm config set … --location=project` for `.npmrc`); otherwise show the user the exact file content, leave the step `in_progress`, and finish on the next `/kickoff`.

## 1. Preflight

Run `node "<plugin root>/scripts/preflight.mjs"`.
- **FAIL** — stop. Show what's missing and how to fix it (e.g. install the Node.js version with their version manager), leave the step `in_progress`, and tell the user to run `/kickoff` again afterwards.
- **WARN** — tell the user and continue (e.g. a Node.js that works but isn't the LTS `.nvmrc` will pin; gitleaks not installed yet — the hook will ask for it).

If the folder isn't a git repository, run `git init` (the hooks need it). Never commit for the user.

## 2. Generate the application

1. Resolve the framework's official generator (e.g. `create-astro`, `create-expo-app`; `uv`, `flutter`, `cargo` are the installed tools themselves) with `scripts/versions.mjs` and read its `--help` to find the non-interactive options. Run it **pinned to that version**, into a temporary folder `.keelwright/tmp-app/`, with: no prompts, no dependency install, no git init, the smallest template that has what the architecture needs, and no agent files of its own (e.g. `--no-agents-md` for Expo — the `generate` step owns `CLAUDE.md`, `AGENTS.md` and `.claude/`).
2. Move the generated files into the project root without overwriting anything KeelWright or the user created (`docs/`, `design/`, `.keelwright/`, `README.md` if it exists). Delete `.keelwright/tmp-app/`.
3. If the framework has no generator with a non-interactive mode (Godot, Phaser, a TypeScript library), follow `reference/toolchains.md` for that toolchain: an official template pinned to a commit, or the minimal files by hand following the framework pack's "Project structure".
4. **Editor-based engines** (`editor`): don't try to create the engine project. Write `docs/setup.md` as `reference/toolchains.md` describes — the engine version, the exact steps to create the project in this folder, the template and packages, where code goes, how to run the tests — and continue with step 6 (hooks, CI, ignores) and step 8's `scaffoldcheck`.

## 3. Versions and dependencies

Follow "Versions" in `reference/toolchains.md` (and `reference/web-scaffold.md` for web):
- Dependencies from `stack.versions` — exact for apps; for libraries, ranges with the resolved version as the lower bound for what users install, exact for development tools.
- Tools the stack packs' rules require (ESLint plugins, Prettier plugins, configs, coverage provider…) — resolve them now, check peers, add them to `stack.versions`. Don't add a package no rule or document asks for.
- Then install with the toolchain's tool (`npm install`, `uv sync`, `flutter pub get`, `cargo fetch`) and confirm it reports no dependency conflicts. The lockfile is committed.

## 4. Configuration from the stack packs

Go through every rule in `.keelwright/stack-packs/*.md` whose "Enforce with" is `config`, `lint`, `format` or `types`, and apply it in the matching config file — unless the gate 3 review marked it not applicable. Use the exact settings and rule names the pack gives. Rules that duplicate each other across packs are applied once.

Record each applied rule in `.keelwright/scaffold.md`:

```markdown
# Scaffold

- Date: YYYY-MM-DD
- Generator: <generator>@<version> <options>
- Node.js used: <local version> (project pins <LTS>)

## Pack rules applied

| Rule | Where |
|---|---|
| ASTRO-01 | tsconfig.json `extends` |

## Pack rules not applied

| Rule | Why |
|---|---|
| ASTRO-08 | Not applicable: no Astro Actions (ADR-0005) |

## Left for the generate step

- <rules of kind hook / ci / review, which become hooks, CI checks and CLAUDE.md rules>
```

`hook` and `ci` rules are applied in steps 6–7 below; `review` rules are left to `generate`.

## 5. Structure, skeleton and theme

- Create the folders from the architecture overview's "Code structure" that the skeleton uses, and the **walking skeleton** for the type — placeholder text plain and short, no lorem ipsum, no invented content:
  - **web:** every P1 route with its layout, `<title>`, `lang` and a placeholder `<h1>` (see "The skeleton" in the web reference);
  - **mobile:** every P1 screen of the screen flow (`S-` IDs) as a route / screen with its title, reachable through the navigation model;
  - **game:** the GDD's scenes (title, play, game over…) wired so the game starts, moves between them and quits; one game rule in plain code with a test;
  - **ai:** the service entry point, one prompt file per `P-` ID in `prompts/` (the text the AI system design gives, or a short placeholder marked `[NEEDS CLARIFICATION]`), tool functions per `T-` ID as typed stubs that refuse to act, the model adapter reading its key from the environment, `evals/data/` from the eval plan, and the `eval` task running the graders over it (never run it here — it costs money; the step only checks it starts);
  - **library / CLI:** the package entry with every P1 `API-` item as a typed stub, the CLI entry with `--help` and `--version` when it's a CLI, and the package build.
- Theme (when `design/tokens.json` exists): copy `<plugin root>/scripts/tokens-to-css.mjs` to `scripts/tokens-to-css.mjs` and `<plugin root>/scripts/lib/tokens.mjs` to `scripts/lib/tokens.mjs`; add the `tokens` task; generate the theme — the output file's extension picks the target: `.css` for web (import it from the global stylesheet), `.ts` for Expo / React Native (e.g. `src/theme/tokens.ts`), `.dart` for Flutter (e.g. `lib/theme/tokens.dart`). Bundle the fonts the visual identity names (web: `@fontsource-variable/<font>` packages; apps: the framework's font loading), resolved like any other dependency.
- Binary assets (games, or apps with large media): `.gitattributes` with the Git LFS patterns from the asset pipeline.

## 6. Hooks, CI, dependency updates, environment

Follow "Git hooks" and "CI and dependency updates" in `reference/toolchains.md` (web: "Files" in `reference/web-scaffold.md`), using the `git-hooks` or `pre-commit` pack for the exact hook commands and the pack rules of kind `hook` and `ci`. Pin every action and pre-commit hook by SHA. List every environment variable the code reads in `.env.example`; never create `.env`.

## 7. Database

Only when `docs/architecture/schema.sql` exists: `supabase init` (non-interactive), then copy the schema into `supabase/migrations/<UTC timestamp>_init.sql`. From now on the migrations are the source of truth for the schema (spec 6.0).

## 8. Make it pass

1. Web: `npx playwright install chromium` (or the browsers the Playwright config uses) — tell the user it downloads browsers.
2. Run the `check` task, then `build` when the project has one, then `test:e2e` when it has one (web: `npm run check`, `npm run build`, `npm run test:e2e`; e.g. Python: `uv run poe check`; Godot: `just check`). Fix every failure in the scaffold (never by weakening a check or deleting a test) and run again until all pass. Count each failing round with `STATE metric scaffold check-failures +1`. Editor-based engines have no tasks to run here.
3. Run `node "<plugin root>/scripts/scaffoldcheck.mjs"` and fix every issue until it passes.

## 9. Finish

1. Tell the user: what was created, the commands they'll use (e.g. `npm run dev`, `npm run check`; `uv run poe check`; `just check`), how to install the git hooks when the toolchain needs a step for it (`uvx pre-commit install` for pre-commit), anything the preflight warned about, and that the scaffold is ready to commit (`git add -A && git commit -m "chore: scaffold project"` — the hooks run on that commit). For editor-based engines: that `docs/setup.md` is the next thing to do.
2. `STATE complete scaffold <manifest> <lockfile> <runtime pin> <each config file> <hooks: .husky or .pre-commit-config.yaml> .github .env.example .gitignore <justfile> <docs/setup.md> .keelwright/scaffold.md` — only the files that exist; record configuration, not source folders: `src/`, `lib/`, scenes and prompts change with every feature and must not count as an edit to the scaffold. For a Python project the tasks live in `pyproject.toml`, so it is recorded like any manifest.
