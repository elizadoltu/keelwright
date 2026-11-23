#!/usr/bin/env node
// KeelWright state CLI — the only way /kickoff and /adopt read or change .keelwright/state.json.
// Run `node state.mjs help` for usage.

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MODES, downstreamOf, stepsOf } from './lib/pipeline.mjs';
import * as M from './lib/metrics.mjs';
import * as S from './lib/state.mjs';
import { roleById, roleByTag } from './lib/profile.mjs';

// --role takes a role id (`project-manager`) or its tag (`pm`); absent means no role.
function roleOf(value) {
  if (typeof value !== 'string' || !value) return null;
  const role = roleById(value) ?? roleByTag(value);
  if (!role) throw new S.StateError(`unknown role "${value}"`);
  return role;
}
const roleId = (value) => roleOf(value)?.id ?? null;

const HELP = `Usage: node state.mjs <command> [args] [--root <dir>] [--json]

  init [--mode kickoff|adopt] [--type <t>] [--input <text>]
                                       Create .keelwright/state.json (fails if it exists)
  mode                                 The pipeline this project follows (kickoff | adopt; "none" without state)
  status                               Steps, next action, edited files and open markers
  next [--role <role>]                 What /kickoff or /adopt should do next; --role: this person's next step, or a hand-off
  steps [--mode <m>]                   The pipeline definition (this project's, or --mode's)
  downstream <step>                    Steps that a re-run of <step> would mark stale
  start <step> [--role <role>]         Start (or re-run) a step; --role: refuse another role's step
  complete <step> <file|dir>...        Finish a step and record its outputs
  skip <step> --reason <text>          Skip a step with nothing to produce
  approve <gate> [--role <role>]       Approve a review gate (kickoff: 1–3, adopt: 1–2); --role: only this person's steps in it
  changes                              Approved files edited since approval
  accept-changes [--keep-downstream]   Take the edits as the new baseline
  markers [--role <tag>] [--all]      Open [NEEDS CLARIFICATION] markers in files under review; --role: yours first; --all: in every document
  scope                                Stories and features changed since they were approved (possible change requests)
  metric <step> <name> <n|+n>          Set (or add to) a step-specific counter in metrics.json
  rate <file> <rating>                 Rate a document: as-is | small-edits | rewritten | deleted
  report [--write]                     Run report from metrics.json (--write: also .keelwright/report.md)
  set project-type <t>
  set documents <key,key,...>
  set input <text>
  set stack '<json object>'            Merged into state.stack (nested objects key by key)`;

const VALUE_FLAGS = new Set(['--root', '--type', '--input', '--reason', '--mode', '--role']);

function parse(argv) {
  const positional = [];
  const flags = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (VALUE_FLAGS.has(arg)) {
      if (i + 1 >= argv.length) throw new S.StateError(`${arg} needs a value`);
      flags[arg.slice(2)] = argv[++i];
    } else if (arg.startsWith('--')) {
      flags[arg.slice(2)] = true;
    } else {
      positional.push(arg);
    }
  }
  return { positional, flags };
}

function pluginVersion() {
  const manifest = join(dirname(fileURLToPath(import.meta.url)), '..', '.claude-plugin', 'plugin.json');
  return existsSync(manifest) ? JSON.parse(readFileSync(manifest, 'utf8')).version : 'unknown';
}

function formatStatus(state, root) {
  const lines = [];
  lines.push(`Mode: /${S.modeOf(state)}   Project type: ${state.projectType ?? '(not set)'}   Documents: ${state.documents.join(', ')}`);
  lines.push('');
  for (const step of stepsOf(S.modeOf(state))) {
    const entry = state.steps[step.name];
    const gate = step.gate ? `gate ${step.gate}` : '';
    const note = entry.reason ? ` — ${entry.reason}` : '';
    const marker = step.name === state.currentStep ? '›' : ' ';
    lines.push(`${marker} ${step.name.padEnd(13)} ${entry.status.padEnd(16)} ${gate.padEnd(7)}${note}`);
  }
  lines.push('');
  lines.push(`Next: ${describeNext(S.next(state))}`);
  const { changed, affected } = S.changes(state, root);
  if (changed.length) {
    lines.push('');
    lines.push('Edited since approval:');
    for (const c of changed) lines.push(`  ${c.file} (${c.step}, ${c.change})`);
    lines.push(`Would regenerate: ${affected.length ? affected.join(', ') : 'nothing downstream'}`);
  }
  const open = S.markers(state, root);
  if (open.length) {
    lines.push('');
    lines.push(`Open [NEEDS CLARIFICATION] markers: ${open.length}`);
    for (const m of open) lines.push(`  ${m.file}:${m.line}`);
  }
  return lines.join('\n');
}

