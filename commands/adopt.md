---
description: Bring an existing project into KeelWright — analyse the code, record its architecture and decisions, fill tooling gaps with your approval, and generate a Claude setup that follows the project's own conventions. On a project that already has a Claude setup, audit mode fixes what the doctor finds, one approved fix at a time
argument-hint: "[status | report | audit [--offline] | <step> | research --refresh | <notes about the project>]"
---

# /adopt

You are running the KeelWright `/adopt` pipeline in the current directory (the project root). It takes an **existing** codebase, describes it as it is, and builds a project-specific Claude setup on top of it, pausing at review gates so the user can correct what was inferred.

**The code is the source of truth.** `/adopt` never changes application code, folder structure or dependency versions. The only changes to the project outside `.keelwright/`, `docs/` and the Claude setup are the tooling fixes the user approves one by one in the `gaps` step.

- Plugin root: `${CLAUDE_PLUGIN_ROOT}`
- Step instructions: `${CLAUDE_PLUGIN_ROOT}/steps/<step>.md`
- Document templates: `${CLAUDE_PLUGIN_ROOT}/templates/`
- State CLI (call it `STATE` below): `node "${CLAUDE_PLUGIN_ROOT}/scripts/state.mjs"`
- Profile script (call it `PROFILE` below): `node "${CLAUDE_PLUGIN_ROOT}/scripts/profile.mjs"`
- Facts script (call it `ANALYSE` below): `node "${CLAUDE_PLUGIN_ROOT}/scripts/analyse.mjs"` (run in the project root)
- Audit script (call it `AUDIT` below): `node "${CLAUDE_PLUGIN_ROOT}/scripts/audit.mjs"` (run in the project root)
- Arguments: `$ARGUMENTS`

## Modes

- **Create mode** — the project has no Claude setup. This command runs it.
- **Audit mode** — the project already has a `CLAUDE.md` or a `.claude/` folder (anywhere except templates, fixtures and examples), or its KeelWright pipeline is complete. It runs the doctor and offers a fix for each finding, applied only on approval (section 9).

Other tools' instruction files (`AGENTS.md`, `.cursorrules`, `.github/copilot-instructions.md`) are not a Claude setup; the `analyse` step reads them as input.

## The pipeline (create mode)

```
analyse → { document, research } → gaps → generate → publish
```

| Step | Produces | Gate after it |
|---|---|---|
| `analyse` | `.keelwright/analysis.md`: type, toolchain, stack and versions in use, tasks, structure, architecture, conventions, decisions, gaps | Gate 1 |
| `document` | Architecture overview (as built), threat model (as built), ADR-0001, ADRs recorded retroactively | Gate 2 |
| `research` | Stack packs for the versions in use | Gate 2 |
| `gaps` | Tooling fixes, each shown as a diff and applied only on approval; `.keelwright/gaps.md` | — |
| `generate` | CLAUDE.md, rules, skills, subagents, hooks, CONTRIBUTING.md | — |
| `publish` | Confluence (only when the user asks for it) | — |

## State rules

- `.keelwright/state.json` holds the pipeline state, with `"mode": "adopt"`. **Only change it through `STATE`** — never edit the JSON yourself. Run `STATE help` for the full command list.
- If a `STATE` command prints `error: …`, stop and tell the user what failed. Don't work around it.
- Steps record their outputs with `STATE complete <step> <files…>`; this is how edits are detected later. Record a folder only when the step owns everything in it; otherwise list the files.
- A step never edits a file an earlier, finished step produced — that counts as a user edit and triggers the edit question. If a step needs such a change, it tells the user which step to re-run.

## Who is running it (profile)

Before section 1, run `PROFILE show --json` once. The profile is personal (`~/.keelwright/profile.json`, spec 5.7) — never in the repository — and it **never changes the document set**: the next person needs every document whoever ran the adoption.

- **First run** (`asked: false`): ask once (AskUserQuestion) for the role — **Developer** · **Project manager** · **Business analyst** · **Account manager** · **Skip** — with the name through "Other". Save it with `PROFILE set --role <developer|project-manager|business-analyst|account-manager> [--name "…"]`, or `PROFILE skip`. Say `/keelwright:profile` changes it any time. Never ask for or store an email address.
- **`name`** is the `owner` of the documents this run writes and the decision-makers of its ADRs, instead of a marker — pass it to the steps.
- **`defaults`**: `jiraProject` and `confluenceSpace` prefill `publish`'s questions (still confirmed); `language` is the language you talk to the user in — documents stay in the language of the project's input.
- **`role`** decides the working set at gates (section 7) and in the report (section 8), which open questions the user is asked, and how results are shown (`shows`: a developer sees diffs, versions and files; a PM scope, risks and what is blocked; a BA requirements, criteria and data gaps). No role: everything is shown as before.
- **A project manager** with `pmSkills: true` is offered pm-skills' workflows on the project's documents (OKRs, outcome roadmap, pre-mortem, PRD red-team, stakeholder map, release notes) after gate 1 and at the end — one line each time, never part of the document set. With `pmSkills: false`, say once that it can be installed (`/plugin marketplace add phuryn/pm-skills`).

