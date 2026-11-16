// Live version resolution (spec 4.6): latest stable versions from the registries, never from
// memory. Supports npm packages, the Node.js LTS line and GitHub releases, plus a peer
// dependency check so the resolved versions can be verified as a compatible set.
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

export function parseSpec(spec) {
  if (spec === 'node') return { source: 'node', name: 'node', range: null };
  if (spec.startsWith('github:')) {
    const name = spec.slice('github:'.length);
    if (!/^[\w.-]+\/[\w.-]+$/.test(name)) throw new Error(`invalid GitHub spec "${spec}" (expected github:owner/repo)`);
    return { source: 'github', name, range: null };
  }
  const body = spec.startsWith('npm:') ? spec.slice(4) : spec;
  const at = body.lastIndexOf('@');
  const name = at > 0 ? body.slice(0, at) : body;
  const range = at > 0 ? body.slice(at + 1) : null;
  if (!/^(@[a-z0-9][\w.-]*\/)?[a-z0-9][\w.-]*$/i.test(name)) throw new Error(`invalid npm package name in "${spec}"`);
  return { source: 'npm', name, range };
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
  const version = String(release.tag_name ?? '').replace(/^v/, '');
  if (!isStable(version)) throw new Error(`latest release of ${name} is not a stable version (${release.tag_name})`);
  return { source: 'github', name, version, peerDependencies: {}, optionalPeers: [] };
}

const RESOLVERS = { npm: resolveNpm, node: resolveNode, github: resolveGithub };

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
  const res = await fetch(url, { headers: { 'User-Agent': 'keelwright', ...headers } });
  if (!res.ok) throw new Error(`${url} → HTTP ${res.status}`);
  return res.json();
}
