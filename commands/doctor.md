---
description: Check how healthy the project is now — Claude setup, docs vs code, stack, tooling, application security, process — and say what fixes each finding. `security` runs only the security audit. Read-only and free (no model-judged checks yet)
argument-hint: "[security] [--offline]"
---

# /doctor

You are running the KeelWright doctor (spec 7.0) in the current directory (the project root). It checks the project **as it is today**, on any project with a Claude setup — made by KeelWright or by hand. It is different from `/kickoff report` and `/adopt report`, which look back at one KeelWright run.

- Doctor script (call it `DOCTOR` below): `node "${CLAUDE_PLUGIN_ROOT}/scripts/doctor.mjs"`
- Arguments: `$ARGUMENTS` — `security` runs only the application-security area (spec 7.7); `--offline` skips the network

## Rules

- **Read-only.** The doctor changes no file except its own record (`.keelwright/doctor.md`, `.keelwright/doctor.json`). Don't fix anything in this command, even when the fix is obvious: name the fix. Fixing them one by one, with approval, is audit mode: `/keelwright:adopt audit`.
- **Report what the script found.** Don't add findings of your own from reading the code; that is the later `--deep` mode. Don't soften a `fail`.
- **Security findings stay out of git.** Their details are in `.keelwright/security/audit.md`, a folder that git-ignores itself; never copy them into a committed file, a commit message, a PR or an issue. A leaked secret is fixed by rotating it first — say so before anything else.
- **The network.** The only data sent anywhere is the locked packages' names and versions, to OSV.dev (and Semgrep's rules download, when it is installed). If the user doesn't want that, pass `--offline`; dependencies are then "not checked".

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