## 1. Read the arguments

| Arguments | Meaning | Go to |
|---|---|---|
| `status` | Show progress | Run `STATE status` and show the result in a short, readable form. Stop. |
| `report` | Run report and document ratings | Section 8 |
| `audit` (optionally `--offline`) | Audit mode, on a project with a Claude setup | Section 9 |
| a step name (`analyse`, `document`, `research`, `gaps`, `generate`, `publish`) | Re-run that step | Section 4 |
| `research --refresh` | Re-run research and force new stack packs | Section 4, passing the refresh flag to the step |
| anything else | Notes about the project (e.g. "the `/v1` routes are deprecated") | Section 2; save the notes as below |
| nothing | Start, or continue | Section 2 |

## 2. Start or continue

1. Run `STATE mode`.
2. **`adopt`** — an adoption is in progress. Check for edits (section 3), then continue with the loop (section 5); a complete adoption goes to audit mode (section 9).
3. **`kickoff`** — this project was set up by `/kickoff`. If `STATE next --json` says `complete`, it has its Claude setup: audit mode (section 9). Otherwise the kickoff is still running: tell the user to continue it with `/kickoff` and stop.
4. **`none`** — a new adoption:
   1. Run `ANALYSE --preflight`. It prints the mode, the toolchain and the `blockers`. For each blocker, tell the user and **stop without creating anything**:
      - `audit` — the project already has a Claude setup (`detail`: its files): not a blocker — go to audit mode (section 9) instead of creating a state. The other blockers don't apply to audit mode either: the doctor works on any repository.
      - `monorepo` — this kind of monorepo isn't supported yet (`why`: e.g. Nx, more than six workspaces, a project outside the workspaces). List the packages (`detail`) and say: run `/adopt` from the folder of the package to adopt; that folder becomes the project root.
      - `toolchain` — the project's languages (`detail`) aren't supported yet. Name the supported ones: node, python, dart, rust, godot.
      - `no-project` — there's no project here; `/adopt` is for existing code and `/kickoff` starts new projects.
   2. Tell the user in one line what was found (toolchain and package manager) and that `/adopt` starts with the analysis. When `workspaces` is set, say the repository is adopted as **one project** with those workspaces, from the root.
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
   - If the step is `publish` (`"optional": true`), first ask whether the user wants the documents in Confluence (Jira isn't offered: it needs a PRD). If not, run `STATE start publish` and `STATE skip publish --reason "not requested"`, then repeat.
3. On `{"action": "review", "gate": N}` → hold the review gate (section 7) and stop.
4. On `{"action": "complete"}` → tell the user the adoption is finished, with a short summary of what exists now and what was declined in `gaps`, and suggest `/adopt report` to rate the documents, and `/adopt` again later for audit mode. Stop. (When `/adopt` starts on an adoption that is **already** complete, section 2 sends it to audit mode instead.)

Run as many steps as you can in one go; the pipeline only pauses at review gates, when a step needs answers from the user, or when a step is not implemented yet.

## 6. Running a step

1. Read `${CLAUDE_PLUGIN_ROOT}/steps/<step>.md`. The `research`, `generate` and `publish` step files serve both `/kickoff` and `/adopt`: follow their **In /adopt** section where it differs.
2. **If the step file says it is not implemented yet** — for the whole step, or for `/adopt` — tell the user: the step name, what it will produce, and that this version of KeelWright stops here. Don't change the state. Stop.
3. Run `STATE start <step>` **on its own** — one command, not chained with `&&` or `;` to anything else, so a refused combined command can't drop it — and **before any of the step's work** — before writing or editing any file — so the step's time is measured.
4. Follow the step's instructions. They say what to read, what to produce, and when to ask the user.
5. Finish with exactly one of:
   - `STATE complete <step> <every file or folder the step produced or updated>`, or
   - `STATE skip <step> --reason "<why there is nothing to produce>"`.

If the step can't be finished in this run (for example, it is waiting for the user's answers), leave it `in_progress` and stop; the next `/adopt` resumes it.

## 7. Review gates

When `STATE next` returns a review:

