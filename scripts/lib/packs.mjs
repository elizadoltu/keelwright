// Stack packs (spec 5.4): one researched Markdown file per technology, with rules and sources.
// Shipped packs live in <plugin>/stack-packs/, packs researched on a user's machine in
// ~/.keelwright/stack-packs/ (or $KEELWRIGHT_HOME/stack-packs/), and the packs a project uses are
// copied into <project>/.keelwright/stack-packs/ so they can be reviewed at gate 3.

import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { placeholders, wordCount } from './doccheck.mjs';
import { parseVersion } from './versions.mjs';

export const MAX_AGE_DAYS = 90;
export const MAX_WORDS = 3000;
export const SOURCE_KINDS = ['official', 'maintainer', 'reference-project', 'community'];
export const ENFORCEMENT = ['lint', 'format', 'types', 'hook', 'ci', 'test', 'config', 'review'];
export const SECTIONS = [
  'Summary',
  'Project structure',
  'Naming',
  'Testing',
  'Linting and formatting',
  'Security',
  'Performance pitfalls',
  'CI/CD and release',
  'Conventions',
  'Version notes',
  'Rules',
  'Sources',
];

export const userPackDir = () => join(process.env.KEELWRIGHT_HOME ?? join(homedir(), '.keelwright'), 'stack-packs');
export const projectPackDir = (root) => join(root, '.keelwright', 'stack-packs');

// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------

