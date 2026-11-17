#!/usr/bin/env node
// Generate the theme from the design tokens. The output file's extension picks the target:
// .css → Tailwind CSS v4 theme (web), .ts → a TypeScript object (React Native / Expo),
// .dart → a Flutter constants class.
//
//   node tokens-to-css.mjs <tokens.json> <out.css|.ts|.dart>           write the theme file
//   node tokens-to-css.mjs <tokens.json> <out.css|.ts|.dart> --check   exit 1 if it is out of date
//
// The generated project calls this from its `tokens` task and checks it in CI, so the
// tokens file stays the only place where colours, fonts and sizes are defined.

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { themeFor } from './lib/tokens.mjs';

const [input, output] = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const check = process.argv.includes('--check');
if (!input || !output) {
  console.log('Usage: node tokens-to-css.mjs <tokens.json> <out.css|.ts|.dart> [--check]');
  process.exit(1);
}

const generate = themeFor(output);
if (!generate) {
  console.error(`error: ${output}: unknown target — use .css, .ts or .dart`);
  process.exit(1);
}

try {
  const css = generate(readFileSync(input, 'utf8'));
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
