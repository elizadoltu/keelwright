// Design tokens (W3C DTCG) → Tailwind CSS v4 theme (spec 6.0: tokens are defined once, the theme
// is generated). Colours in `color.light.*` become theme variables; `color.dark.*` override them
// under prefers-color-scheme: dark. Other groups map onto Tailwind's theme namespaces.

// Self-contained (no imports): the scaffold copies this file into generated projects.

const isObj = (v) => typeof v === 'object' && v !== null && !Array.isArray(v);

// Flatten a DTCG tree into { path: { $type, $value } }, inheriting $type from groups.
export function flattenTokens(tree, prefix = [], inheritedType = null, out = {}) {
  const type = tree.$type ?? inheritedType;
  for (const [key, value] of Object.entries(tree)) {
    if (key.startsWith('$') || !isObj(value)) continue;
    const path = [...prefix, key];
    if ('$value' in value) out[path.join('.')] = { $type: value.$type ?? type, $value: value.$value };
    else flattenTokens(value, path, type, out);
  }
  return out;
}


const HEADER = '/* Generated from design/tokens.json by KeelWright — do not edit; change the tokens and regenerate. */';

const REF = /^\{([^{}]+)\}$/;
function resolve(tokens, value, seen = new Set()) {
  const m = typeof value === 'string' ? REF.exec(value) : null;
  if (!m) return value;
  if (seen.has(m[1]) || !tokens[m[1]]) throw new Error(`token reference ${value} doesn't resolve`);
  seen.add(m[1]);
  return resolve(tokens, tokens[m[1]].$value, seen);
}

const hex2 = (x) => Math.round(Math.min(1, Math.max(0, x)) * 255).toString(16).padStart(2, '0');

export function cssValue(type, v) {
  switch (type) {
    case 'color': {
      if (typeof v === 'string') return v;
      const alpha = v.alpha ?? 1;
      if (v.colorSpace === 'srgb' && alpha === 1) return v.hex ?? `#${v.components.map(hex2).join('')}`;
      if (v.colorSpace === 'srgb') return `rgb(${v.components.map((c) => Math.round(c * 255)).join(' ')} / ${alpha})`;
      return `color(${v.colorSpace} ${v.components.join(' ')}${alpha === 1 ? '' : ` / ${alpha}`})`;
    }
    case 'dimension':
    case 'duration':
      return `${v.value}${v.unit}`;
    case 'fontFamily':
      return (Array.isArray(v) ? v : [v]).map((f) => (/^[\w-]+$/.test(f) && !/\s/.test(f) ? f : `"${f}"`)).join(', ');
    case 'cubicBezier':
      return `cubic-bezier(${v.join(', ')})`;
    default:
      return String(v);
  }
}

// Tailwind v4 namespace for a token, from its $type and the name of its top-level group.
export function namespace(type, group) {
  if (type === 'color') return 'color';
  if (type === 'fontFamily') return 'font';
  if (type === 'fontWeight') return 'font-weight';
  if (type === 'cubicBezier') return 'ease';
  if (type === 'shadow') return 'shadow';
  const g = group.toLowerCase();
  if (type === 'dimension') {
    if (['radius', 'radii'].includes(g)) return 'radius';
    if (['space', 'spacing'].includes(g)) return 'spacing';
    if (['size', 'text', 'font-size', 'fontsize'].includes(g)) return 'text';
    if (['breakpoint', 'breakpoints', 'screen'].includes(g)) return 'breakpoint';
    if (['tracking', 'letter-spacing'].includes(g)) return 'tracking';
  }
  if (type === 'number' && ['line-height', 'leading', 'lineheight'].includes(g)) return 'leading';
  return null; // not a Tailwind theme namespace: emitted as a plain custom property
}

// Path segments that only repeat what the namespace already says (font.family.display → --font-display).
const REDUNDANT = {
  font: ['family', 'families', 'font-family', 'fontfamily'],
  'font-weight': ['weight', 'weights', 'font-weight', 'fontweight'],
  text: ['size', 'sizes', 'font-size', 'fontsize'],
  leading: ['line-height', 'lineheight', 'leading'],
};

const kebab = (s) => s.replace(/([a-z0-9])([A-Z])/g, '$1-$2').replace(/[^a-zA-Z0-9-]+/g, '-').toLowerCase();

export function tokensToCss(json) {
  const tree = typeof json === 'string' ? JSON.parse(json) : json;
  const tokens = flattenTokens(tree);
  const theme = [];
  const dark = [];
  const plain = [];
  for (const [path, t] of Object.entries(tokens)) {
    const parts = path.split('.');
    const value = cssValue(t.$type, resolve(tokens, t.$value));
    if (t.$type === 'color' && parts[0] === 'color' && ['light', 'dark'].includes(parts[1])) {
      const name = `--color-${kebab(parts.slice(2).join('-'))}`;
      (parts[1] === 'light' ? theme : dark).push(`  ${name}: ${value};`);
      continue;
    }
    // The top-level group decides the namespace; failing that, the second level (font.size.lg → --text-lg).
    let ns = namespace(t.$type, parts[0]);
    let restParts = parts.slice(1);
    if (!ns && parts.length > 2 && namespace(t.$type, parts[1])) {
      ns = namespace(t.$type, parts[1]);
      restParts = parts.slice(2);
    }
    const drop = REDUNDANT[ns] ?? [];
    const rest = kebab(restParts.filter((p, i, all) => !(drop.includes(p.toLowerCase()) && i < all.length - 1)).join('-'));
    if (ns) theme.push(`  --${ns}-${rest}: ${value};`);
    else plain.push(`  --${kebab(parts[0])}-${rest}: ${value};`);
  }
  const out = [HEADER, '', '@theme {', ...theme, '}'];
  if (plain.length) out.push('', ':root {', ...plain, '}');
  if (dark.length) out.push('', '@media (prefers-color-scheme: dark) {', '  :root {', ...dark.map((l) => `  ${l}`), '  }', '}');
  return `${out.join('\n')}\n`;
}

