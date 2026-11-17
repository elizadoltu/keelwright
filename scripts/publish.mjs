#!/usr/bin/env node
// Plan and record the `publish` step (Jira / Confluence). Run in the project root.
//
//   node publish.mjs plan <jira|confluence> [--json] [--repo-url <url>|none]
//       What to create or update, in order (epics before stories; parent pages before children),
//       with each item's summary / title, Markdown description / body, labels and parent.
//   node publish.mjs config <jira|confluence> '<json>'
//       Save site settings, e.g. {"cloudId": "…", "projectKey": "SHOP", "issueTypes": {"epic": "Epic",
//       "story": "Story", "task": "Task"}, "include": {"deferred": true, "debt": true}} or {"cloudId": "…", "spaceId": "…", "spaceKey": "DOCS", "parentId": "…"}.
//   node publish.mjs record jira <ID> <KEY> [--url <url>]
//   node publish.mjs record confluence <path> <pageId> <version> [--url <url>]
//       Record what was published (the hash is taken from the current documents).
//   node publish.mjs status
//
// The repository URL (for source links) comes from `git remote get-url origin` unless given.

import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { RECORD_FILE, currentHash, plan, readRecord, repoUrlFromRemote, summarise, updateRecord } from './lib/publish.mjs';

const argv = process.argv.slice(2);
const flag = (name) => {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : undefined;
};
const positional = argv.filter((a, i) => !a.startsWith('--') && !['--repo-url', '--url', '--root'].includes(argv[i - 1]));
const root = resolve(flag('--root') ?? process.cwd());
const [cmd, target, ...rest] = positional;

function repoUrl() {
  const given = flag('--repo-url');
  if (given) return given === 'none' ? null : given;
  try {
    return repoUrlFromRemote(execFileSync('git', ['remote', 'get-url', 'origin'], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }));
  } catch {
    return null;
  }
}

const fail = (msg) => {
  console.error(`error: ${msg}`);
  process.exit(1);
};
const now = () => new Date().toISOString();

try {
  if (cmd === 'plan') {
    if (!['jira', 'confluence'].includes(target)) fail('plan jira | plan confluence');
    const p = plan(target, root, { repoUrl: repoUrl() });
    if (argv.includes('--json')) console.log(JSON.stringify({ ...p, summary: summarise(p) }, null, 2));
    else {
      const s = summarise(p);
      console.log(`${target}: ${s.create} to create, ${s.update} to update, ${s.unchanged} unchanged${s.orphaned ? `, ${s.orphaned} no longer in the documents` : ''}`);
      for (const i of p.items.filter((x) => x.action !== 'unchanged')) {
        const where = target === 'jira' ? `${i.kind}${i.parent ? ` under ${i.parent}${i.parentKey ? ` (${i.parentKey})` : ''}` : ''}` : `under ${i.parent ?? '(root parent)'}`;
        console.log(`  ${i.action.padEnd(7)} ${target === 'jira' ? (i.key ?? i.id) : (i.id ?? i.path)}  ${target === 'jira' ? i.summary : i.title}  — ${where}`);
      }
      for (const o of p.orphaned) console.log(`  orphan  ${o.key ?? o.id}  ${o.id ?? o.path} is published but no longer in the documents (not deleted)`);
    }
  } else if (cmd === 'config') {
    if (!['jira', 'confluence'].includes(target)) fail('config jira | config confluence');
    const settings = JSON.parse(rest[0] ?? '{}');
    updateRecord(root, (r) => {
      r[target] = { ...r[target], ...settings };
    });
    console.log(`Saved ${target} settings to ${RECORD_FILE}`);
  } else if (cmd === 'record') {
    if (target === 'jira') {
      const [id, key] = rest;
      if (!id || !key) fail('record jira <ID> <KEY>');
      const h = currentHash('jira', root, id, { repoUrl: repoUrl() });
      updateRecord(root, (r) => {
        r.jira ??= {};
        r.jira.items ??= {};
        r.jira.items[id] = { key, hash: h, at: now(), ...(flag('--url') ? { url: flag('--url') } : {}) };
      });
      console.log(`Recorded ${id} → ${key}`);
    } else if (target === 'confluence') {
      const [path, id, version] = rest;
      if (!path || !id || !version) fail('record confluence <path> <pageId> <version>');
      const h = currentHash('confluence', root, path, { repoUrl: repoUrl() });
      updateRecord(root, (r) => {
        r.confluence ??= {};
        r.confluence.pages ??= {};
        r.confluence.pages[path] = { id, version: Number(version), hash: h, at: now(), ...(flag('--url') ? { url: flag('--url') } : {}) };
      });
      console.log(`Recorded ${path} → page ${id} (version ${version})`);
    } else fail('record jira … | record confluence …');
  } else if (cmd === 'status') {
    const r = readRecord(root);
    for (const t of ['jira', 'confluence']) {
      if (!r[t]) {
        console.log(`${t}: not published`);
        continue;
      }
      const s = summarise(plan(t, root, { repoUrl: repoUrl() }));
      const where = t === 'jira' ? `project ${r.jira.projectKey ?? '?'}` : `space ${r.confluence.spaceKey ?? r.confluence.spaceId ?? '?'}`;
      console.log(`${t}: ${where} — ${s.unchanged} up to date, ${s.update} changed since publishing, ${s.create} new${s.orphaned ? `, ${s.orphaned} no longer in the documents` : ''}`);
    }
  } else {
    console.log('Usage: node publish.mjs plan <jira|confluence> [--json] | config <jira|confluence> <json> | record jira <ID> <KEY> | record confluence <path> <pageId> <version> | status');
    process.exit(cmd ? 1 : 0);
  }
} catch (err) {
  fail(err.message);
}