// Front matter: `key: value` lines; values may be inline lists `[a, "b"]`, numbers or strings.
export function parseFrontMatter(text) {
  const m = /^---\n([\s\S]*?)\n---\n/.exec(text);
  if (!m) return null;
  const data = {};
  for (const line of m[1].split('\n')) {
    const kv = /^([A-Za-z][\w-]*):\s*(.*?)\s*(?:#.*)?$/.exec(line);
    if (!kv) continue;
    const [, key, raw] = kv;
    if (/^\[.*\]$/.test(raw)) {
      data[key] = raw
        .slice(1, -1)
        .split(',')
        .map((s) => s.trim().replace(/^["']|["']$/g, ''))
        .filter(Boolean);
    } else if (/^-?\d+$/.test(raw)) data[key] = Number(raw);
    else data[key] = raw.replace(/^["']|["']$/g, '');
  }
  return data;
}

function sectionBodies(text) {
  const out = {};
  let current = null;
  for (const line of text.split('\n')) {
    const h = /^##\s+(.+?)\s*$/.exec(line);
    if (h) {
      current = h[1];
      out[current] = [];
    } else if (current) out[current].push(line);
  }
  return out;
}

const tableRows = (lines = []) =>
  lines
    .filter((l) => /^\|/.test(l) && !/^\|\s*-/.test(l))
    .slice(1)
    .map((l) => l.replace(/^\||\|$/g, '').split('|').map((c) => c.trim()));

export function parsePack(text, file = null) {
  const meta = parseFrontMatter(text) ?? {};
  const sections = sectionBodies(text);
  const sources = tableRows(sections.Sources).map(([id, kind, title, url]) => ({ id, kind, title, url }));
  const rules = tableRows(sections.Rules).map(([id, rule, enforce, src]) => ({ id, rule, enforce, sources: (src ?? '').match(/S\d+/g) ?? [] }));
  return { file, meta, sections: Object.keys(sections), sources, rules, text };
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

export function validatePack(text) {
  const p = parsePack(text);
  const issues = [];
  const { meta } = p;
  if (!/^[a-z0-9][a-z0-9-]*$/.test(meta.id ?? '')) issues.push('front matter: id must be a lowercase slug');
  if (!meta.name) issues.push('front matter: name is missing');
  if (!Array.isArray(meta.packages) || !meta.packages.length) issues.push('front matter: packages must be a non-empty list');
  if (!Number.isInteger(meta.major)) issues.push('front matter: major must be an integer (the researched major version)');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(meta.researchedAt ?? '')) issues.push('front matter: researchedAt must be YYYY-MM-DD');
  if (!['draft', 'reviewed'].includes(meta.status)) issues.push('front matter: status must be draft or reviewed');

  for (const s of SECTIONS) if (!p.sections.includes(s)) issues.push(`missing section "## ${s}"`);

  const sourceIds = new Set();
  for (const s of p.sources) {
    if (!/^S\d+$/.test(s.id ?? '')) issues.push(`source "${s.id}": id must be S1, S2, …`);
    if (!SOURCE_KINDS.includes(s.kind)) issues.push(`source ${s.id}: kind must be one of ${SOURCE_KINDS.join(', ')}`);
    if (!/^https:\/\/\S+$/.test(s.url ?? '')) issues.push(`source ${s.id}: url must be an https link`);
    sourceIds.add(s.id);
  }
  if (!p.sources.length) issues.push('no sources');
  else if (!p.sources.some((s) => s.kind === 'official')) issues.push('no official source');

  const prefix = (meta.id ?? '').toUpperCase().replace(/-/g, '');
  if (!p.rules.length) issues.push('no rules');
  for (const r of p.rules) {
    if (!new RegExp(`^${prefix}-\\d{2}$`).test(r.id ?? '')) issues.push(`rule "${r.id}": id must be ${prefix}-NN`);
    const kind = (r.enforce ?? '').split(/[:\s]/)[0].toLowerCase();
    if (!ENFORCEMENT.includes(kind)) issues.push(`rule ${r.id}: "Enforce with" must start with one of ${ENFORCEMENT.join(', ')}`);
    if (!r.sources.length) issues.push(`rule ${r.id}: cites no source`);
    for (const s of r.sources) if (!sourceIds.has(s)) issues.push(`rule ${r.id}: cites unknown source ${s}`);
    const kinds = r.sources.map((s) => p.sources.find((x) => x.id === s)?.kind).filter(Boolean);
    if (kinds.length && kinds.every((k) => k === 'community')) issues.push(`rule ${r.id}: relies on community sources only`);
  }
  const words = wordCount(text);
  if (words > MAX_WORDS) issues.push(`${words} words — over the ${MAX_WORDS}-word limit (tables included)`);
  for (const ph of placeholders(text)) issues.push(`line ${ph.line}: ${ph.issue}`);
  return issues;
}

// ---------------------------------------------------------------------------
// Finding packs and deciding what to research
// ---------------------------------------------------------------------------

function readDir(dir, location) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith('.md') && f !== 'README.md')
    .map((f) => ({ ...parsePack(readFileSync(join(dir, f), 'utf8'), join(dir, f)), location }));
}

// All available packs per id, newest research first: user cache before shipped on a tie.
export function availablePacks(pluginRoot) {
  const all = [...readDir(userPackDir(), 'user'), ...readDir(join(pluginRoot, 'stack-packs'), 'shipped')].filter((p) => p.meta.id);
  const byId = {};
  for (const p of all) (byId[p.meta.id] ??= []).push(p);
  for (const list of Object.values(byId)) list.sort((a, b) => String(b.meta.researchedAt).localeCompare(String(a.meta.researchedAt)));
  return byId;
}

const globToRegex = (g) => new RegExp(`^${g.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*')}$`);

// The resolved version of a pack's primary package (its first `packages` entry).
export function resolvedMajor(pack, versions) {
  const primary = pack.meta.packages?.[0];
  if (!primary) return null;
  const re = globToRegex(primary);
  const name = Object.keys(versions).find((n) => re.test(n));
  const v = name ? parseVersion(String(versions[name])) : null;
  return v ? v.major : null;
}

// The newest pack for the project's major (an adopted project may be on an older one), else the newest.
export function choosePack(list = [], versions = {}) {
  return list.find((p) => resolvedMajor(p, versions) === p.meta.major) ?? list[0] ?? null;
}

const ageDays = (date, now) => Math.floor((Date.parse(now) - Date.parse(date)) / 86_400_000);

// For each pack id the project needs: reuse | research, with the reason.
export function plan(ids, versions, { pluginRoot, now = new Date().toISOString(), refresh = false, maxAgeDays = MAX_AGE_DAYS }) {
  const packs = availablePacks(pluginRoot);
  return ids.map((id) => {
    const best = choosePack(packs[id], versions);
    if (!best) return { id, action: 'research', reason: 'no pack yet' };
    const base = { id, file: best.file, location: best.location, researchedAt: best.meta.researchedAt, major: best.meta.major };
    if (refresh) return { ...base, action: 'research', reason: '--refresh' };
    const issues = validatePack(best.text);
    if (issues.length) return { ...base, action: 'research', reason: `existing pack is invalid: ${issues[0]}` };
    const major = resolvedMajor(best, versions);
    if (major !== null && major !== best.meta.major) return { ...base, action: 'research', reason: `researched for major ${best.meta.major}, project resolves ${major}` };
    const age = ageDays(best.meta.researchedAt, now);
    if (age > maxAgeDays) return { ...base, action: 'research', reason: `${age} days old (limit ${maxAgeDays})` };
    return { ...base, action: 'reuse', reason: `${age} days old${major === null ? ', primary package not in the resolved versions' : `, major ${major} matches`}` };
  });
}

// Copy a pack into the project for review, or a reviewed project pack into the user cache.
export function install(pack, root) {
  mkdirSync(projectPackDir(root), { recursive: true });
  const dest = join(projectPackDir(root), `${pack.meta.id}.md`);
  copyFileSync(pack.file, dest);
  return dest;
}

export function saveToCache(file) {
  const issues = validatePack(readFileSync(file, 'utf8'));
  if (issues.length) throw new Error(`not saved, the pack has issues: ${issues.join('; ')}`);
  mkdirSync(userPackDir(), { recursive: true });
  // One file per id and major, so a pack for an older major (from /adopt) doesn't replace the
  // current one. A cached file from before this naming, for the same major, is replaced.
  const { meta } = parsePack(readFileSync(file, 'utf8'), file);
  const dest = join(userPackDir(), `${meta.id}@${meta.major}.md`);
  const legacy = join(userPackDir(), `${meta.id}.md`);
  if (existsSync(legacy) && parsePack(readFileSync(legacy, 'utf8'), legacy).meta.major === meta.major) rmSync(legacy);
  copyFileSync(file, dest);
  return dest;
}
