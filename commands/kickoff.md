---
description: Start or continue a KeelWright project kickoff — interview, documents, stack research, scaffold and Claude setup, with review gates
argument-hint: "[<project description or file> | status | report | <step> | research --refresh]"
---

# /kickoff

You are running the KeelWright `/kickoff` pipeline in the current directory (the project root). It takes a project from an idea or specs to documents, a scaffolded repository and a project-specific Claude setup, pausing at review gates so the user can edit the documents.

- Plugin root: `${CLAUDE_PLUGIN_ROOT}`
- Step instructions: `${CLAUDE_PLUGIN_ROOT}/steps/<step>.md`
- Document templates: `${CLAUDE_PLUGIN_ROOT}/templates/`
- State CLI (call it `STATE` below): `node "${CLAUDE_PLUGIN_ROOT}/scripts/state.mjs"`
- Arguments: `$ARGUMENTS`

## The pipeline

```
interview → prd → { architecture, features, design } → research → scaffold → generate → publish
```

| Step | Produces | Gate after it |
|---|---|---|
| `interview` | Project type, `.keelwright/interview.md` | — |
| `prd` | PRD, document set, stack recommendation, resolved versions, ADR-0001, stack ADR | Gate 1 |
| `architecture` | ADRs, architecture overview, C4, ERD + `schema.sql`, threat model, AI system design, AI eval plan, API surface | Gate 2 |
| `features` | Feature breakdown, backlog | Gate 2 |
| `design` | Visual identity + tokens, screen flow, GDD, asset pipeline, store release checklist | Gate 2 |
| `research` | Stack packs | Gate 3 |
| `scaffold` | Repository, manifests, lockfile, git hooks, CI, smoke tests | — |
| `generate` | CLAUDE.md, rules, skills, subagents, hooks, CONTRIBUTING.md | — |
| `publish` | Jira / Confluence (only when the user asks for it) | — |

## State rules

- `.keelwright/state.json` holds the pipeline state. **Only change it through `STATE`** — never edit the JSON yourself. Run `STATE help` for the full command list.
- If a `STATE` command prints `error: …`, stop and tell the user what failed. Don't work around it.
- Steps record their outputs with `STATE complete <step> <files…>`; this is how edits are detected later. Record a folder only when the step owns everything in it; otherwise list the files.
- A step never edits a file an earlier, finished step produced — that counts as a user edit and triggers the edit question. If a step needs such a change, it tells the user which step to re-run.

## 1. Read the arguments

Decide what was asked from `$ARGUMENTS`:

| Arguments | Meaning | Go to |
|---|---|---|
| `status` | Show progress | Run `STATE status` and show the result in a short, readable form. Stop. |
| `report` | Run report and document ratings | Section 8 |
| a step name (`interview`, `prd`, `architecture`, `features`, `design`, `research`, `scaffold`, `generate`, `publish`) | Re-run that step | Section 4 |
| `research --refresh` | Re-run research and force new stack packs | Section 4, passing the refresh flag to the step |
| anything else, or nothing | Start a new kickoff, or continue the current one | Section 2 |

## 2. Start or continue

1. Run `STATE mode`. If it prints `adopt`, this project is being adopted: tell the user to continue with `/adopt` and stop.
2. **If it prints `none`** (new kickoff):
   - If the folder already holds a project (a manifest such as `package.json`, `pyproject.toml`, `Cargo.toml`, `pubspec.yaml` with source files next to it), ask (AskUserQuestion) whether to **adopt it with `/adopt`** (recommended: it describes the existing code instead of planning a new project) or **kick off here anyway**. On `/adopt`, stop and tell the user to run it.
   - The project description is required. If `$ARGUMENTS` is a path to a file, that file is the description; if it is text, the text is the description. If there are no arguments, ask the user for the project description or specs (text or file paths) and stop until they answer.
   - Run `STATE init --input "<file path, or a one-line summary of the text>"`.
   - If the folder is a git repository or has a `.gitignore`, add `.keelwright/snapshots/` to `.gitignore` (temporary copies used to measure review edits). The rest of `.keelwright/` is committed.
   - If the description was given as text, save it verbatim to `.keelwright/input.md` so later steps can re-read it.
3. **If it prints `kickoff`**, check for edits first (section 3), then continue.
4. Continue with the loop in section 5.

If the state exists and `$ARGUMENTS` contains a new project description, don't start over: tell the user a kickoff is already in progress here, show `STATE status`, and ask whether the new text should be added as input to the current kickoff.

## 3. Edits since approval

Run `STATE changes --json`. If nothing changed, continue.

If files changed, the user's edited files are now the **source of truth** — never overwrite them with an earlier version. Show:
- which files changed (and whether modified or deleted), and
- which later steps depend on them (`affected`).

Then ask the user (AskUserQuestion) how to proceed:
- **Regenerate the affected steps** → `STATE accept-changes`. The affected steps become `stale` and are re-run in order by the loop, using the edited files as input.
- **Keep everything else as it is** → `STATE accept-changes --keep-downstream`. Use this for edits that don't change any decision (typos, wording).
- **Stop** → change nothing and end.

