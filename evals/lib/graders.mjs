// Graders for one eval run (spec 8.3). Deterministic graders read the project folder the run
// produced; judges ask a model one pass / fail question each.

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { checkTokens, checkWorkspace, crossCheck } from '../../scripts/lib/crosscheck.mjs';
import { checkDocument } from '../../scripts/lib/doccheck.mjs';
import { next } from '../../scripts/lib/state.mjs';
import { isStable, pickNpmVersion } from '../../scripts/lib/versions.mjs';

const read = (dir, f) => (existsSync(join(dir, f)) ? readFileSync(join(dir, f), 'utf8') : null);
const result = (pass, detail = '') => ({ pass, detail });

export function loadRun(dir) {
  const stateText = read(dir, '.keelwright/state.json');
  const decisionsDir = join(dir, 'docs/decisions');
  const adrs = existsSync(decisionsDir) ? readdirSync(decisionsDir).filter((f) => /^\d{4}-.*\.md$/.test(f)).sort() : [];
  return { dir, state: stateText ? JSON.parse(stateText) : null, adrs };
}

// ---------------------------------------------------------------------------
// Deterministic graders: (run, expect) → { pass, detail } | null when not applicable
// ---------------------------------------------------------------------------

export const GRADERS = {
  'reached-gate': (run, expect, c) => {
    if (!run.state) return result(false, 'no state file');
    const n = next(run.state);
    const ok = n.action === 'review' && n.gate === c.stopAtGate;
    return result(ok, ok ? `waiting at gate ${c.stopAtGate}` : `next action: ${JSON.stringify(n)}`);
  },

  'project-type': (run, expect) => {
    if (!expect.projectType) return null;
    const got = run.state?.projectType;
    return result(got === expect.projectType, `got ${got}`);
  },

  frontend: (run, expect) => {
    if (!expect.frontend) return null;
    const f = run.state?.stack?.frontend ?? {};
    const choice = JSON.stringify(f.choice ?? '').toLowerCase();
    const okChoice = choice.includes(expect.frontend.choice.toLowerCase());
    const rule = Number(String(f.rule ?? '').match(/\d+/)?.[0]);
    const okRule = expect.frontend.rule === undefined || rule === expect.frontend.rule;
    return result(okChoice && okRule, `choice ${f.choice ?? '—'}, rule ${f.rule ?? '—'}`);
  },

  'documents-include': (run, expect) => {
    if (!expect.documents?.include) return null;
    const docs = run.state?.documents ?? [];
    const missing = expect.documents.include.filter((k) => !docs.includes(k));
    return result(!missing.length, missing.length ? `missing: ${missing.join(', ')}` : '');
  },

  'documents-exclude': (run, expect) => {
    if (!expect.documents?.exclude) return null;
    const docs = run.state?.documents ?? [];
    const extra = expect.documents.exclude.filter((k) => docs.includes(k));
    return result(!extra.length, extra.length ? `unexpected: ${extra.join(', ')}` : '');
  },

  'interview-asked': (run, expect) => {
    if (!expect.interviewQuestions) return null;
    // The step records the count in metrics.json; the interview record is the fallback (Q:, Q1:, …).
    const metrics = read(run.dir, '.keelwright/metrics.json');
    const counted = metrics ? JSON.parse(metrics).steps?.interview?.counters?.questions : undefined;
    const text = read(run.dir, '.keelwright/interview.md') ?? '';
    const asked = counted ?? (text.match(/\*\*Q\d*:\*\*/g) ?? []).length;
    return result(asked >= expect.interviewQuestions.min, `${asked} questions (${counted !== undefined ? 'metrics' : 'interview record'})`);
  },

  // Every generated document passes its doccheck, and IDs / links resolve across docs/.
  doccheck: (run) => {
    const checks = [
      ['docs/prd.md', 'prd'],
      ['docs/architecture/overview.md', 'overview'],
      ['docs/architecture/erd.md', 'erd'],
      ['docs/features.md', 'features'],
      ['docs/backlog.md', null],
      ['docs/design/visual-identity.md', 'visual-identity'],
      ...run.adrs.map((f) => [`docs/decisions/${f}`, 'adr']),
    ];
    const failures = [];
    for (const [file, type] of checks) {
      const text = read(run.dir, file);
      if (text === null) continue;
      const r = checkDocument(text, { type });
      if (!r.ok) failures.push(`${file}: ${r.issues.map((i) => i.issue).join('; ')}`);
    }
    const tokens = read(run.dir, 'design/tokens.json');
    if (tokens !== null) {
      const issues = checkTokens(tokens);
      if (issues.length) failures.push(`design/tokens.json: ${issues.map((i) => i.issue).join('; ')}`);
    }
    const dsl = read(run.dir, 'docs/architecture/c4/workspace.dsl');
    if (dsl !== null) {
      const issues = checkWorkspace(dsl);
      if (issues.length) failures.push(`workspace.dsl: ${issues.map((i) => i.issue).join('; ')}`);
    }
    if (existsSync(join(run.dir, 'docs'))) {
      const refs = crossCheck(run.dir, ['docs']);
      if (refs.issues.length) failures.push(`refs: ${refs.issues.map((i) => i.issue).join('; ')}`);
    }
    return result(!failures.length, failures.join('\n'));
  },

  // Documents the case expects to exist actually exist (the document set is acted on, not just listed).
  'documents-written': (run) => {
    const paths = {
      prd: 'docs/prd.md',
      'architecture-overview': 'docs/architecture/overview.md',
      c4: 'docs/architecture/c4/workspace.dsl',
      erd: 'docs/architecture/erd.md',
      'feature-breakdown': 'docs/features.md',
      'visual-identity': 'docs/design/visual-identity.md',
    };
    const reached = new Set(Object.entries(run.state?.steps ?? {}).filter(([, s]) => ['awaiting_review', 'approved', 'done'].includes(s.status)).map(([n]) => n));
    const owner = { prd: 'prd', 'architecture-overview': 'architecture', c4: 'architecture', erd: 'architecture', 'feature-breakdown': 'features', 'visual-identity': 'design' };
    const missing = (run.state?.documents ?? []).filter((k) => paths[k] && reached.has(owner[k]) && !existsSync(join(run.dir, paths[k])));
    return result(!missing.length, missing.length ? `listed but not written: ${missing.join(', ')}` : '');
  },

  // Each ADR after 0001 justifies itself with at least one requirement ID.
  'adr-traceability': (run) => {
    // ADR-0001 is fixed text; version hold-backs are justified by a peer range, not a requirement.
    const bare = run.adrs.filter((f) => !f.startsWith('0001-') && !/^\d{4}-hold-/.test(f)).filter((f) => !/\b(?:US-\d+|(?:FR|NFR|SC)-\d{3})\b/.test(read(run.dir, `docs/decisions/${f}`)));
    return result(run.adrs.length > 1 && !bare.length, bare.length ? `no requirement IDs: ${bare.join(', ')}` : `${run.adrs.length} ADRs`);
  },
};

