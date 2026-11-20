// The pipeline definitions: /kickoff (spec 5.1, 5.1.2) and /adopt create mode (5.2.1). Single
// source of truth for step names, order, dependencies and gates; the state CLI and its tests
// read it from here. A state without a `mode` is a kickoff (states written before /adopt).

export const STEPS = [
  { name: 'interview', deps: [], gate: null, optional: false },
  { name: 'prd', deps: ['interview'], gate: 1, optional: false },
  { name: 'architecture', deps: ['prd'], gate: 2, optional: false },
  { name: 'features', deps: ['prd'], gate: 2, optional: false },
  { name: 'design', deps: ['prd'], gate: 2, optional: false },
  { name: 'research', deps: ['architecture', 'features', 'design'], gate: 3, optional: false },
  { name: 'scaffold', deps: ['research'], gate: null, optional: false },
  { name: 'generate', deps: ['scaffold'], gate: null, optional: false },
  { name: 'publish', deps: ['generate'], gate: null, optional: true },
];

// /adopt create mode: the code is the source of truth, so there is no interview, PRD or scaffold.
export const ADOPT_STEPS = [
  { name: 'analyse', deps: [], gate: 1, optional: false },
  { name: 'document', deps: ['analyse'], gate: 2, optional: false },
  { name: 'research', deps: ['analyse'], gate: 2, optional: false },
  { name: 'gaps', deps: ['document', 'research'], gate: null, optional: false },
  { name: 'generate', deps: ['gaps'], gate: null, optional: false },
  { name: 'publish', deps: ['generate'], gate: null, optional: true },
];

export const PIPELINES = { kickoff: STEPS, adopt: ADOPT_STEPS };
export const MODES = Object.keys(PIPELINES);

export function stepsOf(mode = 'kickoff') {
  const steps = PIPELINES[mode];
  if (!steps) throw new Error(`unknown mode "${mode}" (modes: ${MODES.join(', ')})`);
  return steps;
}

export const stepNames = (mode = 'kickoff') => stepsOf(mode).map((s) => s.name);

export const STEP_NAMES = stepNames('kickoff');

export const gatesOf = (mode = 'kickoff') => [...new Set(stepsOf(mode).map((s) => s.gate).filter((g) => g !== null))];

export const GATES = gatesOf('kickoff');

export const STATUSES = [
  'pending',
  'in_progress',
  'awaiting_review',
  'approved',
  'done',
  'skipped',
  'stale',
];

// A dependency is satisfied when the step finished, or was skipped because it had nothing to produce.
export const SATISFIED = new Set(['approved', 'done', 'skipped']);

export const PROJECT_TYPES = ['web', 'mobile', 'game', 'ai', 'library'];

// How a project is built and checked (reference/toolchains.md) — independent of the project type:
// an Expo app and a TypeScript library are both `node`; a Python AI service and a Python library
// are both `python`. `editor` covers engines and IDEs whose projects are created in the editor
// (Unity, Unreal, native Xcode / Android Studio apps): the scaffold writes setup instructions.
export const TOOLCHAINS = ['node', 'python', 'dart', 'rust', 'godot', 'editor'];

// Catalog keys (spec 6.0). Keys are the template names.
export const ALWAYS_DOCUMENTS = ['prd', 'adr', 'backlog', 'development-workflow'];

export const CONDITIONAL_DOCUMENTS = [
  'architecture-overview',
  'c4',
  'erd',
  'feature-breakdown',
  'visual-identity',
  'screen-flow',
  'release-checklist',
  'game-design-document',
  'asset-pipeline',
  'ai-system-design',
  'ai-eval-plan',
  'api-surface',
  'threat-model',
];

export const OPTIONAL_DOCUMENTS = ['jira', 'confluence', 'architecture-requirements'];

export const DOCUMENT_KEYS = [...ALWAYS_DOCUMENTS, ...CONDITIONAL_DOCUMENTS, ...OPTIONAL_DOCUMENTS];

// /adopt writes no PRD and no backlog: the architecture overview (as built), retroactive ADRs and
// CONTRIBUTING.md (merged with an existing one) are its baseline.
export const ADOPT_ALWAYS_DOCUMENTS = ['adr', 'architecture-overview', 'development-workflow'];

export const alwaysDocuments = (mode = 'kickoff') => (mode === 'adopt' ? ADOPT_ALWAYS_DOCUMENTS : ALWAYS_DOCUMENTS);

export function getStep(name, mode = 'kickoff') {
  const step = stepsOf(mode).find((s) => s.name === name);
  if (!step) throw new Error(`unknown step "${name}" (steps: ${stepNames(mode).join(', ')})`);
  return step;
}

// All steps that depend on `name`, directly or transitively, in pipeline order.
export function downstreamOf(name, mode = 'kickoff') {
  getStep(name, mode);
  const steps = stepsOf(mode);
  const found = new Set();
  let frontier = [name];
  while (frontier.length) {
    const next = [];
    for (const step of steps) {
      if (!found.has(step.name) && step.deps.some((d) => frontier.includes(d))) {
        found.add(step.name);
        next.push(step.name);
      }
    }
    frontier = next;
  }
  return stepNames(mode).filter((n) => found.has(n));
}

export function stepsInGate(gate, mode = 'kickoff') {
  return stepsOf(mode).filter((s) => s.gate === gate).map((s) => s.name);
}
