---
description: Check how healthy the project is now — Claude setup, docs vs code, stack, tooling, application security, process — and say what fixes each finding. `security` runs only the security audit; `security --deep --max-cost <usd>` adds a model-judged review of the code (costs money). Otherwise read-only and free
argument-hint: "[security [--deep --max-cost <usd> [--area <name>]]] [--offline]"
---

# /doctor

You are running the KeelWright doctor (spec 7.0) in the current directory (the project root). It checks the project **as it is today**, on any project with a Claude setup — made by KeelWright or by hand. It is different from `/kickoff report` and `/adopt report`, which look back at one KeelWright run.

- Doctor script (call it `DOCTOR` below): `node "${CLAUDE_PLUGIN_ROOT}/scripts/doctor.mjs"`
- Profile script (call it `PROFILE` below): `node "${CLAUDE_PLUGIN_ROOT}/scripts/profile.mjs"`
- Deep review script (call it `DEEP` below): `node "${CLAUDE_PLUGIN_ROOT}/scripts/deep.mjs"`
- Arguments: `$ARGUMENTS` — `security` runs only the application-security area (spec 7.7); `--offline` skips the network; `--deep` adds the judgement review (section 3)

## Rules

- **Read-only.** The doctor changes no file except its own record (`.keelwright/doctor.md`, `.keelwright/doctor.json`). Don't fix anything in this command, even when the fix is obvious: name the fix. Fixing them one by one, with approval, is audit mode: `/keelwright:adopt audit`.
- **Report what the script found.** Don't add findings of your own from reading the code; that is `--deep`, whose findings are checked by a second pass. Don't soften a `fail`.
- **Security findings stay out of git.** Their details are in `.keelwright/security/audit.md`, a folder that git-ignores itself; never copy them into a committed file, a commit message, a PR or a public issue (Jira issues are created only when the user asks — section 3). A leaked secret is fixed by rotating it first — say so before anything else.
- **The network.** The only data sent anywhere is the locked packages' names and versions, to OSV.dev (and Semgrep's rules download, when it is installed). If the user doesn't want that, pass `--offline`; dependencies are then "not checked".

## 0. Who is asking

Run `PROFILE show --json`. On a first run (`asked: false`) ask once for the role, as `/keelwright:profile` does, or let the user skip. The profile changes only how the result is **shown**, never what is checked or recorded: `.keelwright/doctor.md` is the team's record and stays the same whoever runs it.

- Show the areas in `doctorOrder` — the person's areas first.
- Show them the way their role reads them (`shows`): a developer or tech lead the files, commands and versions; a designer the design documents and tokens that drifted; a project manager what is at risk, what is blocked and what to ask a developer for; a business analyst the documents and requirements that drifted; an account manager one short status per area and the one thing to raise with the team.
- `language` is the language you write in.

## 1. Run it

Run `DOCTOR --json` once — `DOCTOR security --json` when the argument is `security`, adding `--offline` when it was given. It prints every area's status (`pass`, `warn`, `fail`, `skipped`) and the findings, each with its level, the issue, and usually a `fix`; `securityAudit` has the security audit in full (each finding's severity, status, evidence, fix and fingerprint). It records the result with its history.

## 2. Show the result

1. One line: the date and the counts — to fix (`fail`), to look at (`warn`), notes (`info`).
2. A table: each area and its status. Areas that were skipped say why in a few words.
3. The findings, **failing areas first**, grouped by area: each in one line with its fix. Group repeated findings ("3 commands in `.claude/rules/` name scripts that don't exist") rather than listing every one; the full list is in `.keelwright/doctor.md`.
4. If there is a history, one line on the trend since the last check (e.g. "Tooling went from fail to pass; 2 fewer findings").
5. The next step, in one or two lines: the fix for the most serious finding — for example `/keelwright:adopt gaps`, `/keelwright:adopt research --refresh`, or which file to correct — and that `/keelwright:adopt audit` goes through all of them as fixes to approve.

Say that the record is in `.keelwright/doctor.md` and that it is safe to commit (it lets the team see the trend). For the application-security area show the counts per severity and the open critical and high findings, each with its fix; the full list is in `.keelwright/security/audit.md`, which isn't committed. A finding the team decides to live with is accepted in `.keelwright/security-accepted.json` (committed) with a reason and an end date at most 90 days away — show the fingerprint to use. Say once that this is not a penetration test.

With `security`, show only that area: the checks and whether each ran, then the findings, critical first.

## 3. The deep review (`--deep`) — costs money

The mechanical checks can't see an unchecked route or an injectable query. `--deep` has a model review the code itself (spec 7.7): area by area, sensitive areas first; as the project's `security-reviewer` (or KeelWright's read-only `security-auditor` when the project has none); and every finding goes to a **second, independent call that tries to disprove it**. Disproved findings, and findings citing code that doesn't exist, are dropped. It reads the code — it is not a penetration test.

1. **Plan, free.** Run `DEEP --plan` and show the areas (sensitive ones marked), the reviewer, and that each area costs about two calls. If the project has no threat model and nothing to attack (a static site, an offline game — `reference/security.md`, "When there is a threat model"), say a deep review has little to find there and ask before going on.
2. **The limit.** `--max-cost` is required: it is a hard limit across all the calls. If the user didn't give one, ask for it (AskUserQuestion: a small limit with `--area <name>` for one area first — recommended the first time — or a limit for the whole plan). Never pick a limit yourself. Areas the limit doesn't reach are listed as not reviewed, never as passed.
3. **Run** `DEEP --max-cost <usd>` (plus `--area <name>` or `--model <m>` when given). It can take several minutes per area: run it in the background and tell the user. It writes `.keelwright/security/deep.json` (git-ignored).
4. **Then** run section 1 with `security`: the audit carries the deep findings (check `deep`) from now on, until the code they cite is gone or they are fixed or accepted.
5. **Show:** the cost against the limit; areas reviewed, not reviewed and failed; the findings that held, critical first, each with `file:line`, the category, the evidence and the fix; and how many were dropped and why (counts only). Fixing them is audit mode: `/keelwright:adopt audit`.
6. **Jira, only when the user asks.** With the Atlassian tools connected and a Jira project (`.keelwright/publish.json`, or ask), offer one issue per open **critical or high** finding: the title, `file:line`, severity and the fix — no step-by-step exploit — labelled `security`. Show the list and create them only on approval. Never publish security findings to Confluence.