// Versions: every npm version is a stable published release; anything older than the newest
// stable must be explained in an ADR. Needs network access.
export async function gradeVersions(run, fetchJson) {
  const versions = run.state?.stack?.versions ?? {};
  const names = Object.keys(versions);
  if (!names.length) return result(false, 'no versions recorded in state.stack.versions');
  const adrText = run.adrs.map((f) => read(run.dir, `docs/decisions/${f}`)).join('\n');
  const problems = [];
  for (const name of names) {
    const v = String(versions[name]).replace(/^v/, '');
    if (name === 'node' || /^node(\.js)?$/i.test(name)) {
      const index = await fetchJson('https://nodejs.org/dist/index.json');
      const lts = index.find((r) => r.lts)?.version.replace(/^v/, '');
      if (v !== lts && !new RegExp(`node`, 'i').test(adrText)) problems.push(`node ${v} is not the latest LTS (${lts})`);
      continue;
    }
    if (!/^(@[a-z0-9][\w.-]*\/)?[a-z0-9][\w.-]*$/i.test(name) || name === 'gitleaks') continue; // not an npm name
    if (!isStable(v)) {
      problems.push(`${name} ${v} is not a stable version`);
      continue;
    }
    let packument;
    try {
      const encoded = name.startsWith('@') ? `@${encodeURIComponent(name.slice(1))}` : encodeURIComponent(name);
      packument = await fetchJson(`https://registry.npmjs.org/${encoded}`, { Accept: 'application/vnd.npm.install-v1+json' });
    } catch {
      problems.push(`${name}: not found on npm`);
      continue;
    }
    if (!packument.versions?.[v]) {
      problems.push(`${name} ${v} doesn't exist on npm`);
      continue;
    }
    const newest = pickNpmVersion(packument);
    if (v !== newest && !adrText.includes(name)) problems.push(`${name} ${v} is older than ${newest} with no ADR explaining it`);
  }
  return result(!problems.length, problems.length ? problems.join('; ') : `${names.length} versions checked`);
}

