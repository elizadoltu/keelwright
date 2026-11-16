// Drives one eval run: a headless Claude Code session with the plugin loaded, in a fresh folder
// outside this repository, answering the interview from the case and approving gates until the
// case's stop gate. Every claude call goes through `invoke` so it can be replaced in tests.

import { copyFileSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { claudeInvoke } from '../../scripts/lib/claude.mjs';
import { next } from '../../scripts/lib/state.mjs';

export { claudeInvoke };

const MAX_CALLS = 8;

const readState = (dir) => {
  const p = join(dir, '.keelwright/state.json');
  return existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : null;
};

// What to say next, from the pipeline state; null when the run is finished.
export function nextMessage(state, c, answersUsed) {
  if (!state) return { message: null, stop: 'no state after the first call' };
  const n = next(state);
  if (n.action === 'review') {
    if (n.gate >= c.stopAtGate) return { message: null, stop: `reached gate ${n.gate}` };
    return { message: `Approve gate ${n.gate}. Keep open questions as they are.` };
  }
  if (n.action === 'run' && state.steps[n.step].status === 'in_progress' && n.step === 'interview') {
    const answer = c.answers[answersUsed];
    return { message: answer ?? 'Decide later for everything that is still open, and continue.', usedAnswer: answer !== undefined };
  }
  if (n.action === 'run') return { message: 'Continue.' };
  return { message: null, stop: 'pipeline complete' };
}

export async function runCase(c, { pluginDir, outDir, invoke = claudeInvoke, model = null, log = () => {} }) {
  const work = mkdtempSync(join(tmpdir(), `keelwright-eval-${c.name}-`));
  copyFileSync(join(c.dir, 'input.md'), join(work, 'input.md'));
  const calls = [];
  let session = null;
  let answersUsed = 0;
  let stop = null;
  let message = '/keelwright:kickoff input.md';
  let lastSignature = null;

  for (let i = 0; i < MAX_CALLS && message; i++) {
    log(`  call ${i + 1}: ${message.slice(0, 70)}`);
    const r = await invoke({ cwd: work, prompt: message, pluginDir, resume: session, model });
    session = r.session_id ?? session;
    calls.push({ prompt: message, cost: r.total_cost_usd ?? 0, turns: r.num_turns ?? null, error: Boolean(r.is_error), reply: String(r.result ?? '').slice(-2000) });
    if (r.is_error && !session) {
      stop = `claude failed: ${String(r.result).slice(0, 200)}`;
      break;
    }
    const state = readState(work);
    // A new interview round changes the interview record even when the state doesn't.
    const interviewPath = join(work, '.keelwright/interview.md');
    const signature = JSON.stringify(state?.steps ?? null) + (existsSync(interviewPath) ? readFileSync(interviewPath, 'utf8') : '');
    if (signature === lastSignature) {
      stop = 'stalled: the state did not change';
      break;
    }
    lastSignature = signature;
    const step = nextMessage(state, c, answersUsed);
    if (step.usedAnswer) answersUsed++;
    message = step.message;
    stop = step.stop ?? null;
  }
  if (!stop && message) stop = `stopped after ${MAX_CALLS} calls`;

  // Keep what the run produced for grading and inspection, then drop the temporary folder.
  mkdirSync(outDir, { recursive: true });
  for (const p of ['.keelwright', 'docs', 'design']) {
    if (existsSync(join(work, p))) cpSync(join(work, p), join(outDir, p), { recursive: true });
  }
  rmSync(work, { recursive: true, force: true });
  return { calls, stop, cost: calls.reduce((s, x) => s + x.cost, 0) };
}
