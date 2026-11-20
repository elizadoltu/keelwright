---
description: Start here — KeelWright looks at the folder and picks what it needs (a kickoff for an idea or notes, an adoption for existing code, the doctor and its fixes for a project with a Claude setup), says why, and runs it
argument-hint: "[<project description, notes or file>]"
---

# /start

You are running KeelWright's entry point (spec 5.0) in the current directory (the project root). It decides **which route** the folder needs and then runs that route's command. It is a routing layer only: the pipelines stay separate, and `/keelwright:kickoff` and `/keelwright:adopt` stay as **overrides** for when the guess is wrong (an empty-looking folder that is really a template, an existing repo the user wants to restart).

- Plugin root: `${CLAUDE_PLUGIN_ROOT}`
- Facts script (call it `ANALYSE` below): `node "${CLAUDE_PLUGIN_ROOT}/scripts/analyse.mjs"` (run in the project root)
- The routes' commands: `${CLAUDE_PLUGIN_ROOT}/commands/kickoff.md`, `adopt.md`, `doctor.md`
- Arguments: `$ARGUMENTS`

## 1. Find the route

The route's command asks once who the user is (their profile, `/keelwright:profile`) — don't ask it here too.


Run `ANALYSE --preflight` and read `route`:

| `route.to` | The folder has | Route |
|---|---|---|
| `continue` | `.keelwright/state.json` with a pipeline in progress (`route.pipeline`) | That pipeline, in its mode |
| `kickoff` | nothing, or only notes, specs or a PRD (`route.inputs`) | `/kickoff` — the notes are its input |
| `adopt` | code, no Claude setup | `/adopt` create mode |
| `doctor` | code with a Claude setup (`route.facts.claude`), or a finished pipeline | Audit mode: the doctor, then its fixes |
| `ask` | something unclear (`route.why`) | Ask, showing what was found |
| `stop` | a blocker `/adopt` can't get past (`route.blocker`) | Explain and stop |

`route.facts` has what the decision rests on: the number of files and code files, the commits, the Claude setup files, the ADR folders and the notes.

## 2. Say what was found and what it will produce

Before running anything, tell the user in two to four lines: **what was found, which route, and why** (`route.why`), and what the route will produce. Name what it will skip and why, from the facts — don't promise documents a later step decides:

- **kickoff** — an interview, then the PRD and the documents its project type needs (chosen at the PRD step), stack research, a scaffold and the Claude setup, with review gates. The notes listed in `route.inputs` are read as the project description.
- **adopt** — an analysis of the code, the architecture overview and threat model **as built**, tooling fixes only with approval, and a Claude setup that follows the project's own conventions. No ADR-0001 when there are ADRs already (`route.facts.adrDirs`); a C4 model only when there is more than one deployable (`workspaces`); no `publish` step unless the user wants Confluence.
- **doctor** — audit mode: a health check of every area (Claude setup, docs vs code, stack, tooling, application security, process), then a fix for each finding, shown as a diff and applied only when the user approves it, one by one.
- **continue** — which pipeline (`route.pipeline`) and that it resumes where it stopped.

Then say once that `/keelwright:kickoff` or `/keelwright:adopt` overrides the choice.

## 3. Run the route

Read the route's command file in full and follow it **as if the user had run that command** with `$ARGUMENTS`. Don't repeat checks this command already made, and don't change the state yourself.

- **`continue`** — `commands/<route.pipeline>.md` with `$ARGUMENTS`.
- **`kickoff`** — `commands/kickoff.md`. If `$ARGUMENTS` is empty and `route.inputs` lists notes, those files are the project description: use their paths as the arguments (one `STATE init --input` naming the main one; mention the others in `.keelwright/input.md`). With neither, kickoff asks for the description.
- **`adopt`** — `commands/adopt.md`, starting at its section 2; its preflight passes, since this one did.
- **`doctor`** — audit mode: `commands/adopt.md`, section 9 (with `--offline` if `$ARGUMENTS` has it). After the doctor's result, if `route.why` is a finished pipeline, say which one and that `/<pipeline> status` still shows it. `route.note` is an `/adopt` blocker (a monorepo, an unsupported toolchain): it doesn't stop the doctor, but mention it in one line, since `/adopt`'s create-mode steps won't run here.
- **`ask`** — AskUserQuestion, with what was found (`route.facts`, `route.detail`) in the question itself:
  - `fresh-scaffold` (code, at most a few commits): **Kick off — plan this project from the start** (the scaffold becomes the starting point the interview asks about) or **Adopt — describe what is here**.
  - `code-in-subfolder` (`route.detail` lists the folders): **Run from `<folder>`** — tell the user to open that folder and run `/keelwright:start` there, then stop — or **Kick off here** (the folder becomes one part of a new project).
  - `claude-setup-without-code`: **Kick off** (the Claude setup is replaced by the generated one at the end; say so) or **Run the doctor** on the setup as it is.
  - `unrecognised` (code KeelWright has no toolchain for, `route.detail`): **Kick off here** or **Adopt** — `/adopt` will then stop and name the supported toolchains.

  Then run the chosen route as above.
- **`stop`** — explain `route.blocker` as `/adopt` does (`monorepo`: run from the package's folder, listing `detail`; `toolchain`: the languages found aren't supported yet — node, python, dart, rust and godot are). Stop without creating anything.

## Rules

- `/start` itself writes nothing; the route's command does.
- One route per run. When the route stops (a gate, a question), the next `/keelwright:start` finds the pipeline in progress and continues it.
