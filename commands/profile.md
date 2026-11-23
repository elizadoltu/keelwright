---
description: Set who you are for KeelWright — your name, your role (developer, tech lead, designer, project manager, business analyst, account manager) and defaults (Jira project, Confluence space, language). The role decides which documents you're shown in full, which open questions you're asked and how results are shown; it never changes the project's documents
argument-hint: "[show | <role>]"
---

# /profile

You are setting the user's KeelWright profile (spec 5.7). It is **personal**: it lives in `~/.keelwright/profile.json`, never in the repository, because several people with different roles work on one project. It never holds an email address.

- Profile script (call it `PROFILE` below): `node "${CLAUDE_PLUGIN_ROOT}/scripts/profile.mjs"`
- Arguments: `$ARGUMENTS`

## What the role changes — and what it doesn't

**The project's document set doesn't depend on who runs KeelWright**: a project kicked off by a PM still gets its architecture and Claude setup, because the next person needs them. What the role decides is **who produces each part** — when the pipeline reaches another role's step, it stops and hands off to them — and what each person is shown and asked:

| | Runs | Working set — shown in full at gates, rated in the report | Asked | Shown as |
|---|---|---|---|---|
| **Developer** | every step | architecture, ADRs, C4, ERD, threat model, API surface, development workflow, stack packs, tooling gaps, the Claude setup | `(dev)`, `(lead)` | diffs, versions, files |
| **Tech lead** | every step; owns the stack, architecture, diagrams, ERD, scaffold and Claude setup | as the developer | `(lead)`, `(dev)` | decisions, diffs, versions, files |
| **Designer** | `design` (visual identity, tokens, screen flow) | the design documents and tokens | `(design)` | the look, the screens, the tokens |
| **Project manager** | interview (product questions only), PRD (no stack), features, publish; the client brief when there is no account manager | PRD, feature breakdown, backlog, release checklist, Jira | `(pm)` | scope, risks, what is blocked |
| **Business analyst** | interview, PRD, features, publish | PRD requirements and criteria, feature breakdown, backlog, test scenarios | `(ba)` | requirements, criteria, data gaps |
| **Account manager** | interview (the client's context), the client brief | the client brief and the scope change log (`docs/client/`) | `(am)`: only the client can answer — they ask the client (`/kickoff questions`) | what the client agreed, what the client still has to answer, what changed in scope |

A project manager, business analyst or account manager is never asked a technical question or shown a stack, a version or a scaffold. With no designer on the team, the tech lead or a developer runs `design`. No role: every step, as before profiles.

Untagged questions are anyone's. The other documents are summarised in a line each and stay open to everyone.

## 1. Show

Run `PROFILE show --json`. With `show` as the argument, show the profile in one line and stop.

## 2. Set

Ask (AskUserQuestion, one round):
- **Role** — Developer · Tech lead · Designer · Project manager · Business analyst · Account manager. AskUserQuestion takes 4 options, so ask first technical (Developer, Tech lead, Designer) or product (Project manager, Business analyst, Account manager), then the role. If the argument already names a role, skip this.
- **Name** — what to write as a document's `owner` and an ADR's decision-makers. Through "Other"; offer "Leave empty" as an option.
- **Defaults** (optional) — the Jira project key, the Confluence space key, and the language KeelWright should talk in. Through "Other"; offer "None for now".

Then run `PROFILE set --role <developer|tech-lead|designer|project-manager|business-analyst|account-manager> [--name "…"] [--jira KEY] [--confluence SPACE] [--language <lang>]`. If it refuses an email address, say a profile never holds one and ask for a name instead.

If the user is a **project manager**, `show --json` says whether **pm-skills** is installed (`pmSkills`). KeelWright uses it rather than copying it: its workflows (OKRs, outcome roadmap, pre-mortem, PRD red-team, stakeholder map, release notes) run on the project's documents. Installed: say they're offered at the PRD gate and at the end of a kickoff. Not installed: say how — `/plugin marketplace add phuryn/pm-skills`, then install its plugins from `/plugin` — and that it's optional.

Confirm in one line what was saved and where.
