// The `publish` step's deterministic part (spec 6.0, 6.2): what the project's documents become in
// Jira and Confluence, and what changed since the last publish. The step itself calls the
// Atlassian tools; this module only plans, so a re-run updates what exists instead of creating
// duplicates, and nothing is ever deleted.
//
// Jira:       F- features → epics; US- stories → stories under their feature's epic, with the
//             acceptance criteria and requirements; deferred BL- items not covered by a story and
//             TD- debt → tasks. Labels: keelwright, kw-<id>, slice-now|next|later.
// Confluence: every Markdown file in docs/ → a page, folders → parent pages, under one root page.
// Record:     .keelwright/publish.json — the site settings and, per item, the Jira key or page id
//             and a hash of what was published.

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, posix } from 'node:path';

export const RECORD_FILE = '.keelwright/publish.json';
const SOURCE_NOTE = 'The repository is the source of truth: edit the document there and publish again.';

const read = (root, f) => (existsSync(join(root, f)) ? readFileSync(join(root, f), 'utf8') : null);
const hash = (value) => `sha256:${createHash('sha256').update(JSON.stringify(value)).digest('hex').slice(0, 16)}`;
const stripFrontMatter = (text) => text.replace(/^---\n[\s\S]*?\n---\n/, '');
const cells = (row) => row.split('|').slice(1, -1).map((c) => c.trim());
const tableRows = (text, prefix) => text.split('\n').filter((l) => new RegExp(`^\\|\\s*${prefix}-\\d+\\s*\\|`).test(l)).map(cells);
const ids = (text, prefix) => [...new Set(String(text).match(new RegExp(`\\b${prefix}-\\d+\\b`, 'g')) ?? [])];

export function readRecord(root) {
  try {
    return JSON.parse(read(root, RECORD_FILE) ?? '{}');
  } catch {
    return {};
  }
}

// Changes the record through `mutate(record)` and writes it back.
export function updateRecord(root, mutate) {
  const record = readRecord(root);
  mutate(record);
  mkdirSync(join(root, '.keelwright'), { recursive: true });
  writeFileSync(join(root, RECORD_FILE), `${JSON.stringify(record, null, 2)}\n`);
  return record;
}

// https URL of the repository from its git remote (GitHub, GitLab, Bitbucket style), or null.
export function repoUrlFromRemote(remote) {
  const r = String(remote ?? '').trim();
  const ssh = /^git@([^:]+):(.+?)(?:\.git)?$/.exec(r);
  if (ssh) return `https://${ssh[1]}/${ssh[2]}`;
  const https = /^https:\/\/(?:[^@/]+@)?([^/]+)\/(.+?)(?:\.git)?$/.exec(r);
  return https ? `https://${https[1]}/${https[2]}` : null;
}

// ---------------------------------------------------------------------------
// Parsing the documents
// ---------------------------------------------------------------------------

export function productName(root) {
  const prd = read(root, 'docs/prd.md') ?? '';
  return /^#\s+(?:PRD:\s*)?(.+)$/m.exec(stripFrontMatter(prd))?.[1].trim() ?? 'Project';
}

