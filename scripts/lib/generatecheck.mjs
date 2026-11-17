// Mechanical checks on the generated agent setup (spec 5.3, and the drift / quality checks of
// spec 7.1–7.3 that can be decided by code): CLAUDE.md size and placeholders, commands and paths
// that exist, subagents with explicit tools and a read-only reviewer, skills with descriptions,
// path-scoped rules, every applicable review rule of the stack packs covered, safe settings with
// existing hook scripts, CONTRIBUTING.md consistent with the hooks.

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { placeholders } from './doccheck.mjs';
import { parseFrontMatter, parsePack } from './packs.mjs';
import { TASK_COMMAND, TOOLCHAIN, definedTasks, detectToolchain } from './toolchains.mjs';

// A folder with no files anywhere inside it: git doesn't track it.
const isEmptyDir = (abs) =>
  statSync(abs).isDirectory() && readdirSync(abs).every((n) => isEmptyDir(join(abs, n)));

export const CLAUDE_MD_MAX_LINES = 200;
export const REQUIRED_AGENTS = ['reviewer', 'tester', 'docs-keeper'];
const WRITE_TOOLS = ['Write', 'Edit', 'MultiEdit', 'NotebookEdit'];
const PATH_ROOTS = /^(?:docs|src|design|tests?|scripts|supabase|public|lib|app|prompts|evals|addons|scenes|assets|integration_test|\.claude|\.github|\.husky)\//;

const read = (root, f) => (existsSync(join(root, f)) ? readFileSync(join(root, f), 'utf8') : null);
const list = (v) => (Array.isArray(v) ? v : String(v ?? '').split(/[,\s]+/)).map((s) => s.trim()).filter(Boolean);

function mdFiles(root, dir) {
  const abs = join(root, dir);
  if (!existsSync(abs)) return [];
  return readdirSync(abs).flatMap((n) => {
    const rel = `${dir}/${n}`;
    if (statSync(join(root, rel)).isDirectory()) return mdFiles(root, rel);
    return n.endsWith('.md') ? [rel] : [];
  });
}

