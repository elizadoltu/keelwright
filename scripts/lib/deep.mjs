// The security audit's judgement review (`/keelwright:doctor security --deep`, spec 7.7). Costs
// money, so it always runs under a hard limit. The codebase is split into areas, sensitive ones
// first (the threat model's sensitive paths and entry points); each area is reviewed by a
// headless, read-only Claude call acting as the project's `security-reviewer` — or the plugin's
// `security-auditor` when the project has none — and every finding goes to a second,
// independent call that tries to disprove it. Findings it disproves, and findings whose cited
// code doesn't exist, are dropped. The result goes to .keelwright/security/deep.json (git-ignored);
// the mechanical audit (security.mjs) carries its findings from then on.
//
// Every model call goes through `invoke` ({ prompt, system, schema, maxBudgetUsd } → { result,
// structured_output, total_cost_usd, is_error }), so tests use a fake and spend nothing.

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { CODE_FILE, listFiles } from './analyse.mjs';
import { FRAMEWORK_EDITIONS } from './doccheck.mjs';
import { DEEP_FILE, RECORD_DIR, SEVERITIES, THREAT_MODEL } from './security.mjs';

export { DEEP_FILE };
export const MAX_AREAS = 15;
export const MAX_FILES_PER_AREA = 60;
export const MAX_FINDINGS_PER_AREA = 8;
export const PROJECT_AGENT = '.claude/agents/security-reviewer.md';
// Read-only: reading and searching the code, and read-only git. No writes, no network.
export const TOOLS = ['Read', 'Grep', 'Glob', 'Bash(git log:*)', 'Bash(git show:*)', 'Bash(ls:*)'];
export const DISALLOWED_TOOLS = ['Write', 'Edit', 'MultiEdit', 'NotebookEdit', 'WebFetch', 'WebSearch'];
// Folders that hold the code itself: an area is one level below them (`src/routes`, `apps/web`).
const CONTAINERS = new Set(['src', 'app', 'apps', 'lib', 'packages', 'services', 'server', 'api', 'backend', 'frontend', 'supabase', 'functions']);
const NOT_REVIEWED = /(^|\/)(__tests__|tests?|spec|e2e|fixtures?|mocks?|__mocks__|examples?|docs|scripts\/dev|migrations\/seed)\/|\.(test|spec|stories|d)\.[cm]?[jt]sx?$|(^|\/)test_[^/]+\.py$|_test\.(py|go|dart)$|\.min\.js$/;

const read = (root, f) => {
  try {
    return readFileSync(join(root, f), 'utf8');
  } catch {
    return null;
  }
};

// --- the threat model's brief ---------------------------------------------------------------------

