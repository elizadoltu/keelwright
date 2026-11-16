// Checks that span files: design tokens (W3C DTCG 2025.10) with contrast, cross-document IDs
// and local links, and the basic structure of a Structurizr workspace.

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { flattenTokens } from './tokens.mjs';

export { flattenTokens };

// ---------------------------------------------------------------------------
// Design tokens
// ---------------------------------------------------------------------------

const isObj = (v) => typeof v === 'object' && v !== null && !Array.isArray(v);
const REF = /^\{([^{}]+)\}$/;

function resolveValue(tokens, value, seen = new Set()) {
  const m = typeof value === 'string' ? REF.exec(value) : null;
  if (!m) return { value };
  const target = m[1];
  if (seen.has(target)) return { error: `circular reference ${value}` };
  if (!tokens[target]) return { error: `reference ${value} doesn't resolve` };
  seen.add(target);
  return resolveValue(tokens, tokens[target].$value, seen);
}

const unitValue = (v, units) => isObj(v) && typeof v.value === 'number' && units.includes(v.unit);

function validValue(type, v) {
  switch (type) {
    case 'color':
      return isObj(v) && typeof v.colorSpace === 'string' && Array.isArray(v.components) && v.components.length >= 3;
    case 'dimension':
      return unitValue(v, ['px', 'rem']);
    case 'duration':
      return unitValue(v, ['ms', 's']);
    case 'fontFamily':
      return typeof v === 'string' || (Array.isArray(v) && v.every((x) => typeof x === 'string'));
    case 'fontWeight':
      return (typeof v === 'number' && v >= 1 && v <= 1000) || typeof v === 'string';
    case 'number':
      return typeof v === 'number';
    case 'cubicBezier':
      return Array.isArray(v) && v.length === 4 && v.every((x) => typeof x === 'number');
    default:
      return v !== undefined; // composite and other types: presence only
  }
}

