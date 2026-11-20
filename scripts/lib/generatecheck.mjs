// Mechanical checks on the generated agent setup (spec 5.3, and the drift / quality checks of
// spec 7.1–7.3 that can be decided by code): CLAUDE.md size and placeholders, commands and paths
// that exist, subagents with explicit tools and a read-only reviewer, skills with descriptions,
// path-scoped rules, every applicable review rule of the stack packs covered, safe settings with
// existing hook scripts, CONTRIBUTING.md consistent with the hooks.

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { FRAMEWORK_EDITIONS, placeholders } from './doccheck.mjs';
import { parseFrontMatter, parsePack } from './packs.mjs';
import { analyse } from './analyse.mjs';
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

// /adopt: commands are the project's own (`pnpm verify`, `make lint`, `tox run -e style`, and in a
// workspace repo `npm run lint --workspace backend`, `pnpm --filter web dev`). Only command-looking
// text inside backticks or code blocks is read, so prose ("make sure") isn't a task. Each command
// is reduced to the form analyse.mjs gives its tasks, then looked up.
const PM_BUILTINS = new Set(['install', 'i', 'ci', 'add', 'remove', 'rm', 'dlx', 'exec', 'why', 'update', 'up', 'upgrade', 'outdated', 'audit', 'create', 'init', 'link', 'publish', 'config', 'store', 'list', 'ls', 'import', 'dedupe', 'run', 'workspace', 'workspaces', 'dev:all']);
const W = '([\\w./@-]+)';
const T = '([\\w:][\\w:.-]*)';
const RUN_FORMS = [
  // npm run S [--workspace W | -w W | --workspaces], npm --workspace W run S
  [new RegExp(`\\bnpm (?:(?:--workspace[= ]|-w ?)${W} )?run(?:-script)? ${T}(?:\\s+(?:(?:--workspace[= ]|-w ?)${W}|(--workspaces|-ws)\\b))?`, 'g'), (m) => ({ runner: 'npm', task: m[2], ws: m[1] ?? m[3] ?? null, all: Boolean(m[4]) })],
  [new RegExp(`\\bpnpm (?:(?:--filter[= ]|-F ?)${W} )?(?:run )?${T}`, 'g'), (m) => ({ runner: 'pnpm', task: m[2], ws: m[1] ?? null })],
  [new RegExp(`\\byarn (?:workspace ${W} )?(?:run )?${T}`, 'g'), (m) => ({ runner: 'yarn', task: m[2], ws: m[1] ?? null })],
  [new RegExp(`\\bbun run (?:--filter[= ]${W} )?${T}`, 'g'), (m) => ({ runner: 'bun run', task: m[2], ws: m[1] ?? null })],
  [/\b(uv run poe|poetry run poe|pdm run poe|pdm run|just|make|tox run -e|tox -e|nox -s|composer) ([\w:.\/-]+)/g, (m) => ({ runner: { 'tox -e': 'tox run -e' }[m[1]] ?? m[1], task: m[2], ws: null })],
];

function codeText(text) {
  const fences = [...text.matchAll(/```[\s\S]*?```/g)].map((m) => m[0]);
  const spans = [...text.replace(/```[\s\S]*?```/g, '').matchAll(/`([^`\n]+)`/g)].map((m) => m[1]);
  return [...fences, ...spans].join('\n');
}

// The commands an adopted project accepts: its tasks' `run` forms, plus — in a workspace repo — a
// workspace's script by name or path, and `npm run S --workspaces` for a script some workspace has.
export function allowedRuns(facts) {
  const allowed = new Set([...facts.tasks.defined.map((t) => t.run), ...Object.values(facts.tasks.contract)]);
  for (const w of facts.workspaces ?? []) {
    for (const t of w.tasks.defined) {
      allowed.add(t.run);
      for (const id of new Set([w.path, w.name])) {
        allowed.add(`npm run ${t.name} --workspace ${id}`);
        allowed.add(`pnpm --filter ${id} ${t.name}`);
        allowed.add(`yarn workspace ${id} ${t.name}`);
        allowed.add(`bun run --filter ${id} ${t.name}`);
      }
      allowed.add(`npm run ${t.name} --workspaces`);
    }
  }
  return allowed;
}

export function adoptCommandIssues(text, allowed) {
  const out = [];
  const code = codeText(text);
  for (const [re, parse] of RUN_FORMS) {
    for (const m of code.matchAll(re)) {
      const { runner, task, ws, all } = parse(m);
      if (['pnpm', 'yarn'].includes(runner) && !ws && PM_BUILTINS.has(task)) continue;
      if (runner === 'composer' && PM_BUILTINS.has(task)) continue;
      const run =
        runner === 'npm' ? `npm run ${task}${all ? ' --workspaces' : ws ? ` --workspace ${ws}` : ''}`
        : runner === 'pnpm' ? (ws ? `pnpm --filter ${ws} ${task}` : `pnpm ${task}`)
        : runner === 'yarn' ? (ws ? `yarn workspace ${ws} ${task}` : `yarn ${task}`)
        : runner === 'bun run' ? (ws ? `bun run --filter ${ws} ${task}` : `bun run ${task}`)
        : `${runner} ${task}`;
      if (!allowed.has(run)) out.push(`"${m[0].trim()}" — not one of this project's tasks`);
    }
  }
  return [...new Set(out)];
}

