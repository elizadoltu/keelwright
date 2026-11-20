---
status: draft            # draft | approved
date: YYYY-MM-DD
owner: <name>
framework: <the edition from reference/security.md, e.g. "OWASP Top 10 (2025)">
---

# Threat model: <Product name>

<!--
Rules for this document:
- What can go wrong, where, and what stops it — for THIS project. No generic checklist: every
  risk names the real paths, routes, tables or tools where it can happen.
- IDs: SEC-01…. Never renumber; a risk that no longer applies is marked "dropped".
- Every risk has a mitigation and says how it is enforced: an RLS policy, a test, a lint rule,
  a hook, a CI step — or "review" when only the security-reviewer can check it. Paths in
  backticks must exist (in /adopt) or be in the architecture overview's code structure (in /kickoff).
- Status: mitigated (enforced and in place) | planned (the stories build it) | open (nothing
  enforces it yet — a known gap) | accepted (with the reason).
- The security-reviewer agent and the doctor's security audit read this file. Keep it current:
  the docs-keeper updates it when a route, table, container or tool is added.
- Target length: 1–2 pages.
-->

## Scope

<!-- One or two sentences: what the system is, what is in and out of scope (e.g. "the hosting
platform's own security is out of scope"). Link the architecture overview. -->

## Assets and data

<!-- What is worth protecting. Personal data marked; the PRD's privacy NFRs by ID. -->

| Asset | Where it lives | Personal data | Notes |
|---|---|---|---|
| <e.g. customer profiles> | <`profiles` table> | yes | <NFR-004: deleted on request> |

## Roles

<!-- Who uses the system and what each may do. Anonymous visitors count. -->

| Role | Can | Cannot |
|---|---|---|
| <anonymous> | <read published content, submit the contact form> | <read other users' data> |

## Trust boundaries and entry points

<!-- Where untrusted input crosses into the system: from the C4 containers. One row per entry point. -->

| Entry point | Boundary | Input from | Notes |
|---|---|---|---|
| <`POST /api/contact`> | <browser → server function> | <anyone> | <rate-limited, captcha> |

## Risks

<!-- Category: the framework item (e.g. A01 Broken Access Control, LLM01 Prompt Injection, API1 BOLA). -->

| ID | Risk | Category | Where | Mitigation | Enforced by | Status |
|---|---|---|---|---|---|---|
| SEC-01 | <a user reads another user's orders> | <A01> | <`orders` table, `src/routes/orders/`> | <RLS: owner only> | <RLS policy + test `orders.rls.test.ts`> | <planned> |

## Sensitive paths

<!-- Globs the security-reviewer always reviews and `.claude/rules/security.md` is scoped to:
auth, access control, migrations and policies, API handlers, prompt and tool code, payment,
file uploads. Real folders only. -->

- `<supabase/migrations/**>`

## Out of scope and assumptions

- <e.g. Supabase and Vercel platform security; DDoS beyond the platform's protection>
