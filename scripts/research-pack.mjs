#!/usr/bin/env node
// Maintainer tool: research stack packs with headless Claude Code, following
// steps/research-pack.md, and write them to stack-packs/ (the packs shipped with the plugin).
//
//   node scripts/research-pack.mjs --shipped [--only <id>...] [--concurrency <n>] [--max-cost <usd>]
//   node scripts/research-pack.mjs --id <id> --name <name> --packages <a,b> [--out <dir>]
//
// The resolved version of each pack's primary package is looked up live (latest stable). Each
// pack runs in a temporary folder outside the repository; only a pack that passes validation is
// written. Costs money: roughly $1–3 per pack.

import { copyFileSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { claudeInvoke } from './lib/claude.mjs';
import { validatePack } from './lib/packs.mjs';
import { httpFetchJson, resolveAll } from './lib/versions.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const TOOLS = ['WebSearch', 'WebFetch', 'Read', 'Write', 'Edit', 'Glob', 'Grep', 'Bash(node:*)'];

function parseArgs(argv) {
  const o = { shipped: false, only: [], concurrency: 3, maxCost: 40, out: join(ROOT, 'stack-packs'), id: null, name: null, packages: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const v = () => argv[++i];
    if (a === '--shipped') o.shipped = true;
    else if (a === '--only') o.only.push(v());
    else if (a === '--concurrency') o.concurrency = Number(v());
    else if (a === '--max-cost') o.maxCost = Number(v());
    else if (a === '--out') o.out = resolve(v());
    else if (a === '--id') o.id = v();
    else if (a === '--name') o.name = v();
    else if (a === '--packages') o.packages = v().split(',');
    else throw new Error(`unknown option ${a}`);
  }
  return o;
}

async function researchOne(pack, o) {
  const primary = pack.packages[0].replace(/\/\*$/, '');
  const resolved = await resolveAll([primary.includes('*') ? pack.packages.find((p) => !p.includes('*')) : primary], { fetchJson: httpFetchJson });
  const version = resolved.packages[0]?.version;
  if (!version) return { id: pack.id, ok: false, cost: 0, detail: `could not resolve ${primary}: ${JSON.stringify(resolved.errors)}` };

  const work = mkdtempSync(join(tmpdir(), `keelwright-pack-${pack.id}-`));
  const outFile = join(work, `${pack.id}.md`);
  const prompt = [
    `Research one stack pack. Follow the procedure in ${join(ROOT, 'steps/research-pack.md')} exactly.`,
    '',
    `- Plugin root: ${ROOT}`,
    `- Pack id: ${pack.id}`,
    `- Name: ${pack.name}`,
    `- Packages (primary first): ${pack.packages.join(', ')}`,
    `- Resolved version of ${primary}: ${version} (major ${version.split('.')[0]})`,
    `- Template: ${join(ROOT, 'templates/stack-pack.md')}`,
    `- Output file: ${outFile}`,
    `- Today: ${new Date().toISOString().slice(0, 10)}`,
    '',
    'This pack is general-purpose (shipped with the plugin), not for one project: describe the technology as most projects should use it.',
    'Finish when the output file passes validation. Reply with one line: the number of rules and sources.',
  ].join('\n');

  const r = await claudeInvoke({ cwd: work, prompt, tools: TOOLS, maxTurns: 200, timeoutMs: 40 * 60_000 });
  let issues;
  try {
    issues = validatePack(readFileSync(outFile, 'utf8'));
  } catch {
    issues = ['no output file written'];
  }
  if (!issues.length) copyFileSync(outFile, join(o.out, `${pack.id}.md`));
  rmSync(work, { recursive: true, force: true });
  return { id: pack.id, ok: !issues.length, cost: r.total_cost_usd ?? 0, version, detail: issues.length ? issues.join('; ') : String(r.result ?? '').trim().split('\n').at(-1) };
}

async function main() {
  const o = parseArgs(process.argv.slice(2));
  let packs;
  if (o.shipped) {
    packs = JSON.parse(readFileSync(join(ROOT, 'stack-packs/shipped.json'), 'utf8')).packs;
    if (o.only.length) packs = packs.filter((p) => o.only.includes(p.id));
  } else {
    if (!o.id || !o.name || !o.packages.length) throw new Error('give --shipped, or --id, --name and --packages');
    packs = [{ id: o.id, name: o.name, packages: o.packages }];
  }
  const queue = [...packs];
  const results = [];
  let spent = 0;
  async function worker() {
    while (queue.length && spent < o.maxCost) {
      const pack = queue.shift();
      console.log(`▶ ${pack.id}`);
      const r = await researchOne(pack, o);
      spent += r.cost;
      results.push(r);
      console.log(`  ${r.ok ? 'ok  ' : 'FAIL'} ${r.id} ${r.version ?? ''} $${r.cost.toFixed(2)} — ${r.detail}`);
    }
  }
  await Promise.all(Array.from({ length: Math.max(1, o.concurrency) }, worker));
  const skipped = queue.map((p) => p.id);
  console.log(`\nTotal $${spent.toFixed(2)}; ${results.filter((r) => r.ok).length}/${packs.length} written to ${o.out}${skipped.length ? `; not started (cost limit): ${skipped.join(', ')}` : ''}`);
  process.exit(results.every((r) => r.ok) && !skipped.length ? 0 : 1);
}

main().catch((err) => {
  console.error(`error: ${err.message}`);
  process.exit(1);
});
