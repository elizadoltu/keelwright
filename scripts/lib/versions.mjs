// Live version resolution (spec 4.6): latest stable versions from the registries, never from
// memory. Supports npm, PyPI, crates.io and pub.dev packages, the Node.js LTS line, CPython,
// Flutter (with its Dart SDK), Rust and GitHub releases, plus a compatibility check so the
// resolved versions can be verified as a set: npm peers and engines.node, Python's
// requires-python, a crate's rust-version and a Dart package's SDK constraint.
//
// Network access goes through an injected `fetchJson(url, headers)` so the logic is testable.

// ---------------------------------------------------------------------------
// Semver (subset): parse, compare, satisfies. Stable versions only are resolved, so a
// prerelease in a range is treated by its base version, which is exact for stable versions.
// ---------------------------------------------------------------------------

const VERSION = /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/;

export function parseVersion(text) {
  const m = VERSION.exec(String(text).trim());
  if (!m) return null;
  return { major: +m[1], minor: +m[2], patch: +m[3], prerelease: m[4] ?? null };
}

export const isStable = (text) => {
  const v = parseVersion(text);
  return v !== null && v.prerelease === null;
};

export function compare(a, b) {
  const x = typeof a === 'string' ? parseVersion(a) : a;
  const y = typeof b === 'string' ? parseVersion(b) : b;
  return x.major - y.major || x.minor - y.minor || x.patch - y.patch;
}

