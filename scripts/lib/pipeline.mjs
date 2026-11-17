// The /kickoff pipeline definition (spec 5.1 and 5.1.2). Single source of truth for step
// names, order, dependencies and gates; the state CLI and its tests read it from here.

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

export const STEP_NAMES = STEPS.map((s) => s.name);

export const GATES = [...new Set(STEPS.map((s) => s.gate).filter((g) => g !== null))];

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
];

export const OPTIONAL_DOCUMENTS = ['jira', 'confluence', 'architecture-requirements'];

export const DOCUMENT_KEYS = [...ALWAYS_DOCUMENTS, ...CONDITIONAL_DOCUMENTS, ...OPTIONAL_DOCUMENTS];

export function getStep(name) {
  const step = STEPS.find((s) => s.name === name);
  if (!step) throw new Error(`unknown step "${name}" (steps: ${STEP_NAMES.join(', ')})`);
  return step;
}

// All steps that depend on `name`, directly or transitively, in pipeline order.
export function downstreamOf(name) {
  getStep(name);
  const found = new Set();
  let frontier = [name];
  while (frontier.length) {
    const next = [];
    for (const step of STEPS) {
      if (!found.has(step.name) && step.deps.some((d) => frontier.includes(d))) {
        found.add(step.name);
        next.push(step.name);
      }
    }
    frontier = next;
  }
  return STEP_NAMES.filter((n) => found.has(n));
}

export function stepsInGate(gate) {
  return STEPS.filter((s) => s.gate === gate).map((s) => s.name);
}
