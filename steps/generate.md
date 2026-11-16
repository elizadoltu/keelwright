# Step: `generate`

Generate the project's agent workflow — `CLAUDE.md`, rules, skills, subagents, hooks and settings — and `CONTRIBUTING.md`, all from the same facts, so agents and humans follow the same rules and nothing disagrees.

**Reads:** `docs/prd.md`, `docs/decisions/`, `docs/architecture/overview.md`, `docs/features.md`, `docs/design/visual-identity.md`, `.keelwright/stack-packs/*.md` (reviewed at gate 3), `.keelwright/scaffold.md` (pack rules applied, not applied, and left for this step), `package.json`, the hook, lint and CI config the scaffold created, and the templates in `<plugin root>/templates/claude/` and `<plugin root>/templates/development-workflow.md`.
**Produces:** `CLAUDE.md`, `.claude/rules/*.md`, `.claude/agents/{reviewer,tester,docs-keeper}.md`, `.claude/skills/*/SKILL.md`, `.claude/hooks/*.mjs`, `.claude/settings.json`, `CONTRIBUTING.md`, `.keelwright/generate.md`.
**Gate:** none — the step ends with a summary for the user.

Claude Code protects `.claude/`: every file this step writes there needs the user's approval, and a session that can't ask (e.g. headless) can't write there at all. Before writing, tell the user to expect about 15 approval prompts (they can allow edits for the rest of the session if the prompt offers it). Never work around the protection (e.g. copying with the shell); if writes are refused, leave the step `in_progress`, say what is still missing, and finish on the next `/kickoff`.

Everything generated is **tailored**: facts, names, paths and commands from this project's documents, never generic advice. A line that would fit any project ("write clean code", "follow best practices") doesn't belong.

## 1. Collect the facts

- **Commands:** the npm scripts in `package.json` — use only scripts that exist.
- **Stack:** from the overview's stack table and `stack.versions`.
- **Structure:** the overview's code structure and routes; check the folders exist.
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
- `new-component` — when the project has a user-facing UI (`visual-identity` in the document set): the real component folder, the theme class names from `design/tokens.json`, and the framework's component rules.
- When the project has a database: a `new-migration` skill (create a migration with the Supabase CLI, never edit an applied one, then have `docs-keeper` update `schema.sql` and the ERD).

Each skill's `description` starts with what it does and when to use it — that is what makes Claude pick it.

## 6. Hooks and settings

- Copy `<plugin root>/templates/claude/hooks/guard-files.mjs`, `format-on-edit.mjs` and `check-on-stop.mjs` into `.claude/hooks/` **unchanged**.
- `.claude/settings.json` from `templates/claude/settings.json`: keep the hooks; in `permissions.allow`, keep only commands whose npm scripts exist. Never allow every shell command (`Bash(*)`).
- `.claude/settings.local.json` (personal settings) must stay out of the repository: the scaffold already ignores it in `.gitignore`. Don't edit `.gitignore` here — it belongs to the scaffold step, and changing it would count as an edit to an approved step. If the line is missing, tell the user and suggest re-running `/kickoff scaffold`.

## 7. `CONTRIBUTING.md`

From `templates/development-workflow.md`, with this project's real values: setup (Node.js version from `.nvmrc`, npm, gitleaks install link, `cp .env.example .env.local`), branching (GitHub Flow unless an ADR says otherwise), Conventional Commits (enforced by commitlint), the quality-gates table with the **actual** tool and hook for each row (from the scaffold), environments and deployment from the overview, releases, definition of done, and the "Working with AI agents" section pointing to `CLAUDE.md`, `.claude/rules/`, `.claude/skills/` and the agents. Remove rows and lines for things the project doesn't have. Keep the first-line `<!-- keelwright: status=generated date=YYYY-MM-DD -->` comment with today's date.

## 8. Record and check

1. Write `.keelwright/generate.md`: which pack rule (or merged group) went to which file, the rules left out and why, and the generated files.
2. `npm run format`, then `npm run check` — the generated Markdown and hook scripts must pass the project's own checks.
3. `node "<plugin root>/scripts/generatecheck.mjs"` — fix every issue and run again until it passes (count failing runs with `STATE metric generate check-failures +1`).

## 9. Finish

1. `STATE complete generate CLAUDE.md .claude CONTRIBUTING.md .keelwright/generate.md` — only files this step owns.
2. Summary for the user:
   - what was generated, one line per file group, with the counts (rule files, rules, skills);
   - how to start: "ask Claude to implement US-1" (the `implement-story` skill) and what the hooks do on every edit;
   - that everything is ready to commit, e.g. `git add -A && git commit -m "chore: add Claude Code setup and contributing guide"`;
   - open questions still marked `[NEEDS CLARIFICATION]` in the documents, which the first stories will need.
