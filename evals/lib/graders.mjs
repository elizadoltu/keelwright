// Graders for one eval run (spec 8.3). Deterministic graders read the project folder the run
// produced; judges ask a model one pass / fail question each.

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { checkTokens, checkWorkspace, crossCheck } from '../../scripts/lib/crosscheck.mjs';
import { checkDocument, citedPaths } from '../../scripts/lib/doccheck.mjs';
import { validatePack } from '../../scripts/lib/packs.mjs';
import { next } from '../../scripts/lib/state.mjs';
import { isPyFinal, isStable, parseSpec, resolveAll } from '../../scripts/lib/versions.mjs';

const read = (dir, f) => (existsSync(join(dir, f)) ? readFileSync(join(dir, f), 'utf8') : null);
const result = (pass, detail = '') => ({ pass, detail });

// `c.expect.adrFolder`: an adopted project's own ADR folder (default `docs/decisions`).
export function loadRun(dir, c = {}) {
  const stateText = read(dir, '.keelwright/state.json');
  const adrDir = (c.expect?.adrFolder ?? 'docs/decisions').replace(/\/$/, '');
  const decisionsDir = join(dir, adrDir);
  const adrs = existsSync(decisionsDir) ? readdirSync(decisionsDir).filter((f) => /^\d{4}-.*\.md$/.test(f)).sort() : [];
  const filesText = read(dir, '.eval/files.json');
  return { dir, state: stateText ? JSON.parse(stateText) : null, adrs, adrDir, files: filesText ? JSON.parse(filesText) : null };
}

const adopted = (run) => run.state?.mode === 'adopt';
// ADRs this run wrote: in the ADR folder after the run but not before.
const newAdrs = (run) => run.adrs.filter((f) => !run.files || !run.files.before[`${run.adrDir}/${f}`]);
const section = (text, name) => (new RegExp(`^##\\s+${name}[^\\n]*\\n([\\s\\S]*?)(?=^##\\s|(?![\\s\\S]))`, 'mi').exec(text ?? '') ?? [])[1] ?? '';
// Files an adopted project may gain or change before the gaps step: the documents and KeelWright's own folder.
const DOC_PATHS = /^(\.keelwright\/|docs\/|CLAUDE\.md$|\.claude\/|CONTRIBUTING\.md$|\.gitignore$)/;

// ---------------------------------------------------------------------------
// Deterministic graders: (run, expect) → { pass, detail } | null when not applicable
// ---------------------------------------------------------------------------