An edit that changes an accepted ADR's decision is not allowed: accepted ADRs are immutable. If an accepted ADR was edited, tell the user, and offer to restore it and write a new ADR that supersedes it instead.

## 4. Re-run a single step

1. Run `STATE downstream <step>`. If any steps would be marked stale, tell the user which, and ask for confirmation before continuing.
2. Run section 3 (edits) first, so pending edits are not lost.
3. Run the step as described in section 6. Its existing outputs, including the user's edits, are its starting point.
4. Then continue with the loop in section 5.

## 5. The loop

Repeat:

1. Run `STATE next --json`.
2. On `{"action": "run", "step": …}` → run the step (section 6), then repeat.
   - If the step is `publish` (`"optional": true`), first ask whether the user wants Jira or Confluence output. If not, run `STATE start publish` and `STATE skip publish --reason "not requested"`, then repeat.
3. On `{"action": "review", "gate": N}` → hold the review gate (section 7) and stop.
4. On `{"action": "complete"}` → tell the user the kickoff is finished, with a short summary of what exists now. Stop.

Run as many steps as you can in one go; the pipeline only pauses at review gates, when a step needs answers from the user, or when a step is not implemented yet.

## 6. Running a step

1. Read `${CLAUDE_PLUGIN_ROOT}/steps/<step>.md`.
2. **If it says the step is not implemented yet** (the whole step — an **In /adopt** note is about `/adopt` and doesn't apply here), tell the user: the step name, what it will produce, and that this version of KeelWright stops here. Don't change the state. Stop.
3. Run `STATE start <step>` **on its own** — one command, not chained with `&&` or `;` to anything else, so a refused combined command can't drop it — and **before any of the step's work** — before writing or editing any file — so the step's time is measured. `STATE complete` warns when every output was written before the start.
4. Follow the step's instructions. They say what to read, what to produce, and when to ask the user.
5. Finish with exactly one of:
   - `STATE complete <step> <every file or folder the step produced or updated>`, or
   - `STATE skip <step> --reason "<why there is nothing to produce>"` — e.g. `design` for a project with no user-facing UI and no type-specific design documents.

If the step can't be finished in this run (for example, it is waiting for interview answers), leave it `in_progress` and stop; the next `/kickoff` resumes it.

## 7. Review gates

When `STATE next` returns a review:

1. Run `STATE markers` to find open `[NEEDS CLARIFICATION: …]` markers.
2. Show the user:
   - the gate number and the files to review (one line each: path and what it contains),
   - the open markers (file and line), and
   - that they can edit any of these files directly — when they continue, their edited files are the source of truth.
3. Ask (AskUserQuestion):
   - **Approve gate N** — the documents are ready.
   - **Resolve the open questions with me** — only offer when there are markers; go through each marker, update the file with the answer, then ask again.
   - **I'll edit the files first** — stop; the user runs `/kickoff` again when ready.
4. Before approving, **re-read every file under review from disk** — the user may have edited them. If the edits change a decision that other documents in the same gate depend on (e.g. the stack in the PRD), update those documents to match first.
5. If markers are still open, say so and ask for explicit confirmation; approved markers stay as open questions in their documents.
6. For each step in the gate, if its step file has an **"On approval"** section, do what it says (e.g. set document statuses to approved / accepted).
7. Run `STATE approve <N>`, then continue the loop (section 5).

The step files can add gate-specific content to show in step 2 (e.g. the `prd` step's stack summary); include it.

## 8. Report

Run metrics are recorded automatically by `STATE` (`.keelwright/metrics.json`); steps add their own counters with `STATE metric <step> <name> <n|+n>`.

1. Run `STATE report` and show the scorecard: steps, runs, time, open questions, and how much of each document the user changed at review.
2. Ask the user to rate each generated document they reviewed (AskUserQuestion, up to 4 documents per question round), with the options **Used as-is**, **Small edits**, **Rewritten**, **Deleted**. Skip documents already rated unless the user wants to change a rating.
3. Record each answer: `STATE rate <file> <as-is|small-edits|rewritten|deleted>`.
4. Run `STATE report --write` and tell the user the report is in `.keelwright/report.md`. Suggest running `/kickoff report` again a few weeks into the project, to re-rate the documents once they've been used.

## Rules for every step

- **Templates.** Every document is written from its template in `${CLAUDE_PLUGIN_ROOT}/templates/`. Keep the template's structure, front matter and stable IDs; remove the template's instruction comments and example rows from the final document.
- **Unknowns are marked, not guessed.** Anything the input and the interview don't settle is written as `[NEEDS CLARIFICATION: …]` and resolved at a review gate.
- **The user's files win.** Before writing a file that already exists, read it; keep the user's edits and change only what the step needs to change.
- **Accepted ADRs are never edited.** A changed decision gets a new ADR that supersedes the old one.
- **Versions come from the registries, never from memory** (spec 4.6).
- **Keep the user informed** with one short line per step started and finished; put detail in the documents, not the chat.
