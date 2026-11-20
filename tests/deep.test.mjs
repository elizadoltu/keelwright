import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { after, describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import * as D from '../scripts/lib/deep.mjs';
import * as Sec from '../scripts/lib/security.mjs';

const PLUGIN = join(dirname(fileURLToPath(import.meta.url)), '..');
const roots = [];
after(() => roots.forEach((r) => rmSync(r, { recursive: true, force: true })));
const write = (root, f, text) => {
  mkdirSync(join(root, f, '..'), { recursive: true });
  writeFileSync(join(root, f), text);
};
function project(files) {
  const root = mkdtempSync(join(tmpdir(), 'keelwright-deep-'));
  roots.push(root);
  for (const [f, text] of Object.entries(files)) write(root, f, text);
  return root;
}

const THREAT = `---
status: approved
framework: OWASP Top 10 (2025)
---

# Threat model: Shop

## Trust boundaries and entry points

| Entry point | Boundary | Input from | Notes |
|---|---|---|---|
| \`POST /api/orders\` | browser → server | anyone | |

## Risks

| ID | Risk | Category | Where | Mitigation | Enforced by | Status |
|---|---|---|---|---|---|---|
| SEC-01 | a user reads another user's orders | A01 | \`src/api/orders.ts\` | owner check | review | planned |

## Sensitive paths

- \`src/api/**\`
- \`supabase/migrations/**\`
`;

const SHOP = {
  'docs/security/threat-model.md': THREAT,
  'src/api/orders.ts': 'export async function get(req) {\n  const id = req.query.id;\n  return db.query(`select * from orders where id = ${id}`);\n}\n',
  'src/api/orders.test.ts': 'test()',
  'src/components/Button.tsx': 'export const Button = () => null;\n',
  'src/components/Card.tsx': 'export const Card = () => null;\n',
  'supabase/migrations/001.sql': 'create table orders (id int);\n',
};

describe('deep review: areas', () => {
  test('sensitive areas first, in the threat model’s order; tests are not reviewed', () => {
    const root = project(SHOP);
    const { review } = D.areas(root);
    assert.deepEqual(review.map((a) => [a.name, a.sensitive]), [['src/api', true], ['supabase/migrations', true], ['src/components', false]]);
    assert.deepEqual(review[0].files, ['src/api/orders.ts']);
  });

  test('big folders are split; beyond the limit, areas are listed as not reviewed', () => {
    const files = Object.fromEntries(Array.from({ length: D.MAX_FILES_PER_AREA + 5 }, (_, i) => [`src/ui/${i < 40 ? 'forms' : 'tables'}/c${i}.tsx`, 'x']));
    const root = project({ ...files, 'lib/a.ts': 'x', 'cli/b.ts': 'x' });
    const { review, skipped } = D.areas(root, { maxAreas: 2 });
    assert.deepEqual(review.map((a) => a.name), ['src/ui/forms', 'src/ui/tables']);
    assert.deepEqual(skipped.map((s) => s.name).sort(), ['cli', 'lib']);
  });

  test('the threat model’s brief, and the project’s own reviewer before the plugin’s', () => {
    const root = project(SHOP);
    const b = D.threatBrief(root);
    assert.equal(b.framework, 'OWASP Top 10 (2025)');
    assert.deepEqual(b.sensitive, ['src/api/**', 'supabase/migrations/**']);
    assert.deepEqual(b.risks, ["SEC-01 a user reads another user's orders"]);
    assert.equal(D.reviewer(root, PLUGIN).agent, 'security-auditor');
    assert.match(D.reviewer(root, PLUGIN).system, /When asked to disprove/);
    write(root, D.PROJECT_AGENT, '---\nname: security-reviewer\n---\n<!-- template -->\nYou review the Shop.');
    assert.deepEqual([D.reviewer(root, PLUGIN).agent, D.reviewer(root, PLUGIN).system], ['security-reviewer', 'You review the Shop.']);
  });
});

// A fake model: the review reports what `review` says for the area; the second pass judges by `holds`.
function fake({ review = {}, holds = () => ({ holds: true, reason: 'traced' }), cost = 0.1 } = {}) {
  const calls = [];
  const invoke = async ({ prompt, schema, maxBudgetUsd }) => {
    calls.push({ prompt, maxBudgetUsd, kind: schema === D.VERDICT_SCHEMA ? 'disprove' : 'review' });
    if (schema === D.FINDINGS_SCHEMA) {
      const area = /\*\*(.+?)\*\*/.exec(prompt)[1];
      return { structured_output: { findings: review[area] ?? [] }, total_cost_usd: cost };
    }
    const titles = [...prompt.matchAll(/^\d+\. \[\w+\] .+? — (.+)$/gm)].map((m) => m[1]);
    return { result: `\`\`\`json\n${JSON.stringify({ verdicts: titles.map((t, index) => ({ index, ...holds(t) })) })}\n\`\`\``, total_cost_usd: cost };
  };
  return { invoke, calls };
}

const SQLI = { file: 'src/api/orders.ts', line: 3, category: 'A05', severity: 'critical', title: 'SQL injection in orders lookup', evidence: 'req.query.id is interpolated into the SQL', fix: 'use a parameterised query' };

describe('deep review: the run', () => {
  test('findings that are disproved, or cite code that doesn’t exist, are dropped', async () => {
    const root = project(SHOP);
    const { invoke, calls } = fake({
      review: {
        'src/api': [SQLI, { ...SQLI, title: 'IDOR on orders', category: 'SEC-01', severity: 'high' }, { ...SQLI, line: 99, title: 'phantom line' }, { ...SQLI, file: 'src/api/nope.ts', title: 'phantom file' }],
      },
      holds: (t) => (t.startsWith('IDOR') ? { holds: false, reason: 'RLS on orders limits rows to the owner' } : { holds: true, reason: 'traced', severity: 'high' }),
    });
    const r = await D.run(root, { pluginRoot: PLUGIN, maxCost: 5, invoke });
    assert.deepEqual(r.findings.map((f) => [f.title, f.severity]), [['SQL injection in orders lookup', 'high']]);
    assert.match(r.findings[0].fingerprint, /^deep:A05:src\/api\/orders\.ts:[0-9a-f]{8}$/);
    assert.deepEqual(r.dropped.map((d) => d.reason.split(':')[0]).sort(), ['disproved', 'the cited code does not exist', 'the cited code does not exist']);
    assert.equal(calls.filter((c) => c.kind === 'disprove').length, 1, 'one disproving call per area with findings');
    assert.equal(r.areas.filter((a) => a.status === 'reviewed').length, 3);
    assert.equal(r.framework, 'OWASP Top 10 (2025)');
    assert.match(calls[0].prompt, /SEC-01 a user reads/);
  });

  test('the cost limit is hard: unverified findings are not reported, unreached areas are listed', async () => {
    const root = project(SHOP);
    const { invoke, calls } = fake({ review: { 'src/api': [SQLI], 'supabase/migrations': [{ ...SQLI, file: 'supabase/migrations/001.sql', line: 1, title: 'no RLS' }] }, cost: 1 });
    const r = await D.run(root, { pluginRoot: PLUGIN, maxCost: 2.5, invoke });
    assert.deepEqual(r.findings.map((f) => f.title), ['SQL injection in orders lookup']);
    assert.equal(r.dropped[0].reason, 'not verified: cost limit reached');
    assert.deepEqual(r.areas.map((a) => a.status), ['reviewed', 'reviewed', 'not-reviewed']);
    assert.deepEqual(calls.map((c) => c.maxBudgetUsd), [2.5, 1.5, 0.5], 'each call may spend only what is left');
    await assert.rejects(D.run(root, { pluginRoot: PLUGIN, invoke }), /--max-cost is required/);
  });

  test('a call that fails marks its area failed and the run goes on', async () => {
    const root = project(SHOP);
    const invoke = async ({ prompt }) => (prompt.includes('**src/api**') ? { is_error: true, result: 'budget exceeded', total_cost_usd: 0.2 } : { structured_output: { findings: [] }, total_cost_usd: 0.1 });
    const r = await D.run(root, { pluginRoot: PLUGIN, maxCost: 5, invoke });
    assert.deepEqual(r.areas.map((a) => a.status), ['failed', 'reviewed', 'reviewed']);
  });

  test('the doctor’s audit carries the findings until the code they cite is gone', async () => {
    const root = project(SHOP);
    execFileSync('git', ['init', '-q'], { cwd: root });
    const r = await D.run(root, { pluginRoot: PLUGIN, maxCost: 5, invoke: fake({ review: { 'src/api': [SQLI] } }).invoke });
    D.save(root, r);
    const noTools = () => {
      const e = new Error('not installed');
      e.code = 'ENOENT';
      throw e;
    };
    const a = await Sec.audit(root, { offline: true, exec: noTools });
    const deep = a.findings.filter((f) => f.check === 'deep');
    assert.equal(deep.length, 1);
    assert.match(deep[0].issue, /^A05: SQL injection in orders lookup — src\/api\/orders\.ts:3 \(deep review \d{4}-\d{2}-\d{2}\)$/);
    assert.equal(Sec.areaStatus(a), 'fail');
    unlinkSync(join(root, 'src/api/orders.ts'));
    assert.equal((await Sec.audit(root, { offline: true, exec: noTools })).findings.filter((f) => f.check === 'deep').length, 0);
    assert.equal(Sec.checkDeep(project({})).status, 'skipped');
  });
});

describe('deep review: findings from the first real run', () => {
  test('the same problem reported from two areas is one finding', async () => {
    const root = project({ ...SHOP, 'src/server.js': 'import "./api/orders.ts";\n' });
    const sqli = (title) => ({ ...SQLI, category: 'A05:2025 Injection', title });
    const { invoke } = fake({ review: { 'src/api': [sqli('SQL injection in orders lookup')], src: [{ ...sqli('SQL injection via the id parameter'), line: 4 }] } });
    const r = await D.run(root, { pluginRoot: PLUGIN, maxCost: 5, invoke });
    assert.equal(r.findings.length, 1);
    assert.match(r.dropped.find((d) => /duplicate/.test(d.reason)).reason, /duplicate of a finding in src\/api/);
    assert.match(r.findings[0].fingerprint, /^deep:A05:/);
  });

  test('the prompt keeps each area to its own files and leaves the mechanical checks’ findings out', () => {
    const p = D.reviewPrompt({ name: 'src/api', files: ['src/api/orders.ts'] }, { brief: null, framework: 'OWASP Top 10 (2025)' });
    assert.match(p, /fix belongs in \*\*this area's files\*\*/);
    assert.match(p, /secrets in the git history \(gitleaks\)/);
  });
});
