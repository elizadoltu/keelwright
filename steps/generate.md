# Step: `generate`

Generate the project's agent workflow — `CLAUDE.md`, rules, skills, subagents, hooks and settings — and `CONTRIBUTING.md`, all from the same facts, so agents and humans follow the same rules and nothing disagrees.

**In /adopt:** the same step built on the analysis instead of the PRD and the scaffold — read the **In /adopt** section at the end first; it says what replaces what.

**Reads:** `docs/prd.md`, `docs/decisions/`, `docs/architecture/overview.md`, `docs/features.md`, `docs/design/visual-identity.md`, the type-specific documents that exist (`docs/design/screen-flow.md`, `docs/gdd.md`, `docs/ai/system-design.md`, `docs/evals/plan.md`, `docs/api-surface.md`), `.keelwright/stack-packs/*.md` (reviewed at gate 3), `.keelwright/scaffold.md` (pack rules applied, not applied, and left for this step), the manifest and its tasks (`package.json`, `pyproject.toml`, `justfile`), the hook, lint and CI config the scaffold created, `<plugin root>/reference/toolchains.md`, and the templates in `<plugin root>/templates/claude/` and `<plugin root>/templates/development-workflow.md`.
**Produces:** `CLAUDE.md`, `.claude/rules/*.md`, `.claude/agents/{reviewer,tester,docs-keeper}.md`, `.claude/skills/*/SKILL.md`, `.claude/hooks/*.mjs`, `.claude/hooks/config.json`, `.claude/settings.json`, `CONTRIBUTING.md`, `.keelwright/generate.md`.
**Gate:** none — the step ends with a summary for the user.

Claude Code protects `.claude/`: every file this step writes there needs the user's approval, and a session that can't ask (e.g. headless) can't write there at all. Before writing, tell the user to expect about 15 approval prompts (they can allow edits for the rest of the session if the prompt offers it). Never work around the protection (e.g. copying with the shell); if writes are refused, leave the step `in_progress`, say what is still missing, and finish on the next `/kickoff`.

Everything generated is **tailored**: facts, names, paths and commands from this project's documents, never generic advice. A line that would fit any project ("write clean code", "follow best practices") doesn't belong.

## 1. Collect the facts

- **Commands:** the project's tasks, run the toolchain's way — `npm run <task>`, `uv run poe <task>` or `just <task>` (`node "<plugin root>/scripts/toolchains.mjs" tasks <toolchain> <type>`). Use only tasks that exist. The templates show npm commands as examples: write this project's commands instead, and its test tools instead of Vitest / Playwright (e.g. pytest, `flutter test`, gdUnit4, Jest with `jest-expo`). Editor-based engines have no tasks: commands come from `docs/setup.md`.
- **Stack:** from the overview's stack table and `stack.versions`.
- **Structure:** the overview's code structure and routes (or screens, scenes, prompts and tools, public API items); check the folders exist.
- **Conventions:** which of Clean Architecture, Atomic Design and Humble Object the project uses, and how (overview, ADRs).
- **Pack rules**, sorted by what happens to them:
  - **already enforced** — applied by the scaffold (`.keelwright/scaffold.md`, "Pack rules applied"): lint, types, config, CI, hooks check them. They need no prose; CLAUDE.md only says not to disable those checks.
  - **for agents** — every rule with "Enforce with" `review`, plus `hook` / `ci` / `test` rules the scaffold left for this step: these become `.claude/rules/`.
  - **not applicable** — in "Pack rules not applied" (and any the gate 3 review excluded): leave them out.
- **Duplicates** across packs (the gate 3 summary lists them): one rule, citing every ID, e.g. "Await every promise (PLAYWRIGHT-01, TYPESCRIPT-11)".

## 2. Rules — `.claude/rules/*.md`

- One file per area where rules apply, scoped with front matter so it loads only when Claude works on matching files: `paths: ["src/**/*.astro", "src/pages/**"]`. Use globs that match the real folders. `paths` is the only front-matter field Claude Code reads.
- One file **without** `paths` for project-wide architecture rules from the overview and ADRs: the dependency direction, where logic lives (Humble Object), the component levels (Atomic Design), i18n or other cross-cutting rules. Keep it short.
- Each rule is one line, concrete and checkable, ending with its ID(s) — e.g. "Read secrets only from `astro:env/server`; client code reads only `PUBLIC_*` values (ASTRO-06)." Rewrite the pack's wording for this project's paths and names when that makes it more concrete.
- **Every applicable `review` rule must appear somewhere**, in a rule file or CLAUDE.md — the check verifies it.

## 3. `CLAUDE.md`

From `templates/claude/CLAUDE.md`, **under 200 lines**: what the project is, where the documents are, the commands, the stack in one line per layer, the code structure, 5–12 project-wide working rules (including: never disable a lint rule, skip hooks or weaken a test to get green), the workflow, and the three agents. Link to documents and rule files instead of repeating them.

