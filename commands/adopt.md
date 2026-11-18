---
description: Bring an existing project into KeelWright — analyse the code, record its architecture and decisions, fill tooling gaps with your approval, and generate a Claude setup that follows the project's own conventions
argument-hint: "[status | report | <step> | research --refresh | <notes about the project>]"
---

# /adopt

You are running the KeelWright `/adopt` pipeline in the current directory (the project root). It takes an **existing** codebase, describes it as it is, and builds a project-specific Claude setup on top of it, pausing at review gates so the user can correct what was inferred.

**The code is the source of truth.** `/adopt` never changes application code, folder structure or dependency versions. The only changes to the project outside `.keelwright/`, `docs/` and the Claude setup are the tooling fixes the user approves one by one in the `gaps` step.

- Plugin root: `${CLAUDE_PLUGIN_ROOT}`
- Step instructions: `${CLAUDE_PLUGIN_ROOT}/steps/<step>.md`
- Document templates: `${CLAUDE_PLUGIN_ROOT}/templates/`
- State CLI (call it `STATE` below): `node "${CLAUDE_PLUGIN_ROOT}/scripts/state.mjs"`
- Facts script (call it `ANALYSE` below): `node "${CLAUDE_PLUGIN_ROOT}/scripts/analyse.mjs"` (run in the project root)
- Arguments: `$ARGUMENTS`

## Modes

- **Create mode** — the project has no Claude setup. This command runs it.
- **Audit mode** — the project already has a `CLAUDE.md` or a `.claude/` folder (anywhere except templates, fixtures and examples). Not built yet (Phase 3): say so and stop.

Other tools' instruction files (`AGENTS.md`, `.cursorrules`, `.github/copilot-instructions.md`) are not a Claude setup; the `analyse` step reads them as input.

## The pipeline (create mode)

```
analyse → { document, research } → gaps → generate → publish
```

| Step | Produces | Gate after it |
|---|---|---|
| `analyse` | `.keelwright/analysis.md`: type, toolchain, stack and versions in use, tasks, structure, architecture, conventions, decisions, gaps | Gate 1 |
| `document` | Architecture overview (as built), ADR-0001, ADRs recorded retroactively | Gate 2 |
| `research` | Stack packs for the versions in use | Gate 2 |
| `gaps` | Tooling fixes, each shown as a diff and applied only on approval; `.keelwright/gaps.md` | — |
| `generate` | CLAUDE.md, rules, skills, subagents, hooks, CONTRIBUTING.md | — |
| `publish` | Confluence (only when the user asks for it) | — |

## State rules

- `.keelwright/state.json` holds the pipeline state, with `"mode": "adopt"`. **Only change it through `STATE`** — never edit the JSON yourself. Run `STATE help` for the full command list.
- If a `STATE` command prints `error: …`, stop and tell the user what failed. Don't work around it.
- Steps record their outputs with `STATE complete <step> <files…>`; this is how edits are detected later. Record a folder only when the step owns everything in it; otherwise list the files.
- A step never edits a file an earlier, finished step produced — that counts as a user edit and triggers the edit question. If a step needs such a change, it tells the user which step to re-run.

## 1. Read the arguments

| Arguments | Meaning | Go to |
|---|---|---|
| `status` | Show progress | Run `STATE status` and show the result in a short, readable form. Stop. |
| `report` | Run report and document ratings | Section 8 |
| a step name (`analyse`, `document`, `research`, `gaps`, `generate`, `publish`) | Re-run that step | Section 4 |
| `research --refresh` | Re-run research and force new stack packs | Section 4, passing the refresh flag to the step |
| anything else | Notes about the project (e.g. "the `/v1` routes are deprecated") | Section 2; save the notes as below |
| nothing | Start, or continue | Section 2 |

## 2. Start or continue

1. Run `STATE mode`.
2. **`adopt`** — an adoption is in progress. Check for edits (section 3), then continue with the loop (section 5).
3. **`kickoff`** — this project was set up by `/kickoff` and already has its Claude setup: keeping it current is audit mode, which isn't built yet. Say so; suggest `/kickoff status` and `/kickoff <step>` meanwhile. Stop.
4. **`none`** — a new adoption:
   1. Run `ANALYSE --preflight`. It prints the mode, the toolchain and the `blockers`. For each blocker, tell the user and **stop without creating anything**:
      - `audit` — the project already has a Claude setup (`detail`: its files); audit mode isn't built yet (Phase 3).
      - `monorepo` — monorepos aren't supported yet. List the packages (`detail`) and say: run `/adopt` from the folder of the package to adopt; that folder becomes the project root.
      - `toolchain` — the project's languages (`detail`) aren't supported yet. Name the supported ones: node, python, dart, rust, godot.
      - `no-project` — there's no project here; `/adopt` is for existing code and `/kickoff` starts new projects.
   2. Tell the user in one line what was found (toolchain and package manager) and that `/adopt` starts with the analysis.
   3. **Git.** If it is a git repository with uncommitted changes, say so: `/adopt` writes documents and, with approval, tooling fixes — mixing them with unfinished work makes both hard to review. Then ask (AskUserQuestion):
      - **Create a branch `keelwright-adopt`** (recommended) → `git switch -c keelwright-adopt`;
      - **Stay on the current branch**;
      - **Stop** — the user commits or stashes first.

      On a clean tree, offer the same branch choice (without Stop).
   4. Run `STATE init --mode adopt --input "<the folder name>"`.
   5. If the arguments held notes, save them verbatim to `.keelwright/input.md`; the `analyse` step reads them.
   6. If the folder is a git repository or has a `.gitignore`, add `.keelwright/snapshots/` to `.gitignore`. The rest of `.keelwright/` is committed.
   7. Continue with the loop (section 5).