const PARTIAL = /^v?(\d+|[xX*])(?:\.(\d+|[xX*]))?(?:\.(\d+|[xX*]))?(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;
const isWild = (p) => p === undefined || p === 'x' || p === 'X' || p === '*';

// A partial version like "1", "1.2", "1.x" → { parts: [1, 2, 0], given: 2 }
function parsePartial(text) {
  const m = PARTIAL.exec(text);
  if (!m) return null;
  const raw = [m[1], m[2], m[3]];
  let given = 0;
  for (const p of raw) {
    if (isWild(p)) break;
    given++;
  }
  const parts = raw.map((p, i) => (i < given ? Number(p) : 0));
  return { parts, given };
}

const v = (major, minor, patch) => ({ major, minor, patch, prerelease: null });
const bump = ({ parts, given }) => {
  if (given <= 1) return v(parts[0] + 1, 0, 0);
  if (given === 2) return v(parts[0], parts[1] + 1, 0);
  return v(parts[0], parts[1], parts[2] + 1);
};
const base = ({ parts }) => v(parts[0], parts[1], parts[2]);

// One comparator token → list of [op, version] constraints, or null when unparseable.
function desugar(token) {
  if (token === '' || token === '*' || token === 'x' || token === 'X') return [];
  const m = /^(\^|~>?|>=|<=|>|<|=)?\s*(.+)$/.exec(token);
  if (!m) return null;
  const [, op = '', rest] = m;
  const p = parsePartial(rest);
  if (!p) return null;
  if (p.given === 0) return op === '<' || op === '>' ? [['<', v(0, 0, 0)]] : [];
  const [major, minor, patch] = p.parts;
  switch (op) {
    case '':
    case '=':
      return p.given === 3 ? [['>=', base(p)], ['<=', base(p)]] : [['>=', base(p)], ['<', bump(p)]];
    case '^': {
      let upper;
      if (major > 0 || p.given === 1) upper = v(major + 1, 0, 0);
      else if (minor > 0 || p.given === 2) upper = v(0, minor + 1, 0);
      else upper = v(0, 0, patch + 1);
      return [['>=', base(p)], ['<', upper]];
    }
    case '~':
    case '~>':
      return [['>=', base(p)], ['<', p.given === 1 ? v(major + 1, 0, 0) : v(major, minor + 1, 0)]];
    case '>=':
      return [['>=', base(p)]];
    case '>':
      return p.given === 3 && !/-/.test(rest) ? [['>', base(p)]] : [['>=', p.given === 3 ? base(p) : bump(p)]];
    case '<':
      return [['<', base(p)]];
    case '<=':
      return p.given === 3 && !/-/.test(rest) ? [['<=', base(p)]] : [['<', p.given === 3 ? base(p) : bump(p)]];
    default:
      return null;
  }
}

function test(version, [op, bound]) {
  const c = compare(version, bound);
  return { '>=': c >= 0, '>': c > 0, '<': c < 0, '<=': c <= 0 }[op];
}

// true / false, or null when the range uses syntax this subset doesn't understand.
export function satisfies(version, range) {
  const ver = typeof version === 'string' ? parseVersion(version) : version;
  if (!ver) return null;
  let unknown = false;
  for (const set of String(range).split('||')) {
    let text = set.trim().replace(/(\^|~>?|>=|<=|>|<|=)\s+/g, '$1');
    const hyphen = /^(\S+)\s+-\s+(\S+)$/.exec(text);
    if (hyphen) text = `>=${hyphen[1]} <=${hyphen[2]}`;
    const constraints = [];
    let parsed = true;
    for (const token of text.split(/\s+/).filter(Boolean)) {
      const c = desugar(token);
      if (c === null) {
        parsed = false;
        break;
      }
      constraints.push(...c);
    }
    if (!parsed) {
      unknown = true;
      continue;
    }
    if (constraints.every((c) => test(ver, c))) return true;
  }
  return unknown ? null : false;
}

// ---------------------------------------------------------------------------
// Specs: "node", "npm:<name>[@range]", "<name>[@range]", "github:<owner>/<repo>"
// ---------------------------------------------------------------------------

const RUNTIMES = new Set(['node', 'python', 'flutter', 'rust', 'godot', 'unity']);
const NAMES = {
  npm: /^(@[a-z0-9][\w.-]*\/)?[a-z0-9][\w.-]*$/i,
  pypi: /^[a-z0-9]([\w.-]*[a-z0-9])?$/i,
  crates: /^[a-z0-9][\w-]*$/i,
  pub: /^[a-z][a-z0-9_]*$/,
};

export function parseSpec(spec) {
  if (RUNTIMES.has(spec)) return { source: spec, name: spec, range: null };
  if (spec.startsWith('github:')) {
    const name = spec.slice('github:'.length);
    if (!/^[\w.-]+\/[\w.-]+$/.test(name)) throw new Error(`invalid GitHub spec "${spec}" (expected github:owner/repo)`);
    return { source: 'github', name, range: null };
  }
  const prefix = /^(npm|pypi|crates|pub):/.exec(spec)?.[1] ?? 'npm';
  const body = spec.startsWith(`${prefix}:`) ? spec.slice(prefix.length + 1) : spec;
  const at = body.lastIndexOf('@');
  const name = at > 0 ? body.slice(0, at) : body;
  const range = at > 0 ? body.slice(at + 1) : null;
  if (!NAMES[prefix].test(name)) throw new Error(`invalid ${prefix} package name in "${spec}"`);
  return { source: prefix, name, range };
}

// ---------------------------------------------------------------------------
// PEP 440 (subset) for PyPI: final releases only, specifiers ==, !=, >=, <=, >, <, ~=, ==X.*
// ---------------------------------------------------------------------------

const PY_FINAL = /^v?(\d+(?:\.\d+)*)(?:\.post\d+)?$/;
const pyParts = (text) => PY_FINAL.exec(String(text).trim())?.[1].split('.').map(Number) ?? null;

export const isPyFinal = (text) => pyParts(text) !== null;

export function comparePy(a, b) {
  const x = pyParts(a) ?? [];
  const y = pyParts(b) ?? [];
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    const d = (x[i] ?? 0) - (y[i] ?? 0);
    if (d) return d;
  }
  return 0;
}

// true / false, or null when the specifier isn't understood.
export function satisfiesPy(version, spec) {
  if (!pyParts(version)) return null;
  for (const clause of String(spec ?? '').split(',').map((c) => c.trim()).filter(Boolean)) {
    const m = /^(~=|===|==|!=|<=|>=|<|>)\s*([\d.]+(?:\.\*)?)$/.exec(clause);
    if (!m) return null;
    const [, op, target] = m;
    if (target.endsWith('.*')) {
      const prefix = target.slice(0, -2).split('.').map(Number);
      const parts = pyParts(version);
      const match = prefix.every((p, i) => (parts[i] ?? 0) === p);
      if ((op === '==' && !match) || (op === '!=' && match)) return false;
      if (op !== '==' && op !== '!=') return null;
      continue;
    }
    const c = comparePy(version, target);
    let ok;
    if (op === '~=') {
      const t = target.split('.').map(Number);
      if (t.length < 2) return null;
      const upper = [...t.slice(0, -2), t.at(-2) + 1].join('.');
      ok = c >= 0 && comparePy(version, upper) < 0;
    } else ok = { '==': c === 0, '===': c === 0, '!=': c !== 0, '<=': c <= 0, '>=': c >= 0, '<': c < 0, '>': c > 0 }[op];
    if (!ok) return false;
  }
  return true;
}