export function threatBrief(root) {
  const text = read(root, THREAT_MODEL);
  if (!text) return null;
  const framework = /^framework:\s*["']?(.+?)["']?\s*$/m.exec(text)?.[1] ?? null;
  const section = (title) => new RegExp(`^## ${title}[^\\n]*\\n([\\s\\S]*?)(?=^## |$(?![\\s\\S]))`, 'm').exec(text)?.[1] ?? '';
  const ticks = (s) => [...s.matchAll(/`([^`]+)`/g)].map((m) => m[1].trim());
  return {
    framework,
    sensitive: ticks(section('Sensitive paths')),
    entryPoints: ticks(section('Trust boundaries')),
    risks: [...text.matchAll(/^\|\s*(SEC-\d{2})\s*\|\s*([^|]+)\|/gm)].map((m) => `${m[1]} ${m[2].trim()}`),
  };
}

const globRe = (g) => new RegExp(`^${g.replace(/^\.\//, '').replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*\*\/?/g, '§').replace(/\*/g, '[^/]*').replace(/§/g, '.*')}`);

// --- areas ---------------------------------------------------------------------------------------

// The code split into areas of at most MAX_FILES_PER_AREA files, sensitive ones first in the threat
// model's order, then the largest. Beyond MAX_AREAS the rest is listed as not reviewed.
export function areas(root, { maxAreas = MAX_AREAS, files = listFiles(root).files, brief = threatBrief(root) } = {}) {
  const code = files.filter((f) => CODE_FILE.test(f) && !NOT_REVIEWED.test(f) && !f.startsWith('.keelwright/'));
  const keyOf = (f, depth) => {
    const p = f.split('/');
    if (p.length === 1) return '(root)';
    let n = CONTAINERS.has(p[0]) ? 2 : 1;
    n += depth;
    return p.slice(0, Math.min(n, p.length - 1)).join('/');
  };
  const split = (list, depth) => {
    const groups = new Map();
    for (const f of list) {
      const k = keyOf(f, depth);
      groups.set(k, [...(groups.get(k) ?? []), f]);
    }
    return [...groups.entries()].flatMap(([k, fs]) => {
      if (fs.length <= MAX_FILES_PER_AREA) return [{ name: k, files: fs }];
      const deeper = split(fs, depth + 1);
      if (deeper.length > 1) return deeper;
      // One folder too big to split: chunks of it.
      return Array.from({ length: Math.ceil(fs.length / MAX_FILES_PER_AREA) }, (_, i) => ({ name: `${k} (${i + 1})`, files: fs.slice(i * MAX_FILES_PER_AREA, (i + 1) * MAX_FILES_PER_AREA) }));
    });
  };
  const all = split(code, 0);
  const patterns = [...(brief?.sensitive ?? []), ...(brief?.entryPoints ?? []).filter((e) => /[/.]/.test(e) && !/\s/.test(e))].map(globRe);
  const rank = (a) => {
    const i = patterns.findIndex((re) => a.files.some((f) => re.test(f)));
    return i === -1 ? Infinity : i;
  };
  for (const a of all) a.sensitive = rank(a) !== Infinity;
  all.sort((a, b) => rank(a) - rank(b) || b.files.length - a.files.length || a.name.localeCompare(b.name));
  return { review: all.slice(0, maxAreas), skipped: all.slice(maxAreas).map((a) => ({ name: a.name, files: a.files.length })) };
}

// --- prompts and schemas -------------------------------------------------------------------------

export const FINDINGS_SCHEMA = {
  type: 'object',
  properties: {
    findings: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          file: { type: 'string' },
          line: { type: 'integer' },
          category: { type: 'string', description: 'framework category (e.g. A01) or SEC- ID' },
          severity: { type: 'string', enum: SEVERITIES },
          title: { type: 'string' },
          evidence: { type: 'string', description: 'which input, through which code, reaches what' },
          fix: { type: 'string' },
        },
        required: ['file', 'line', 'category', 'severity', 'title', 'evidence', 'fix'],
      },
    },
  },
  required: ['findings'],
};

export const VERDICT_SCHEMA = {
  type: 'object',
  properties: {
    verdicts: {
      type: 'array',
      items: {
        type: 'object',
        properties: { index: { type: 'integer' }, holds: { type: 'boolean' }, reason: { type: 'string' }, severity: { type: 'string', enum: SEVERITIES } },
        required: ['index', 'holds', 'reason'],
      },
    },
  },
  required: ['verdicts'],
};

// The reviewer's instructions: the project's own security-reviewer when it has one, else the
// plugin's security-auditor. Front matter and template comments removed.
export function reviewer(root, pluginRoot) {
  const own = read(root, PROJECT_AGENT);
  const file = own ? PROJECT_AGENT : 'agents/security-auditor.md (KeelWright)';
  const text = own ?? read(pluginRoot, 'agents/security-auditor.md') ?? '';
  return { agent: own ? 'security-reviewer' : 'security-auditor', file, system: text.replace(/^---\n[\s\S]*?\n---\n/, '').replace(/<!--[\s\S]*?-->/g, '').trim() };
}

export function reviewPrompt(area, { brief, framework }) {
  const L = [
    `Security review of one area of this codebase: **${area.name}** (${area.files.length} files). Read-only: don't change any file.`,
    '',
    `Framework: ${framework}.${brief ? ` Threat model: ${THREAT_MODEL} — read it first; its roles, entry points and SEC- risks are your brief.` : ' The project has no threat model: infer the roles and entry points from the code.'}`,
  ];
  if (brief?.risks.length) L.push('', 'Risks it records:', ...brief.risks.slice(0, 30).map((r) => `- ${r}`));
  L.push('', 'The files of this area (read the ones that handle input, data access, auth, secrets or model calls; follow calls into other areas only as far as you need to trace a path):', ...area.files.map((f) => `- ${f}`));
  L.push('', `Report at most ${MAX_FINDINGS_PER_AREA} findings, most severe first, only ones whose attack path you traced. \`file\` is the path from the project root and \`line\` the line where the fix belongs. An empty list is a good answer.`);
  return L.join('\n');
}

export function disprovePrompt(area, findings) {
  return [
    `Another reviewer reported these security findings in **${area.name}**. Try to disprove each one: read the cited code, its callers, middleware, policies and validation. A finding holds only if you can follow the whole attack path yourself. Read-only: don't change any file.`,
    '',
    ...findings.map((f, i) => `${i}. [${f.severity}] ${f.category} — ${f.title}\n   ${f.file}:${f.line}\n   Evidence: ${f.evidence}`),
    '',
    'Give one verdict per finding, by its index. You may lower (never raise) the severity of a finding that holds.',
  ].join('\n');
}

// --- results -------------------------------------------------------------------------------------

export function parseOutput(r) {
  if (r?.structured_output && typeof r.structured_output === 'object') return r.structured_output;
  const text = String(r?.result ?? '');
  const m = /```(?:json)?\s*([\s\S]*?)```/.exec(text) ?? /(\{[\s\S]*\})/.exec(text);
  try {
    return JSON.parse(m ? m[1] : text);
  } catch {
    return null;
  }
}

// A finding cites code that exists: the file is there and has the line.
export function citesRealCode(root, f) {
  const file = String(f.file ?? '').replace(/^\.\//, '');
  if (!file || file.includes('..')) return false;
  const text = read(root, file);
  if (text === null) return false;
  return Number.isInteger(f.line) && f.line >= 1 && f.line <= text.split('\n').length;
}

export function fingerprint(f) {
  const h = createHash('sha256').update(String(f.title).toLowerCase().replace(/\s+/g, ' ').trim()).digest('hex').slice(0, 8);
  return `deep:${f.category.split(/\s/)[0]}:${f.file}:${h}`;
}

// --- the run -------------------------------------------------------------------------------------

export async function run(root, { pluginRoot, maxCost, invoke, now = new Date().toISOString(), maxAreas = MAX_AREAS, only = null, log = () => {} }) {
  if (!(maxCost > 0)) throw new Error('--max-cost is required: the deep review costs money');
  const brief = threatBrief(root);
  const framework = brief?.framework && FRAMEWORK_EDITIONS.includes(brief.framework) ? brief.framework : (brief?.framework ?? 'OWASP Top 10 (2025) — or the edition in reference/security.md that fits the project type');
  const who = reviewer(root, pluginRoot);
  const plan = areas(root, { maxAreas, brief });
  const review = only ? plan.review.filter((a) => a.name === only || a.name.startsWith(`${only}/`)) : plan.review;
  let spent = 0;
  const outAreas = [];
  const findings = [];
  const dropped = [];
  const call = async (prompt, schema) => {
    const r = await invoke({ prompt, system: who.system, schema, maxBudgetUsd: Math.max(0.01, maxCost - spent) });
    spent += r.total_cost_usd ?? 0;
    return r;
  };
  for (const area of review) {
    if (spent >= maxCost) {
      outAreas.push({ name: area.name, files: area.files.length, status: 'not-reviewed', reason: 'cost limit reached' });
      continue;
    }
    log(`reviewing ${area.name} (${area.files.length} files)…`);
    const before = spent;
    const r = await call(reviewPrompt(area, { brief, framework }), FINDINGS_SCHEMA);
    const out = parseOutput(r);
    if (r.is_error || !out || !Array.isArray(out.findings)) {
      outAreas.push({ name: area.name, files: area.files.length, status: 'failed', reason: String(r.result ?? 'no structured output').slice(0, 200), cost: spent - before });
      continue;
    }
    const candidates = [];
    for (const f of out.findings.slice(0, MAX_FINDINGS_PER_AREA)) {
      const clean = { ...f, file: String(f.file).replace(/^\.\//, ''), severity: SEVERITIES.includes(f.severity) ? f.severity : 'medium' };
      if (!citesRealCode(root, clean)) dropped.push({ ...clean, area: area.name, reason: 'the cited code does not exist' });
      else candidates.push(clean);
    }
    if (candidates.length) {
      if (spent >= maxCost) {
        // Unverified findings are not reported: the second pass is what makes them worth acting on.
        dropped.push(...candidates.map((f) => ({ ...f, area: area.name, reason: 'not verified: cost limit reached' })));
      } else {
        log(`  checking ${candidates.length} finding${candidates.length > 1 ? 's' : ''}…`);
        const v = parseOutput(await call(disprovePrompt(area, candidates), VERDICT_SCHEMA));
        candidates.forEach((f, i) => {
          const verdict = v?.verdicts?.find((x) => x.index === i);
          if (!verdict) return dropped.push({ ...f, area: area.name, reason: 'not verified: no verdict' });
          if (!verdict.holds) return dropped.push({ ...f, area: area.name, reason: `disproved: ${verdict.reason}` });
          const severity = verdict.severity && SEVERITIES.indexOf(verdict.severity) > SEVERITIES.indexOf(f.severity) ? verdict.severity : f.severity;
          findings.push({ ...f, severity, area: area.name, verified: verdict.reason });
        });
      }
    }
    outAreas.push({ name: area.name, files: area.files.length, status: 'reviewed', cost: spent - before });
  }
  return {
    at: now,
    reviewer: who.agent,
    framework,
    maxCost,
    cost: Math.round(spent * 10_000) / 10_000,
    areas: [...outAreas, ...plan.skipped.map((s) => ({ ...s, status: 'not-reviewed', reason: `beyond the first ${maxAreas} areas` }))],
    findings: findings.map((f) => ({ ...f, fingerprint: fingerprint(f) })),
    dropped,
  };
}

export function save(root, result) {
  mkdirSync(join(root, RECORD_DIR), { recursive: true });
  if (!existsSync(join(root, RECORD_DIR, '.gitignore'))) writeFileSync(join(root, RECORD_DIR, '.gitignore'), '*\n');
  writeFileSync(join(root, DEEP_FILE), `${JSON.stringify(result, null, 2)}\n`);
}
