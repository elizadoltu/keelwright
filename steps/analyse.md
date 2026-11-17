# Step: `analyse`

`/adopt` create mode (spec 5.2.1): describe the existing project as it is — stack, tasks, structure, architecture, conventions, decisions and gaps — so the documents and the agent setup can be built on what the code really does.

**Reads:** the output of `node "<plugin root>/scripts/analyse.mjs" --json` (run in the project root), the README, CONTRIBUTING, existing ADRs and `docs/`, other tools' instruction files (`AGENTS.md`, `.cursorrules`, `.github/copilot-instructions.md`), the manifests and config files, CI, and a sample of the source and test files; `.keelwright/analysis.md` if it exists (a re-run: the user's corrections win).
**Produces:** `.keelwright/analysis.md` (from `<plugin root>/templates/analysis.md`); the project type and toolchain in the state.
**Gate:** 1 — the user corrects the analysis.

**Never change the project in this step.** Read only; the only file written is `.keelwright/analysis.md`.

## 1. Collect the facts

Run `analyse.mjs --json` and read the output completely.

- **`mode` is `audit`** (a `CLAUDE.md` or `.claude/` exists): tell the user the project already has a Claude setup, that audit mode isn't built yet, and stop.
- **`monorepo.detected`**: tell the user monorepos aren't supported yet, list `monorepo.packages`, and ask (AskUserQuestion) which package to adopt, or to stop. The chosen folder becomes the project root: stop and tell the user to start `/adopt` again from that folder.
- **`toolchain` is null**: name what was found (`otherLanguages`) and say KeelWright doesn't support that toolchain yet; stop.
- Record the stack as it is: `STATE set stack '<json>'` with `resolvedAt` (today), `toolchain`, `packageManager`, `primary` (`{ "choice": <the main framework>, "rule": null, "compared": [] }` — nothing was compared: it was already chosen) and `versions` (`{ name: locked version }` for the runtime and the frameworks).

## 2. Read the project

Read before you judge. In this order, stopping when you have enough to describe each section of the template:

1. README, CONTRIBUTING, existing ADRs and docs, other tools' instruction files.
2. The manifest, the config files the facts name (lint, format, types, test, CI, hooks).
3. The entry points (`main`, `bin`, app or server entry, routes, pages) and the folders in `structure.dirs` with the most files.
4. A sample per area — two or three files each of routes / components / services / data access / tests — enough to see whether a pattern holds. **Open the files you cite.**

## 3. Write `.keelwright/analysis.md`

Follow the template. Section by section:

- **Project:** the type (`web`, `mobile`, `game`, `ai`, `library` — as in the interview step's rules); `STATE set project-type <type>`.
- **Stack:** the frameworks and main libraries with their **locked** versions (`dependencies[].locked`), each with the file that shows it. Not the latest versions — this project's.
- **Tasks:** `tasks.contract`, exactly as the facts give them; missing ones go to Gaps.
- **Structure and Architecture:** what the folders hold and the style the code actually has, citing files. Where the code departs from its own style, say so — that's useful to the reviewer agent later.
- **Conventions:** only what you saw. Each row: the area, the convention phrased so it could become a rule, the files that show it, and **consistent** (the files you looked at follow it) or **mixed** (some don't — name one that doesn't). Instructions from other tools' files count as conventions when the code follows them; cite both. Skip generic practice ("uses functions") — a convention is something a new contributor could get wrong.
- **Enforced by tooling:** the tools in `tooling` and what each enforces, from its config.
- **Existing documents:** link them. Don't summarise what they already say well.
- **Decisions in the code:** framework, database, hosting, auth, messaging — the choices the code depends on. Link an existing ADR when there is one.
- **Gaps:** every gap in `gaps`, plus end-of-life: for the runtime and each framework, compare the major in use with the current one (`node "<plugin root>/scripts/versions.mjs" <specs>`); a runtime past end-of-life or a framework two or more majors behind is a gap. Propose a fix per gap using the project's **existing** tools (its package manager, hook manager, CI system) — never a replacement.
- **Open questions:** what you couldn't tell from the code (e.g. who deploys it, whether a half-migrated pattern is the new standard).

## 4. Check

- `node "<plugin root>/scripts/doccheck.mjs" analysis:.keelwright/analysis.md` from the project root: the word limit, every convention with evidence and a verdict, every cited file existing. Fix and re-run until it passes; count the failures with `STATE metric analyse doccheck-failures +1`.

## 5. Complete

`STATE complete analyse .keelwright/analysis.md`

## Gate 1 content

Show, besides the gate's standard content:
- the project type, toolchain and the stack line (framework + version in use);
- the number of conventions, and the ones marked **mixed** — ask the user which way is the standard;
- the gaps;
- that anything struck out or corrected in the analysis is what the setup will follow.

## On approval

Set `status: approved` in `.keelwright/analysis.md`.