// Review rules from the project's stack packs, minus those the scaffold record marks not applicable.
export function applicableReviewRules(root) {
  const dir = join(root, '.keelwright/stack-packs');
  const ids = new Map();
  if (existsSync(dir)) {
    for (const f of readdirSync(dir).filter((n) => n.endsWith('.md'))) {
      for (const r of parsePack(readFileSync(join(dir, f), 'utf8')).rules) ids.set(r.id, (r.enforce ?? '').split(/[:\s]/)[0].toLowerCase());
    }
  }
  const record = read(root, '.keelwright/scaffold.md') ?? '';
  const notApplied = record.split(/^## /m).find((s) => s.startsWith('Pack rules not applied')) ?? '';
  const excluded = new Set([...notApplied.matchAll(/\b([A-Z]+-\d{2})\b/g)].map((m) => m[1]));
  // "PLAYWRIGHT-09, -10" style ranges in the record
  for (const m of notApplied.matchAll(/\b([A-Z]+)-(\d{2})((?:,\s*-\d{2})+)/g)) for (const n of m[3].matchAll(/-(\d{2})/g)) excluded.add(`${m[1]}-${n[1]}`);
  const review = [...ids].filter(([, kind]) => kind === 'review').map(([id]) => id).filter((id) => !excluded.has(id));
  return { all: new Set(ids.keys()), review, excluded };
}

export function checkGenerated(root) {
  const issues = [];
  const add = (area, issue) => issues.push({ area, issue });
  const toolchain = detectToolchain(root) ?? 'node';
  const runner = TOOLCHAIN[toolchain].runner;
  const tasks = new Set(definedTasks(root, toolchain));

  // --- CLAUDE.md -------------------------------------------------------------------
  const claude = read(root, 'CLAUDE.md');
  if (!claude) add('claude-md', 'no CLAUDE.md');
  else {
    const lines = claude.split('\n').length;
    if (lines > CLAUDE_MD_MAX_LINES) add('claude-md', `CLAUDE.md has ${lines} lines (limit ${CLAUDE_MD_MAX_LINES}) — move path-specific guidance to .claude/rules/ and procedures to skills`);
    if (!/docs\/decisions/.test(claude)) add('claude-md', 'CLAUDE.md doesn\'t say where ADRs live');
    for (const a of REQUIRED_AGENTS) if (!claude.includes(a)) add('claude-md', `CLAUDE.md doesn't mention the ${a} agent`);
  }

  // --- texts the agents read: placeholders, commands, paths ------------------------------
  const texts = ['CLAUDE.md', 'CONTRIBUTING.md', ...mdFiles(root, '.claude')].filter((f) => read(root, f) !== null);
  for (const f of texts) {
    const text = read(root, f);
    for (const p of placeholders(text)) add('placeholders', `${f}:${p.line}: ${p.issue}`);
    for (const m of text.matchAll(TASK_COMMAND)) {
      if (m[1] !== runner) add('commands', `${f}: "${m[0]}" — this project runs its tasks with ${runner ? `"${runner} <task>"` : 'no task runner'}`);
      else if (!tasks.has(m[2])) add('commands', `${f}: "${m[0]}" — no such ${toolchain === 'node' ? 'script in package.json' : 'task'}`);
    }
    for (const m of text.matchAll(/`([^`\s]+)`/g)) {
      const p = m[1].replace(/[.,;:)]+$/, '');
      // Only things that look like files (an extension) or folders (a trailing slash): branch names
      // such as `docs/adr-analytics` share the same prefixes.
      if (!PATH_ROOTS.test(p) || /[*<>{}$…]/.test(p) || !/(\.[a-z0-9]+|\/)$/i.test(p)) continue;
      const abs = join(root, p.replace(/\/$/, ''));
      if (!existsSync(abs)) add('paths', `${f}: \`${p}\` doesn't exist`);
      else if (isEmptyDir(abs)) add('paths', `${f}: \`${p}\` is an empty folder — git doesn't keep it, so a fresh clone won't have it; add a \`.gitkeep\``);
    }
  }

  // --- subagents --------------------------------------------------------------------------
  for (const name of REQUIRED_AGENTS) {
    const text = read(root, `.claude/agents/${name}.md`);
    if (!text) {
      add('agents', `no .claude/agents/${name}.md`);
      continue;
    }
    const fm = parseFrontMatter(text) ?? {};
    if (fm.name !== name) add('agents', `${name}.md: front matter name should be "${name}"`);
    if (!fm.description || fm.description.length < 40) add('agents', `${name}.md: description is missing or too short to know when to use it`);
    if (!fm.tools) add('agents', `${name}.md: no tools list — without one it inherits every tool`);
    if (name === 'reviewer') {
      const granted = list(fm.tools).filter((t) => WRITE_TOOLS.includes(t));
      if (granted.length) add('agents', `reviewer.md: the reviewer must be read-only but has ${granted.join(', ')}`);
      const denied = list(fm.disallowedTools);
      if (!['Write', 'Edit'].every((t) => denied.includes(t))) add('agents', 'reviewer.md: disallowedTools should include Write and Edit');
    }
  }

  // --- skills -----------------------------------------------------------------------------
  const skillsDir = join(root, '.claude/skills');
  const skills = existsSync(skillsDir) ? readdirSync(skillsDir).filter((n) => existsSync(join(skillsDir, n, 'SKILL.md'))) : [];
  if (!skills.length) add('skills', 'no skills in .claude/skills/');
  for (const s of skills) {
    const fm = parseFrontMatter(read(root, `.claude/skills/${s}/SKILL.md`)) ?? {};
    if (!fm.description || fm.description.length < 40) add('skills', `${s}: description is missing or too short to trigger reliably`);
    else if (fm.description.length > 1536) add('skills', `${s}: description is over 1,536 characters and will be cut`);
  }

  // --- rules ------------------------------------------------------------------------------
  const ruleFiles = mdFiles(root, '.claude/rules');
  if (!ruleFiles.length) add('rules', 'no rules in .claude/rules/');
  let ruleText = claude ?? '';
  for (const f of ruleFiles) {
    const text = read(root, f);
    ruleText += `\n${text}`;
    if (/^---\n/.test(text)) {
      const fm = parseFrontMatter(text);
      if (!fm) add('rules', `${f}: front matter doesn't parse — the rule would load unscoped`);
      else for (const k of Object.keys(fm)) if (k !== 'paths') add('rules', `${f}: "${k}" in front matter is ignored by Claude Code (only paths is read)`);
    }
  }
  const { all, review } = applicableReviewRules(root);
  for (const id of review) if (!new RegExp(`\\b${id}\\b`).test(ruleText)) add('rules', `stack-pack review rule ${id} is not in CLAUDE.md or .claude/rules/`);
  for (const m of ruleText.matchAll(/\b([A-Z]+-\d{2})\b/g)) {
    if (all.size && /^[A-Z]{3,}-\d{2}$/.test(m[1]) && !/^(?:FR|SC|BL|TD|EV|US|NFR|API)-/.test(m[1]) && !all.has(m[1])) add('rules', `${m[1]} is cited but no stack pack defines it`);
  }

  // --- settings and hooks -------------------------------------------------------------------
  const settingsText = read(root, '.claude/settings.json');
  if (!settingsText) add('settings', 'no .claude/settings.json');
  else {
    let settings = null;
    try {
      settings = JSON.parse(settingsText);
    } catch (err) {
      add('settings', `.claude/settings.json is not valid JSON: ${err.message}`);
    }
    if (settings) {
      for (const a of settings.permissions?.allow ?? []) if (/^Bash(\(\*\)|\(\* ?\*?\))?$/.test(a)) add('settings', `permission "${a}" allows every shell command`);
      const commands = JSON.stringify(settings.hooks ?? {});
      for (const m of commands.matchAll(/\.claude\/hooks\/([\w.-]+)/g)) if (!existsSync(join(root, '.claude/hooks', m[1]))) add('settings', `hook script .claude/hooks/${m[1]} doesn't exist`);
      if (!/guard-files/.test(commands)) add('settings', 'no PreToolUse guard (accepted ADRs, generated files, secrets)');
    }
  }
  // Hook config: which formatter, linter and check the hooks run (Node.js projects may rely on the defaults).
  const hookConfig = read(root, '.claude/hooks/config.json');
  if (hookConfig === null && toolchain !== 'node' && toolchain !== 'editor') add('settings', `no .claude/hooks/config.json — without it the hooks run the Node.js defaults, not the ${toolchain} tools (node "<plugin root>/scripts/toolchains.mjs" hook-config ${toolchain})`);
  if (hookConfig !== null) {
    try {
      const cfg = JSON.parse(hookConfig);
      const cmd = cfg.check?.run?.join(' ') ?? '';
      const m = /^(npm run|uv run poe|just) ([\w:-]+)/.exec(cmd.replace(/ --silent$/, ''));
      if (m && !tasks.has(m[2])) add('settings', `.claude/hooks/config.json runs "${m[0]}" on stop, but there is no such task`);
    } catch (err) {
      add('settings', `.claude/hooks/config.json is not valid JSON: ${err.message}`);
    }
  }
  if (!/settings\.local\.json/.test(read(root, '.gitignore') ?? '')) add('settings', '.gitignore doesn\'t ignore .claude/settings.local.json');

  // --- CONTRIBUTING.md --------------------------------------------------------------------------
  const contributing = read(root, 'CONTRIBUTING.md');
  if (!contributing) add('contributing', 'no CONTRIBUTING.md');
  else {
    if (!/^<!-- keelwright:/.test(contributing)) add('contributing', 'CONTRIBUTING.md has no keelwright metadata comment on its first line');
    const conventional = /config-conventional/.test(['commitlint.config.js', 'commitlint.config.mjs', 'commitlint.config.cjs', '.commitlintrc.json'].map((f) => read(root, f) ?? '').join(''));
    const preCommit = /conventional-pre-commit/.test(read(root, '.pre-commit-config.yaml') ?? '');
    if ((conventional || preCommit) && !/Conventional Commits/i.test(contributing)) add('contributing', `${conventional ? 'commitlint' : 'the commit-msg hook'} enforces Conventional Commits but CONTRIBUTING.md doesn't say so`);
  }
  return issues;
}
