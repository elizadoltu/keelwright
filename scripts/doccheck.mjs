#!/usr/bin/env node
// Check generated documents against the template principles (spec 6.1).
//
//   node doccheck.mjs [--json] [--max-words <n>] <type>:<file>... | <file>...
//
//   prd:docs/prd.md                 PRD checks + 1,800-word limit
//   adr:docs/decisions/0002-x.md    700-word limit
//   docs/anything.md                placeholders only
//
// Exits 1 when any document has issues.

import { readFileSync } from 'node:fs';
import { checkDocument } from './lib/doccheck.mjs';

const args = process.argv.slice(2);
const json = args.includes('--json');
const maxIdx = args.indexOf('--max-words');
const maxWords = maxIdx >= 0 ? Number(args[maxIdx + 1]) : null;
const targets = args.filter((a, i) => a !== '--json' && a !== '--max-words' && (maxIdx < 0 || i !== maxIdx + 1));

if (!targets.length) {
  console.log('Usage: node doccheck.mjs [--json] [--max-words <n>] [<type>:]<file>...   (types: prd, adr)');
  process.exit(1);
}

const results = targets.map((t) => {
  const m = /^(prd|adr):(.+)$/.exec(t);
  const [type, file] = m ? [m[1], m[2]] : [null, t];
  try {
    return { file, type, ...checkDocument(readFileSync(file, 'utf8'), { type, maxWords }) };
  } catch (err) {
    return { file, type, ok: false, issues: [{ issue: err.message }] };
  }
});

if (json) console.log(JSON.stringify(results, null, 2));
else {
  for (const r of results) {
    const size = r.words !== undefined ? ` (${r.words} words${r.limit ? ` / ${r.limit}` : ''})` : '';
    console.log(`${r.ok ? 'ok  ' : 'FAIL'} ${r.file}${size}`);
    for (const i of r.issues) console.log(`     - ${i.issue}`);
  }
}
process.exit(results.every((r) => r.ok) ? 0 : 1);