// Release tags such as "4.7.2-stable" (Godot) or "4.5-stable" → "4.5.0"; other tags unchanged.
export function normalizeTag(tag) {
  const t = String(tag ?? '').replace(/^v/, '').replace(/-stable$/, '');
  return /^\d+\.\d+$/.test(t) ? `${t}.0` : t;
}

// ---------------------------------------------------------------------------
// Resolvers
// ---------------------------------------------------------------------------

const NPM_REGISTRY = 'https://registry.npmjs.org';
const NPM_ABBREVIATED = { Accept: 'application/vnd.npm.install-v1+json' };

// Highest stable, non-deprecated version; the "latest" dist-tag wins when it is stable,
// not deprecated and inside the requested range.
export function pickNpmVersion(packument, range = null) {
  const versions = packument.versions ?? {};
  const ok = (ver) => isStable(ver) && !versions[ver]?.deprecated && (range === null || satisfies(ver, range) === true);
  const latest = packument['dist-tags']?.latest;
  if (latest && versions[latest] && ok(latest)) return latest;
  const candidates = Object.keys(versions).filter(ok).sort(compare);
  return candidates.at(-1) ?? null;
}

async function resolveNpm({ name, range }, fetchJson) {
  const encoded = name.startsWith('@') ? `@${encodeURIComponent(name.slice(1))}` : encodeURIComponent(name);
  const packument = await fetchJson(`${NPM_REGISTRY}/${encoded}`, NPM_ABBREVIATED);
  const version = pickNpmVersion(packument, range);
  if (!version) throw new Error(`no stable version of ${name}${range ? ` matches ${range}` : ''}`);
  const meta = packument.versions[version];
  const optional = Object.entries(meta.peerDependenciesMeta ?? {})
    .filter(([, m]) => m?.optional)
    .map(([peer]) => peer);
  return {
    source: 'npm',
    name,
    version,
    ...(range ? { range } : {}),
    ...(meta.engines?.node ? { engines: { node: meta.engines.node } } : {}),
    peerDependencies: meta.peerDependencies ?? {},
    optionalPeers: optional,
  };
}

async function resolveNode(_spec, fetchJson) {
  const index = await fetchJson('https://nodejs.org/dist/index.json');
  const lts = index.filter((r) => r.lts).sort((a, b) => compare(b.version, a.version))[0];
  if (!lts) throw new Error('no Node.js LTS release found');
  return { source: 'node', name: 'node', version: lts.version.replace(/^v/, ''), lts: lts.lts, peerDependencies: {}, optionalPeers: [] };
}

async function resolveGithub({ name }, fetchJson) {
  const release = await fetchJson(`https://api.github.com/repos/${name}/releases/latest`, { Accept: 'application/vnd.github+json' });
  const version = normalizeTag(release.tag_name);
  if (!isStable(version)) throw new Error(`latest release of ${name} is not a stable version (${release.tag_name})`);
  // The commit the tag points to, for pinning GitHub Actions by SHA (annotated tags point to a tag object).
  let sha = null;
  try {
    const ref = await fetchJson(`https://api.github.com/repos/${name}/git/ref/tags/${encodeURIComponent(release.tag_name)}`, { Accept: 'application/vnd.github+json' });
    sha = ref.object?.type === 'tag' ? (await fetchJson(ref.object.url, { Accept: 'application/vnd.github+json' })).object?.sha : ref.object?.sha;
  } catch {
    sha = null;
  }
  return { source: 'github', name, version, tag: release.tag_name, ...(sha ? { sha } : {}), peerDependencies: {}, optionalPeers: [] };
}

const none = { peerDependencies: {}, optionalPeers: [] };

// Highest final, not fully yanked release (inside the range, when given).
export function pickPypiVersion(project, range = null) {
  const releases = project.releases ?? {};
  const ok = (ver) => isPyFinal(ver) && (releases[ver] ?? []).length > 0 && !releases[ver].every((f) => f.yanked) && (range === null || satisfiesPy(ver, range) === true);
  return Object.keys(releases).filter(ok).sort(comparePy).at(-1) ?? null;
}

