# Step: `interview`

Understand the project well enough to write the PRD and choose the stack: identify the project type, find what the input leaves open, and ask the user — briefly and only about what matters.

**Reads:** the project input (`state.input`: a file path, or `.keelwright/input.md`), any other files the user pointed to, and `.keelwright/interview.md` if it exists (a resumed or re-run interview).
**Produces:** `.keelwright/interview.md`; the project type via `STATE set project-type`.
**Gate:** none — continues to `prd`.

## 1. Read everything first

- Read the input completely, and every spec or file it references or the user mentioned.
- If `.keelwright/interview.md` exists, read it: questions already answered are not asked again; the user may have edited answers, and their version wins.
- Look at the project folder. If it already contains application code (beyond `.keelwright/`, docs or a README), tell the user that `/kickoff` is for new projects and that existing codebases will be handled by `/adopt` (not built yet). Ask whether to continue treating it as a new project; stop if not.

## 2. Identify the project type

Pick one: `web`, `mobile`, `game`, `ai`, `library` (library / CLI / API).

- Base it on what the user is building, not on incidental mentions (a website with a chatbot widget is `web` with an AI feature, not `ai`).
- If two types fit equally, ask (one question, with the options).
- **This version supports `web` only.** For any other type: record it with `STATE set project-type <type>`, tell the user the type was recognised but its documents and stacks arrive in a later version, and stop. Leave the step `in_progress`.

## 3. Map what is known and what is open

Go through the topics below. For each, decide: **answered by the input** (note where), **open and worth asking**, or **not relevant** for this project. Don't ask about a topic the input already answers — use the answer.

| Topic | Why it matters |
|---|---|
| Purpose and outcome | The PRD summary and success criteria |
| Users / audiences and what each needs | User stories; whether parts of the product must work on their own |
| Platforms and devices | Mobile-first, browsers, accessibility needs |
| Content: what it is, where it lives, who edits it, how often | Markdown in the repo vs a CMS vs a database |
| Existing assets to reuse or migrate | Content migration, URLs to keep (redirects), domain |
| Pages / structure and how users move between them | Routes, navigation, separate entry points |
| Dynamic features (forms, search, comments, booking, newsletter, payments) | Whether a backend, functions or third-party services are needed |
| Data that must be stored | Whether there is a database and an ERD |
| Accounts / logins | Public vs logged-in areas (frontend rules 3–5) |
| Search and AI-search visibility | Server-rendered or prerendered HTML |
| Languages | i18n routing and content structure |
| Look and feel, brand | Visual identity: shared or separate per area |
| Performance and quality priorities | NFR targets |
| Scale and expected traffic | Hosting and budget |
| Constraints: budget, hosting, domain, legal / privacy (e.g. GDPR, cookies, analytics) | NFRs, ADRs |
| Team and skills, who maintains it | Stack choice, how simple maintenance must be |
| Integrations (email, analytics, calendars, social, APIs) | Added services, ADRs |
| Non-goals | Scope and the backlog |
| Timeline / first release | MVP scope |

**Don't ask about technology** (frameworks, databases, hosting products) unless the user raised it or a hard constraint depends on it — KeelWright recommends the stack in the `prd` step. Ask about needs; the stack follows from them.

## 4. Ask

- Use **AskUserQuestion**, at most **4 questions per round** and normally **no more than 3 rounds**. Ask the questions that change the stack, the document set or the MVP scope first.
- Make each question stand on its own: say briefly why you're asking, and offer 2–4 concrete options. Put the option you'd recommend first and mark it "(Recommended)" when there is a sensible default; the user can always answer in their own words.
- When the input lists something as undecided, ask about it — those are the user's open decisions.
- Use earlier answers: don't ask what an answer already settled, and follow up only when an answer opened a real new question.
- If the user doesn't know or wants to decide later, accept that — it becomes an open question, not a guess.
- Stop asking when the remaining unknowns wouldn't change the PRD's scope, the stack or the document set; those go to the PRD as `[NEEDS CLARIFICATION: …]`.

## 5. Write `.keelwright/interview.md`

Write (or update) the file in this shape — short, factual, no recommendations yet:

```markdown
# Interview: <project name>

- Date: YYYY-MM-DD
- Input: <file path or ".keelwright/input.md">
- Project type: <type> — <one-line reason>

## Summary

<3–5 sentences: what is being built, for whom, and what matters most to the user.>

## Findings

| Topic | Answer | Source |
|---|---|---|
| <topic> | <answer in the user's terms> | input / interview round N |

## Open questions

- <question the user left open or deferred>

## Not relevant

- <topic> — <why>

## Questions and answers

### Round 1
- **Q:** <question as asked>
  **A:** <answer as given, verbatim where possible>
```

Every finding has a source. Nothing is assumed: if neither the input nor the user said it, it isn't a finding.

## 6. Finish

1. `STATE set project-type <type>`
2. `STATE complete interview .keelwright/interview.md` (add `.keelwright/input.md` if it exists, so edits to it are detected too)
3. Tell the user in one or two lines what was settled and how many questions remain open, then continue with `prd`.

If the user stops partway through the questions, save what you have to `.keelwright/interview.md` and leave the step `in_progress`; the next `/kickoff` resumes from the file.
