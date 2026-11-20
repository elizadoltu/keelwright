#!/usr/bin/env node
// Check generated documents against the template principles (spec 6.1).
//
//   node doccheck.mjs [--json] [--max-words <n>] <target>...
//
//   prd:docs/prd.md                        PRD checks + word limit
//   adr:<file>  overview:<file>  features:<file>  visual-identity:<file>  erd:<file>
//   screen-flow:  release-checklist:  gdd:  asset-pipeline:  ai-system-design:  ai-eval-plan:
//   api-surface:<file>                     word limit + placeholders (+ the document's own checks:
//                                          screens, core loop, prompts and tools, eval thresholds
//                                          with cost and latency, public API items)
//   analysis:.keelwright/analysis.md      /adopt analysis: conventions cite existing files, consistent / mixed
//   adr-retro:<file>                       /adopt retroactive ADR: says so, cites existing files, Alternatives
//   threat-model:docs/security/threat-model.md  framework edition, SEC- risks with mitigation, enforcement
//                                          and status, sensitive paths; mitigated / open risks cite existing files
//   tokens:design/tokens.json              W3C DTCG structure, references, WCAG AA text contrast
//   c4:docs/architecture/c4/workspace.dsl  Structurizr workspace structure
//   refs:docs                              every ID referenced is defined; no broken local links
//   <file>                                 placeholders only
//
// Exits 1 when any target has issues.

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { checkTokens, checkWorkspace, crossCheck } from './lib/crosscheck.mjs';
import { DOC_TYPES, checkDocument } from './lib/doccheck.mjs';

const args = process.argv.slice(2);
const json = args.includes('--json');
const maxIdx = args.indexOf('--max-words');
const maxWords = maxIdx >= 0 ? Number(args[maxIdx + 1]) : null;
const targets = args.filter((a, i) => a !== '--json' && a !== '--max-words' && (maxIdx < 0 || i !== maxIdx + 1));

if (!targets.length) {
  console.log(`Usage: node doccheck.mjs [--json] [--max-words <n>] [<type>:]<path>...   (types: ${DOC_TYPES.join(', ')}, tokens, c4, refs)`);
  process.exit(1);
}

function check(target) {
  const m = /^([a-z0-9-]+):(.+)$/.exec(target);
  const [type, path] = m ? [m[1], m[2]] : [null, target];
  try {
    if (type === 'tokens') return { file: path, type, issues: checkTokens(readFileSync(path, 'utf8')) };
    if (type === 'c4') return { file: path, type, issues: checkWorkspace(readFileSync(path, 'utf8')) };
    if (type === 'refs') {
      const r = crossCheck(process.cwd(), [path]);
      return { file: path, type, note: `${r.files} files, ${r.defined} IDs defined`, issues: r.issues };
    }
    if (type && !DOC_TYPES.includes(type)) throw new Error(`unknown check type "${type}"`);
    // Cited paths are relative to the project root (the current folder).
    const exists = (p) => existsSync(join(process.cwd(), p));
    const r = checkDocument(readFileSync(path, 'utf8'), { type, maxWords, exists });
    return { file: path, type, note: `${r.words} words${r.limit ? ` / ${r.limit}` : ''}`, issues: r.issues };
  } catch (err) {
    return { file: path, type, issues: [{ issue: err.message }] };
  }
}

const results = targets.map(check).map((r) => ({ ...r, ok: r.issues.length === 0 }));

if (json) console.log(JSON.stringify(results, null, 2));
else {
  for (const r of results) {
    console.log(`${r.ok ? 'ok  ' : 'FAIL'} ${r.type ? `${r.type}:` : ''}${r.file}${r.note ? ` (${r.note})` : ''}`);
    for (const i of r.issues) console.log(`     - ${i.issue}`);
  }
}
process.exit(results.every((r) => r.ok) ? 0 : 1);
