// Drives one eval run: a headless Claude Code session with the plugin loaded, in a fresh folder
// outside this repository, answering the interview from the case and approving gates until the
// case's stop gate. Every claude call goes through `invoke` so it can be replaced in tests.
//
// /adopt cases (`"mode": "adopt"`) start from the case's `repo/` folder, committed to a fresh git
// repository, and record a hash of every file before and after, so graders can check that the
// run changed nothing it shouldn't and that every file it cites exists.
//
// Phase 3 cases (spec 9, step 7) start from a repository the same way:
//   "mode": "command"  runs one command (`command`) and then each of `replies`, in one session —
//                      /start's routing, the doctor and audit mode;
//   "mode": "deep"     runs the security audit's deep review (lib/deep.mjs) under the case's
//                      `maxCost`, then the mechanical audit — no command, no session.
// `repo` points at another folder (e.g. a shared fixture in evals/fixtures/); `history` is a list
// of commits made before the repository's own files ({ message, files: { path: text | null } }),
// so a secret can live only in the history; `secret` is that secret in pieces, joined at run time
// into `{{SECRET}}`, so no secret-looking string is committed to KeelWright. Every run gets its own
// profile folder (KEELWRIGHT_HOME): the case's `profile`, or one already asked and skipped.

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFileSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative } from 'node:path';
import { claudeInvoke } from '../../scripts/lib/claude.mjs';
import * as Deep from '../../scripts/lib/deep.mjs';
import * as Sec from '../../scripts/lib/security.mjs';
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

export const REPO_MODES = new Set(['adopt', 'command', 'deep']);

export function prepareRepo(c, work) {
  const git = (...args) => execFileSync('git', ['-c', 'user.name=KeelWright eval', '-c', 'user.email=eval@keelwright.invalid', ...args], { cwd: work, stdio: 'ignore' });
  git('init', '-q', '-b', 'main');
  const secret = (c.secret ?? []).join('');
  for (const commit of c.history ?? []) {
    for (const [f, text] of Object.entries(commit.files)) {
      if (text === null) {
        rmSync(join(work, f), { force: true });
        // Like a clone: a folder left empty by the deletion is gone too.
        for (let d = dirname(f); d !== '.' && readdirSync(join(work, d)).length === 0; d = dirname(d)) rmSync(join(work, d), { recursive: true });
      }
      else {
        mkdirSync(join(work, f, '..'), { recursive: true });
        writeFileSync(join(work, f), text.replaceAll('{{SECRET}}', secret));
      }
    }
    git('add', '-A');
    git('commit', '-q', '--allow-empty', '-m', commit.message);
  }
  cpSync(join(c.dir, c.repo ?? 'repo'), work, { recursive: true });
  git('add', '-A');
  git('commit', '-qm', c.mode === 'adopt' ? 'chore: the project before /adopt' : 'chore: the project as it is');
}

// The run's own profile folder: never the developer's ~/.keelwright.
function profileHome(c) {
  const dir = mkdtempSync(join(tmpdir(), 'keelwright-eval-profile-'));
  writeFileSync(join(dir, 'profile.json'), `${JSON.stringify({ ...(c.profile ?? {}), asked: true }, null, 2)}\n`);
  return dir;
}

// A deep case: the deep review under `maxCost`, then the mechanical audit, both recorded in
// .keelwright/security/. The review's calls go through `invoke` like every other call.
async function runDeep(c, work, { pluginDir, invoke, model, log }) {
  const call = ({ prompt, system, schema, maxBudgetUsd }) => invoke({ cwd: work, prompt, system, schema, maxBudgetUsd, model, tools: Deep.TOOLS, disallowedTools: Deep.DISALLOWED_TOOLS, maxTurns: 60, timeoutMs: 20 * 60_000 });
  const result = await Deep.run(work, { pluginRoot: pluginDir, maxCost: c.maxCost, invoke: call, log: (m) => log(`  ${m}`) });
  Deep.save(work, result);
  const audit = await Sec.audit(work, { offline: Boolean(c.offline) });
  Sec.record(work, audit);
  return { calls: result.areas.map((a) => ({ prompt: `deep: ${a.name}`, cost: a.cost ?? 0, error: a.status === 'failed', reply: a.reason ?? a.status })), stop: `deep review: ${result.areas.filter((a) => a.status === 'reviewed').length} areas reviewed`, cost: result.cost };
}

export async function runCase(c, { pluginDir, outDir, invoke = claudeInvoke, model = null, log = () => {} }) {
  const work = mkdtempSync(join(tmpdir(), `keelwright-eval-${c.name}-`));
  const adopt = c.mode === 'adopt';
  const fromRepo = REPO_MODES.has(c.mode);
  if (fromRepo) prepareRepo(c, work);
  else copyFileSync(join(c.dir, 'input.md'), join(work, 'input.md'));
  const before = fromRepo ? snapshot(work) : null;
  const home = profileHome(c);
  const env = { KEELWRIGHT_HOME: home };
  const userInvoke = invoke;
  invoke = (args) => userInvoke({ ...args, env });
  const calls = [];
  let session = null;
  let answersUsed = 0;
  let stop = null;
  let message = adopt ? '/keelwright:adopt' : '/keelwright:kickoff input.md';
  let lastSignature = null;
  let fresh = false;
  let deepCost = 0;

  if (c.mode === 'deep') {
    const r = await runDeep(c, work, { pluginDir, invoke, model, log });
    calls.push(...r.calls);
    stop = r.stop;
    deepCost = r.cost;
    message = null;
  } else if (c.mode === 'command') {
    // One session: the command, then each scripted reply.
    for (const [i, prompt] of [c.command, ...(c.replies ?? [])].entries()) {
      log(`  call ${i + 1}: ${prompt.slice(0, 70)}`);
      const r = await invoke({ cwd: work, prompt, pluginDir, resume: session, model });
      session = r.session_id ?? session;
      calls.push({ prompt, cost: r.total_cost_usd ?? 0, turns: r.num_turns ?? null, error: Boolean(r.is_error), reply: String(r.result ?? '').slice(-2000) });
      if (r.is_error && !session) {
        stop = `claude failed: ${String(r.result).slice(0, 200)}`;
        break;
      }
    }
    stop ??= 'replies done';
    message = null;
  }

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
  rmSync(home, { recursive: true, force: true });

  // Keep what the run produced for grading and inspection, then drop the temporary folder.
  mkdirSync(outDir, { recursive: true });
  for (const p of ['.keelwright', 'docs', 'design', 'evals/data', ...(fromRepo ? ['CLAUDE.md', '.claude', 'CONTRIBUTING.md'] : [])]) {
    if (existsSync(join(work, p))) cpSync(join(work, p), join(outDir, p), { recursive: true });
  }
  if (fromRepo) {
    // Every file before and after the run; ADR folders outside docs/ are kept too.
    mkdirSync(join(outDir, '.eval'), { recursive: true });
    writeFileSync(join(outDir, '.eval/files.json'), `${JSON.stringify({ before, after: snapshot(work) }, null, 2)}\n`);
    const adrFolder = c.expect?.adrFolder;
    if (adrFolder && !adrFolder.startsWith('docs/') && existsSync(join(work, adrFolder))) cpSync(join(work, adrFolder), join(outDir, adrFolder), { recursive: true });
  }
  rmSync(work, { recursive: true, force: true });
  return { calls, stop, cost: c.mode === 'deep' ? deepCost : calls.reduce((s, x) => s + x.cost, 0) };
}
