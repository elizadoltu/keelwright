---
description: Set who you are for KeelWright — your name, your role (developer, project manager, business analyst, account manager) and defaults (Jira project, Confluence space, language). The role decides which documents you're shown in full, which open questions you're asked and how results are shown; it never changes the project's documents
argument-hint: "[show | <role>]"
---

# /profile

You are setting the user's KeelWright profile (spec 5.7). It is **personal**: it lives in `~/.keelwright/profile.json`, never in the repository, because several people with different roles work on one project. It never holds an email address.

- Profile script (call it `PROFILE` below): `node "${CLAUDE_PLUGIN_ROOT}/scripts/profile.mjs"`
- Arguments: `$ARGUMENTS`

## What the role changes — and what it doesn't

**The project's document set doesn't depend on who runs KeelWright**: a project kicked off by a PM still gets its architecture and Claude setup, because the next person needs them. The role decides:

| | Developer | Project manager | Business analyst | Account manager |
|---|---|---|---|---|
| Working set — shown in full at gates, rated in the report | architecture, ADRs, C4, ERD, threat model, API surface, development workflow, stack packs, tooling gaps, the Claude setup | PRD, feature breakdown, backlog, release checklist, Jira | PRD requirements and criteria, ERD (the data), screen flow, test scenarios | to be defined — everything summarised |
| Questions asked | `(dev)` | `(pm)` | `(ba)` | `(am)` |
| Results shown as | diffs, versions, files | scope, risks, what is blocked | requirements, criteria, data gaps | a short status per area |

Untagged questions are anyone's. The other documents are summarised in a line each and stay open to everyone.

## 1. Show

Run `PROFILE show --json`. With `show` as the argument, show the profile in one line and stop.

## 2. Set

Ask (AskUserQuestion, one round):
- **Role** — Developer · Project manager · Business analyst · Account manager. If the argument already names a role, skip this question.
- **Name** — what to write as a document's `owner` and an ADR's decision-makers. Through "Other"; offer "Leave empty" as an option.
- **Defaults** (optional) — the Jira project key, the Confluence space key, and the language KeelWright should talk in. Through "Other"; offer "None for now".

Then run `PROFILE set --role <developer|project-manager|business-analyst|account-manager> [--name "…"] [--jira KEY] [--confluence SPACE] [--language <lang>]`. If it refuses an email address, say a profile never holds one and ask for a name instead.

If the user is a **project manager**, `show --json` says whether **pm-skills** is installed (`pmSkills`). KeelWright uses it rather than copying it: its workflows (OKRs, outcome roadmap, pre-mortem, PRD red-team, stakeholder map, release notes) run on the project's documents. Installed: say they're offered at the PRD gate and at the end of a kickoff. Not installed: say how — `/plugin marketplace add phuryn/pm-skills`, then install its plugins from `/plugin` — and that it's optional.

Confirm in one line what was saved and where.