1. Run `STATE markers --role <the profile's tag> --json` (without `--role` when there is no role) to find the open `[NEEDS CLARIFICATION …]` markers: `mine` are the user's (their role's and untagged ones), `waiting` belong to another role. Run `PROFILE split <every file under review> --json`: `mine` is the user's working set.
2. Show the user:
   - the gate number and the files to review: the working set (`mine`) first, each with its path and what it contains, then the others in one line each — still open to the user,
   - the step files' gate content (e.g. the `analyse` step's mixed conventions and gaps),
   - the user's open markers (file and line), and how many wait on other roles ("2 waiting on a developer") — those stay open for the right person, and
   - that they can edit any of these files directly — when they continue, their edited files are the source of truth.
3. Ask (AskUserQuestion):
   - **Approve gate N** — the documents are right.
   - **Resolve the open questions with me** — only offer when the user has markers; go through each of theirs, update the file with the answer, then ask again. Never answer another role's question for them.
   - **I'll edit the files first** — stop; the user runs `/adopt` again when ready.
4. Before approving, **re-read every file under review from disk** — the user may have edited them. If an edit changes something another document in the same gate depends on, update that document first.
5. If the user's markers are still open, say so and ask for explicit confirmation (markers waiting on another role don't block the user's approval — list them); approved markers stay as open questions in their documents.
6. For each step in the gate, if its step file has an **"On approval"** section, do what it says.
7. Run `STATE approve <N>`, then continue the loop (section 5).

## 8. Report

Run metrics are recorded automatically by `STATE` (`.keelwright/metrics.json`); steps add their own counters with `STATE metric <step> <name> <n|+n>`.

1. Run `STATE report` and show the scorecard: steps, runs, time, open questions, and how much of each document the user changed at review.
2. Ask the user to rate each generated document in their working set (`PROFILE split <the reviewed documents>`; everything without a role) (AskUserQuestion, up to 4 documents per question round), then offer once to rate the others too, with the options **Used as-is**, **Small edits**, **Rewritten**, **Deleted**. Skip documents already rated unless the user wants to change a rating.
3. Record each answer: `STATE rate <file> <as-is|small-edits|rewritten|deleted>`.
4. Run `STATE report --write` and tell the user the report is in `.keelwright/report.md`.

## 9. Audit mode (spec 7.4)

The project has a Claude setup. Audit mode keeps it — and the project around it — healthy: it runs the doctor and turns each finding into a fix, shown as a diff and applied **only when the user approves it**, one by one. Some unusual rules are intentional; nothing is rewritten silently. Audit mode has no pipeline state: its record is `.keelwright/audit.md` (committed) and, for security findings, `.keelwright/security/fixes.json` (git-ignored).

### 9.1 Plan

1. Run `AUDIT plan --json` (with `--offline` when the user asked for it). It runs the doctor — recording `.keelwright/doctor.md` as `/keelwright:doctor` does — and prints `fixes`, in order: a leaked secret first, then failures, then warnings. Each fix has an `id` (`FIX-NN`), the `kind`, `how`, the `issues` it covers (repeats are grouped: every advisory of one package is one upgrade), the `evidence`, `secure` (a security finding) and `previously` (deferred last time). `kinds` explains each kind.
2. Show the doctor's result as `/keelwright:doctor` does (`${CLAUDE_PLUGIN_ROOT}/commands/doctor.md`, section 2): the counts and the area table. Then the fixes in one line each: id, kind, the issue. Declined fixes and accepted risks aren't offered again (`AUDIT plan --all` shows them, if the user asks).
3. No fixes: say the project is healthy as far as the mechanical checks go, and stop.
4. Ask (AskUserQuestion): **Go through the fixes** (recommended) · **Only the failures** · **Stop** (the record is written; nothing else changes).

### 9.2 One fix at a time

For each fix, in order:

