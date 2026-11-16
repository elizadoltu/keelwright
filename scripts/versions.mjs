#!/usr/bin/env node
// Resolve the latest stable versions of a stack from the registries (spec 4.6).
//
//   node versions.mjs [--json] <spec>...
//
//   node                      latest Node.js LTS
//   astro | npm:astro         latest stable npm version
//   npm:tailwindcss@^4        highest stable version in a range (to hold a package back)
//   github:gitleaks/gitleaks  latest GitHub release
//
// Prints each version, then a peer dependency check across the set. Exits 1 if any package
// could not be resolved or a peer conflicts.

import { httpFetchJson, resolveAll } from './lib/versions.mjs';

const args = process.argv.slice(2);
const json = args.includes('--json');
const specs = args.filter((a) => a !== '--json');

if (!specs.length || specs.includes('help') || specs.includes('--help')) {
  console.log('Usage: node versions.mjs [--json] <node | npm:<pkg>[@range] | <pkg>[@range] | github:<owner>/<repo>>...');
  process.exit(specs.length ? 0 : 1);
}

const result = await resolveAll(specs, { fetchJson: httpFetchJson });
const conflicts = result.peers.filter((p) => p.status === 'conflict');

if (json) {
  console.log(JSON.stringify(result, null, 2));
} else {
  console.log(`Resolved on ${result.resolvedAt}`);
  for (const p of result.packages) {
    const note = p.lts ? ` (LTS ${p.lts})` : p.range ? ` (range ${p.range})` : '';
    console.log(`  ${p.name.padEnd(36)} ${p.version}${note}`);
  }
  const notable = result.peers.filter((p) => p.status !== 'ok');
  if (notable.length) {
    console.log('\nPeer dependencies needing attention:');
    for (const p of notable) {
      console.log(`  ${p.status.padEnd(8)} ${p.package} → ${p.peer} ${p.range}${p.peerVersion ? ` (resolved ${p.peerVersion})` : ''}`);
    }
  } else if (result.peers.length) {
    console.log('\nAll peer dependencies within the set are compatible.');
  }
  for (const e of result.errors) console.error(`error: ${e.spec}: ${e.error}`);
}

process.exit(result.errors.length || conflicts.length ? 1 : 0);
