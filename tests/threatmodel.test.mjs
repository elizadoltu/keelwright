import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { after, describe, test } from 'node:test';
import { crossCheck } from '../scripts/lib/crosscheck.mjs';
import { FRAMEWORK_EDITIONS, checkDocument } from '../scripts/lib/doccheck.mjs';
import { checkGenerated } from '../scripts/lib/generatecheck.mjs';
import { CONDITIONAL_DOCUMENTS } from '../scripts/lib/pipeline.mjs';
import { checkThreatModel } from '../scripts/lib/security.mjs';

const PLUGIN = join(import.meta.dirname, '..');
const dirs = [];
after(() => dirs.forEach((d) => rmSync(d, { recursive: true, force: true })));

function project(files) {
  const root = mkdtempSync(join(tmpdir(), 'keelwright-tm-'));
  dirs.push(root);
  for (const [f, c] of Object.entries(files)) {
    if (c === null) continue;
    mkdirSync(dirname(join(root, f)), { recursive: true });
    writeFileSync(join(root, f), c);
  }
  return root;
}

const TM = (rows, { framework = 'OWASP Top 10 (2025)', sensitive = '- `supabase/migrations/**`\n- `src/routes/api/**`' } = {}) => `---
status: draft
date: 2026-11-20
owner: Eliza
framework: ${framework}
---

# Threat model: Invoices

## Roles

| Role | Can | Cannot |
|---|---|---|
| freelancer | manage own invoices | read others' |

## Risks

| ID | Risk | Category | Where | Mitigation | Enforced by | Status |
|---|---|---|---|---|---|---|
${rows.join('\n')}

## Sensitive paths

${sensitive}
`;
const ROW_PLANNED = '| SEC-01 | a freelancer reads another\'s invoices | A01 | `invoices` table, `src/routes/api/invoices/` | RLS: owner only | RLS policy + test `tests/invoices.rls.test.ts` | planned |';