## 4. Subagents — `.claude/agents/`

From `templates/claude/agents/`: `reviewer`, `tester`, `docs-keeper`. Fill in the project's conventions, folders, test locations and the most important pack rules by ID. Keep each agent's `tools` list as in the template — **the reviewer stays read-only** (`disallowedTools: Write, Edit, …`; Bash only for read-only commands). Leave out the ERD lines in `docs-keeper` when the project stores no data.

## 5. Skills — `.claude/skills/`

From `templates/claude/skills/`, filled in for this project:
- `implement-story` and `new-adr` — always.
- `new-component` — when the project has a user-facing UI (`visual-identity` in the document set): the real component folder, the theme names from `design/tokens.json` (Tailwind classes on web; the generated `tokens` object or `Tokens` class in apps), and the framework's component rules.
- When the project has a database: a `new-migration` skill (create a migration with the Supabase CLI, never edit an applied one, then have `docs-keeper` update `schema.sql` and the ERD).
- AI projects: a `change-prompt` skill — change or add a prompt or tool by its `P-` / `T-` ID: update the file and the AI system design, add eval cases for the change to `evals/data/`, run the `eval` task only with the user's go-ahead (it costs money) and compare against the `EV-` thresholds, then record the result in the eval plan's results log.
- Libraries: a `change-public-api` skill — any change to an `API-` item: decide whether it's breaking (the API surface's versioning rules), update `docs/api-surface.md`, deprecate before removing, and use the Conventional Commit type that produces the right version bump (`feat`, `fix`, `feat!` / `BREAKING CHANGE:`).
- Games: none beyond the base skills unless the GDD names a repeated task (e.g. adding a level); then one skill for it.

Each skill's `description` starts with what it does and when to use it — that is what makes Claude pick it.

## 6. Hooks and settings

- Copy `<plugin root>/templates/claude/hooks/guard-files.mjs`, `format-on-edit.mjs` and `check-on-stop.mjs` into `.claude/hooks/` **unchanged**.
- Write `.claude/hooks/config.json` with the output of `node "<plugin root>/scripts/toolchains.mjs" hook-config <toolchain>` — which formatter and linter run after each edit and which `check` runs on stop. For an editor-based engine, keep the edit list empty and `check` null unless `docs/setup.md` gives a command-line check.
- `.claude/settings.json` from `templates/claude/settings.json`: keep the hooks; in `permissions.allow`, list this project's own task commands that exist (`Bash(npm run test *)`, `Bash(uv run poe test *)`, `Bash(just test *)`…) and its test runner, instead of the template's npm lines. Never allow every shell command (`Bash(*)`) or a whole tool (`Bash(uv *)`, `Bash(cargo *)`).
- `.claude/settings.local.json` (personal settings) must stay out of the repository: the scaffold already ignores it in `.gitignore`. Don't edit `.gitignore` here — it belongs to the scaffold step, and changing it would count as an edit to an approved step. If the line is missing, tell the user and suggest re-running `/kickoff scaffold`.

## 7. `CONTRIBUTING.md`

From `templates/development-workflow.md`, with this project's real values: setup (the runtime and its version — `.nvmrc`, `.python-version`, the Flutter, Rust, Godot or engine version — the tools to install with their links, how to install the git hooks, gitleaks, `cp .env.example .env.local` when there is one), branching (GitHub Flow unless an ADR says otherwise), Conventional Commits (enforced by commitlint), the quality-gates table with the **actual** tool and hook for each row (from the scaffold), environments and deployment from the overview, releases, definition of done, and the "Working with AI agents" section pointing to `CLAUDE.md`, `.claude/rules/`, `.claude/skills/` and the agents. Remove rows and lines for things the project doesn't have. Keep the first-line `<!-- keelwright: status=generated date=YYYY-MM-DD -->` comment with today's date.

## 8. Record and check

1. Write `.keelwright/generate.md`: which pack rule (or merged group) went to which file, the rules left out and why, and the generated files.
2. The `format` task, then the `check` task (e.g. `npm run format` and `npm run check`) — the generated Markdown and hook scripts must pass the project's own checks. Editor-based engines: skip this.
3. `node "<plugin root>/scripts/generatecheck.mjs"` — fix every issue and run again until it passes (count failing runs with `STATE metric generate check-failures +1`).

## 9. Finish

