import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, test } from 'node:test';
import { checkDocument, citedPaths, placeholders, wordCount } from '../scripts/lib/doccheck.mjs';

const prd = (stories, frs, extra = '') => `---
status: draft
date: 2026-11-16
---

# PRD: Test

## User stories

${stories}

## Functional requirements

| ID | Requirement | Story | Priority |
|---|---|---|---|
${frs}

## Technical constraints

- Platforms: web
${extra}`;

const GOOD_STORY = `### US-1 [P1] Contact

As a visitor, I want to contact the owner so that I can ask a question.

**Acceptance criteria**
- WHEN the visitor submits a valid form THE SYSTEM SHALL send it by email.
- Given an empty email field, when the visitor submits, then the form shows an error.`;

describe('doccheck', () => {
  test('a clean PRD passes', () => {
    const r = checkDocument(prd(GOOD_STORY, '| FR-001 | Send enquiries by email. | US-1 | P1 |'), { type: 'prd' });
    assert.deepEqual(r.issues, []);
    assert.equal(r.ok, true);
  });

  test('plain-statement criteria are flagged, sections after the last story are not', () => {
    const story = `${GOOD_STORY}\n- The form looks nice.`;
    const r = checkDocument(prd(story, '| FR-001 | Send. | US-1 | P1 |'), { type: 'prd' });
    assert.deepEqual(r.issues.map((i) => i.issue), ['US-1: criterion is not WHEN/SHALL or Given/When/Then: "- The form looks nice."']);
  });

  test('requirements must trace to existing stories', () => {
    const r = checkDocument(prd(GOOD_STORY, '| FR-001 | Send. | — | P1 |\n| FR-002 | Log. | US-9 | P2 |'), { type: 'prd' });
    assert.deepEqual(r.issues.map((i) => i.issue), ["FR-001 doesn't reference a story", 'FR-002 references unknown US-9']);
  });

  test('a story without criteria is flagged', () => {
    const r = checkDocument(prd('### US-1 [P1] X\n\nAs a user, I want x so that y.', '| FR-001 | X. | US-1 | P1 |'), { type: 'prd' });
    assert.ok(r.issues.some((i) => i.issue === 'US-1 has no acceptance criteria'));
  });

  test('the word limit applies per type and can be overridden', () => {
    const long = prd(GOOD_STORY, '| FR-001 | X. | US-1 | P1 |', 'word '.repeat(2000));
    assert.match(checkDocument(long, { type: 'prd' }).issues[0].issue, /over the 1800-word limit/);
    assert.equal(checkDocument(long, { type: 'prd', maxWords: 5000 }).ok, true);
  });

  test('front matter is not counted as words', () => {
    assert.equal(wordCount('---\nstatus: draft\n---\n\nOne two three.'), 3);
  });

  test('placeholders are found outside code and clarification markers only', () => {
    const text = [
      'Date: YYYY-MM-DD',
      'Owner: <name>',
      '<!-- instructions -->',
      'Use `<html lang>` in code.',
      '[NEEDS CLARIFICATION: <which inbox>]',
      '```',
      '<div>example</div>',
      '```',
      'A link <https://example.com> is fine.',
    ].join('\n');
    assert.deepEqual(placeholders(text).map((p) => [p.line, p.issue]), [
      [1, 'date or number placeholder'],
      [2, 'placeholder <name>'],
      [3, 'template comment left in'],
    ]);
  });

  test('the raw PRD template fails', () => {
    const template = readFileSync(new URL('../templates/prd.md', import.meta.url), 'utf8');
    assert.equal(checkDocument(template, { type: 'prd' }).ok, false);
  });
});

describe('type-specific documents', () => {
  const issuesOf = (text, type) => checkDocument(text, { type }).issues.map((i) => i.issue);

  test('screen flow needs screens and a navigation diagram', () => {
    assert.deepEqual(issuesOf('# Screens\n', 'screen-flow'), ['no screens (| S-01 | … rows in the screen inventory)', 'no Mermaid diagram of the navigation']);
    assert.deepEqual(issuesOf('```mermaid\nflowchart LR\n```\n\n| S-01 | Home | x |\n', 'screen-flow'), []);
  });

  test('GDD needs a core loop and a cut list', () => {
    assert.deepEqual(issuesOf('## Core loop\n\n## Scope and cut list\n\n- Online play\n', 'gdd'), ['the core loop is missing']);
  });

  test('AI system design: prompts, and tools with side effects need confirmation', () => {
    const doc = '| P-01 | answer | `prompts/answer.md` | q | text |\n\n| ID | Tool | What | Side effects | Needs confirmation |\n|---|---|---|---|---|\n| T-01 | search | finds | read-only | no |\n| T-02 | refund | refunds an order | writes payments | no |\n| T-03 | note | adds a note | writes | yes |\n';
    assert.deepEqual(issuesOf(doc, 'ai-system-design'), ['T-02 has side effects (writes payments) but doesn\'t need confirmation — set it to "yes" or say why not']);
  });

  test('AI eval plan: thresholds, plus a cost and a latency budget', () => {
    assert.deepEqual(issuesOf('| EV-001 | grounded | pass rate | high | judge |\n', 'ai-eval-plan'), ['no latency criterion (an EV- row with a latency budget)', 'no cost criterion (an EV- row with a cost budget)', 'EV-001 has no threshold']);
    assert.deepEqual(issuesOf('| EV-001 | grounded | pass rate | ≥ 95% | judge |\n| EV-002 | Latency | p95 | < 3 s | code |\n| EV-003 | Cost | per request | < $0.01 | code |\n', 'ai-eval-plan'), []);
  });

  test('API surface: items and a versioning policy', () => {
    assert.deepEqual(issuesOf('## Versioning\n\nSemVer.\n', 'api-surface'), ['no public API items (| API-001 | … rows)']);
  });
});