describe('threat model document', () => {
  const doc = (text, exists) => checkDocument(text, { type: 'threat-model', exists }).issues.map((i) => i.issue);

  test('a filled-in threat model passes; planned risks may cite code still to be built', () => {
    assert.deepEqual(doc(TM([ROW_PLANNED]), () => false), []);
  });

  test('framework edition, mitigation, enforcement, status and sensitive paths are required', () => {
    const bad = TM(['| SEC-01 | x | A01 | — | — | — | maybe |'], { framework: 'OWASP Top 10 (2021)', sensitive: 'auth stuff' });
    const got = doc(bad);
    assert.ok(got.some((i) => /framework "OWASP Top 10 \(2021\)" isn't one of/.test(i)), got.join('\n'));
    assert.ok(got.includes('SEC-01: status "maybe" isn\'t one of mitigated, planned, open, accepted, dropped'));
    assert.ok(got.includes('SEC-01 has no mitigation'));
    assert.ok(got.some((i) => /SEC-01 doesn't say how the mitigation is enforced/.test(i)));
    assert.ok(got.some((i) => /no sensitive paths/.test(i)));
  });

  test('a mitigated risk must cite files that exist (as built, /adopt)', () => {
    const row = ROW_PLANNED.replace('| planned |', '| mitigated |');
    assert.deepEqual(doc(TM([row]), (p) => p === 'src/routes/api/invoices/'), ['SEC-01 is mitigated but cites `tests/invoices.rls.test.ts`, which doesn\'t exist']);
  });

  test('SEC- IDs are cross-document IDs: a reference to an undefined one fails refs:docs', () => {
    const root = project({ 'docs/security/threat-model.md': TM([ROW_PLANNED]), 'docs/architecture/overview.md': '# Overview\n\nSee SEC-01 and SEC-07.\n' });
    const issues = crossCheck(root, ['docs']).issues.map((i) => i.issue);
    assert.ok(issues.some((i) => /SEC-07/.test(i)), issues.join('\n'));
    assert.ok(!issues.some((i) => /SEC-01/.test(i)));
  });

  test('the catalog, the template and reference/security.md agree', () => {
    assert.ok(CONDITIONAL_DOCUMENTS.includes('threat-model'));
    const catalog = readFileSync(join(PLUGIN, 'reference/catalog.md'), 'utf8');
    assert.match(catalog, /\| `threat-model` \|/);
    const reference = readFileSync(join(PLUGIN, 'reference/security.md'), 'utf8');
    for (const e of FRAMEWORK_EDITIONS) assert.ok(reference.includes(`| ${e} |`), `reference/security.md lists ${e}`);
    const spec = readFileSync(join(PLUGIN, 'keelwright-spec.md'), 'utf8');
    assert.match(spec, /\| `threat-model` \|/);
    readFileSync(join(PLUGIN, 'templates/threat-model.md'), 'utf8');
  });
});

describe('generated security reviewer', () => {
  const agent = (body, tools = 'Read, Grep, Glob, Bash\ndisallowedTools: Write, Edit, MultiEdit, NotebookEdit') => `---\nname: security-reviewer\ndescription: Reviews changes to Invoices for security against the threat model, when they touch sensitive paths.\ntools: ${tools}\n---\n\n${body}\n`;
  const base = (over = {}) => project({
    'docs/security/threat-model.md': TM([ROW_PLANNED]),
    'CLAUDE.md': '# Invoices\n\nAgents: reviewer, tester, docs-keeper, security-reviewer.\n',
    '.claude/agents/security-reviewer.md': agent('Framework: OWASP Top 10 (2025).\n\n- **SEC-01** owner-only invoices.'),
    '.claude/skills/security-review/SKILL.md': '---\nname: security-review\ndescription: Security review of a change against the threat model and OWASP Top 10 (2025).\n---\n',
    '.claude/rules/security.md': '---\npaths: ["supabase/migrations/**", "src/routes/api/**"]\n---\n\n- Every query on invoices goes through RLS (SEC-01).\n',
    ...over,
  });
  const sec = (root) => checkGenerated(root).map((i) => `${i.area}: ${i.issue}`).filter((i) => /security|SEC-/.test(i));

  test('a complete security setup passes', () => {
    assert.deepEqual(sec(base()), []);
  });

  test('no threat model: no security reviewer required', () => {
    assert.deepEqual(sec(base({ 'docs/security/threat-model.md': null, '.claude/agents/security-reviewer.md': null, '.claude/skills/security-review/SKILL.md': null, '.claude/rules/security.md': null })), []);
  });

  test('missing parts, a writing reviewer, the wrong edition and unknown SEC- IDs are flagged', () => {
    const root = base({
      '.claude/agents/security-reviewer.md': agent('Framework: OWASP API Security Top 10 (2023).\n\n- **SEC-01**, **SEC-09**.', 'Read, Edit, Bash'),
      '.claude/skills/security-review/SKILL.md': null,
      '.claude/rules/security.md': '- No paths here (SEC-01).\n',
      'CLAUDE.md': '# Invoices\n',
    });
    assert.deepEqual(sec(root), [
      'agents: security-reviewer.md: the security reviewer must be read-only but has Edit',
      'agents: security-reviewer.md: disallowedTools should include Write and Edit',
      'agents: security-reviewer.md names OWASP API Security Top 10 (2023), but the threat model\'s framework is OWASP Top 10 (2025)',
      'agents: security-reviewer.md cites SEC-09, which the threat model doesn\'t define',
      'skills: the project has a threat model but no security-review skill',
      'rules: .claude/rules/security.md has no paths — scope it to the threat model\'s sensitive paths',
      'claude-md: CLAUDE.md doesn\'t mention the security-reviewer agent',
    ]);
  });
});

describe('threat model vs code (doctor)', () => {
  test('a mitigated risk whose test is gone, and a table the threat model never mentions', () => {
    const row = ROW_PLANNED.replace('| planned |', '| mitigated |');
    const root = project({
      'docs/security/threat-model.md': TM([row]),
      'src/routes/api/invoices/index.ts': 'x',
      'supabase/migrations/001.sql': 'create table invoices (id int);\ncreate table payouts (id int);\n',
    });
    const r = checkThreatModel(root);
    assert.equal(r.risks, 1);
    assert.deepEqual(r.findings.map((f) => [f.severity, f.issue]), [
      ['medium', 'SEC-01 is marked mitigated, but `tests/invoices.rls.test.ts`, which it cites, no longer exists'],
      ['low', 'table payouts (supabase/migrations/001.sql) isn\'t in the threat model'],
    ]);
  });

  test('no threat model: skipped', () => {
    assert.equal(checkThreatModel(project({ 'x.md': 'x' })).status, 'skipped');
  });
});
