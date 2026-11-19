// Drives one eval run: a headless Claude Code session with the plugin loaded, in a fresh folder
// outside this repository, answering the interview from the case and approving gates until the
// case's stop gate. Every claude call goes through `invoke` so it can be replaced in tests.
//
// /adopt cases (`"mode": "adopt"`) start from the case's `repo/` folder, committed to a fresh git
// repository, and record a hash of every file before and after, so graders can check that the
// run changed nothing it shouldn't and that every file it cites exists.

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFileSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { claudeInvoke } from '../../scripts/lib/claude.mjs';
import { next } from '../../scripts/lib/state.mjs';

export { claudeInvoke };

const MAX_CALLS = 8;

const readState = (dir) => {
  const p = join(dir, '.keelwright/state.json');
  return existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : null;
};

// What to say next, from the pipeline state; null when the run is finished.
export function nextMessage(state, c, answersUsed, { call = 1 } = {}) {
  // /adopt asks whether to work on a new branch before it creates the state; the eval stays put.
  if (!state && c.mode === 'adopt' && call === 1) return { message: 'Stay on the current branch and continue.' };
  if (!state) return { message: null, stop: 'no state after the first call' };
  const n = next(state);
  if (n.action === 'review') {
    if (n.gate >= c.stopAtGate) return { message: null, stop: `reached gate ${n.gate}` };
    // A fresh session: the pipeline resumes from its files, and carrying the earlier steps' context into
    // the approval multiplies its cost (found in the esn-fm run: a two-minute approval cost $16).
    return { message: `Approve gate ${n.gate}. Keep open questions as they are.`, fresh: true };
  }
  if (n.action === 'run' && state.steps[n.step].status === 'in_progress' && n.step === 'interview') {
    const answer = c.answers[answersUsed];
    return { message: answer ?? 'Decide later for everything that is still open, and continue.', usedAnswer: answer !== undefined };
  }
  if (n.action === 'run' && c.mode === 'adopt' && n.step === 'gaps' && state.steps.gaps.status === 'in_progress') return { message: c.gapsAnswer ?? 'Apply every proposed fix, and continue.' };
  if (n.action === 'run') return { message: 'Continue.' };
  return { message: null, stop: 'pipeline complete' };
}

// sha256 of every file under root (git metadata excluded), by relative path.
export function snapshot(root) {
  const out = {};
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      if (name === '.git' || name === 'node_modules') continue;
      const abs = join(dir, name);
      if (statSync(abs).isDirectory()) walk(abs);
      else out[relative(root, abs).split('\\').join('/')] = createHash('sha256').update(readFileSync(abs)).digest('hex');
    }
  };
  walk(root);
  return out;
}

function prepareAdopt(c, work) {
  cpSync(join(c.dir, 'repo'), work, { recursive: true });
  const git = (...args) => execFileSync('git', ['-c', 'user.name=KeelWright eval', '-c', 'user.email=eval@keelwright.invalid', ...args], { cwd: work, stdio: 'ignore' });
  git('init', '-q', '-b', 'main');
  git('add', '-A');
  git('commit', '-qm', 'chore: the project before /adopt');
}

export async function runCase(c, { pluginDir, outDir, invoke = claudeInvoke, model = null, log = () => {} }) {
  const work = mkdtempSync(join(tmpdir(), `keelwright-eval-${c.name}-`));
  const adopt = c.mode === 'adopt';
  if (adopt) prepareAdopt(c, work);
  else copyFileSync(join(c.dir, 'input.md'), join(work, 'input.md'));
  const before = adopt ? snapshot(work) : null;
  const calls = [];
  let session = null;
  let answersUsed = 0;
  let stop = null;
  let message = adopt ? '/keelwright:adopt' : '/keelwright:kickoff input.md';
  let lastSignature = null;
  let fresh = false;

  for (let i = 0; i < MAX_CALLS && message; i++) {
    if (fresh) {
      // Re-open the gate in a new session, then approve it there.
      const open = adopt ? '/keelwright:adopt' : '/keelwright:kickoff';
      log(`  call ${i + 1}: ${open} (fresh session)`);
      const g = await invoke({ cwd: work, prompt: open, pluginDir, resume: null, model });
      calls.push({ prompt: open, cost: g.total_cost_usd ?? 0, turns: g.num_turns ?? null, error: Boolean(g.is_error), reply: String(g.result ?? '').slice(-2000) });
      session = g.session_id ?? null;
    }
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
    if (signature === lastSignature && !(adopt && !state && i === 0)) {
      stop = 'stalled: the state did not change';
      break;
    }
    lastSignature = signature;
    const step = nextMessage(state, c, answersUsed, { call: i + 1 });
    if (step.usedAnswer) answersUsed++;
    message = step.message;
    fresh = Boolean(step.fresh);
    stop = step.stop ?? null;
  }
  if (!stop && message) stop = `stopped after ${MAX_CALLS} calls`;

  // Keep what the run produced for grading and inspection, then drop the temporary folder.
  mkdirSync(outDir, { recursive: true });
  for (const p of ['.keelwright', 'docs', 'design', 'evals/data', ...(adopt ? ['CLAUDE.md', '.claude', 'CONTRIBUTING.md'] : [])]) {
    if (existsSync(join(work, p))) cpSync(join(work, p), join(outDir, p), { recursive: true });
  }
  if (adopt) {
    // Every file before and after the run; ADR folders outside docs/ are kept too.
    mkdirSync(join(outDir, '.eval'), { recursive: true });
    writeFileSync(join(outDir, '.eval/files.json'), `${JSON.stringify({ before, after: snapshot(work) }, null, 2)}\n`);
    const adrFolder = c.expect?.adrFolder;
    if (adrFolder && !adrFolder.startsWith('docs/') && existsSync(join(work, adrFolder))) cpSync(join(work, adrFolder), join(outDir, adrFolder), { recursive: true });
  }
  rmSync(work, { recursive: true, force: true });
  return { calls, stop, cost: calls.reduce((s, x) => s + x.cost, 0) };
}
