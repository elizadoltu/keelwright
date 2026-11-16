// Pipeline state for /kickoff (spec 5.1.2), kept in <project>/.keelwright/state.json.
// Every change to the state goes through these functions; nothing edits the JSON by hand.

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';
import {
  ALWAYS_DOCUMENTS,
  DOCUMENT_KEYS,
  PROJECT_TYPES,
  SATISFIED,
  STEPS,
  downstreamOf,
  getStep,
  stepsInGate,
} from './pipeline.mjs';

export const STATE_DIR = '.keelwright';
export const STATE_FILE = 'state.json';
const HASH_IGNORE = new Set(['.git', 'node_modules', STATE_DIR]);
const MARKER = '[NEEDS CLARIFICATION';

export class StateError extends Error {}

const fail = (message) => {
  throw new StateError(message);
};

// ---------------------------------------------------------------------------
// Load / save
// ---------------------------------------------------------------------------

export const statePath = (root) => join(root, STATE_DIR, STATE_FILE);

export function exists(root) {
  return existsSync(statePath(root));
}

export function load(root) {
  if (!exists(root)) fail(`no KeelWright state in ${root} — run /kickoff to start`);
  return JSON.parse(readFileSync(statePath(root), 'utf8'));
}

export function save(root, state) {
  mkdirSync(join(root, STATE_DIR), { recursive: true });
  writeFileSync(statePath(root), `${JSON.stringify(state, null, 2)}\n`);
}

