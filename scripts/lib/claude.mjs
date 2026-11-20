// Runs headless Claude Code (`claude -p`) and returns its JSON result
// ({ result, total_cost_usd, session_id, num_turns, is_error }). Used by the eval runner and
// the maintainer scripts.

import { spawn } from 'node:child_process';

// Read-only git commands too: /adopt reads the history (commit style, who introduced a decision).
export const TOOLS = ['Bash(node:*)', 'Bash(git log:*)', 'Bash(git show:*)', 'Bash(git status:*)', 'Bash(git ls-files:*)', 'Bash(git branch:*)', 'Read', 'Write', 'Edit', 'Glob', 'Grep', 'WebSearch', 'WebFetch'];
export const MAX_TURNS_PER_CALL = 150;

// Runs `claude -p` and returns its JSON result ({ result, total_cost_usd, session_id, is_error, … }).
// `schema` asks for structured output (`structured_output` in the result); `maxBudgetUsd` is a hard
// limit for the call; `disallowedTools` and `system` (appended to the system prompt) shape a
// read-only reviewer.
export function claudeInvoke({ cwd, prompt, pluginDir, resume = null, model = null, tools = TOOLS, disallowedTools = [], system = null, schema = null, maxBudgetUsd = null, maxTurns = MAX_TURNS_PER_CALL, timeoutMs = 30 * 60_000 }) {
  const args = ['-p', prompt, '--output-format', 'json', '--max-turns', String(maxTurns)];
  if (schema) args.push('--json-schema', JSON.stringify(schema));
  if (maxBudgetUsd != null) args.push('--max-budget-usd', String(maxBudgetUsd));
  if (system) args.push('--append-system-prompt', system);
  if (disallowedTools.length) args.push('--disallowedTools', ...disallowedTools);
  if (pluginDir) args.push('--plugin-dir', pluginDir);
  if (resume) args.push('--resume', resume);
  if (model) args.push('--model', model);
  if (tools.length) args.push('--allowedTools', ...tools);
  return new Promise((resolve) => {
    const child = spawn('claude', args, { cwd, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    let err = '';
    const timer = setTimeout(() => child.kill('SIGTERM'), timeoutMs);
    child.stdout.on('data', (d) => (out += d));
    child.stderr.on('data', (d) => (err += d));
    child.on('close', (code) => {
      clearTimeout(timer);
      try {
        resolve(JSON.parse(out.trim().split('\n').at(-1)));
      } catch {
        resolve({ is_error: true, result: `claude exited ${code}: ${(err || out).slice(-500)}`, total_cost_usd: 0 });
      }
    });
  });
}