// ---------------------------------------------------------------------------
// Other targets: TypeScript (React Native / Expo, or any TS UI) and Dart (Flutter).
// The output file's extension picks the target (themeFor).
// ---------------------------------------------------------------------------

const toPx = (v) => (v.unit === 'rem' ? v.value * 16 : v.value);
const toMs = (v) => (v.unit === 's' ? v.value * 1000 : v.value);

// A token value as plain data for app code: colours as hex / rgba strings, dimensions as
// numbers in px (rem × 16), durations in ms, a font family as its first family.
export function plainValue(type, v) {
  switch (type) {
    case 'color':
      return cssValue('color', v);
    case 'dimension':
      return toPx(v);
    case 'duration':
      return toMs(v);
    case 'fontFamily':
      return Array.isArray(v) ? v[0] : v;
    case 'fontWeight':
      return String(v);
    default:
      return v;
  }
}

function resolvedTree(tree) {
  const tokens = flattenTokens(tree);
  const out = {};
  for (const [path, t] of Object.entries(tokens)) {
    const parts = path.split('.');
    let node = out;
    for (const p of parts.slice(0, -1)) node = node[p] ??= {};
    node[parts.at(-1)] = plainValue(t.$type, resolve(tokens, t.$value));
  }
  return { tokens, out };
}

export function tokensToTs(json) {
  const tree = typeof json === 'string' ? JSON.parse(json) : json;
  const { out } = resolvedTree(tree);
  return `${HEADER}\n\nexport const tokens = ${JSON.stringify(out, null, 2)} as const;\n\nexport type Tokens = typeof tokens;\n`;
}

const camel = (parts) =>
  parts
    .map((p) => kebab(p).split('-').filter(Boolean))
    .flat()
    .map((w, i) => (i === 0 ? w : w[0].toUpperCase() + w.slice(1)))
    .join('');

function dartValue(type, v) {
  switch (type) {
    case 'color': {
      if (typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v)) return `Color(0xFF${v.slice(1).toUpperCase()})`;
      if (isObj(v) && Array.isArray(v.components)) {
        const a = hex2(v.alpha ?? 1);
        const rgb = v.colorSpace === 'srgb' ? v.components.map(hex2).join('') : (v.hex ?? '#000000').slice(1);
        return `Color(0x${(a + rgb).toUpperCase()})`;
      }
      return null;
    }
    case 'dimension': {
      const n = toPx(v);
      return Number.isInteger(n) ? `${n}.0` : String(n);
    }
    case 'duration':
      return `Duration(milliseconds: ${Math.round(toMs(v))})`;
    case 'fontFamily':
      return `'${String(Array.isArray(v) ? v[0] : v).replace(/'/g, "\\'")}'`;
    case 'fontWeight': {
      const n = typeof v === 'number' ? v : { thin: 100, light: 300, normal: 400, regular: 400, medium: 500, bold: 700, black: 900 }[String(v).toLowerCase()] ?? 400;
      return `FontWeight.w${Math.min(900, Math.max(100, Math.round(n / 100) * 100))}`;
    }
    case 'cubicBezier':
      return `Cubic(${v.join(', ')})`;
    case 'number':
      return Number.isInteger(v) ? `${v}.0` : String(v);
    default:
      return null;
  }
}

export function tokensToDart(json) {
  const tree = typeof json === 'string' ? JSON.parse(json) : json;
  const tokens = flattenTokens(tree);
  const lines = [];
  for (const [path, t] of Object.entries(tokens)) {
    const raw = resolve(tokens, t.$value);
    const value = dartValue(t.$type, t.$type === 'color' && isObj(raw) && raw.colorSpace === 'srgb' && (raw.alpha ?? 1) === 1 ? cssValue('color', raw) : raw);
    if (value !== null) lines.push(`  static const ${camel(path.split('.'))} = ${value};`);
  }
  return `${HEADER}\n\nimport 'package:flutter/widgets.dart';\n\nabstract final class Tokens {\n${lines.join('\n')}\n}\n`;
}

// The generator for an output file, by its extension: .css → Tailwind theme, .ts / .js → a
// TypeScript object, .dart → a Flutter constants class.
export function themeFor(file) {
  if (/\.css$/.test(file)) return tokensToCss;
  if (/\.[cm]?[jt]s$/.test(file)) return tokensToTs;
  if (/\.dart$/.test(file)) return tokensToDart;
  return null;
}