// Where each document lives, which doccheck type checks it, and which step writes it.
const DOCUMENTS = {
  prd: { path: 'docs/prd.md', check: 'prd', step: 'prd' },
  'architecture-overview': { path: 'docs/architecture/overview.md', check: 'overview', step: 'architecture' },
  c4: { path: 'docs/architecture/c4/workspace.dsl', check: null, step: 'architecture' }, // checked by checkWorkspace
  erd: { path: 'docs/architecture/erd.md', check: 'erd', step: 'architecture' },
  'ai-system-design': { path: 'docs/ai/system-design.md', check: 'ai-system-design', step: 'architecture' },
  'ai-eval-plan': { path: 'docs/evals/plan.md', check: 'ai-eval-plan', step: 'architecture' },
  'api-surface': { path: 'docs/api-surface.md', check: 'api-surface', step: 'architecture' },
  'feature-breakdown': { path: 'docs/features.md', check: 'features', step: 'features' },
  'visual-identity': { path: 'docs/design/visual-identity.md', check: 'visual-identity', step: 'design' },
  'screen-flow': { path: 'docs/design/screen-flow.md', check: 'screen-flow', step: 'design' },
  'release-checklist': { path: 'docs/release-checklist.md', check: 'release-checklist', step: 'design' },
  'game-design-document': { path: 'docs/gdd.md', check: 'gdd', step: 'design' },
  'asset-pipeline': { path: 'design/asset-pipeline.md', check: 'asset-pipeline', step: 'design' },
};

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
    return result([expect.projectType].flat().includes(got), `got ${got}`);
  },

  // The main stack decision (the frontend for web; app framework, engine, provider or language otherwise).
  primary: (run, expect) => {
    if (!expect.primary) return null;
    const f = run.state?.stack?.primary ?? run.state?.stack?.frontend ?? {};
    const choice = JSON.stringify(f.choice ?? '').toLowerCase();
    const wanted = [expect.primary.choice].flat().map((c) => c.toLowerCase());
    const okChoice = wanted.some((c) => choice.includes(c));
    const rule = Number(String(f.rule ?? '').match(/\d+/)?.[0]);
    const okRule = expect.primary.rule === undefined || [expect.primary.rule].flat().includes(rule);
    return result(okChoice && okRule, `choice ${f.choice ?? '—'}, rule ${f.rule ?? '—'}`);
  },

  toolchain: (run, expect) => {
    if (!expect.toolchain) return null;
    const got = run.state?.stack?.toolchain;
    return result([expect.toolchain].flat().includes(got), `got ${got ?? '—'}`);
  },

  // ADRs the case expects, as patterns matched against each ADR's file name and title
  // (e.g. a mobile app always gets an offline / sync decision).
  adrs: (run, expect) => {
    if (!expect.adrs) return null;
    const titles = run.adrs.map((f) => `${f} ${/^#\s+(.+)$/m.exec(read(run.dir, `docs/decisions/${f}`) ?? '')?.[1] ?? ''}`);
    const missing = expect.adrs.filter((p) => !titles.some((t) => new RegExp(p, 'i').test(t)));
    return result(!missing.length, missing.length ? `no ADR matching ${missing.map((m) => `/${m}/`).join(', ')} (ADRs: ${run.adrs.join(', ')})` : '');
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

  packs: (run, expect) => {
    if (!expect.packs) return null;
    const packs = Object.keys(run.state?.stack?.packs ?? {});
    const missing = (expect.packs.include ?? []).filter((id) => !packs.includes(id));
    const extra = (expect.packs.exclude ?? []).filter((id) => packs.includes(id));
    const detail = [missing.length && `missing: ${missing.join(', ')}`, extra.length && `unexpected: ${extra.join(', ')}`].filter(Boolean).join('; ');
    return result(!missing.length && !extra.length, detail || packs.join(', '));
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
      ...Object.values(DOCUMENTS).filter((d) => d.check).map((d) => [d.path, d.check]),
      ['docs/backlog.md', null],
      ...(adopted(run) ? newAdrs(run).filter((f) => !/record-architecture-decisions/.test(f)) : run.adrs).map((f) => [`${run.adrDir}/${f}`, adopted(run) ? 'adr-retro' : 'adr']),
    ];
    const failures = [];
    for (const [file, type] of checks) {
      const text = read(run.dir, file);
      if (text === null) continue;
      const r = checkDocument(text, { type, exists: run.files ? (p) => run.files.after[p] !== undefined : null });
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
    const packDir = join(run.dir, '.keelwright/stack-packs');
    if (existsSync(packDir)) {
      for (const f of readdirSync(packDir).filter((n) => n.endsWith('.md'))) {
        const issues = validatePack(readFileSync(join(packDir, f), 'utf8'));
        if (issues.length) failures.push(`stack pack ${f}: ${issues.join('; ')}`);
      }
    }
    // /adopt: the project's own documents in docs/ aren't the run's to fix (the step reports them at the gate).
    if (existsSync(join(run.dir, 'docs')) && !adopted(run)) {
      const refs = crossCheck(run.dir, ['docs']);
      if (refs.issues.length) failures.push(`refs: ${refs.issues.map((i) => i.issue).join('; ')}`);
    }
    return result(!failures.length, failures.join('\n'));
  },

  // Documents the case expects to exist actually exist (the document set is acted on, not just listed).
  'documents-written': (run) => {
    if (adopted(run)) return null;
    const reached = new Set(Object.entries(run.state?.steps ?? {}).filter(([, s]) => ['awaiting_review', 'approved', 'done'].includes(s.status)).map(([n]) => n));
    const missing = (run.state?.documents ?? []).filter((k) => DOCUMENTS[k] && reached.has(DOCUMENTS[k].step) && !existsSync(join(run.dir, DOCUMENTS[k].path)));
    return result(!missing.length, missing.length ? `listed but not written: ${missing.join(', ')}` : '');
  },

  // ---- /adopt -------------------------------------------------------------------------

  mode: (run, expect) => {
    if (!expect.mode) return null;
    return result((run.state?.mode ?? 'kickoff') === expect.mode, `got ${run.state?.mode ?? 'kickoff'}`);
  },

  // Every file the analysis, the overview and the new ADRs cite exists in the project.
  'cited-files': (run) => {
    if (!adopted(run) || !run.files) return null;
    const exists = (p) => run.files.after[p] !== undefined || Object.keys(run.files.after).some((f) => f.startsWith(p.endsWith('/') ? p : `${p}/`));
    const sources = [['.keelwright/analysis.md', read(run.dir, '.keelwright/analysis.md')], ...newAdrs(run).map((f) => [`${run.adrDir}/${f}`, read(run.dir, `${run.adrDir}/${f}`)])];
    const missing = [];
    let cited = 0;
    for (const [file, text] of sources) {
      if (!text) continue;
      // Table rows and Evidence lists: the places that make claims about the code.
      for (const line of text.split('\n').filter((l) => /^\s*(\||- `)/.test(l))) {
        for (const p of citedPaths(line).filter((x) => !x.includes('*') && !x.startsWith('.keelwright/'))) {
          cited++;
          if (!exists(p.replace(/\/$/, '/'))) missing.push(`${file} cites \`${p}\``);
        }
      }
    }
    if (!cited) return result(false, 'no cited files found');
    return result(!missing.length, missing.length ? [...new Set(missing)].join('; ') : `${cited} citations`);
  },

  // Before the gaps step, nothing outside the documents and the Claude setup changed.
  'code-untouched': (run, expect, c) => {
    if (!adopted(run) || !run.files) return null;
    const { before, after } = run.files;
    const gapsRan = ['done', 'in_progress'].includes(run.state?.steps?.gaps?.status);
    const changed = [...new Set([...Object.keys(before), ...Object.keys(after)])].filter((f) => before[f] !== after[f] && !DOC_PATHS.test(f));
    // Existing documents (an ADR, the README) must not change either.
    const editedDocs = Object.keys(before).filter((f) => /\.md$/.test(f) && after[f] !== before[f]);
    const bad = gapsRan ? editedDocs : [...changed, ...editedDocs];
    return result(!bad.length, bad.length ? `changed: ${[...new Set(bad)].join(', ')}` : `${Object.keys(before).length} files unchanged`);
  },

  // The analysis passes its doccheck against the project's real files.
  'analysis-check': (run) => {
    if (!adopted(run)) return null;
    const text = read(run.dir, '.keelwright/analysis.md');
    if (!text) return result(false, 'no .keelwright/analysis.md');
    const exists = run.files ? (p) => run.files.after[p] !== undefined || Object.keys(run.files.after).some((f) => f.startsWith(p.endsWith('/') ? p : `${p}/`)) : null;
    const r = checkDocument(text, { type: 'analysis', exists });
    return result(r.ok, r.ok ? `${r.words} words` : r.issues.map((i) => i.issue).join('; '));
  },

  // Conventions the case planted, with the verdict expected (e.g. one route breaks the error pattern → mixed).
  conventions: (run, expect) => {
    if (!expect.conventions) return null;
    const rows = section(read(run.dir, '.keelwright/analysis.md'), 'Conventions').split('\n').filter((l) => /\|\s*C-\d+/.test(l));
    const misses = expect.conventions.filter((e) => !rows.some((r) => new RegExp(e.match, 'i').test(r) && (!e.followed || new RegExp(`\\b${e.followed}\\b`, 'i').test(r))));
    return result(!misses.length, misses.length ? `no convention row matching ${misses.map((m) => `/${m.match}/${m.followed ? ` marked ${m.followed}` : ''}`).join(', ')}` : `${rows.length} conventions`);
  },

  // Gaps the case planted appear in the analysis's Gaps section.
  'gaps-found': (run, expect) => {
    if (!expect.gaps) return null;
    const text = section(read(run.dir, '.keelwright/analysis.md'), 'Gaps');
    const missing = expect.gaps.filter((p) => !new RegExp(p, 'i').test(text));
    const extra = (expect.notGaps ?? []).filter((p) => new RegExp(p, 'i').test(text));
    const detail = [missing.length && `missing: ${missing.map((m) => `/${m}/`).join(', ')}`, extra.length && `reported but not a gap: ${extra.map((m) => `/${m}/`).join(', ')}`].filter(Boolean).join('; ');
    return result(!missing.length && !extra.length, detail);
  },

  // The versions in use (locked), not the latest, are recorded.
  'versions-in-use': (run, expect) => {
    if (!expect.versions) return null;
    const got = run.state?.stack?.versions ?? {};
    const wrong = Object.entries(expect.versions).filter(([name, v]) => !String(got[name] ?? '').startsWith(v));
    return result(!wrong.length, wrong.length ? wrong.map(([n, v]) => `${n}: expected ${v}, got ${got[n] ?? '—'}`).join('; ') : '');
  },

  workspaces: (run, expect) => {
    if (!expect.workspaces) return null;
    const got = [...(run.state?.stack?.workspaces ?? [])].map((w) => w.replace(/\/$/, '')).sort();
    return result(JSON.stringify(got) === JSON.stringify([...expect.workspaces].sort()), `got ${got.join(', ') || '—'}`);
  },

  // New ADRs go in the project's own folder, numbered after its highest, and ADR-0001 isn't
  // re-recorded when the project already has ADRs.
  'adr-folder': (run, expect) => {
    if (!expect.adrFolder || !run.files) return null;
    const reached = ['awaiting_review', 'approved'].includes(run.state?.steps?.document?.status);
    if (!reached) return null;
    const added = newAdrs(run);
    const problems = [];
    if (!added.length) problems.push(`no new ADR in ${run.adrDir}/`);
    const highest = Math.max(0, ...Object.keys(run.files.before).filter((f) => f.startsWith(`${run.adrDir}/`)).map((f) => Number(/\/(\d{4})-/.exec(f)?.[1] ?? 0)));
    for (const f of added) if (Number(f.slice(0, 4)) <= highest) problems.push(`${f} reuses a number (highest existing: ${highest})`);
    if (highest && added.some((f) => /record-architecture-decisions/.test(f))) problems.push('ADR-0001 "record architecture decisions" written although the project has ADRs');
    const strays = Object.keys(run.files.after).filter((f) => /^docs\/decisions\//.test(f) && run.adrDir !== 'docs/decisions');
    if (strays.length) problems.push(`ADRs written outside the project's folder: ${strays.join(', ')}`);
    return result(!problems.length, problems.join('; ') || added.join(', '));
  },

  // Retroactive ADRs pass their check, and don't invent alternatives the repository never mentions.
  'retro-adrs': (run, expect) => {
    if (!adopted(run) || !run.files) return null;
    const retro = newAdrs(run).filter((f) => /Recorded retroactively/.test(read(run.dir, `${run.adrDir}/${f}`) ?? ''));
    if (!retro.length) return ['awaiting_review', 'approved'].includes(run.state?.steps?.document?.status) ? result(false, 'no retroactive ADRs') : null;
    const exists = (p) => run.files.after[p] !== undefined;
    const problems = [];
    for (const f of retro) {
      const text = read(run.dir, `${run.adrDir}/${f}`);
      const r = checkDocument(text, { type: 'adr-retro', exists });
      if (!r.ok) problems.push(`${f}: ${r.issues.map((i) => i.issue).join('; ')}`);
      if (expect.alternativesKnown === false && !/not recorded/i.test(section(text, 'Alternatives'))) problems.push(`${f}: lists alternatives the repository never mentions`);
    }
    return result(!problems.length, problems.join('\n') || `${retro.length} retroactive ADRs`);
  },

  // Packs researched or reused at the major version the project uses.
  'pack-majors': (run, expect) => {
    if (!expect.packMajors) return null;
    if (!['awaiting_review', 'approved'].includes(run.state?.steps?.research?.status)) return null;
    const wrong = Object.entries(expect.packMajors).filter(([id, major]) => {
      const m = /^major:\s*(\d+)/m.exec(read(run.dir, `.keelwright/stack-packs/${id}.md`) ?? '');
      return Number(m?.[1]) !== major;
    });
    return result(!wrong.length, wrong.map(([id, major]) => `${id}: expected major ${major}`).join('; '));
  },

  // Each ADR after 0001 justifies itself with at least one requirement ID.
  'adr-traceability': (run) => {
    if (adopted(run)) return null; // retroactive ADRs have no requirements to cite
    // ADR-0001 is fixed text; version hold-backs are justified by a peer range, not a requirement.
    const bare = run.adrs.filter((f) => !f.startsWith('0001-') && !/^\d{4}-hold-/.test(f)).filter((f) => !/\b(?:US-\d+|(?:FR|NFR|SC)-\d{3})\b/.test(read(run.dir, `docs/decisions/${f}`)));
    return result(run.adrs.length > 1 && !bare.length, bare.length ? `no requirement IDs: ${bare.join(', ')}` : `${run.adrs.length} ADRs`);
  },
};

// Versions: every package version is a stable published release on the toolchain's registry
// (npm, PyPI, pub.dev, crates.io) and every runtime is the current one; anything older than the
// newest stable must be explained in an ADR. Needs network access.
const RUNTIME_NAMES = { node: 'node', 'node.js': 'node', python: 'python', flutter: 'flutter', rust: 'rust', godot: 'godot', unity: 'unity' };
const REGISTRY = { node: 'npm', python: 'pypi', dart: 'pub', rust: 'crates' };

export async function gradeVersions(run, fetchJson) {
  const versions = run.state?.stack?.versions ?? {};
  const names = Object.keys(versions);
  if (!names.length) return result(false, 'no versions recorded in state.stack.versions');
  const adrText = run.adrs.map((f) => read(run.dir, `docs/decisions/${f}`)).join('\n');
  const registry = REGISTRY[run.state?.stack?.toolchain ?? 'node'] ?? null;
  const problems = [];
  let checked = 0;
  for (const name of names) {
    const v = String(versions[name]).replace(/^v/, '');
    const runtime = RUNTIME_NAMES[name.toLowerCase()];
    if (runtime) {
      const { packages, errors } = await resolveAll([runtime], { fetchJson });
      if (errors.length) continue; // feed unavailable: nothing to compare against
      const current = packages[0].version;
      checked++;
      if (v !== current && !new RegExp(runtime, 'i').test(adrText)) problems.push(`${name} ${v} is not the current ${runtime === 'node' ? 'LTS' : 'stable'} (${current})`);
      continue;
    }
    const githubRepo = name.includes('/') && !name.startsWith('@');
    if (!registry || name === 'gitleaks' || githubRepo) continue; // a binary or a GitHub release
    let spec;
    try {
      spec = parseSpec(`${registry}:${name}`);
    } catch {
      continue; // not a package name on this registry
    }
    if (registry === 'pypi' ? !isPyFinal(v) : !isStable(v)) {
      problems.push(`${name} ${v} is not a stable version`);
      continue;
    }
    const { packages, errors } = await resolveAll([`${registry}:${spec.name}`], { fetchJson });
    if (errors.length) {
      if (registry === 'npm') problems.push(`${name}: not found on npm`);
      continue; // other registries: may be a tool installed another way
    }
    checked++;
    if (registry === 'npm') {
      const encoded = name.startsWith('@') ? `@${encodeURIComponent(name.slice(1))}` : encodeURIComponent(name);
      const packument = await fetchJson(`https://registry.npmjs.org/${encoded}`, { Accept: 'application/vnd.npm.install-v1+json' });
      if (!packument.versions?.[v]) {
        problems.push(`${name} ${v} doesn't exist on npm`);
        continue;
      }
    } else if (registry === 'pypi') {
      const project = await fetchJson(`https://pypi.org/pypi/${encodeURIComponent(name)}/json`);
      if (!project.releases?.[v]) {
        problems.push(`${name} ${v} doesn't exist on PyPI`);
        continue;
      }
    }
    const newest = packages[0].version;
    if (v !== newest && !adrText.includes(name)) problems.push(`${name} ${v} is older than ${newest} with no ADR explaining it`);
  }
  return result(!problems.length, problems.length ? problems.join('; ') : `${checked} versions checked`);
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
