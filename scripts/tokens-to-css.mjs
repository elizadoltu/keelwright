#!/usr/bin/env node
// Generate the Tailwind CSS v4 theme from the design tokens.
//
//   node tokens-to-css.mjs <tokens.json> <out.css>           write the theme file
//   node tokens-to-css.mjs <tokens.json> <out.css> --check   exit 1 if the file is out of date
//
// The generated project calls this from its `tokens` npm script and checks it in CI, so the
// tokens file stays the only place where colours, fonts and sizes are defined.

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { tokensToCss } from './lib/tokens.mjs';

const [input, output] = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const check = process.argv.includes('--check');
if (!input || !output) {
  console.log('Usage: node tokens-to-css.mjs <tokens.json> <out.css> [--check]');
  process.exit(1);
}

try {
  const css = tokensToCss(readFileSync(input, 'utf8'));
  if (check) {
    const current = existsSync(output) ? readFileSync(output, 'utf8') : '';
    if (current !== css) {
      console.error(`error: ${output} is out of date with ${input} — regenerate it`);
      process.exit(1);
    }
    console.log(`ok   ${output} matches ${input}`);
  } else {
    writeFileSync(output, css);
    console.log(`Wrote ${output}`);
  }
} catch (err) {
  console.error(`error: ${err.message}`);
  process.exit(1);
}
