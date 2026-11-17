# Step: `publish`

Publish the planned work to **Jira** (epics, stories, tasks) and the documents to **Confluence** (one page per document), only when the user asks for it. The repository stays the source of truth: a re-run updates what was published, and nothing is ever deleted.

**Reads:** `docs/` (the PRD's stories, acceptance criteria and requirements; `docs/features.md`; `docs/backlog.md`; every document for Confluence), `.keelwright/publish.json` (what was published before), the state's document set.
**Produces:** Jira issues and Confluence pages; `.keelwright/publish.json`.
**Gate:** none — but nothing is written to Jira or Confluence before the user approves the plan.

`PUBLISH` below means `node "<plugin root>/scripts/publish.mjs"` (run in the project root). It plans from the documents and the record — what to create, update or leave alone — and records what was published. Read spec 5.6 for the rules.

## 1. What to publish

Ask (AskUserQuestion, one round): Jira, Confluence, or both — unless the user already said. For Jira also ask whether deferred backlog items and technical debt should become tasks (recommended: debt yes, deferred items only if the team plans from Jira). Record the answer in the document set: `STATE set documents <current keys plus jira and / or confluence>`.

If the user wants neither: `STATE skip publish --reason "not requested"` and stop.

## 2. Connect to Atlassian

KeelWright publishes through the **Atlassian Rovo MCP server**, with the user's own login and permissions.

1. Look for its tools: `mcp__<server>__getAccessibleAtlassianResources` (the server may be called `atlassian`, or `claude_ai_Atlassian…` when it comes from a claude.ai connector).
2. **Not available:** tell the user how to add it, then stop and leave the step `in_progress`:
   - `claude mcp add --transport http atlassian https://mcp.atlassian.com/v2/mcp`, then `/mcp` to sign in (or add the Atlassian connector in claude.ai);
   - their Atlassian admin may have to allow the Rovo MCP server and its write permissions (`write_jira`, `write_confluence`).
3. **Available:** call `getAccessibleAtlassianResources` and pick the site (ask if there are several). Its `cloudId` goes with every call.

**Use the live tool schemas, not names from memory.** The server's v2 tools differ from v1 (e.g. `createConfluenceContent`, not `createConfluencePage`), only some tools are listed directly — the others are found with `discover` and run through `executeRead` / `executeWrite` with `name`, `cloudId` and `inputs` — and **parameters it doesn't recognise are dropped silently**. Read each tool's schema before its first use; never call `executeDestructive`.

## 3. Jira settings

1. Projects: `listJiraProjects` (through `executeRead` if it isn't listed). Ask which project (or use the one in `.keelwright/publish.json`).
2. Issue types: `listJiraProjectIssueTypesMetadata` for the project. Map KeelWright's kinds to the project's names — `epic`, `story`, `task` (e.g. team-managed projects may call them differently; if there is no epic type, stories go without a parent and the feature is named in a label).
3. Save: `PUBLISH config jira '{"cloudId": "…", "site": "<url>", "projectKey": "…", "issueTypes": {"epic": "…", "story": "…", "task": "…"}, "include": {"deferred": <bool>, "debt": <bool>}}'`

## 4. Confluence settings

1. Spaces: `listConfluenceSpaces` or `getConfluenceSpace` (takes a key or id). Ask which space, and optionally a parent page to publish under. Pages are created with the space's **numeric id**.
2. If the space has instructions (`getConfluenceSpace`), follow them. Read the content format guide once (`getContentFormatGuide` for `createConfluencePage` / `updateConfluencePage`).
3. Save: `PUBLISH config confluence '{"cloudId": "…", "site": "<url>", "spaceId": "…", "spaceKey": "…", "parentId": "<page id or null>"}'`

## 5. Show the plan and ask

Run `PUBLISH plan jira` and / or `PUBLISH plan confluence`. Show the user the summary lines (how many to create, update, unchanged; where), the first few items, and any **orphaned** items (published before, no longer in the documents — they are reported, never deleted). Ask for the go-ahead (AskUserQuestion: publish / show me everything first / cancel). Write nothing before the user agrees.

## 6. Publish to Jira

Get the items with `PUBLISH plan jira --json`. Work through them **in order** (epics first), only those with `action` `create` or `update`:

- **create:** `createJiraIssue` with `cloudId`, `projectKey`, the issue type for the item's `kind`, `summary`, `description` (Markdown), `parent` = the item's `parentKey` (the epic's key), and the `labels`. Then `PUBLISH record jira <id> <new key>` immediately — so an interrupted run never creates duplicates.
- **update:** `editJiraIssue` for the item's `key`: summary, description and labels only — never status, assignee, sprint or other fields the team manages. Then `PUBLISH record jira <id> <key>`.
- **After the first issue of each kind**, read it back (`getJiraIssue`) and check that the description, labels and parent arrived; if a field was dropped, find the right parameter in the tool schema, fix the issue, and only then continue.
- Stories whose `parentKey` was empty in the plan because their epic was created in this run: re-run `PUBLISH plan jira --json` after the epics to get the keys.
- If the record was lost but issues exist, find them before creating: `searchJiraIssuesUsingJql` with `labels = kw-<id>` in the project.
- On a rate-limit error, wait and retry the same item; don't skip it.

## 7. Publish to Confluence

Get the pages with `PUBLISH plan confluence --json` (parents come before their children). For each page with `action` `create` or `update`:

- **create:** `createConfluenceContent` with `cloudId`, `contentType: "page"`, `parent: {"spaceId": …, "parentContentId": <the item's parentId>}`, `title`, `body: {"format": "markdown", "value": <body>}`. Then read it (`getConfluenceContent` with metadata) for its version and URL, and `PUBLISH record confluence <path> <page id> <version> --url <page url>`.
- **update:** first `getConfluenceContent` (markdown, full, with metadata). If its version is **higher than the recorded one**, someone edited the page in Confluence: show the user what changed and ask before overwriting. Then `updateConfluenceContent` with the `snapshotToken` from that read (never a stale one), the new body and a version message ("Published from <path> by KeelWright"), read it again for the new version, and record it.
- After the first pass, run `PUBLISH plan confluence` again: pages whose links to other pages can now resolve show as `update` — publish them too (a second pass, normally short).

## 8. Finish

1. `PUBLISH status` — everything published is up to date.
2. `STATE complete publish .keelwright/publish.json`
3. Tell the user: the Jira project and how many epics, stories and tasks were created or updated (with a link to the project or a JQL `labels = keelwright`), the Confluence root page's link, orphaned items to close or archive by hand, and how to publish again after editing the documents (`/kickoff publish`). Remind them that Jira holds the work's progress, while requirements and decisions are edited in the repository.