1. `STATE complete generate CLAUDE.md .claude CONTRIBUTING.md .keelwright/generate.md` — only files this step owns.
2. Summary for the user:
   - what was generated, one line per file group, with the counts (rule files, rules, skills);
   - how to start: "ask Claude to implement US-1" (the `implement-story` skill) and what the hooks do on every edit (with this project's formatter, linter and check);
   - that everything is ready to commit, e.g. `git add -A && git commit -m "chore: add Claude Code setup and contributing guide"`;
   - open questions still marked `[NEEDS CLARIFICATION]` in the documents, which the first stories will need.

## In /adopt

The project exists and has its own ways. The setup describes and protects them; it doesn't bring in KeelWright's defaults. Sections 1–9 apply, with these differences:

- **Reads instead:** `.keelwright/analysis.md` (approved at gate 1 — struck-out or corrected conventions are what count), `docs/architecture/overview.md` and the ADRs in the project's ADR folder (approved at gate 2), `.keelwright/stack-packs/*.md` (gate 2), `.keelwright/gaps.md` (what was applied, declined, recorded), `node "<plugin root>/scripts/analyse.mjs" --json` (`tasks`, `tooling`, `docs`), the existing `CONTRIBUTING.md`, README and other tools' instruction files. There is no PRD, feature breakdown, scaffold record or design tokens.
- **Commands:** exactly the project's own — `tasks.contract` and `tasks.defined[].run` (`pnpm verify`, `make lint`, `tox run -e style`), plus tasks added in `gaps`. Never `npm run` unless that's the project's runner. A task the project lacks and `gaps` didn't add isn't mentioned.
- **Already enforced:** the analysis's "Enforced by tooling" and the fixes applied in `gaps` replace `.keelwright/scaffold.md`. Pack rules those tools enforce need no prose.
- **Rules from the code:** every convention (`C-NN`) the user kept at gate 1 becomes a rule in the matching `.claude/rules/` file, one line with its evidence file, ending with its ID — "Route handlers throw `HttpError`; the error middleware in `src/app.ts` formats responses (C-03)." For a **mixed** convention, write the standard the user chose and say the old pattern exists and isn't copied.
- **Pack rules vs. the project:** a pack rule the user set aside at gate 2, or that contradicts a kept convention, goes to `.keelwright/generate.md` under **Pack rules not applied**, with the reason ("the project validates in middleware, see C-04"); `generatecheck` then doesn't require it. The project's convention wins unless the user decided otherwise.
- **Other tools' instructions** (`AGENTS.md`, `.cursorrules`, `.github/copilot-instructions.md`): carry over what the code follows into `CLAUDE.md` or the rules, citing the file. Don't delete or edit those files. When `AGENTS.md` is kept up to date for other tools, CLAUDE.md can import it (`@AGENTS.md`) instead of repeating it — ask the user.
- **CLAUDE.md:** links the existing docs (README, `docs/`, the ADR folder by its real path) instead of the KeelWright document set; the stack with **versions in use**; the code structure from the overview; the gaps recorded (end of life, declined fixes) as one line each under "Known limits", so agents don't "fix" them unasked.
- **Skills:** `implement-change` (from `templates/claude/skills/implement-change/`) instead of `implement-story` — there are no story IDs; fill in the tracker if the README or analysis names one. `new-adr` uses the project's ADR folder and naming. `new-component` only when the project has a component folder and a clear pattern for components (the analysis's conventions); it describes that pattern, not Atomic Design. `new-migration` only for the migration tool the project uses.
- **Agents:** the reviewer checks the kept conventions (`C-NN`) and the ADRs, and flags **new** code that copies a pattern the analysis marked as the old one; it doesn't flag existing code that predates the rules.
- **Workspace repos:** one `CLAUDE.md` at the root, with a short section per workspace (what it is, its commands run from the root — `npm run lint --workspace backend` — and its rule files). Rule files are scoped to their workspace with `paths` (`["frontend/src/**"]`); a convention shared by all workspaces goes in an unscoped rule. The reviewer and tester know which workspace's conventions and test runner apply to a changed file.
- **Hooks:** `.claude/hooks/config.json` is the output of `node "<plugin root>/scripts/analyse.mjs" --hook-config` — the formatter and linter the project already has (in a workspace repo, each workspace's tools, run from its folder with `cwd`), and its `check` task on stop. When it prints `"check": null` (no check task, and `gaps` didn't add one), keep it null and say in the summary that the stop check is off until the project has one.
- **`.gitignore`:** add `.claude/settings.local.json` if it's missing — in `/adopt` there is no scaffold step that owns that line. Say so in the summary.
- **`CONTRIBUTING.md`:** when the project has one, **keep it** — add only what's missing (setup steps for tools added in `gaps`, the quality gates as they now are, "Working with AI agents"), in its style, and put `<!-- keelwright: status=merged date=<today> -->` on the first line. Without one, write it from the template with the project's real values — its branching and commit style as the history shows, not KeelWright's defaults.
- **Check:** as in section 8 — `generatecheck` knows an adopted project (state `mode: adopt`): it accepts only the project's own task commands, looks for the project's ADR folder, and requires the hook config.
- **Finish:** `STATE complete generate CLAUDE.md .claude CONTRIBUTING.md .keelwright/generate.md` — not `.gitignore`: it belongs to the project and changes often. In the summary, "how to start" is "ask Claude to fix or build something" (`implement-change`), and the suggested commit is `chore: add Claude Code setup`.
