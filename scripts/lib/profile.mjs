// Profiles (spec 5.7): who is running KeelWright. A personal file, `~/.keelwright/profile.json`
// (KEELWRIGHT_HOME overrides the folder) — never in the repository, since several people with
// different roles work on one project, and never with an email address. The role doesn't change
// the project's documents; it decides which of them the person owns (the working set, shown in
// full at gates and rated in the report), which open questions they are asked, and the order the
// doctor's areas are shown in.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

export const ROLES = [
  { id: 'developer', tag: 'dev', title: 'Developer', shows: 'diffs, versions and files' },
  { id: 'project-manager', tag: 'pm', title: 'Project manager', shows: 'scope, risks and what is blocked' },
  { id: 'business-analyst', tag: 'ba', title: 'Business analyst', shows: 'requirements, acceptance criteria and data gaps' },
  // Open (spec 10): what account managers need is still being researched. Until then they get
  // every document summarised and a short status per doctor area.
  { id: 'account-manager', tag: 'am', title: 'Account manager', shows: 'a short status per area' },
];
export const TAGS = ROLES.map((r) => r.tag);
export const roleById = (id) => ROLES.find((r) => r.id === id) ?? null;
export const roleByTag = (tag) => ROLES.find((r) => r.tag === tag) ?? null;

// The working set per role (spec 5.7): the documents the person owns.
const ADR = /(^|\/)(adrs?|decisions|decision-records)\//i;
export const WORKING_SETS = {
  developer: [/^docs\/architecture\//, ADR, /^docs\/security\/threat-model\.md$/, /^docs\/api-surface\.md$/, /^docs\/ai\//, /^CONTRIBUTING\.md$/, /^\.keelwright\/(stack-packs\/|gaps\.md$|analysis\.md$|scaffold\.md$|generate\.md$)/, /^CLAUDE\.md$/, /^\.claude\//],
  'project-manager': [/^docs\/prd\.md$/, /^docs\/features\.md$/, /^docs\/backlog\.md$/, /^docs\/release-checklist\.md$/, /^\.keelwright\/publish/],
  'business-analyst': [/^docs\/prd\.md$/, /^docs\/architecture\/erd\.md$/, /^docs\/design\/screen-flow\.md$/, /^docs\/evals\/plan\.md$/],
  'account-manager': [],
};

// The doctor's areas, most relevant first (spec 7.0: "the profile orders the areas").
export const DOCTOR_ORDER = {
  developer: ['setup', 'security', 'tooling', 'stack', 'docs', 'process', 'delivery'],
  'project-manager': ['delivery', 'security', 'docs', 'process', 'stack', 'tooling', 'setup'],
  'business-analyst': ['delivery', 'docs', 'security', 'process', 'setup', 'stack', 'tooling'],
  'account-manager': ['delivery', 'security', 'process', 'docs', 'stack', 'tooling', 'setup'],
};

export const home = (env = process.env) => env.KEELWRIGHT_HOME ?? join(homedir(), '.keelwright');
export const profilePath = (dir = home()) => join(dir, 'profile.json');

export function load(dir = home()) {
  try {
    return JSON.parse(readFileSync(profilePath(dir), 'utf8'));
  } catch {
    return null;
  }
}

const EMAIL = /[^\s@]+@[^\s@]+/;
const DEFAULT_KEYS = ['jiraProject', 'confluenceSpace', 'language'];

// Merges `patch` into the saved profile. `skip` records that the question was asked and declined,
// so it isn't asked again.
export function save(patch, { dir = home(), now = new Date().toISOString() } = {}) {
  const current = load(dir) ?? {};
  const next = { ...current, ...patch, defaults: { ...(current.defaults ?? {}), ...(patch.defaults ?? {}) }, asked: true, updatedAt: now.slice(0, 10) };
  for (const k of Object.keys(next.defaults)) if (!DEFAULT_KEYS.includes(k)) throw new Error(`unknown default "${k}" (defaults: ${DEFAULT_KEYS.join(', ')})`);
  for (const k of Object.keys(next.defaults)) if (next.defaults[k] === '' || next.defaults[k] == null) delete next.defaults[k];
  if (next.role != null && !roleById(next.role)) throw new Error(`unknown role "${next.role}" (roles: ${ROLES.map((r) => r.id).join(', ')})`);
  if (next.name != null && (typeof next.name !== 'string' || next.name.length > 80)) throw new Error('the name must be text of at most 80 characters');
  const values = JSON.stringify({ name: next.name, defaults: next.defaults });
  if (EMAIL.test(values)) throw new Error('a profile never holds an email address (spec 5.7)');
  mkdirSync(dir, { recursive: true });
  writeFileSync(profilePath(dir), `${JSON.stringify(next, null, 2)}\n`);
  return next;
}

// Files split into the person's working set and the rest. No role: everything is theirs (as before
// profiles existed).
export function workingSet(role, files) {
  if (!role || !WORKING_SETS[role]) return { mine: [...files], others: [] };
  const res = WORKING_SETS[role];
  const mine = files.filter((f) => res.some((re) => re.test(f)));
  return { mine, others: files.filter((f) => !mine.includes(f)) };
}

// `[NEEDS CLARIFICATION (pm): …]` → 'pm'; untagged → null (anyone can answer it).
export function markerTag(text) {
  const m = /\[NEEDS CLARIFICATION\s*\(([a-z]+)\)/.exec(text);
  return m && TAGS.includes(m[1]) ? m[1] : null;
}

// Open questions for this person (their role's and untagged ones) and the ones waiting on others.
export function questionsFor(role, markers) {
  const tag = roleById(role)?.tag ?? null;
  if (!tag) return { mine: markers, waiting: [] };
  const mine = markers.filter((m) => !m.role || m.role === tag);
  return { mine, waiting: markers.filter((m) => m.role && m.role !== tag) };
}

// pm-skills (spec 5.7: used, not copied): installed as a Claude Code plugin from its marketplace.
export function pmSkillsInstalled(claudeDir = join(homedir(), '.claude')) {
  try {
    const plugins = JSON.parse(readFileSync(join(claudeDir, 'plugins/installed_plugins.json'), 'utf8')).plugins ?? {};
    return Object.keys(plugins).some((k) => /pm-skills/i.test(k));
  } catch {
    return existsSync(join(claudeDir, 'skills/pm-skills'));
  }
}

// Everything a command needs about the person, in one call.
export function summary(dir = home(), { claudeDir } = {}) {
  const p = load(dir);
  const role = p?.role ? roleById(p.role) : null;
  return {
    asked: Boolean(p?.asked),
    name: p?.name ?? null,
    role: role?.id ?? null,
    tag: role?.tag ?? null,
    shows: role?.shows ?? null,
    defaults: p?.defaults ?? {},
    doctorOrder: DOCTOR_ORDER[role?.id] ?? DOCTOR_ORDER.developer,
    ...(role?.id === 'project-manager' ? { pmSkills: pmSkillsInstalled(claudeDir) } : {}),
    path: profilePath(dir),
  };
}