// "### US-1 [P1] Title" blocks: the story sentence, acceptance criteria and anything else in the block.
export function parseStories(prd) {
  const body = stripFrontMatter(prd);
  const stories = [];
  for (const block of body.split(/^###\s+/m).slice(1)) {
    const head = /^(US-\d+)\s*(?:\[(P\d)\])?\s*(.*)$/m.exec(block);
    if (!head) continue;
    const text = block.split(/^##\s/m)[0].split('\n').slice(1).join('\n').replace(/<!--[\s\S]*?-->/g, '').trim();
    stories.push({ id: head[1], priority: head[2] ?? null, title: head[3].trim(), text });
  }
  return stories;
}

// Functional requirements per story: "| FR-001 | text | US-1 |" rows.
export function requirementsByStory(prd) {
  const map = {};
  for (const row of tableRows(stripFrontMatter(prd), 'FR')) {
    const [id, ...rest] = row;
    const text = rest.find((c) => c && !/^US-\d+/.test(c) && !/^P\d$/.test(c)) ?? '';
    for (const us of ids(rest.join(' '), 'US')) (map[us] ??= []).push(`${id} — ${text}`);
  }
  return map;
}

// | ID | Feature | Activity | Stories | Slice | Depends on | Status |
export function parseFeatures(text) {
  if (!text) return [];
  const header = text.split('\n').find((l) => /^\|\s*ID\s*\|\s*Feature/i.test(l));
  const cols = header ? cells(header).map((c) => c.toLowerCase()) : ['id', 'feature', 'activity', 'stories', 'slice', 'depends on', 'status'];
  const col = (row, name) => row[cols.indexOf(name)] ?? '';
  return tableRows(stripFrontMatter(text), 'F').map((row) => ({
    id: row[0],
    name: col(row, 'feature'),
    activity: col(row, 'activity'),
    stories: ids(col(row, 'stories'), 'US'),
    slice: (/now|next|later/i.exec(col(row, 'slice'))?.[0] ?? '').toLowerCase() || null,
    dependsOn: ids(col(row, 'depends on'), 'F'),
  }));
}

export function parseBacklog(text) {
  if (!text) return { deferred: [], debt: [] };
  const body = stripFrontMatter(text);
  return {
    deferred: tableRows(body, 'BL').map(([id, item, source, why, revisit, size]) => ({ id, item, source, why, revisit, size })),
    debt: tableRows(body, 'TD').map(([id, debt, impact, plan]) => ({ id, debt, impact, plan })),
  };
}

// ---------------------------------------------------------------------------
// Jira
// ---------------------------------------------------------------------------

const SLICE_OF_PRIORITY = { P1: 'now', P2: 'next', P3: 'later' };
const SLICE_NAME = { now: 'Now (MVP)', next: 'Next', later: 'Later' };
const sourceLink = (repoUrl, path, label = path) => (repoUrl ? `[${label}](${repoUrl.replace(/\/$/, '')}/blob/HEAD/${path})` : `\`${path}\``);
const labelsFor = (id, slice) => ['keelwright', `kw-${id.toLowerCase()}`, ...(slice ? [`slice-${slice}`] : [])];

// The issues the documents describe, epics first, in a stable order.
// `include`: { deferred, debt } — whether deferred backlog items and technical debt become tasks.
export function jiraItems(root, { repoUrl = null, include = {} } = {}) {
  const prd = read(root, 'docs/prd.md');
  if (!prd) throw new Error('docs/prd.md not found — publish runs after the documents exist');
  const stories = parseStories(prd);
  const reqs = requirementsByStory(prd);
  const features = parseFeatures(read(root, 'docs/features.md'));
  const backlog = parseBacklog(read(root, 'docs/backlog.md'));
  const featureOf = Object.fromEntries(features.flatMap((f) => f.stories.map((s) => [s, f])));
  const items = [];

  for (const f of features) {
    const storyLines = f.stories.map((s) => `- ${s} ${stories.find((x) => x.id === s)?.title ?? ''}`.trimEnd());
    const description = [
      `**Activity:** ${f.activity || '—'} · **Slice:** ${SLICE_NAME[f.slice] ?? '—'}${f.dependsOn.length ? ` · **Depends on:** ${f.dependsOn.join(', ')}` : ''}`,
      '',
      '**Stories**',
      ...storyLines,
      '',
      `_Source: ${sourceLink(repoUrl, 'docs/features.md')} (${f.id}). ${SOURCE_NOTE}_`,
    ].join('\n');
    items.push({ id: f.id, kind: 'epic', summary: `${f.id} ${f.name}`, description, parent: null, labels: labelsFor(f.id, f.slice) });
  }

  for (const s of stories) {
    const feature = featureOf[s.id];
    const slice = feature?.slice ?? SLICE_OF_PRIORITY[s.priority] ?? null;
    const description = [
      s.text,
      ...(reqs[s.id]?.length ? ['', '**Requirements**', ...reqs[s.id].map((r) => `- ${r}`)] : []),
      '',
      `**Priority:** ${s.priority ?? '—'} · **Slice:** ${SLICE_NAME[slice] ?? '—'}${feature ? ` · **Feature:** ${feature.id} ${feature.name}` : ''}`,
      '',
      `_Source: ${sourceLink(repoUrl, 'docs/prd.md')} (${s.id}). ${SOURCE_NOTE}_`,
    ].join('\n');
    items.push({ id: s.id, kind: 'story', summary: `${s.id} ${s.title}`, description, parent: feature?.id ?? null, labels: labelsFor(s.id, slice) });
  }

  const storyIds = new Set(stories.map((s) => s.id));
  for (const b of include.deferred === false ? [] : backlog.deferred) {
    // A deferred story is already a story in a later slice; only items no story covers become tasks.
    if (ids(b.source, 'US').some((u) => storyIds.has(u))) continue;
    const description = [`**Why deferred:** ${b.why || '—'}`, `**Revisit when:** ${b.revisit || '—'}`, `**Size:** ${b.size || '—'} · **Source:** ${b.source || '—'}`, '', `_Source: ${sourceLink(repoUrl, 'docs/backlog.md')} (${b.id}). ${SOURCE_NOTE}_`].join('\n');
    items.push({ id: b.id, kind: 'task', summary: `${b.id} ${b.item}`, description, parent: ids(b.source, 'F').find((f) => features.some((x) => x.id === f)) ?? null, labels: [...labelsFor(b.id, null), 'deferred'] });
  }
  for (const t of include.debt === false ? [] : backlog.debt) {
    const description = [`**Impact:** ${t.impact || '—'}`, `**Plan:** ${t.plan || '—'}`, '', `_Source: ${sourceLink(repoUrl, 'docs/backlog.md')} (${t.id}). ${SOURCE_NOTE}_`].join('\n');
    items.push({ id: t.id, kind: 'task', summary: `${t.id} ${t.debt}`, description, parent: null, labels: [...labelsFor(t.id, null), 'tech-debt'] });
  }
  return items;
}

// ---------------------------------------------------------------------------
// Confluence
// ---------------------------------------------------------------------------

function markdownFiles(root, dir) {
  const abs = join(root, dir);
  if (!existsSync(abs)) return [];
  return readdirSync(abs)
    .sort()
    .flatMap((n) => {
      const rel = `${dir}/${n}`;
      if (statSync(join(root, rel)).isDirectory()) return markdownFiles(root, rel);
      return n.endsWith('.md') ? [rel] : [];
    });
}

const FOLDER_TITLES = { architecture: 'Architecture', decisions: 'Decisions', design: 'Design', ai: 'AI', evals: 'Evaluation', api: 'API' };
const folderTitle = (product, folder) => `${product} — ${FOLDER_TITLES[posix.basename(folder)] ?? posix.basename(folder).replace(/[-_]/g, ' ').replace(/^./, (c) => c.toUpperCase())}`;

// Front matter as one line of metadata; instruction comments removed; local links to other
// documents point to their page once it exists, otherwise they show the repository path.
export function pageBody(root, path, { record = {}, repoUrl = null } = {}) {
  const text = read(root, path) ?? '';
  const fm = /^---\n([\s\S]*?)\n---\n/.exec(text)?.[1] ?? '';
  const meta = ['status', 'date', 'owner', 'decision-makers']
    .map((k) => [k, new RegExp(`^${k}:\\s*(.+)$`, 'm').exec(fm)?.[1]?.replace(/^["']|["']$/g, '').trim()])
    .filter(([, v]) => v)
    .map(([k, v]) => `**${k[0].toUpperCase()}${k.slice(1).replace('-', ' ')}:** ${v}`);
  let body = stripFrontMatter(text).replace(/<!--[\s\S]*?-->\n?/g, '');
  body = body.trimStart().replace(/^#\s+.+\n+/, ''); // the title becomes the page title
  body = body.replace(/(!?)\[([^\]]+)\]\(([^)\s]+)\)/g, (all, bang, label, target) => {
    if (bang || /^(https?:|mailto:|#)/.test(target)) return all;
    const [file, anchor] = target.split('#');
    const resolved = posix.normalize(posix.join(posix.dirname(path), decodeURI(file)));
    const page = record.pages?.[resolved];
    if (page?.url) return `[${label}](${page.url}${anchor ? `#${anchor}` : ''})`;
    return repoUrl ? `[${label}](${repoUrl.replace(/\/$/, '')}/blob/HEAD/${resolved})` : `${label} (\`${resolved}\`)`;
  });
  const source = `_Source: ${sourceLink(repoUrl, path)}. ${SOURCE_NOTE} Diagrams are Mermaid code, rendered in the repository._`;
  return [...(meta.length ? [meta.join(' · '), ''] : []), source, '', body.trim(), ''].join('\n');
}

export function confluencePages(root, { record = {}, repoUrl = null } = {}) {
  const product = productName(root);
  const files = markdownFiles(root, 'docs');
  const pages = [];
  const rootPage = { path: 'docs/', title: `${product} — Documentation`, parent: null, folder: true };
  rootPage.body = [`Documents for ${product}, published from the repository's \`docs/\` folder by KeelWright.`, '', SOURCE_NOTE, ''].join('\n');
  pages.push(rootPage);
  const folders = [...new Set(files.map((f) => posix.dirname(f)).filter((d) => d !== 'docs'))];
  // Every intermediate folder gets a page, parents before children.
  const allFolders = [...new Set(folders.flatMap((d) => d.split('/').slice(1).map((_, i, parts) => ['docs', ...parts.slice(0, i + 1)].join('/'))))].sort();
  for (const d of allFolders) {
    pages.push({ path: `${d}/`, title: folderTitle(product, d), parent: posix.dirname(d) === 'docs' ? 'docs/' : `${posix.dirname(d)}/`, folder: true, body: `Documents in \`${d}/\`.\n` });
  }
  for (const f of files) {
    const h1 = /^#\s+(.+)$/m.exec(stripFrontMatter(read(root, f) ?? ''))?.[1].trim() ?? posix.basename(f, '.md');
    // Titles must be unique in a Confluence space: make sure the product name is in it.
    const title = h1.toLowerCase().includes(product.toLowerCase()) ? h1 : `${product} — ${h1}`;
    const dir = posix.dirname(f);
    pages.push({ path: f, title, parent: dir === 'docs' ? 'docs/' : `${dir}/`, folder: false, body: pageBody(root, f, { record, repoUrl }) });
  }
  return pages;
}

// ---------------------------------------------------------------------------
// Plan: compare with the record
// ---------------------------------------------------------------------------

// create — not published yet; update — the content changed since it was published;
// unchanged; orphaned — published before, no longer in the documents (never deleted).
export function plan(target, root, { repoUrl = null } = {}) {
  const record = readRecord(root);
  if (target === 'jira') {
    const published = record.jira?.items ?? {};
    const items = jiraItems(root, { repoUrl, include: record.jira?.include ?? {} }).map((item) => {
      const h = hash({ summary: item.summary, description: item.description, parent: item.parent, labels: item.labels });
      const prev = published[item.id];
      const parentKey = item.parent ? (published[item.parent]?.key ?? null) : null;
      return { ...item, hash: h, key: prev?.key ?? null, parentKey, action: !prev ? 'create' : prev.hash === h ? 'unchanged' : 'update' };
    });
    const orphaned = Object.entries(published).filter(([id]) => !items.some((i) => i.id === id)).map(([id, p]) => ({ id, key: p.key }));
    return { target, settings: { ...record.jira, items: undefined }, items, orphaned };
  }
  if (target === 'confluence') {
    const published = record.confluence?.pages ?? {};
    const pages = confluencePages(root, { record: record.confluence ?? {}, repoUrl }).map((page) => {
      const h = hash({ title: page.title, body: page.body, parent: page.parent });
      const prev = published[page.path];
      const parentId = page.parent ? (published[page.parent]?.id ?? null) : (record.confluence?.parentId ?? null);
      return { ...page, hash: h, id: prev?.id ?? null, version: prev?.version ?? null, parentId, action: !prev ? 'create' : prev.hash === h ? 'unchanged' : 'update' };
    });
    const orphaned = Object.entries(published).filter(([p]) => !pages.some((x) => x.path === p)).map(([path, p]) => ({ path, id: p.id }));
    return { target, settings: { ...record.confluence, pages: undefined }, items: pages, orphaned };
  }
  throw new Error(`unknown target "${target}" (jira or confluence)`);
}

export function summarise(p) {
  const count = (a) => p.items.filter((i) => i.action === a).length;
  return { create: count('create'), update: count('update'), unchanged: count('unchanged'), orphaned: p.orphaned.length };
}

// The hash to record for one item, from the current documents (so `record` needs no hash argument).
export function currentHash(target, root, id, { repoUrl = null } = {}) {
  const item = plan(target, root, { repoUrl }).items.find((i) => (target === 'jira' ? i.id : i.path) === id);
  if (!item) throw new Error(`${id} is not in the current ${target} plan`);
  return item.hash;
}

