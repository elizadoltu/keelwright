import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, test } from 'node:test';
import { checkDocument, placeholders, wordCount } from '../scripts/lib/doccheck.mjs';

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
