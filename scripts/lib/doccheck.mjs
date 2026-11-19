// Mechanical checks on generated documents (spec 6.1): length, leftover template placeholders,
// acceptance-criteria form and ID traceability. Steps run these before completing; the same
// checks can serve as eval graders.

const LIMITS = {
  prd: 1800,
  adr: 700,
  overview: 1300,
  features: 1200,
  'visual-identity': 1300,
  erd: 1000,
  'screen-flow': 1000,
  'release-checklist': 900,
  gdd: 1300,
  'asset-pipeline': 700,
  'ai-system-design': 1500,
  'ai-eval-plan': 1200,
  'api-surface': 1300,
  analysis: 1800,
  'adr-retro': 450,
};

const stripCode = (text) => text.replace(/```[\s\S]*?```/g, '').replace(/`[^`\n]*`/g, '');
const stripFrontMatter = (text) => text.replace(/^---\n[\s\S]*?\n---\n/, '');

export function wordCount(text) {
  return stripFrontMatter(text).split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length;
}

// Template leftovers outside code: instruction comments, <placeholders>, YYYY-MM-DD, NNNN.
export function placeholders(text) {
  const issues = [];
  const lines = text.split('\n');
  let inFence = false;
  lines.forEach((raw, i) => {
    if (/^\s*```/.test(raw)) inFence = !inFence;
    if (inFence) return;
    const line = raw.replace(/`[^`\n]*`/g, '').replace(/\[NEEDS CLARIFICATION:[^\]]*\]/g, '');
    if (/<!--(?! keelwright:)/.test(line)) issues.push({ line: i + 1, issue: 'template comment left in' });
    const tag = line.match(/<(?!https?:)[a-z][^<>]*>/i);
    if (tag && !/^<\/?(a|br|img|details|summary|sup|sub|kbd|abbr)\b/i.test(tag[0])) issues.push({ line: i + 1, issue: `placeholder ${tag[0]}` });
    if (/YYYY-MM-DD|\bNNNN\b/.test(line)) issues.push({ line: i + 1, issue: 'date or number placeholder' });
  });
  return issues;
}

function sections(text) {
  const out = {};
  let current = null;
  for (const line of text.split('\n')) {
    const h = /^##\s+(.+)$/.exec(line);
    if (h) {
      current = h[1].trim().toLowerCase();
      out[current] = [];
    } else if (current) out[current].push(line);
  }
  return out;
}

function prdChecks(text) {
  const issues = [];
  const body = stripCode(text);
  const stories = [...body.matchAll(/^###\s+(US-\d+)\b.*$/gm)].map((m) => m[1]);
  if (!stories.length) issues.push({ issue: 'no user stories (### US-n)' });

  // Acceptance criteria: every bullet under "**Acceptance criteria**" uses EARS or Given/When/Then.
  const blocks = body.split(/^###\s+/m).slice(1).map((b) => b.split(/^##\s/m)[0]);
  for (const block of blocks) {
    const id = /^(US-\d+)/.exec(block)?.[1];
    if (!id) continue;
    const ac = block.split(/\*\*Acceptance criteria\*\*/i)[1];
    const bullets = ac ? ac.split('\n').filter((l) => /^\s*[-*]\s+/.test(l)) : [];
    if (!bullets.length) issues.push({ issue: `${id} has no acceptance criteria` });
    for (const b of bullets) {
      if (!/\bSHALL\b/.test(b) && !/\bGiven\b[\s\S]*\bthen\b/i.test(b)) {
        issues.push({ issue: `${id}: criterion is not WHEN/SHALL or Given/When/Then: "${b.trim().slice(0, 80)}"` });
      }
    }
  }

  // Every FR row references an existing story.
  const fr = sections(body)['functional requirements'] ?? [];
  for (const row of fr.filter((l) => /^\|\s*FR-\d+/.test(l))) {
    const id = /FR-\d+/.exec(row)[0];
    const refs = row.match(/US-\d+/g) ?? [];
    if (!refs.length) issues.push({ issue: `${id} doesn't reference a story` });
    for (const r of refs) if (!stories.includes(r)) issues.push({ issue: `${id} references unknown ${r}` });
  }
  return issues;
}

// Rows of a Markdown table whose first cell is an ID with this prefix.
const idRows = (text, prefix) => text.split('\n').filter((l) => new RegExp(`^\\|\\s*${prefix}-\\d+\\b`).test(l));
const hasSection = (text, name) => (sections(stripCode(text))[name] ?? []).some((l) => l.trim() && !/^<!--/.test(l.trim()));
const need = (cond, issue) => (cond ? [] : [{ issue }]);