// ---------------------------------------------------------------------------
// Judges: one model call each, answering with {"pass": bool, "reason": "…"}
// ---------------------------------------------------------------------------

export const JUDGES = {
  'invented-facts': (run, c) => {
    const prd = read(run.dir, 'docs/prd.md');
    if (!prd) return null;
    return {
      question:
        'Does the PRD state any fact about the product, its users, content, constraints or the owner\'s preferences that is NOT supported by the input or the interview? ' +
        'Allowed without support: technology and architecture choices, measurable targets presented as proposals or industry defaults, items marked [NEEDS CLARIFICATION], entries in the assumptions and risks table (they are labelled as possibilities, not facts), and reasonable restatements. ' +
        'PASS when nothing is invented; FAIL when at least one user-specific fact is made up. Name the invented fact in the reason.',
      materials: { 'Input (project description)': c.input, 'Interview record': read(run.dir, '.keelwright/interview.md') ?? '(none)', 'Answers the user gave': c.answers.join('\n\n'), 'PRD under review': prd },
    };
  },
  'redundant-questions': (run, c) => {
    const interview = read(run.dir, '.keelwright/interview.md');
    if (!interview) return null;
    return {
      question:
        'Did the interview ask the user anything that the input already answered clearly? Questions about items the input lists as undecided are fine, and so are follow-ups that go beyond what the input says. ' +
        'PASS when every question asked was needed; FAIL when at least one question was already answered by the input. Name it in the reason.',
      materials: { 'Input (project description)': c.input, 'Interview record (questions asked are in "Questions and answers")': interview },
    };
  },
};

export function judgePrompt({ question, materials }) {
  const parts = Object.entries(materials).map(([title, body]) => `<${title.replace(/\W+/g, '_')}>\n${body}\n</${title.replace(/\W+/g, '_')}>`);
  return [
    'You are grading the output of a project-kickoff tool. Answer one question strictly.',
    '',
    parts.join('\n\n'),
    '',
    `Question: ${question}`,
    '',
    'First go through the relevant items briefly, one line each. Then decide.',
    'End with the verdict as a JSON object alone on the last line: {"pass": true or false, "reason": "<one sentence that agrees with the verdict>"}',
  ].join('\n');
}

// The verdict is the last {"pass": …} object in the reply (the judge reasons before it).
export function parseVerdict(text) {
  const all = [...String(text ?? '').matchAll(/\{[^{}]*"pass"\s*:\s*(true|false)[^{}]*\}/g)];
  const m = all.at(-1);
  if (!m) return result(false, `judge reply not understood: ${String(text).slice(0, 120)}`);
  try {
    const v = JSON.parse(m[0]);
    return result(Boolean(v.pass), v.reason ?? '');
  } catch {
    return result(m[1] === 'true', 'judge reply partly understood');
  }
}

// Majority of several independent votes; the detail comes from a vote on the winning side.
export function majority(verdicts) {
  const passes = verdicts.filter((v) => v.pass);
  const pass = passes.length * 2 > verdicts.length;
  const side = pass ? passes : verdicts.filter((v) => !v.pass);
  return result(pass, `${passes.length}/${verdicts.length} votes pass — ${side[0]?.detail ?? ''}`);
}
