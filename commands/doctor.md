---
description: Check how healthy the project is now — Claude setup, docs vs code, stack, tooling and security, process — and say what fixes each finding. Read-only and free (no model-judged checks yet)
argument-hint: ""
---

# /doctor

You are running the KeelWright doctor (spec 7.0) in the current directory (the project root). It checks the project **as it is today**, on any project with a Claude setup — made by KeelWright or by hand. It is different from `/kickoff report` and `/adopt report`, which look back at one KeelWright run.

- Doctor script (call it `DOCTOR` below): `node "${CLAUDE_PLUGIN_ROOT}/scripts/doctor.mjs"`
- Arguments: `$ARGUMENTS`

## Rules

- **Read-only.** The doctor changes no file except its own record (`.keelwright/doctor.md`, `.keelwright/doctor.json`). Don't fix anything in this command, even when the fix is obvious: name the fix, and the user runs it.
- **Report what the script found.** Don't add findings of your own from reading the code; that is the later `--deep` mode. Don't soften a `fail`.

## 1. Run it

Run `DOCTOR --json` once. It prints every area's status (`pass`, `warn`, `fail`, `skipped`) and the findings, each with its level, the issue, and usually a `fix`; it records the result with its history.

## 2. Show the result

1. One line: the date and the counts — to fix (`fail`), to look at (`warn`), notes (`info`).
2. A table: each area and its status. Areas that were skipped say why in a few words.
3. The findings, **failing areas first**, grouped by area: each in one line with its fix. Group repeated findings ("3 commands in `.claude/rules/` name scripts that don't exist") rather than listing every one; the full list is in `.keelwright/doctor.md`.
4. If there is a history, one line on the trend since the last check (e.g. "Tooling went from fail to pass; 2 fewer findings").
5. The next step, in one or two lines: the fix for the most serious finding — for example `/keelwright:adopt gaps`, `/keelwright:adopt research --refresh`, or which file to correct.

Say that the record is in `.keelwright/doctor.md` and that it is safe to commit (it lets the team see the trend).
