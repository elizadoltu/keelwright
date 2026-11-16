// Runs headless Claude Code (`claude -p`) and returns its JSON result
// ({ result, total_cost_usd, session_id, num_turns, is_error }). Used by the eval runner and
// the maintainer scripts.

import { spawn } from 'node:child_process';

export const TOOLS = ['Bash(node:*)', 'Read', 'Write', 'Edit', 'Glob', 'Grep', 'WebSearch', 'WebFetch'];
export const MAX_TURNS_PER_CALL = 150;

// Runs `claude -p` and returns its JSON result ({ result, total_cost_usd, session_id, is_error, … }).
export function claudeInvoke({ cwd, prompt, pluginDir, resume = null, model = null, tools = TOOLS, maxTurns = MAX_TURNS_PER_CALL, timeoutMs = 30 * 60_000 }) {
  const args = ['-p', prompt, '--output-format', 'json', '--max-turns', String(maxTurns)];
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
