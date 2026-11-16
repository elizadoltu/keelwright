#!/usr/bin/env node
// KeelWright evaluation suite (spec 8.3).
//
//   node evals/run.mjs [options]
//
//   --case <name>         run one case (repeatable; default: all in evals/cases)
//   --runs <n>            runs per case (default 3)
//   --stop-at <gate>      override every case's stop gate (e.g. 1 for a cheaper smoke run)
//   --max-cost <usd>      stop starting new runs once spent (default 30)
//   --concurrency <n>     runs in parallel (default 1)
//   --threshold <0..1>    minimum pass rate per grader and case (default 0.67)
//   --model <m>           model for the runs (default: Claude Code's default)
//   --judge-model <m>     model for the judges (default sonnet)
//   --judge-votes <n>     votes per judge, majority wins (default 3)
//   --no-judges           skip the model-graded checks
//   --regrade <dir>       grade the runs in an earlier results folder again, without new runs
//   --out <dir>           results folder (default evals/results/<timestamp>)
//
// Each run executes `claude -p` with this plugin in a temporary folder outside the repository,
// so the runs cost money. Exit codes: 0 all graders at or above the threshold, 1 below,
// 2 stopped early by the cost limit.

import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { httpFetchJson } from '../scripts/lib/versions.mjs';
import { GRADERS, JUDGES, gradeVersions, judgePrompt, loadRun, majority, parseVerdict } from './lib/graders.mjs';
import { claudeInvoke, runCase } from './lib/runner.mjs';
import { summarise, toMarkdown } from './lib/summary.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CASES = join(ROOT, 'evals', 'cases');

function parseArgs(argv) {
  const o = { cases: [], runs: 3, stopAt: null, maxCost: 30, concurrency: 1, threshold: 0.67, model: null, judgeModel: 'sonnet', judgeVotes: 3, judges: true, out: null, regrade: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const v = () => argv[++i];
    if (a === '--case') o.cases.push(v());
    else if (a === '--runs') o.runs = Number(v());
    else if (a === '--stop-at') o.stopAt = Number(v());
    else if (a === '--max-cost') o.maxCost = Number(v());
    else if (a === '--concurrency') o.concurrency = Math.max(1, Number(v()));
    else if (a === '--threshold') o.threshold = Number(v());
    else if (a === '--model') o.model = v();
    else if (a === '--judge-model') o.judgeModel = v();
    else if (a === '--no-judges') o.judges = false;
    else if (a === '--judge-votes') o.judgeVotes = Math.max(1, Number(v()));
    else if (a === '--regrade') o.regrade = resolve(v());
    else if (a === '--out') o.out = resolve(v());
    else if (a === '--help' || a === '-h') {
      console.log(readFileSync(fileURLToPath(import.meta.url), 'utf8').split('\n').slice(1, 20).map((l) => l.replace(/^\/\/ ?/, '')).join('\n'));
      process.exit(0);
    } else throw new Error(`unknown option ${a}`);
  }
  return o;
}

function loadCases(names) {
  const all = readdirSync(CASES).filter((n) => existsSync(join(CASES, n, 'case.json'))).sort();
  const unknown = names.filter((n) => !all.includes(n));
  if (unknown.length) throw new Error(`unknown case(s): ${unknown.join(', ')} (cases: ${all.join(', ')})`);
  return (names.length ? names : all).map((name) => {
    const dir = join(CASES, name);
    return { name, dir, input: readFileSync(join(dir, 'input.md'), 'utf8'), ...JSON.parse(readFileSync(join(dir, 'case.json'), 'utf8')) };
  });
}

async function grade(c, dir, o) {
  const run = loadRun(dir);
  const grades = {};
  for (const [name, fn] of Object.entries(GRADERS)) {
    const r = fn(run, c.expect ?? {}, c);
    if (r) grades[name] = r;
  }
  try {
    grades.versions = await gradeVersions(run, httpFetchJson);
  } catch (err) {
    grades.versions = { pass: false, detail: `could not check: ${err.message}` };
  }
  let judgeCost = 0;
  if (o.judges) {
    for (const name of c.judges ?? []) {
      const spec = JUDGES[name]?.(run, c);
      if (!spec) continue;
      const votes = await Promise.all(
        Array.from({ length: o.judgeVotes }, () => claudeInvoke({ cwd: tmpdir(), prompt: judgePrompt(spec), model: o.judgeModel, tools: [], maxTurns: 1, timeoutMs: 5 * 60_000 })),
      );
      judgeCost += votes.reduce((s, v) => s + (v.total_cost_usd ?? 0), 0);
      grades[`judge:${name}`] = majority(votes.map((v) => parseVerdict(v.result)));
    }
  }
  return { grades, judgeCost };
}