async function resolvePypi({ name, range }, fetchJson) {
  const project = await fetchJson(`https://pypi.org/pypi/${encodeURIComponent(name)}/json`);
  const version = pickPypiVersion(project, range);
  if (!version) throw new Error(`no final release of ${name}${range ? ` matches ${range}` : ''}`);
  const requiresPython = project.releases[version].find((f) => f.requires_python)?.requires_python ?? (version === project.info?.version ? project.info.requires_python : null);
  return { source: 'pypi', name, version, ...(range ? { range } : {}), ...(requiresPython ? { requires: { python: requiresPython } } : {}), ...none };
}

async function resolveCrates({ name, range }, fetchJson) {
  const data = await fetchJson(`https://crates.io/api/v1/crates/${encodeURIComponent(name)}`);
  const ok = (v) => !v.yanked && isStable(v.num) && (range === null || satisfies(v.num, range) === true);
  const chosen = range === null && data.crate?.max_stable_version ? (data.versions ?? []).find((v) => v.num === data.crate.max_stable_version) ?? { num: data.crate.max_stable_version } : (data.versions ?? []).filter(ok).sort((a, b) => compare(a.num, b.num)).at(-1);
  if (!chosen) throw new Error(`no stable version of ${name}${range ? ` matches ${range}` : ''}`);
  return { source: 'crates', name, version: chosen.num, ...(range ? { range } : {}), ...(chosen.rust_version ? { requires: { rust: `>=${chosen.rust_version}` } } : {}), ...none };
}

async function resolvePub({ name, range }, fetchJson) {
  const data = await fetchJson(`https://pub.dev/api/packages/${encodeURIComponent(name)}`);
  const ok = (v) => isStable(v.version) && !v.retracted && (range === null || satisfies(v.version, range) === true);
  const chosen = range === null && data.latest && isStable(data.latest.version) ? data.latest : (data.versions ?? []).filter(ok).sort((a, b) => compare(a.version, b.version)).at(-1);
  if (!chosen) throw new Error(`no stable version of ${name}${range ? ` matches ${range}` : ''}`);
  const sdk = chosen.pubspec?.environment?.sdk;
  return { source: 'pub', name, version: chosen.version, ...(range ? { range } : {}), ...(sdk ? { requires: { dart: sdk } } : {}), ...none };
}

async function resolvePython(_spec, fetchJson) {
  const releases = await fetchJson('https://www.python.org/api/v2/downloads/release/?is_published=true&pre_release=false&version=3');
  // Not the newest release_date: maintenance releases of older lines come out on the same day.
  const versions = releases.filter((r) => r.is_published && !r.pre_release).map((r) => /Python\s+(\d+\.\d+\.\d+)$/.exec(r.name ?? '')?.[1]).filter(Boolean);
  const version = versions.sort(compare).at(-1);
  if (!version) throw new Error('no stable CPython release found');
  return { source: 'python', name: 'python', version, ...none };
}

async function resolveFlutter(_spec, fetchJson) {
  const index = await fetchJson('https://storage.googleapis.com/flutter_infra_release/releases/releases_macos.json');
  const release = (index.releases ?? []).find((r) => r.hash === index.current_release?.stable && r.channel === 'stable');
  if (!release) throw new Error('no stable Flutter release found');
  return { source: 'flutter', name: 'flutter', version: release.version, dart: release.dart_sdk_version, ...none };
}

async function resolveRust(_spec, fetchJson) {
  const release = await fetchJson('https://api.github.com/repos/rust-lang/rust/releases/latest', { Accept: 'application/vnd.github+json' });
  const version = normalizeTag(release.tag_name);
  if (!isStable(version)) throw new Error(`latest Rust release is not a stable version (${release.tag_name})`);
  return { source: 'rust', name: 'rust', version, ...none };
}