export function create({ version, now, projectType = null, input = null }) {
  if (projectType !== null) checkProjectType(projectType);
  return {
    keelwright: version,
    createdAt: now,
    projectType,
    input,
    currentStep: STEPS[0].name,
    documents: [...ALWAYS_DOCUMENTS],
    steps: Object.fromEntries(STEPS.map((s) => [s.name, { status: 'pending' }])),
    stack: {},
  };
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

const statusOf = (state, name) => state.steps[name].status;
const depsSatisfied = (state, name) => getStep(name).deps.every((d) => SATISFIED.has(statusOf(state, d)));

// What /kickoff should do next:
//   { action: 'run', step }       run this step
//   { action: 'review', gate }    all steps of this gate are waiting for the user's approval
//   { action: 'complete' }        every step is finished
export function next(state) {
  let reviewGate = null;
  for (const step of STEPS) {
    const status = statusOf(state, step.name);
    if (SATISFIED.has(status)) continue;
    if (status === 'awaiting_review') {
      reviewGate ??= step.gate;
      continue;
    }
    if (depsSatisfied(state, step.name)) return { action: 'run', step: step.name, optional: step.optional };
    break;
  }
  if (reviewGate !== null) return { action: 'review', gate: reviewGate, steps: stepsInGate(reviewGate) };
  return { action: 'complete' };
}

// Steps downstream of `name` that already ran (or were skipped) and would have to be regenerated.
export function affectedDownstream(state, name) {
  return downstreamOf(name).filter((n) => statusOf(state, n) !== 'pending');
}

// ---------------------------------------------------------------------------
// Transitions
// ---------------------------------------------------------------------------

function markStale(state, names) {
  for (const n of names) {
    if (statusOf(state, n) !== 'pending') state.steps[n] = { ...state.steps[n], status: 'stale' };
  }
}

// Start a step, or re-run one that already ran. A re-run marks every step after it as stale.
export function start(state, name, { now }) {
  getStep(name);
  if (!depsSatisfied(state, name)) {
    const missing = getStep(name).deps.filter((d) => !SATISFIED.has(statusOf(state, d)));
    fail(`cannot start "${name}": waiting for ${missing.join(', ')}`);
  }
  const rerun = statusOf(state, name) !== 'pending';
  const stale = rerun ? affectedDownstream(state, name) : [];
  markStale(state, stale);
  state.steps[name] = { ...state.steps[name], status: 'in_progress', startedAt: now };
  state.currentStep = name;
  return { rerun, stale };
}

// Record a finished step and the files it produced. Gated steps wait for review;
// other steps are done immediately and their outputs are hashed for edit detection.
export function complete(state, name, outputs, { root, now }) {
  const step = getStep(name);
  if (statusOf(state, name) !== 'in_progress') fail(`cannot complete "${name}": it is ${statusOf(state, name)}, not in_progress`);
  const files = normaliseOutputs(root, outputs);
  if (step.gate === null) {
    state.steps[name] = { status: 'done', at: now, outputs: hashAll(root, files) };
  } else {
    state.steps[name] = { status: 'awaiting_review', at: now, outputs: Object.fromEntries(files.map((f) => [f, null])) };
  }
  state.currentStep = next(state).step ?? name;
  return state.steps[name];
}

// Skip a step that has nothing to produce for this project (e.g. `design` for a CLI without UI).
export function skip(state, name, reason, { now }) {
  if (!reason) fail('a reason is required to skip a step');
  const status = statusOf(state, name);
  if (!['pending', 'stale', 'in_progress'].includes(status)) fail(`cannot skip "${name}": it is ${status}`);
  if (!depsSatisfied(state, name)) fail(`cannot skip "${name}": its dependencies are not finished`);
  state.steps[name] = { status: 'skipped', at: now, reason };
  state.currentStep = next(state).step ?? name;
  return state.steps[name];
}

// Approve a review gate. Outputs are hashed now, so edits made during the review are the baseline.
export function approve(state, gate, { root, now }) {
  const names = stepsInGate(gate);
  if (!names.length) fail(`unknown gate "${gate}"`);
  const pending = next(state);
  if (pending.action !== 'review' || pending.gate !== gate) fail(`gate ${gate} is not waiting for review`);
  const approved = [];
  for (const n of names) {
    if (statusOf(state, n) !== 'awaiting_review') continue;
    const files = Object.keys(state.steps[n].outputs ?? {});
    state.steps[n] = { status: 'approved', at: state.steps[n].at, approvedAt: now, outputs: hashAll(root, files) };
    approved.push(n);
  }
  state.currentStep = next(state).step ?? state.currentStep;
  return approved;
}

// Files of finished steps that changed since they were approved (or done), and the steps
// downstream that would have to be regenerated because of it.
export function changes(state, root) {
  const changed = [];
  for (const step of STEPS) {
    const entry = state.steps[step.name];
    if (!['approved', 'done'].includes(entry.status) || !entry.outputs) continue;
    for (const [file, recorded] of Object.entries(entry.outputs)) {
      const current = hashPath(root, file);
      if (current === recorded) continue;
      changed.push({ step: step.name, file, change: current === null ? 'deleted' : 'modified' });
    }
  }
  const changedSteps = [...new Set(changed.map((c) => c.step))];
  const affected = [...new Set(changedSteps.flatMap((s) => affectedDownstream(state, s)))];
  return { changed, changedSteps, affected: STEPS.map((s) => s.name).filter((n) => affected.includes(n)) };
}

// Accept the user's edits as the new baseline. Unless keepDownstream is set, the steps after
// the edited ones are marked stale so /kickoff regenerates them.
export function acceptChanges(state, root, { keepDownstream = false } = {}) {
  const { changedSteps, affected } = changes(state, root);
  for (const n of changedSteps) {
    const files = Object.keys(state.steps[n].outputs);
    state.steps[n] = { ...state.steps[n], outputs: hashAll(root, files) };
  }
  if (!keepDownstream) markStale(state, affected);
  state.currentStep = next(state).step ?? state.currentStep;
  return { accepted: changedSteps, stale: keepDownstream ? [] : affected };
}

// Open [NEEDS CLARIFICATION: …] markers in the outputs of steps waiting for review.
export function markers(state, root) {
  const found = [];
  for (const step of STEPS) {
    const entry = state.steps[step.name];
    if (entry.status !== 'awaiting_review') continue;
    for (const file of Object.keys(entry.outputs ?? {})) {
      for (const f of listFiles(root, file)) {
        const lines = readFileSync(join(root, f), 'utf8').split('\n');
        lines.forEach((text, i) => {
          if (text.includes(MARKER)) found.push({ step: step.name, file: f, line: i + 1, text: text.trim() });
        });
      }
    }
  }
  return found;
}

// ---------------------------------------------------------------------------
// Setters
// ---------------------------------------------------------------------------

function checkProjectType(type) {
  if (!PROJECT_TYPES.includes(type)) fail(`unknown project type "${type}" (types: ${PROJECT_TYPES.join(', ')})`);
}

export function setProjectType(state, type) {
  checkProjectType(type);
  state.projectType = type;
}

export function setDocuments(state, keys) {
  const unknown = keys.filter((k) => !DOCUMENT_KEYS.includes(k));
  if (unknown.length) fail(`unknown document keys: ${unknown.join(', ')} (keys: ${DOCUMENT_KEYS.join(', ')})`);
  const missing = ALWAYS_DOCUMENTS.filter((k) => !keys.includes(k));
  if (missing.length) fail(`the document set must include the "always" documents: ${missing.join(', ')}`);
  state.documents = DOCUMENT_KEYS.filter((k) => keys.includes(k));
}

export function setInput(state, input) {
  state.input = input;
}

export function mergeStack(state, patch) {
  if (typeof patch !== 'object' || patch === null || Array.isArray(patch)) fail('stack must be a JSON object');
  state.stack = { ...state.stack, ...patch };
}

// ---------------------------------------------------------------------------
// Files and hashes
// ---------------------------------------------------------------------------

function normaliseOutputs(root, outputs) {
  if (!outputs.length) fail('list at least one output file');
  const files = outputs.map((o) => {
    const abs = resolve(root, o);
    const rel = relative(root, abs);
    if (rel === '' || rel.startsWith('..') || isAbsolute(rel)) fail(`output "${o}" is outside the project`);
    if (!existsSync(abs)) fail(`output "${o}" does not exist`);
    return rel.split(sep).join('/');
  });
  return [...new Set(files)].sort();
}

function listFiles(root, path) {
  const abs = join(root, path);
  if (!existsSync(abs)) return [];
  if (!statSync(abs).isDirectory()) return [path];
  return readdirSync(abs, { withFileTypes: true })
    .filter((e) => !HASH_IGNORE.has(e.name))
    .sort((a, b) => a.name.localeCompare(b.name))
    .flatMap((e) => listFiles(root, `${path}/${e.name}`));
}

// sha256 of a file, or of every file in a directory (path + content); null when it is missing.
export function hashPath(root, path) {
  const abs = join(root, path);
  if (!existsSync(abs)) return null;
  const hash = createHash('sha256');
  if (statSync(abs).isDirectory()) {
    for (const f of listFiles(root, path)) {
      hash.update(`${f}\0`);
      hash.update(readFileSync(join(root, f)));
      hash.update('\0');
    }
  } else {
    hash.update(readFileSync(abs));
  }
  return `sha256:${hash.digest('hex')}`;
}

function hashAll(root, files) {
  return Object.fromEntries(files.map((f) => [f, hashPath(root, f)]));
}
