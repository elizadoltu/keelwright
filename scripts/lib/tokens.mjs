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
