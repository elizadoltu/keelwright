// The agreed scope (spec 5.7, the account manager): the PRD's stories and the feature breakdown's
// features as they were approved, so a later edit that adds, drops or re-prioritises one can be
// shown to the account manager as a possible change request. Read-only; the baseline lives in
// the state (`state.scope`), set through state.mjs.

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export const PRD = 'docs/prd.md';
export const FEATURES = 'docs/features.md';

const read = (root, file) => (existsSync(join(root, file)) ? readFileSync(join(root, file), 'utf8') : null);
const clean = (t) => t.replace(/\s+/g, ' ').trim();
const withoutCode = (t) => t.replace(/^```[\s\S]*?^```/gm, '').replace(/<!--[\s\S]*?-->/g, '');

// `### US-3 [P2] Book a desk` → { 'US-3': { title: 'Book a desk', priority: 'P2', dropped: false } }
export function parseStories(text) {
  const out = {};
  for (const m of withoutCode(text ?? '').matchAll(/^###\s+(US-\d+)\b\s*(?:\[(P\d)\])?\s*(.*)$/gm)) {
    const title = clean(m[3].replace(/^[—–:-]\s*/, ''));
    out[m[1]] = { title: title.replace(/\s*\(?dropped\)?\s*$/i, ''), priority: m[2] ?? null, dropped: /\bdropped\b/i.test(title) };
  }
  return out;
}

// The feature table (`| F-01 | Name | A-1 | US-1 | Now | … |`): name and slice (Now / Next / Later).
export function parseFeatures(text) {
  const out = {};
  for (const line of withoutCode(text ?? '').split('\n')) {
    const cells = line.split('|').slice(1, -1).map(clean);
    if (!/^F-\d+$/.test(cells[0] ?? '')) continue;
    const slice = cells.find((c) => /^(Now|Next|Later)\b/i.test(c)) ?? null;
    out[cells[0]] = { title: cells[1] ?? '', slice: slice && slice.split(/\s/)[0] };
  }
  return out;
}

export function current(root) {
  return { stories: parseStories(read(root, PRD)), features: parseFeatures(read(root, FEATURES)) };
}

// What changed between two scopes, in order: stories, then features.
export function diff(before, after) {
  const changes = [];
  const compare = (kind, a = {}, b = {}) => {
    for (const [id, x] of Object.entries(b)) {
      const was = a[id];
      if (!was) changes.push({ kind, id, change: 'added', to: x });
      else if (x.dropped && !was.dropped) changes.push({ kind, id, change: 'dropped', from: was });
      else if (kind === 'story' && x.priority !== was.priority) changes.push({ kind, id, change: 'priority', from: was.priority, to: x.priority, title: x.title });
      else if (kind === 'feature' && x.slice !== was.slice) changes.push({ kind, id, change: 'slice', from: was.slice, to: x.slice, title: x.title });
      else if (x.title !== was.title) changes.push({ kind, id, change: 'renamed', from: was.title, to: x.title });
    }
    for (const [id, was] of Object.entries(a)) if (!b[id]) changes.push({ kind, id, change: 'removed', from: was });
  };
  compare('story', before?.stories, after.stories);
  compare('feature', before?.features, after.features);
  return changes;
}

// One line per change, in words an account manager can forward.
export function describe(c) {
  const name = c.title ?? c.to?.title ?? c.from?.title ?? '';
  const what = c.kind === 'story' ? 'Story' : 'Feature';
  switch (c.change) {
    case 'added': return `${what} ${c.id} added: ${name}${c.to?.priority ? ` (${c.to.priority})` : ''}${c.to?.slice ? ` (${c.to.slice})` : ''}`;
    case 'removed': return `${what} ${c.id} removed: ${name}`;
    case 'dropped': return `${what} ${c.id} dropped: ${name}`;
    case 'priority': return `${what} ${c.id} moved from ${c.from ?? 'no priority'} to ${c.to ?? 'no priority'}: ${name}`;
    case 'slice': return `${what} ${c.id} moved from ${c.from ?? '—'} to ${c.to ?? '—'}: ${name}`;
    default: return `${what} ${c.id} renamed: "${c.from}" → "${c.to}"`;
  }
}