If an adoption is in progress and the arguments hold notes, append them to `.keelwright/input.md` with today's date and tell the user which steps they affect (usually `analyse`; offer to re-run it).

## 3. Edits since approval

Run `STATE changes --json`. If nothing changed, continue.

If files changed, the user's edited files are now the **source of truth** — never overwrite them with an earlier version. Show which files changed (modified or deleted) and which later steps depend on them (`affected`). Then ask (AskUserQuestion):
- **Regenerate the affected steps** → `STATE accept-changes`. The affected steps become `stale` and are re-run in order by the loop.
- **Keep everything else as it is** → `STATE accept-changes --keep-downstream`. For edits that don't change anything later steps rely on (typos, wording).
- **Stop** → change nothing and end.

Corrections to `.keelwright/analysis.md` almost always affect the later steps: a struck-out convention must not become a rule.

An accepted ADR's decision is never edited. If one was, tell the user and offer to restore it and write a new ADR that supersedes it instead.

## 4. Re-run a single step

1. Run `STATE downstream <step>`. If any steps would be marked stale, tell the user which, and ask for confirmation before continuing.
2. Run section 3 (edits) first, so pending edits are not lost.
3. Run the step as described in section 6. Its existing outputs, including the user's edits, are its starting point.
4. Then continue with the loop in section 5.

## 5. The loop

Repeat:

1. Run `STATE next --json`.
2. On `{"action": "run", "step": …}` → run the step (section 6), then repeat.
   - If the step is `publish` (`"optional": true`): publishing is not built for `/adopt` yet (the Jira plan reads a PRD, which `/adopt` doesn't write). Run `STATE start publish` and `STATE skip publish --reason "not available in /adopt yet"`, then repeat.
3. On `{"action": "review", "gate": N}` → hold the review gate (section 7) and stop.
4. On `{"action": "complete"}` → tell the user the adoption is finished, with a short summary of what exists now and what was declined in `gaps`. Stop.

Run as many steps as you can in one go; the pipeline only pauses at review gates, when a step needs answers from the user, or when a step is not implemented yet.

## 6. Running a step

1. Read `${CLAUDE_PLUGIN_ROOT}/steps/<step>.md`. The `research` and `generate` step files serve both `/kickoff` and `/adopt`: follow their **In /adopt** section where it differs.
2. **If the step file says it is not implemented yet** — for the whole step, or for `/adopt` — tell the user: the step name, what it will produce, and that this version of KeelWright stops here. Don't change the state. Stop.
3. Run `STATE start <step>` **before any of the step's work** — before writing or editing any file — so the step's time is measured.
4. Follow the step's instructions. They say what to read, what to produce, and when to ask the user.
5. Finish with exactly one of:
   - `STATE complete <step> <every file or folder the step produced or updated>`, or
   - `STATE skip <step> --reason "<why there is nothing to produce>"`.

If the step can't be finished in this run (for example, it is waiting for the user's answers), leave it `in_progress` and stop; the next `/adopt` resumes it.

## 7. Review gates

When `STATE next` returns a review:

1. Run `STATE markers` to find open `[NEEDS CLARIFICATION: …]` markers.
2. Show the user:
   - the gate number and the files to review (one line each: path and what it contains),
   - the step files' gate content (e.g. the `analyse` step's mixed conventions and gaps),
   - the open markers (file and line), and
   - that they can edit any of these files directly — when they continue, their edited files are the source of truth.
3. Ask (AskUserQuestion):
   - **Approve gate N** — the documents are right.
   - **Resolve the open questions with me** — only offer when there are markers; go through each marker, update the file with the answer, then ask again.
   - **I'll edit the files first** — stop; the user runs `/adopt` again when ready.
4. Before approving, **re-read every file under review from disk** — the user may have edited them. If an edit changes something another document in the same gate depends on, update that document first.
5. If markers are still open, say so and ask for explicit confirmation; approved markers stay as open questions in their documents.
6. For each step in the gate, if its step file has an **"On approval"** section, do what it says.
7. Run `STATE approve <N>`, then continue the loop (section 5).

## 8. Report

Run metrics are recorded automatically by `STATE` (`.keelwright/metrics.json`); steps add their own counters with `STATE metric <step> <name> <n|+n>`.

1. Run `STATE report` and show the scorecard: steps, runs, time, open questions, and how much of each document the user changed at review.
2. Ask the user to rate each generated document they reviewed (AskUserQuestion, up to 4 documents per question round), with the options **Used as-is**, **Small edits**, **Rewritten**, **Deleted**. Skip documents already rated unless the user wants to change a rating.
3. Record each answer: `STATE rate <file> <as-is|small-edits|rewritten|deleted>`.
4. Run `STATE report --write` and tell the user the report is in `.keelwright/report.md`.

## Rules for every step

- **Describe, don't redesign.** Write what the code does, citing files. A pattern you'd do differently is not a gap; a missing safety net (secret scanning, CI, tests) is.
- **Never change application code, structure or dependency versions.** Tooling fixes happen only in `gaps`, one by one, with approval.
- **Templates.** Every document is written from its template in `${CLAUDE_PLUGIN_ROOT}/templates/`. Keep the template's structure, front matter and stable IDs; remove the template's instruction comments and example rows.
- **Unknowns are marked, not guessed.** What the code and docs don't settle is a `[NEEDS CLARIFICATION: …]` marker, resolved at a gate.
- **Existing documents are linked, not rewritten.** Existing ADRs keep their numbers; new ones are numbered after them.
- **The user's files win.** Before writing a file that already exists, read it; keep the user's edits and change only what the step needs to change.
- **Keep the user informed** with one short line per step started and finished; put detail in the documents, not the chat.