// Review rules from the project's stack packs, minus those the scaffold record (/kickoff) or the
// generate record marks not applicable — in /adopt, also the rules the user set aside at gate 2.
export function applicableReviewRules(root) {
  const dir = join(root, '.keelwright/stack-packs');
  const ids = new Map();
  if (existsSync(dir)) {
    for (const f of readdirSync(dir).filter((n) => n.endsWith('.md'))) {
      for (const r of parsePack(readFileSync(join(dir, f), 'utf8')).rules) ids.set(r.id, (r.enforce ?? '').split(/[:\s]/)[0].toLowerCase());
    }
  }
  const notApplied = ['.keelwright/scaffold.md', '.keelwright/generate.md']
    .map((f) => (read(root, f) ?? '').split(/^## /m).find((s) => s.startsWith('Pack rules not applied')) ?? '')
    .join('\n');
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
  let mode = 'kickoff';
  try {
    mode = JSON.parse(read(root, '.keelwright/state.json') ?? '{}').mode ?? 'kickoff';
  } catch {
    // no readable state: a kickoff project
  }
  // /adopt: the project's own task commands and ADR folder.
  const facts = mode === 'adopt' ? analyse(root) : null;
  const allowed = facts ? allowedRuns(facts) : null;
  const adrDir = (facts?.docs.adrDirs[0]?.dir ?? 'docs/decisions/').replace(/\/$/, '');

  // --- CLAUDE.md -------------------------------------------------------------------
  const claude = read(root, 'CLAUDE.md');
  if (!claude) add('claude-md', 'no CLAUDE.md');
  else {
    const lines = claude.split('\n').length;
    if (lines > CLAUDE_MD_MAX_LINES) add('claude-md', `CLAUDE.md has ${lines} lines (limit ${CLAUDE_MD_MAX_LINES}) — move path-specific guidance to .claude/rules/ and procedures to skills`);
    if (!claude.includes(adrDir)) add('claude-md', `CLAUDE.md doesn't say where ADRs live (${adrDir}/)`);
    for (const a of REQUIRED_AGENTS) if (!claude.includes(a)) add('claude-md', `CLAUDE.md doesn't mention the ${a} agent`);
  }

  // --- texts the agents read: placeholders, commands, paths ------------------------------
  const texts = ['CLAUDE.md', 'CONTRIBUTING.md', ...mdFiles(root, '.claude')].filter((f) => read(root, f) !== null);
  for (const f of texts) {
    const text = read(root, f);
    for (const p of placeholders(text)) add('placeholders', `${f}:${p.line}: ${p.issue}`);
    if (allowed) for (const i of adoptCommandIssues(text, allowed)) add('commands', `${f}: ${i}`);
    else for (const m of text.matchAll(TASK_COMMAND)) {
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

  // --- security reviewer (spec 5.3): only when the project has a threat model ----------------
  const threatModel = read(root, 'docs/security/threat-model.md');
  if (threatModel) {
    const defined = new Set([...threatModel.matchAll(/^\|\s*(SEC-\d{2})\s*\|/gm)].map((m) => m[1]));
    const framework = /^framework:\s*"?([^"\n#]+?)"?\s*(#.*)?$/m.exec(threatModel)?.[1]?.trim();
    const agent = read(root, '.claude/agents/security-reviewer.md');
    if (!agent) add('agents', 'the project has a threat model but no .claude/agents/security-reviewer.md');
    else {
      const fm = parseFrontMatter(agent) ?? {};
      if (fm.name !== 'security-reviewer') add('agents', 'security-reviewer.md: front matter name should be "security-reviewer"');
      if (!fm.description || fm.description.length < 40) add('agents', 'security-reviewer.md: description is missing or too short to know when to use it');
      if (!fm.tools) add('agents', 'security-reviewer.md: no tools list — without one it inherits every tool');
      const granted = list(fm.tools).filter((t) => WRITE_TOOLS.includes(t));
      if (granted.length) add('agents', `security-reviewer.md: the security reviewer must be read-only but has ${granted.join(', ')}`);
      if (!['Write', 'Edit'].every((t) => list(fm.disallowedTools).includes(t))) add('agents', 'security-reviewer.md: disallowedTools should include Write and Edit');
      const edition = FRAMEWORK_EDITIONS.find((e) => agent.includes(e));
      if (!edition) add('agents', `security-reviewer.md doesn't name a framework edition (${framework ?? 'the threat model\'s framework'})`);
      else if (framework && edition !== framework && !agent.includes(framework)) add('agents', `security-reviewer.md names ${edition}, but the threat model's framework is ${framework}`);
      const cited = new Set([...agent.matchAll(/\bSEC-\d{2}\b/g)].map((m) => m[0]));
      for (const id of cited) if (!defined.has(id)) add('agents', `security-reviewer.md cites ${id}, which the threat model doesn't define`);
      if (defined.size && !cited.size) add('agents', 'security-reviewer.md names none of the threat model\'s SEC- risks');
    }
    if (!existsSync(join(root, '.claude/skills/security-review/SKILL.md'))) add('skills', 'the project has a threat model but no security-review skill');
    const rules = read(root, '.claude/rules/security.md');
    if (!rules) add('rules', 'the project has a threat model but no .claude/rules/security.md');
    else if (!list(parseFrontMatter(rules)?.paths).length) add('rules', '.claude/rules/security.md has no paths — scope it to the threat model\'s sensitive paths');
    if (claude && !claude.includes('security-reviewer')) add('claude-md', 'CLAUDE.md doesn\'t mention the security-reviewer agent');
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

  // A project with a UI: the implement skill looks at the result running, not only at passing
  // tests (found in the skier-portfolio run: tests green, a first review listing nine broken
  // scroll animations).
  const projectType = (() => {
    try {
      return JSON.parse(read(root, '.keelwright/state.json') ?? 'null')?.projectType ?? null;
    } catch {
      return null;
    }
  })();
  const implement = ['implement-story', 'implement-change'].find((s) => skills.includes(s));
  if (implement && ['web', 'mobile', 'game'].includes(projectType) && !/look at it running/i.test(read(root, `.claude/skills/${implement}/SKILL.md`) ?? '')) {
    add('skills', `${implement}: no "Look at it running" step — a ${projectType} project's changes are checked on screen (and scrolled through, for motion), not only by tests`);
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
    if (all.size && /^[A-Z]{3,}-\d{2}$/.test(m[1]) && !/^(?:FR|SC|BL|TD|EV|US|NFR|API|SEC)-/.test(m[1]) && !all.has(m[1])) add('rules', `${m[1]} is cited but no stack pack defines it`);
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
  if (hookConfig === null && mode === 'adopt') add('settings', 'no .claude/hooks/config.json — without it the hooks run `npm run check`, not this project\'s tools (node "<plugin root>/scripts/analyse.mjs" --hook-config)');
  else if (hookConfig === null && toolchain !== 'node' && toolchain !== 'editor') add('settings', `no .claude/hooks/config.json — without it the hooks run the Node.js defaults, not the ${toolchain} tools (node "<plugin root>/scripts/toolchains.mjs" hook-config ${toolchain})`);
  if (hookConfig !== null) {
    try {
      const cfg = JSON.parse(hookConfig);
      const cmd = (cfg.check?.run?.join(' ') ?? '').replace(/ --silent$/, '');
      if (allowed) {
        if (cmd && !allowed.has(cmd)) add('settings', `.claude/hooks/config.json runs "${cmd}" on stop, but it isn't one of this project's tasks`);
      } else {
        const m = /^(npm run|uv run poe|just) ([\w:-]+)/.exec(cmd);
        if (m && !tasks.has(m[2])) add('settings', `.claude/hooks/config.json runs "${m[0]}" on stop, but there is no such task`);
      }
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