// Godot: the repository also publishes 3.x maintenance releases, so take the highest stable tag
// rather than the "latest" release.
async function resolveGodot(_spec, fetchJson) {
  const releases = await fetchJson('https://api.github.com/repos/godotengine/godot/releases?per_page=50', { Accept: 'application/vnd.github+json' });
  const tags = releases.filter((r) => !r.prerelease && /-stable$/.test(r.tag_name ?? '')).map((r) => ({ tag: r.tag_name, version: normalizeTag(r.tag_name) })).filter((t) => isStable(t.version));
  const best = tags.sort((a, b) => compare(a.version, b.version)).at(-1);
  if (!best) throw new Error('no stable Godot release found');
  return { source: 'godot', name: 'godot', version: best.version, tag: best.tag, ...none };
}

// Unity: the official Release API; the newest LTS stream release (e.g. 6000.3.28f1).
async function resolveUnity(_spec, fetchJson) {
  const data = await fetchJson('https://services.api.unity.com/unity/editor/release/v1/releases?stream=LTS&order=RELEASE_DATE_DESC&limit=25');
  const key = (v) => /^(\d+)\.(\d+)\.(\d+)f(\d+)$/.exec(v)?.slice(1).map(Number) ?? null;
  const versions = (data.results ?? []).map((r) => r.version).filter(key);
  const best = versions.sort((a, b) => key(a).reduce((d, x, i) => d || x - key(b)[i], 0)).at(-1);
  if (!best) throw new Error('no Unity LTS release found');
  return { source: 'unity', name: 'unity', version: best, stream: 'LTS', ...none };
}

const RESOLVERS = { godot: resolveGodot, unity: resolveUnity, npm: resolveNpm, node: resolveNode, github: resolveGithub, pypi: resolvePypi, crates: resolveCrates, pub: resolvePub, python: resolvePython, flutter: resolveFlutter, rust: resolveRust };

// Peer dependency check across the resolved set.
//   ok: the peer is in the set and its version satisfies the range
//   conflict: it is in the set and doesn't satisfy it
//   unknown: the range syntax isn't understood — check by hand
//   missing: a required peer that isn't in the set
export function checkPeers(packages) {
  const byName = new Map(packages.map((p) => [p.name, p]));
  const results = [];
  for (const pkg of packages) {
    for (const [peer, range] of Object.entries(pkg.peerDependencies)) {
      const found = byName.get(peer);
      if (!found) {
        if (!pkg.optionalPeers.includes(peer)) results.push({ package: pkg.name, peer, range, status: 'missing' });
        continue;
      }
      const s = satisfies(found.version, range);
      results.push({ package: pkg.name, peer, range, peerVersion: found.version, status: s === null ? 'unknown' : s ? 'ok' : 'conflict' });
    }
    // Runtime requirements: requires-python, a crate's rust-version, a Dart package's SDK constraint.
    for (const [runtime, range] of Object.entries(pkg.requires ?? {})) {
      const rt = runtime === 'dart' ? byName.get('flutter') : byName.get(runtime);
      if (!rt) continue;
      const have = runtime === 'dart' ? rt.dart : rt.version;
      if (!have) continue;
      const s = runtime === 'python' ? satisfiesPy(have, range) : satisfies(have, range);
      results.push({ package: pkg.name, peer: `${runtime} (requires)`, range, peerVersion: have, status: s === null ? 'unknown' : s ? 'ok' : 'conflict' });
    }
    const nodeRange = pkg.engines?.node;
    const node = byName.get('node');
    if (nodeRange && node) {
      const s = satisfies(node.version, nodeRange);
      results.push({ package: pkg.name, peer: 'node (engines)', range: nodeRange, peerVersion: node.version, status: s === null ? 'unknown' : s ? 'ok' : 'conflict' });
    }
  }
  return results;
}

export async function resolveAll(specs, { fetchJson, now = new Date() }) {
  const packages = [];
  const errors = [];
  for (const spec of specs) {
    try {
      const parsed = parseSpec(spec);
      packages.push(await RESOLVERS[parsed.source](parsed, fetchJson));
    } catch (err) {
      errors.push({ spec, error: err.message });
    }
  }
  return { resolvedAt: now.toISOString().slice(0, 10), packages, peers: checkPeers(packages), errors };
}

export async function httpFetchJson(url, headers = {}) {
  // A GitHub token, when present, raises the API rate limit (60 requests an hour without one).
  const token = url.startsWith('https://api.github.com/') ? (process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN) : null;
  const res = await fetch(url, { headers: { 'User-Agent': 'keelwright', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...headers } });
  if (!res.ok) throw new Error(`${url} → HTTP ${res.status}`);
  return res.json();
}