// sRGB relative luminance (WCAG 2.2).
function luminance(color) {
  let rgb;
  if (color.colorSpace === 'srgb' && color.components.every((c) => typeof c === 'number')) rgb = color.components.slice(0, 3);
  else if (typeof color.hex === 'string' && /^#[0-9a-f]{6}$/i.test(color.hex)) rgb = [1, 3, 5].map((i) => parseInt(color.hex.slice(i, i + 2), 16) / 255);
  else return null;
  const lin = rgb.map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
}

export function contrast(a, b) {
  const la = luminance(a);
  const lb = luminance(b);
  if (la === null || lb === null) return null;
  return Math.round(((Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05)) * 100) / 100;
}

// Text pairs that must reach 4.5:1 within each colour group: X-foreground on X, and text / muted on surface.
function textPairs(names) {
  const pairs = [];
  for (const n of names) {
    if (n.endsWith('-foreground') && names.includes(n.slice(0, -'-foreground'.length))) pairs.push([n, n.slice(0, -'-foreground'.length)]);
  }
  for (const t of ['text', 'muted']) if (names.includes(t) && names.includes('surface')) pairs.push([t, 'surface']);
  return pairs;
}

export function checkTokens(json) {
  const issues = [];
  let tree;
  try {
    tree = JSON.parse(json);
  } catch (err) {
    return [{ issue: `not valid JSON: ${err.message}` }];
  }
  const tokens = flattenTokens(tree);
  if (!Object.keys(tokens).length) return [{ issue: 'no tokens found (a token is an object with $value)' }];

  const resolved = {};
  for (const [path, t] of Object.entries(tokens)) {
    if (!t.$type) issues.push({ issue: `${path}: no $type (on the token or a parent group)` });
    const r = resolveValue(tokens, t.$value);
    if (r.error) {
      issues.push({ issue: `${path}: ${r.error}` });
      continue;
    }
    if (t.$type && !validValue(t.$type, r.value)) issues.push({ issue: `${path}: invalid ${t.$type} value ${JSON.stringify(r.value)}` });
    resolved[path] = { type: t.$type, value: r.value };
  }

  // Group colours by parent path (e.g. color.light, color.dark) and check text contrast in each.
  const groups = {};
  for (const [path, t] of Object.entries(resolved)) {
    if (t.type !== 'color') continue;
    const i = path.lastIndexOf('.');
    (groups[path.slice(0, i)] ??= {})[path.slice(i + 1)] = t.value;
  }
  for (const [group, colors] of Object.entries(groups)) {
    for (const [fg, bg] of textPairs(Object.keys(colors))) {
      const ratio = contrast(colors[fg], colors[bg]);
      if (ratio === null) issues.push({ issue: `${group}: can't compute contrast of ${fg} on ${bg} (use srgb components) — check by hand` });
      else if (ratio < 4.5) issues.push({ issue: `${group}: ${fg} on ${bg} has contrast ${ratio}:1, below WCAG AA 4.5:1` });
    }
  }
  return issues;
}

// ---------------------------------------------------------------------------
// Cross-document IDs and links
// ---------------------------------------------------------------------------

const ID = /\b(?:(?:SC|FR|NFR|BL|TD|EV|API)-\d{3}|US-\d+|A-\d+|F-\d{2}|S-\d{2}|P-\d{2}|T-\d{2}|ADR-\d{4})\b/g;

function markdownFiles(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .sort()
    .flatMap((n) => {
      const p = join(dir, n);
      if (statSync(p).isDirectory()) return markdownFiles(p);
      return n.endsWith('.md') ? [p] : [];
    });
}

// An ID is defined by a heading "### ID …" or the first cell of a table row "| ID |";
// ADR-NNNN is defined by a file docs/decisions/NNNN-*.md.
export function crossCheck(root, dirs = ['docs']) {
  const files = dirs.flatMap((d) => markdownFiles(resolve(root, d)));
  const defined = new Set();
  const texts = files.map((f) => [f, readFileSync(f, 'utf8')]);
  for (const [f, text] of texts) {
    for (const m of text.matchAll(/^#{2,4}\s+([A-Z]+-\d+)\b/gm)) defined.add(m[1]);
    for (const m of text.matchAll(/^\|\s*([A-Z]+-\d+)\s*\|/gm)) defined.add(m[1]);
    const adr = /(?:^|\/)decisions\/(\d{4})-[^/]+\.md$/.exec(f);
    if (adr) defined.add(`ADR-${adr[1]}`);
  }
  const issues = [];
  for (const [f, text] of texts) {
    const rel = relative(root, f);
    const lines = text.split('\n');
    lines.forEach((line, i) => {
      const clean = line.replace(/\[NEEDS CLARIFICATION:[^\]]*\]/g, '');
      for (const id of new Set(clean.match(ID) ?? [])) {
        if (!defined.has(id)) issues.push({ issue: `${rel}:${i + 1}: ${id} is referenced but not defined in any document` });
      }
      for (const m of clean.matchAll(/\]\(([^)\s]+)\)/g)) {
        const target = m[1];
        if (/^(https?:|mailto:|#)/.test(target)) continue;
        const path = resolve(dirname(f), decodeURI(target.split('#')[0]));
        if (!existsSync(path)) issues.push({ issue: `${rel}:${i + 1}: broken link ${target}` });
      }
    });
  }
  return { files: files.length, defined: defined.size, issues };
}

// ---------------------------------------------------------------------------
// Structurizr workspace (structure only; a full parse needs the Structurizr CLI)
// ---------------------------------------------------------------------------

export function checkWorkspace(dsl) {
  const issues = [];
  const code = dsl
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/"(?:[^"\\]|\\.)*"/g, '""')
    .split('\n')
    .map((l) => l.replace(/(^|\s)(\/\/|#).*$/, '$1'))
    .join('\n');
  let depth = 0;
  for (const ch of code) {
    if (ch === '{') depth++;
    if (ch === '}') depth--;
    if (depth < 0) break;
  }
  if (depth !== 0) issues.push({ issue: 'unbalanced braces' });
  for (const kw of ['workspace', 'model', 'views']) if (!new RegExp(`\\b${kw}\\b`).test(code)) issues.push({ issue: `no ${kw} block` });
  if (!/\bsystemContext\b/.test(code)) issues.push({ issue: 'no systemContext view' });
  if (!/=\s*container\b/.test(code)) issues.push({ issue: 'no containers defined' });
  if (!/^\s*container\s+[\w.]+/m.test(code)) issues.push({ issue: 'no container view' });
  return issues;
}