1. **Explain** in one line what is wrong and what it risks, citing the evidence.
2. **Propose** the fix by kind — read the files involved first and change as little as the fix needs:
   - **`edit`** — the diff for each file. A document that cites a moved file gets the new path; an **accepted ADR is never edited** — propose a new ADR that supersedes it. A rule or CLAUDE.md line that no longer matches the project is corrected from the project's real commands and paths (`ANALYSE --json`). RLS: a **new** migration, never an edit to one that has run. CI actions: the full commit SHA with the version in a comment (`node "${CLAUDE_PLUGIN_ROOT}/scripts/versions.mjs" github:<owner>/<repo>`).
   - **`gap`** — a tooling fix: follow `${CLAUDE_PLUGIN_ROOT}/steps/gaps.md`, its **Rules** and the **Fix guide** entry for the gap id in `how` (the project's own tools; protected paths; every command shown). When `.keelwright/gaps.md` exists, update the gap's row there too.
   - **`step`** — a KeelWright step to re-run (`how`, e.g. `/keelwright:adopt research --refresh`). Say what it will regenerate; on approval run it as in section 4, then come back to the next fix.
   - **`command`** — show the exact command; run it on approval.
   - **`upgrade`** — under the version policy (spec 4.6): within the same major, raise the package to the fixed version with the project's package manager (`npm install <pkg>@<version>`, `pnpm update <pkg>@<version>`, `uv lock --upgrade-package <pkg>==<version>`, `cargo update -p <pkg> --precise <version>`); a transitive package through the direct dependency that pulls it in, or the package manager's override field when none has a fix yet. A **new major** is a decision: propose an ADR and offer to defer the upgrade as a piece of work of its own. Then run the project's `check` task — an upgrade that breaks it is reverted.
   - **`rotate`** — a leaked secret. **Rotating it comes first and only the team can do it**: name the kind of key (the gitleaks rule) and where it is used. Removing it from the code doesn't remove it from the history, and rewriting history is the team's call, not audit mode's. After rotation: move the value to an environment variable the code reads, or — for a test fixture or false positive — add the finding to `.gitleaksignore`.
   - **`answer`** — open questions: go through each `[NEEDS CLARIFICATION]` marker that is the user's (their role's tag, or untagged) and write the answer into the file. Questions tagged for another role are listed as waiting on them; never answer for them. When none are the user's, record the fix as deferred.
3. **Ask** (AskUserQuestion): **Apply** · **Skip** (ask why in one line) · **Later** · **Accept the risk** (security findings only: a reason, and for how long — at most 90 days) · **Stop here**.
4. **Record** right away, so a stopped run resumes cleanly:
   - Apply → apply exactly what was shown, then `AUDIT decide <FIX-NN> applied`. It re-runs the doctor and refuses while the finding is still there: finish the fix or revert it — never leave it half-done. When the checking tool isn't installed (gitleaks, Semgrep), add `--unverified` and say so.
   - Skip → `AUDIT decide <FIX-NN> declined --note "<reason>"` (not offered again; the row in `.keelwright/audit.md` shows why).
   - Later → `AUDIT decide <FIX-NN> deferred`.
   - Accept → `AUDIT accept <FIX-NN> --reason "<reason>" --days <n>` (writes `.keelwright/security-accepted.json`, which the doctor reads).
   - Stop here → stop; the next `/adopt audit` plans again from the doctor.

### 9.3 Finish

1. Run `AUDIT plan` once more (it records the doctor again, so the trend shows in `.keelwright/doctor.md`) and `AUDIT status`.
2. Tell the user in a few lines: what was applied, declined, deferred and accepted; how the areas changed; anything the team must do by hand (rotate a key, install a tool); and suggested commits, one per fix (`fix(deps): upgrade lodash`, `docs: update the overview after the api/ move`). Nothing is committed by audit mode.

### Rules for audit mode

- **Approved, one by one.** Audit mode may change any file a fix needs — including dependency versions and migrations, unlike create mode — but only what the user saw and approved.
- **Security details stay out of git** (spec 7.7): never in `.keelwright/audit.md`, a commit message, a PR or an issue. A commit for a vulnerability fix names the package and version, not the attack.
- **The doctor decides when a fix is done**, not the model: `AUDIT decide … applied` checks it.

## Rules for every step

- **Describe, don't redesign.** Write what the code does, citing files. A pattern you'd do differently is not a gap; a missing safety net (secret scanning, CI, tests) is.
- **Never change application code, structure or dependency versions.** Tooling fixes happen only in `gaps`, one by one, with approval.
- **Templates.** Every document is written from its template in `${CLAUDE_PLUGIN_ROOT}/templates/`. Keep the template's structure, front matter and stable IDs; remove the template's instruction comments and example rows.
- **Unknowns are marked, not guessed.** What the code and docs don't settle is a `[NEEDS CLARIFICATION: …]` marker, resolved at a gate. Tag it with the role that can answer it — `[NEEDS CLARIFICATION (pm): launch date?]`: `dev` (technical), `pm` (scope, priorities, dates, budget), `ba` (requirements, rules, data), `am` (the client relationship); untagged when anyone can.
- **Existing documents are linked, not rewritten.** Existing ADRs keep their numbers; new ones are numbered after them.
- **The user's files win.** Before writing a file that already exists, read it; keep the user's edits and change only what the step needs to change.
- **Keep the user informed** with one short line per step started and finished; put detail in the documents, not the chat.
