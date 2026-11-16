# Step: `scaffold`

Create a working repository for the chosen stack: the application skeleton, exact versions, configuration from the stack packs, the generated theme, git hooks with secret scanning, CI, dependency updates and tests that pass. **This version scaffolds web projects**; other project types arrive later.

**Reads:** the state (`stack`, `documents`, `projectType`), `docs/architecture/overview.md` (code structure, routes, deployment), the ADRs, `.keelwright/stack-packs/*.md` (approved at gate 3), `design/tokens.json`, `docs/architecture/schema.sql`, `<plugin root>/reference/web-scaffold.md`.
**Produces:** the repository files; `.keelwright/scaffold.md` (what was created and which pack rules were applied where).
**Gate:** none — continues to `generate`.

This step runs package installs and creates many files. Tell the user what it is about to do (one short paragraph) before starting, and keep them informed with one line per stage.

Claude Code asks for approval before writing some paths, such as `.husky/`, `.npmrc` and `.vscode/`; tell the user to expect those prompts. If a write is refused or can't be approved (e.g. a headless run), use the tool's own command where one exists (e.g. `npm config set … --location=project` for `.npmrc`); otherwise show the user the exact file content, leave the step `in_progress`, and finish on the next `/kickoff`.

## 1. Preflight

Run `node "<plugin root>/scripts/preflight.mjs"`.
- **FAIL** — stop. Show what's missing and how to fix it (e.g. install the Node.js version with their version manager), leave the step `in_progress`, and tell the user to run `/kickoff` again afterwards.
- **WARN** — tell the user and continue (e.g. a Node.js that works but isn't the LTS `.nvmrc` will pin; gitleaks not installed yet — the hook will ask for it).

If the folder isn't a git repository, run `git init` (the hooks need it). Never commit for the user.

## 2. Generate the application

1. Resolve the framework's official generator (e.g. `create-astro`) with `scripts/versions.mjs` and read its `--help` to find the non-interactive options. Run it **pinned to that version**, into a temporary folder `.keelwright/tmp-app/`, with: no prompts, no dependency install, no git init, the smallest template.
2. Move the generated files into the project root without overwriting anything KeelWright or the user created (`docs/`, `design/`, `.keelwright/`, `README.md` if it exists). Delete `.keelwright/tmp-app/`.
3. If the framework has no generator with a non-interactive mode, create the minimal files by hand following the framework pack's "Project structure".

## 3. Versions and dependencies

Follow "Versions" in `reference/web-scaffold.md`:
- Dependencies from `stack.versions`, exact.
- Tools the stack packs' rules require (ESLint plugins, Prettier plugins, configs, coverage provider…) — resolve them now, check peers, add them to `stack.versions`. Don't add a package no rule or document asks for.
- Then `npm install` and confirm it reports no peer-dependency errors.

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

- Create the folders from the architecture overview's "Code structure" that the skeleton uses, and every **P1 route** with its layout, `<title>`, `lang` and a placeholder `<h1>` (see "The skeleton" in the reference). Placeholder text is plain and short — no lorem ipsum, no invented content.
- Theme: copy `<plugin root>/scripts/tokens-to-css.mjs` to `scripts/tokens-to-css.mjs` and `<plugin root>/scripts/lib/tokens.mjs` to `scripts/lib/tokens.mjs`; add the `tokens` script; generate the CSS; import it from the global stylesheet. Self-host the fonts the visual identity names (e.g. `@fontsource-variable/<font>` packages), resolved like any other dependency.

## 6. Hooks, CI, dependency updates, environment

Follow "Files" in `reference/web-scaffold.md`, using the `git-hooks` pack for the exact hook commands and the pack rules of kind `hook` and `ci`. Pin every action by SHA. List every environment variable the code reads in `.env.example`; never create `.env`.

## 7. Database

Only when `docs/architecture/schema.sql` exists: `supabase init` (non-interactive), then copy the schema into `supabase/migrations/<UTC timestamp>_init.sql`. From now on the migrations are the source of truth for the schema (spec 6.0).

## 8. Make it pass

1. `npx playwright install chromium` (or the browsers the Playwright config uses) — tell the user it downloads browsers.
2. Run `npm run check`, `npm run build`, `npm run test:e2e`. Fix every failure in the scaffold (never by weakening a check or deleting a test) and run again until all three pass. Count each failing round with `STATE metric scaffold check-failures +1`.
3. Run `node "<plugin root>/scripts/scaffoldcheck.mjs"` and fix every issue until it passes.

## 9. Finish

1. Tell the user: what was created, the commands they'll use (`npm run dev`, `npm run check`), anything the preflight warned about, and that the scaffold is ready to commit (`git add -A && git commit -m "chore: scaffold project"` — the hooks run on that commit).
2. `STATE complete scaffold package.json <lockfile> .npmrc .nvmrc <each config file> .husky .github .env.example .gitignore .keelwright/scaffold.md` — record configuration, not source folders: `src/` changes with every feature and must not count as an edit to the scaffold.
