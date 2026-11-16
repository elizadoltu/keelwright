// Mechanical checks on generated documents (spec 6.1): length, leftover template placeholders,
// acceptance-criteria form and ID traceability. Steps run these before completing; the same
// checks can serve as eval graders.

const LIMITS = { prd: 1800, adr: 700 };

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
    if (/<!--/.test(line)) issues.push({ line: i + 1, issue: 'template comment left in' });
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

const TYPE_CHECKS = { prd: prdChecks };

export function checkDocument(text, { type = null, maxWords = null } = {}) {
  const limit = maxWords ?? (type ? LIMITS[type] : null) ?? null;
  const words = wordCount(text);
  const issues = [];
  if (limit && words > limit) issues.push({ issue: `${words} words — over the ${limit}-word limit by ${words - limit}` });
  for (const p of placeholders(text)) issues.push({ issue: `line ${p.line}: ${p.issue}` });
  if (type && TYPE_CHECKS[type]) issues.push(...TYPE_CHECKS[type](text));
  return { words, limit, issues, ok: issues.length === 0 };
}
