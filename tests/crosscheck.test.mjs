import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, describe, test } from 'node:test';
import { checkTokens, checkWorkspace, contrast, crossCheck, flattenTokens } from '../scripts/lib/crosscheck.mjs';

const srgb = (hex) => ({
  colorSpace: 'srgb',
  components: [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255),
  hex,
});

describe('design tokens', () => {
  const tokens = (colors, extra = {}) =>
    JSON.stringify({
      color: { $type: 'color', light: colors },
      space: { $type: 'dimension', md: { $value: { value: 16, unit: 'px' } } },
      ...extra,
    });

  test('a valid file with AA contrast passes', () => {
    const json = tokens({
      surface: { $value: srgb('#ffffff') },
      text: { $value: srgb('#1a1a1a') },
      primary: { $value: srgb('#1d4ed8') },
      'primary-foreground': { $value: '{color.light.surface}' },
    });
    assert.deepEqual(checkTokens(json), []);
  });

  test('low contrast, broken references and invalid values are reported', () => {
    const json = tokens(
      {
        surface: { $value: srgb('#ffffff') },
        text: { $value: srgb('#aaaaaa') },
        accent: { $value: '{color.light.missing}' },
      },
      { motion: { fast: { $type: 'duration', $value: 200 } }, loose: { $value: 3 } },
    );
    const issues = checkTokens(json).map((i) => i.issue);
    assert.ok(issues.some((i) => /text on surface has contrast 2\.32:1/.test(i)), issues.join('\n'));
    assert.ok(issues.includes("color.light.accent: reference {color.light.missing} doesn't resolve"));
    assert.ok(issues.includes('motion.fast: invalid duration value 200'));
    assert.ok(issues.includes('loose: no $type (on the token or a parent group)'));
  });

  test('types are inherited from groups', () => {
    const flat = flattenTokens({ color: { $type: 'color', brand: { a: { $value: 1 } } } });
    assert.deepEqual(flat, { 'color.brand.a': { $type: 'color', $value: 1 } });
  });

  test('contrast ratio matches WCAG examples', () => {
    assert.equal(contrast(srgb('#000000'), srgb('#ffffff')), 21);
    assert.equal(contrast(srgb('#777777'), srgb('#ffffff')), 4.48);
  });

  test('invalid JSON is reported', () => {
    assert.match(checkTokens('{oops')[0].issue, /not valid JSON/);
  });
});

describe('cross-document check', () => {
  const roots = [];
  after(() => roots.forEach((r) => rmSync(r, { recursive: true, force: true })));
  const project = (files) => {
    const root = mkdtempSync(join(tmpdir(), 'keelwright-refs-'));
    roots.push(root);
    for (const [f, c] of Object.entries(files)) {
      mkdirSync(join(root, f, '..'), { recursive: true });
      writeFileSync(join(root, f), c);
    }
    return root;
  };

  test('defined IDs and working links pass; unknown IDs and broken links fail', () => {
    const root = project({
      'docs/prd.md': '### US-1 [P1] Contact\n\n| ID | Req |\n|---|---|\n| FR-001 | Send. US-1 |\n\nSee [ADR](decisions/0002-astro.md).',
      'docs/decisions/0002-astro.md': '# 0002. Use Astro\n\nDrivers: FR-001.',
      'docs/features.md': '| F-01 | Contact form | US-1 |\n\nAlso US-7 and ADR-0003. [Gone](missing.md) [web](https://x.dev) [anchor](#top)\n\n[NEEDS CLARIFICATION: US-9?]',
    });
    const r = crossCheck(root, ['docs']);
    assert.equal(r.files, 3);
    assert.deepEqual(r.issues.map((i) => i.issue), [
      'docs/features.md:3: US-7 is referenced but not defined in any document',
      'docs/features.md:3: ADR-0003 is referenced but not defined in any document',
      'docs/features.md:3: broken link missing.md',
    ]);
  });
});

describe('Structurizr workspace', () => {
  test('the shipped template passes', () => {
    const dsl = readFileSync(new URL('../templates/c4-workspace.dsl', import.meta.url), 'utf8');
    assert.deepEqual(checkWorkspace(dsl), []);
  });

  test('missing views and unbalanced braces are reported', () => {
    const issues = checkWorkspace('workspace "x" {\n model {\n  a = softwareSystem "A" {\n }\n}').map((i) => i.issue);
    assert.deepEqual(issues, ['unbalanced braces', 'no views block', 'no systemContext view', 'no containers defined', 'no container view']);
  });

  test('braces inside strings and comments are ignored', () => {
    const dsl = 'workspace "a { b" {\n // }\n model { s = softwareSystem "S" { w = container "W" } }\n views { systemContext s { include * }\n container s { include * } }\n}';
    assert.deepEqual(checkWorkspace(dsl), []);
  });
});

describe('doccheck CLI', () => {
  test('recognises every check type, including c4', async () => {
    const { execFileSync } = await import('node:child_process');
    const cliPath = new URL('../scripts/doccheck.mjs', import.meta.url).pathname;
    const dsl = new URL('../templates/c4-workspace.dsl', import.meta.url).pathname;
    const out = execFileSync('node', [cliPath, `c4:${dsl}`], { encoding: 'utf8' });
    assert.match(out, /^ok {3}c4:/);
    let failed;
    try {
      execFileSync('node', [cliPath, 'nope:x.md'], { encoding: 'utf8' });
    } catch (err) {
      failed = err.stdout;
    }
    assert.match(failed, /unknown check type "nope"/);
  });
});