function describeNext(n) {
  if (n.action === 'handoff') return `hand off: ${n.waiting.map((w) => `${w.action === 'review' ? `review of ${w.step}` : w.step}${w.optional ? ' (optional)' : ''} → ${w.roles.join(' / ')}`).join('; ')}`;
  if (n.action === 'run') return `run step "${n.step}"${n.optional ? ' (optional)' : ''}`;
  if (n.action === 'review') return `review gate ${n.gate} (${n.steps.join(', ')})`;
  return 'all steps finished';
}

// Turn validation errors from the metrics module into short CLI errors.
function wrap(fn) {
  try {
    return fn();
  } catch (err) {
    throw new S.StateError(err.message);
  }
}

function run(argv) {
  const { positional, flags } = parse(argv);
  const [command, ...args] = positional;
  const root = resolve(flags.root ?? process.cwd());
  const now = new Date().toISOString();
  const out = (human, data) => console.log(flags.json ? JSON.stringify(data, null, 2) : human);
  const need = (n, usage) => {
    if (args.length < n) throw new S.StateError(`usage: ${usage}`);
  };
  const mutate = (fn) => {
    const state = S.load(root);
    const result = fn(state);
    S.save(root, state);
    return result;
  };
  // Metrics never block the pipeline: a failure is reported and the command still succeeds.
  const measure = (fn) => {
    try {
      const metrics = M.loadMetrics(root);
      fn(metrics);
      M.saveMetrics(root, metrics);
    } catch (err) {
      console.error(`warning: metrics not recorded: ${err.message}`);
    }
  };
  const markerCount = (state, step) => S.markers(state, root).filter((m) => m.step === step).length;

  switch (command) {
    case undefined:
    case 'help':
      return console.log(HELP);

    case 'init': {
      if (S.exists(root)) throw new S.StateError(`state already exists at ${S.statePath(root)}`);
      const state = S.create({ version: pluginVersion(), now, mode: flags.mode ?? 'kickoff', projectType: flags.type ?? null, input: flags.input ?? null });
      S.save(root, state);
      return out(`Created ${S.statePath(root)}`, state);
    }

    case 'status': {
      const state = S.load(root);
      if (flags.json) {
        return out(null, { ...state, next: S.next(state), changes: S.changes(state, root), markers: S.markers(state, root) });
      }
      return console.log(formatStatus(state, root));
    }

    case 'next': {
      const n = S.nextFor(S.load(root), roleId(flags.role));
      return out(describeNext(n), n);
    }

    case 'mode': {
      const mode = S.exists(root) ? S.modeOf(S.load(root)) : 'none';
      return out(mode, { mode });
    }

    case 'steps': {
      const mode = flags.mode ?? (S.exists(root) ? S.modeOf(S.load(root)) : 'kickoff');
      if (!MODES.includes(mode)) throw new S.StateError(`unknown mode "${mode}" (modes: ${MODES.join(', ')})`);
      const steps = stepsOf(mode);
      return out(steps.map((s) => `${s.name}  deps: ${s.deps.join(', ') || '—'}  gate: ${s.gate ?? '—'}`).join('\n'), steps);
    }

    case 'downstream': {
      need(1, 'downstream <step>');
      const state = S.exists(root) ? S.load(root) : null;
      const all = downstreamOf(args[0], state ? S.modeOf(state) : 'kickoff');
      const affected = state ? S.affectedDownstream(state, args[0]) : [];
      return out(
        `Downstream of ${args[0]}: ${all.join(', ') || 'none'}\nWould be marked stale: ${affected.join(', ') || 'none'}`,
        { downstream: all, affected },
      );
    }

    case 'start': {
      need(1, 'start <step>');
      const r = mutate((state) => S.start(state, args[0], { now, role: roleId(flags.role) }));
      measure((m) => M.recordStart(m, args[0], { now, ...r }));
      return out(`Started ${args[0]}${r.stale.length ? `; marked stale: ${r.stale.join(', ')}` : ''}`, r);
    }

    case 'complete': {
      need(2, 'complete <step> <file|dir>...');
      let startedAtBefore;
      try {
        startedAtBefore = M.loadMetrics(root).steps?.[args[0]]?.startedAt;
      } catch {
        // metrics are best-effort
      }
      let markers = 0;
      const entry = mutate((state) => {
        const e = S.complete(state, args[0], args.slice(1), { root, now });
        markers = markerCount(state, args[0]);
        return e;
      });
      measure((m) => M.recordComplete(m, root, args[0], entry, { now, markers }));
      const late = M.startedLate(root, Object.keys(entry.outputs ?? {}), startedAtBefore);
      if (late) console.error(`warning: every output of ${args[0]} was written before \`start ${args[0]}\` — run \`start\` before a step's work, or its time isn't measured`);
      return out(`${args[0]}: ${entry.status}`, entry);
    }

    case 'skip': {
      need(1, 'skip <step> --reason <text>');
      const entry = mutate((state) => S.skip(state, args[0], flags.reason, { now }));
      measure((m) => M.recordSkip(m, args[0], { now, reason: entry.reason }));
      return out(`${args[0]}: skipped (${entry.reason})`, entry);
    }

    case 'approve': {
      need(1, 'approve <gate>');
      const gate = Number(args[0]);
      const markersByStep = {};
      const outputsByStep = {};
      const approved = mutate((state) => {
        for (const step of Object.keys(state.steps)) {
          if (state.steps[step].status !== 'awaiting_review') continue;
          markersByStep[step] = markerCount(state, step);
          outputsByStep[step] = Object.keys(state.steps[step].outputs ?? {});
        }
        return S.approve(state, gate, { root, now, role: roleId(flags.role) });
      });
      measure((m) => M.recordApprove(m, root, gate, approved, { now, markersByStep, outputsByStep }));
      return out(`Gate ${gate} approved: ${approved.join(', ')}`, { gate, approved });
    }

    case 'changes': {
      const c = S.changes(S.load(root), root);
      const human = c.changed.length
        ? [...c.changed.map((x) => `${x.file} (${x.step}, ${x.change})`), `Would regenerate: ${c.affected.join(', ') || 'nothing downstream'}`].join('\n')
        : 'No approved files were edited.';
      return out(human, c);
    }

    case 'accept-changes': {
      const keepDownstream = Boolean(flags['keep-downstream']);
      const r = mutate((state) => S.acceptChanges(state, root, { keepDownstream }));
      measure((m) => M.recordAcceptChanges(m, { now, ...r, keepDownstream }));
      return out(`Accepted edits in: ${r.accepted.join(', ') || 'nothing'}; marked stale: ${r.stale.join(', ') || 'nothing'}`, r);
    }

    case 'scope': {
      const c = S.scopeChanges(S.load(root), root);
      return out(c.length ? c.map((x) => x.text).join('\n') : 'No change to the agreed scope.', c);
    }

    case 'markers': {
      // --role <tag>: this person's questions (their role's and untagged ones) first, then the
      // ones waiting on another role (spec 5.7).
      const m = S.markers(S.load(root), root, { all: Boolean(flags.all) });
      const tag = roleOf(flags.role)?.tag ?? null;
      if (!tag) return out(m.length ? m.map((x) => `${x.file}:${x.line}  ${x.text}`).join('\n') : 'No open markers.', m);
      const mine = m.filter((x) => !x.role || x.role === tag);
      const waiting = m.filter((x) => x.role && x.role !== tag);
      const text = [mine.length ? mine.map((x) => `${x.file}:${x.line}  ${x.text}`).join('\n') : 'No open markers for you.', ...(waiting.length ? ['', `Waiting on others: ${[...new Set(waiting.map((x) => x.role))].map((r) => `${r} ${waiting.filter((x) => x.role === r).length}`).join(', ')}`] : [])].join('\n');
      return out(text, { mine, waiting });
    }

    case 'metric': {
      need(3, 'metric <step> <name> <n|+n>');
      const mode = S.modeOf(S.load(root));
      const metrics = M.loadMetrics(root);
      const value = wrap(() => M.recordCounter(metrics, args[0], args[1], args[2], mode));
      M.saveMetrics(root, metrics);
      return out(`${args[0]}.${args[1]} = ${value}`, { step: args[0], name: args[1], value });
    }

    case 'rate': {
      need(2, 'rate <file> <as-is|small-edits|rewritten|deleted>');
      S.load(root);
      const metrics = M.loadMetrics(root);
      wrap(() => M.recordRating(metrics, args[0], args[1], { now }));
      M.saveMetrics(root, metrics);
      return out(`Rated ${args[0]}: ${args[1]}`, { file: args[0], rating: args[1] });
    }

    case 'report': {
      const state = S.load(root);
      const metrics = M.loadMetrics(root);
      const text = M.report(metrics, state);
      if (flags.write) writeFileSync(join(root, S.STATE_DIR, 'report.md'), text);
      return out(text, metrics);
    }

    case 'set': {
      need(2, 'set <project-type|documents|input|stack> <value>');
      const [field, value] = args;
      mutate((state) => {
        if (field === 'project-type') S.setProjectType(state, value);
        else if (field === 'documents') S.setDocuments(state, value.split(',').map((k) => k.trim()).filter(Boolean));
        else if (field === 'input') S.setInput(state, value);
        else if (field === 'stack') {
          let patch;
          try {
            patch = JSON.parse(value);
          } catch {
            throw new S.StateError('stack must be valid JSON');
          }
          S.mergeStack(state, patch);
        } else throw new S.StateError(`unknown field "${field}"`);
      });
      return out(`Set ${field}`, { field, value });
    }

    default:
      throw new S.StateError(`unknown command "${command}" — run "node state.mjs help"`);
  }
}

try {
  run(process.argv.slice(2));
} catch (err) {
  if (err instanceof S.StateError || err instanceof SyntaxError || /unknown (step|mode)/.test(err.message)) {
    console.error(`error: ${err.message}`);
    process.exit(1);
  }
  throw err;
}