// Re-grade earlier runs (e.g. after changing a grader or judge) — no new runs, only judge costs.
async function regrade(o) {
  const cases = Object.fromEntries(loadCases([]).map((c) => [c.name, c]));
  const results = [];
  for (const name of readdirSync(o.regrade).filter((n) => cases[n])) {
    for (const runDir of readdirSync(join(o.regrade, name)).filter((n) => n.startsWith('run-')).sort()) {
      const dir = join(o.regrade, name, runDir);
      const previous = JSON.parse(readFileSync(join(dir, 'run.json'), 'utf8'));
      const { grades, judgeCost } = await grade(cases[name], dir, o);
      const r = { ...previous, cost: previous.cost + judgeCost, grades };
      writeFileSync(join(dir, 'run.json'), `${JSON.stringify(r, null, 2)}\n`);
      results.push(r);
      console.log(`${name} ${runDir}: ${Object.entries(grades).filter(([, g]) => !g.pass).map(([k]) => k).join(', ') || 'all graders passed'}`);
    }
  }
  const summary = summarise(results, { threshold: o.threshold });
  writeFileSync(join(o.regrade, 'summary.json'), `${JSON.stringify(summary, null, 2)}\n`);
  const md = toMarkdown(summary);
  writeFileSync(join(o.regrade, 'summary.md'), md);
  console.log(`\n${md}`);
  process.exit(summary.ok ? 0 : 1);
}

async function main() {
  const o = parseArgs(process.argv.slice(2));
  if (o.regrade) return regrade(o);
  const cases = loadCases(o.cases).map((c) => (o.stopAt ? { ...c, stopAtGate: o.stopAt } : c));
  const out = o.out ?? join(ROOT, 'evals', 'results', new Date().toISOString().replace(/[:.]/g, '-'));
  mkdirSync(out, { recursive: true });

  const jobs = cases.flatMap((c) => Array.from({ length: o.runs }, (_, i) => ({ c, n: i + 1 })));
  const results = [];
  let spent = 0;
  let stoppedByCost = false;

  async function worker() {
    while (jobs.length) {
      if (spent >= o.maxCost) {
        stoppedByCost = true;
        return;
      }
      const { c, n } = jobs.shift();
      const dir = join(out, c.name, `run-${n}`);
      console.log(`▶ ${c.name} run ${n}`);
      const started = Date.now();
      const run = await runCase(c, { pluginDir: ROOT, outDir: dir, model: o.model, log: console.log });
      spent += run.cost;
      const { grades, judgeCost } = await grade(c, dir, o);
      spent += judgeCost;
      const r = { case: c.name, run: n, stop: run.stop, cost: run.cost + judgeCost, minutes: Math.round((Date.now() - started) / 6000) / 10, calls: run.calls, grades };
      writeFileSync(join(dir, 'run.json'), `${JSON.stringify(r, null, 2)}\n`);
      results.push(r);
      const failed = Object.entries(grades).filter(([, g]) => !g.pass).map(([k]) => k);
      console.log(`  ${run.stop}; $${r.cost.toFixed(2)}; ${failed.length ? `failed: ${failed.join(', ')}` : 'all graders passed'}`);
    }
  }
  await Promise.all(Array.from({ length: o.concurrency }, worker));

  const summary = summarise(results, { threshold: o.threshold, stoppedByCost, maxCost: o.maxCost });
  writeFileSync(join(out, 'summary.json'), `${JSON.stringify(summary, null, 2)}\n`);
  const md = toMarkdown(summary);
  writeFileSync(join(out, 'summary.md'), md);
  console.log(`\n${md}\nResults: ${out}`);
  process.exit(stoppedByCost ? 2 : summary.ok ? 0 : 1);
}

main().catch((err) => {
  console.error(`error: ${err.message}`);
  process.exit(1);
});