describe('adopt analysis', () => {
  const doc = (rows) => `# Analysis\n\n## Conventions\n\n| ID | Area | Convention | Evidence | Followed |\n|---|---|---|---|---|\n${rows}\n\n## Gaps\n\n| ID | Gap | Fix |\n|---|---|---|\n| G-01 | no gitleaks | add it |\n`;
  const exists = (p) => ['src/errors.ts', 'src/app.ts', 'src/routes/'].includes(p);
  const issues = (text) => checkDocument(text, { type: 'analysis', exists }).issues.map((i) => i.issue);

  test('conventions cite existing files and say consistent or mixed', () => {
    assert.deepEqual(issues(doc('| C-01 | errors | handlers throw HttpError | `src/errors.ts`, `src/app.ts:12` | consistent |')), []);
  });

  test('missing evidence, invented files, no verdict, no gaps section', () => {
    assert.deepEqual(issues(doc('| C-01 | errors | throw HttpError | the route files | consistent |\n| C-02 | naming | kebab-case files | `src/utils/strings.ts` | mostly |')), [
      'C-01 cites no file — name at least one file that shows it',
      "C-02 doesn't say whether the code follows it consistently or mixed",
      'C-02 cites `src/utils/strings.ts`, which doesn\'t exist',
    ]);
    assert.ok(issues('# Analysis\n').includes('no conventions (| C-01 | … rows)'));
    assert.ok(issues('# Analysis\n').includes('no Gaps section'));
  });

  test('commands and globs in backticks are not cited files', () => {
    assert.deepEqual(citedPaths('`pnpm test` `src/**/*.ts` `src/app.ts` `v4.2` `https://x.dev/a.md`'), ['src/**/*.ts', 'src/app.ts']);
    // Code isn't a file: found in the first real /adopt run (esn-fm), where `req.body` failed the check.
    assert.deepEqual(citedPaths('`req.body` `err.message` `index.ts` `.nvmrc` `package.json` `backend/src/` `res.status(500)`'), ['index.ts', '.nvmrc', 'package.json', 'backend/src/']);
  });
});

describe('retroactive ADR', () => {
  const exists = (p) => ['prisma/schema.prisma', 'package.json'].includes(p);
  const issues = (text) => checkDocument(text, { type: 'adr-retro', exists }).issues.map((i) => i.issue);
  const adr = (evidence, alternatives = 'Not recorded — the decision predates this record.') =>
    `---\nstatus: proposed\ndate: 2026-11-18\ndecision-makers: unknown — recorded from the code\n---\n\n# 0002. Use PostgreSQL through Prisma\n\n## Context\n\nRecorded retroactively by KeelWright from the code on 2026-11-18.\n\n## Decision\n\nPrisma 5 with PostgreSQL.\n\nEvidence:\n${evidence}\n\n## Alternatives\n\n${alternatives}\n`;

  test('a recorded decision with existing evidence passes', () => {
    assert.deepEqual(issues(adr('- `prisma/schema.prisma` — the datasource\n- `package.json` — `@prisma/client` 5.22.0')), []);
  });

  test('no evidence, missing files, no retroactive note, no alternatives section', () => {
    assert.deepEqual(issues(adr('- the schema')), ['cites no file — the Decision section names the files that show it']);
    assert.deepEqual(issues(adr('- `db/schema.sql`')), ['cites `db/schema.sql`, which doesn\'t exist']);
    const bare = '# 0002. Use Prisma\n\n## Decision\n\n`package.json`\n';
    assert.deepEqual(issues(bare), [
      'doesn\'t say it was "Recorded retroactively by KeelWright from the code"',
      'no Alternatives section (say "Not recorded" when none are known)',
    ]);
  });

  test('an unfilled template fails', () => {
    const template = readFileSync(new URL('../templates/adr-retroactive.md', import.meta.url), 'utf8');
    assert.ok(checkDocument(template, { type: 'adr-retro', exists }).issues.length > 0);
  });
});