function screenFlowChecks(text) {
  return [
    ...need(idRows(text, 'S').length > 0, 'no screens (| S-01 | … rows in the screen inventory)'),
    ...need(/```mermaid/.test(text), 'no Mermaid diagram of the navigation'),
  ];
}

function gddChecks(text) {
  return [
    ...need(hasSection(text, 'core loop'), 'the core loop is missing'),
    ...need(hasSection(text, 'scope and cut list'), 'no scope and cut list'),
  ];
}

function aiSystemDesignChecks(text) {
  const issues = need(idRows(text, 'P').length > 0, 'no prompts (| P-01 | … rows)');
  // Tools table: | ID | Tool | What it does | Side effects | Needs confirmation |
  for (const row of idRows(text, 'T')) {
    const cells = row.split('|').slice(1, -1).map((c) => c.trim());
    const [id, , , effects = '', confirm = ''] = cells;
    if (effects && !/^(read-only|none|no)\b/i.test(effects) && !/^yes\b/i.test(confirm)) issues.push({ issue: `${id} has side effects (${effects}) but doesn't need confirmation — set it to "yes" or say why not` });
  }
  return issues;
}

function aiEvalPlanChecks(text) {
  const rows = idRows(text, 'EV');
  const issues = need(rows.length > 0, 'no eval criteria (| EV-001 | … rows)');
  issues.push(...need(rows.some((r) => /latency|p9\d|response time/i.test(r)), 'no latency criterion (an EV- row with a latency budget)'));
  issues.push(...need(rows.some((r) => /cost|\$|€|tokens/i.test(r)), 'no cost criterion (an EV- row with a cost budget)'));
  for (const r of rows) if (!/[<>≤≥=]|\d+\s*%/.test(r)) issues.push({ issue: `${/EV-\d+/.exec(r)[0]} has no threshold` });
  return issues;
}

function apiSurfaceChecks(text) {
  return [
    ...need(idRows(text, 'API').length > 0, 'no public API items (| API-001 | … rows)'),
    ...need(hasSection(text, 'versioning'), 'no versioning policy'),
  ];
}

// /adopt analysis (spec 5.2.1): every convention cites files that show it, and every cited file
// exists — the analysis describes the code, so a claim without evidence is an invented one.
// A cited path has a folder (`src/app.ts`, `docs/`), or is a dotfile (`.nvmrc`), or a bare file name
// with a file extension (`package.json`) — not code like `req.body` or `err.message`.
const PATHLIKE = /^[\w.@*-][\w./@*-]*(\/|\.[A-Za-z0-9*]+)$/;
const FILE_EXT = /\.(?:[cm]?[jt]sx?|json5?|jsonc|md|mdx|ya?ml|toml|ini|cfg|txt|lock|sql|prisma|py|pyi|rs|dart|go|rb|java|kts?|swift|gd|tscn|tres|css|scss|html|astro|vue|svelte|dsl|sh|env|example|xml|gradle|csv|svg|png|\*)$/i;
export function citedPaths(cell) {
  return [...cell.matchAll(/`([^`\n]+)`/g)]
    .map((m) => m[1].replace(/:\d+(-\d+)?$/, ''))
    .filter((p) => (PATHLIKE.test(p) || /^\.[\w.-]+$/.test(p)) && !/^v?\d+(\.\d+)*$|^https?:/.test(p))
    .filter((p) => p.includes('/') || /^\.[\w.-]+$/.test(p) || /^(Makefile|Dockerfile|justfile|Procfile)$/.test(p) || FILE_EXT.test(p));
}

function analysisChecks(text, { exists } = {}) {
  const issues = [];
  const conventions = idRows(text, 'C');
  issues.push(...need(conventions.length > 0, 'no conventions (| C-01 | … rows)'));
  issues.push(...need(hasSection(text, 'gaps'), 'no Gaps section'));
  for (const row of [...conventions, ...idRows(text, 'D')]) {
    const id = /\b([CD]-\d+)/.exec(row)[1];
    const paths = citedPaths(row).filter((p) => !p.includes('*'));
    if (id.startsWith('C') && !paths.length) issues.push({ issue: `${id} cites no file — name at least one file that shows it` });
    if (id.startsWith('C') && !/\b(consistent|mixed)\b/i.test(row)) issues.push({ issue: `${id} doesn't say whether the code follows it consistently or mixed` });
    if (exists) for (const p of paths) if (!exists(p)) issues.push({ issue: `${id} cites \`${p}\`, which doesn't exist` });
  }
  return issues;
}

// A retroactive ADR (/adopt `document`): says it was recorded from the code, cites files that exist,
// and leaves out what a recorder can't know rather than inventing it.
function adrRetroChecks(text, { exists } = {}) {
  const issues = [];
  issues.push(...need(/Recorded retroactively by KeelWright from the code/.test(text), 'doesn\'t say it was "Recorded retroactively by KeelWright from the code"'));
  issues.push(...need(hasSection(text, 'alternatives'), 'no Alternatives section (say "Not recorded" when none are known)'));
  const paths = citedPaths(stripFrontMatter(text)).filter((p) => !p.includes('*'));
  issues.push(...need(paths.length > 0, 'cites no file — the Decision section names the files that show it'));
  if (exists) for (const p of paths) if (!exists(p)) issues.push({ issue: `cites \`${p}\`, which doesn't exist` });
  return issues;
}

const TYPE_CHECKS = {
  analysis: analysisChecks,
  'adr-retro': adrRetroChecks,
  prd: prdChecks,
  'screen-flow': screenFlowChecks,
  gdd: gddChecks,
  'ai-system-design': aiSystemDesignChecks,
  'ai-eval-plan': aiEvalPlanChecks,
  'api-surface': apiSurfaceChecks,
};

export const DOC_TYPES = Object.keys(LIMITS);

export function checkDocument(text, { type = null, maxWords = null, exists = null } = {}) {
  const limit = maxWords ?? (type ? LIMITS[type] : null) ?? null;
  const words = wordCount(text);
  const issues = [];
  if (limit && words > limit) issues.push({ issue: `${words} words — over the ${limit}-word limit by ${words - limit}` });
  for (const p of placeholders(text)) issues.push({ issue: `line ${p.line}: ${p.issue}` });
  if (type && TYPE_CHECKS[type]) issues.push(...TYPE_CHECKS[type](text, { exists }));
  return { words, limit, issues, ok: issues.length === 0 };
}
